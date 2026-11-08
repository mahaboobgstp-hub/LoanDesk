import { supabase } from "../lib/supabase";

const BUCKET = "loan-private-documents";

export async function uploadPrivateDocument(applicationId, file, documentType = "credit_report") {
  if (!file || file.type !== "application/pdf") throw new Error("Please upload a PDF file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("PDF must be 15 MB or smaller.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${applicationId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "application/pdf", upsert: false
  });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("uploaded_documents").insert({
    application_id: applicationId, storage_path: path, original_name: file.name,
    mime_type: file.type, file_size: file.size, document_type: documentType
  }).select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function getPrivateDocumentUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 90);
  if (error) throw error;
  return data.signedUrl;
}
