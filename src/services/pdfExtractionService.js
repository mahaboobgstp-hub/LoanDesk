import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(" "));
  }
  return pages.join("\n");
}

// Generic indicators only. Bureau-specific parsing must be validated against real report samples.
export function detectCreditIndicators(text) {
  const source = text || "";
  const findAmount = (patterns) => {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match?.[1]) return Number(match[1].replace(/[,\s]/g, ""));
    }
    return null;
  };
  return {
    hasWrittenOffKeyword: /written[\s-]?off|write[\s-]?off/i.test(source),
    hasSettledKeyword: /\bsettled\b|settlement/i.test(source),
    hasSuitFiledKeyword: /suit[\s-]?filed|wilful[\s-]?default/i.test(source),
    hasOverdueKeyword: /\boverdue\b|amount past due/i.test(source),
    score: findAmount([/(?:CIBIL|credit)\s+score[^0-9]{0,20}([0-9]{3})/i, /score[^0-9]{0,20}([0-9]{3})/i]),
    extractionNote: "Text extraction is best-effort. Verify all values and account classifications against the original bureau report."
  };
}
