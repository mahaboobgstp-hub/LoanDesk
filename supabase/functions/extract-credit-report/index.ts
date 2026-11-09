
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import * as pdfjs from "npm:pdfjs-dist@5.4.624/legacy/build/pdf.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "loan-private-documents";
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function extractIndicators(text: string) {
  const source = text || "";

  const scoreMatch =
    source.match(/(?:CIBIL|credit)\s+score[^0-9]{0,25}([0-9]{3})/i) ||
    source.match(/\bscore[^0-9]{0,25}([0-9]{3})/i);

  const score = scoreMatch ? Number(scoreMatch[1]) : null;

  return {
    score:
      score !== null && score >= 300 && score <= 900
        ? score
        : null,

    hasWrittenOffKeyword:
      /written[\s-]?off|write[\s-]?off/i.test(source),

    hasSettledKeyword:
      /\bsettled\b|settlement/i.test(source),

    hasSuitFiledKeyword:
      /suit[\s-]?filed|wilful[\s-]?default/i.test(source),

    hasOverdueKeyword:
      /\boverdue\b|amount past due/i.test(source),
  };
}

async function extractText(bytes: Uint8Array) {
  const pdf = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  try {
    if (pdf.numPages > 100) {
      throw new Error("PDF exceeds the 100-page processing limit.");
    }

    const pages: string[] = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item: any) => item.str || "")
        .join(" ");

      pages.push(pageText);
    }

    return {
      text: pages.join("\n"),
      pageCount: pdf.numPages,
    };
  } finally {
    await pdf.destroy();
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return respond({ error: "Authentication required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the actual signed-in user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return respond({ error: "Invalid user session" }, 401);
    }

    // Privileged client is used only after authentication and
    // application ownership checks.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const body = await req.json();
    const applicationId = String(body.application_id || "");
    const reportId = String(body.report_id || "");

    if (!applicationId || !reportId) {
      return respond({
        error: "Application ID and report ID are required",
      }, 400);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_active) {
      return respond({ error: "Active account required" }, 403);
    }

    const { data: application, error: applicationError } = await admin
      .from("loan_applications")
      .select("id,agent_id")
      .eq("id", applicationId)
      .single();

    if (applicationError || !application) {
      return respond({ error: "Application not found" }, 404);
    }

    const isAdmin = profile.role === "admin";
    const isOwner = application.agent_id === user.id;

    if (!isAdmin && !isOwner) {
      return respond({ error: "Application access denied" }, 403);
    }

    const { data: report, error: reportError } = await admin
      .from("credit_reports")
      .select("id,application_id,document_id,bureau_name,report_source")
      .eq("id", reportId)
      .eq("application_id", applicationId)
      .single();

    if (reportError || !report || !report.document_id) {
      return respond({ error: "Credit report record not found" }, 404);
    }

    const { data: document, error: documentError } = await admin
      .from("uploaded_documents")
      .select("id,application_id,storage_path,mime_type,file_size,document_type")
      .eq("id", report.document_id)
      .eq("application_id", applicationId)
      .single();

    if (documentError || !document) {
      return respond({ error: "Uploaded document not found" }, 404);
    }

    if (
      document.document_type !== "credit_report" ||
      document.mime_type !== "application/pdf" ||
      !document.storage_path.startsWith(`${applicationId}/`) ||
      document.file_size > MAX_FILE_SIZE
    ) {
      return respond({ error: "Invalid credit report document" }, 400);
    }

    const { data: file, error: downloadError } = await admin.storage
      .from(BUCKET)
      .download(document.storage_path);

    if (downloadError || !file) {
      throw new Error("Could not retrieve the private PDF.");
    }

    if (file.size > MAX_FILE_SIZE) {
      return respond({ error: "PDF exceeds the 15 MB limit" }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Check the PDF file signature.
    const signature = new TextDecoder().decode(bytes.slice(0, 5));

    if (signature !== "%PDF-") {
      return respond({ error: "Invalid PDF file structure" }, 400);
    }

    const extracted = await extractText(bytes);
    const indicators = extractIndicators(extracted.text);

    const hasText = extracted.text.trim().length > 30;

    const summary = {
      extraction_method: "server_side_pdfjs",
      extraction_version: "1.0",
      page_count: extracted.pageCount,
      extracted_character_count: extracted.text.length,
      text_extracted: hasText,
      indicators: indicators,
      extraction_note: hasText
        ? "Automatic extraction is preliminary. Verify all values against the original report."
        : "No readable text found. This may be a scanned PDF and requires OCR.",
    };

    const { error: updateError } = await admin
      .from("credit_reports")
      .update({
        credit_score: indicators.score,
        written_off: indicators.hasWrittenOffKeyword,
        settled: indicators.hasSettledKeyword,
        suit_filed: indicators.hasSuitFiledKeyword,
        extraction_status: "pending_verification",
        extracted_summary: summary,
      })
      .eq("id", reportId)
      .eq("application_id", applicationId);

    if (updateError) throw updateError;

    await admin.from("audit_logs").insert({
      application_id: applicationId,
      actor_id: user.id,
      action: "credit_report_server_extracted",
      details: {
        report_id: reportId,
        page_count: extracted.pageCount,
        text_extracted: hasText,
        extraction_method: "server_side_pdfjs",
      },
    });

    return respond({
      success: true,
      message: hasText
        ? "PDF text extraction completed. Admin verification is pending."
        : "PDF received, but readable text was not found. OCR is required.",
      extraction_status: "pending_verification",
      summary,
    });

  } catch (error) {
    console.error(
      "Credit report extraction failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return respond({
      error: "Credit report processing failed. Please retry or contact an administrator.",
    }, 500);
  }
});
