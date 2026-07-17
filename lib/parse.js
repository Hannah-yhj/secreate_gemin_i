const DOCUMENT_PARSE_URL = "https://api.upstage.ai/v1/document-digitization";

export async function parseDocument(buffer, filename) {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    throw new Error("UPSTAGE_API_KEY가 설정되어 있지 않습니다.");
  }

  const form = new FormData();
  form.append("document", new Blob([buffer]), filename || "document.pdf");
  form.append("model", "document-parse");
  form.append("output_formats", JSON.stringify(["text"]));

  const res = await fetch(DOCUMENT_PARSE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const raw = await res.json();
  if (!res.ok) {
    throw new Error(`Upstage Document Parse 실패 (${res.status}): ${raw?.error?.message || JSON.stringify(raw)}`);
  }

  const text = raw?.content?.text;
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("Upstage Document Parse 응답에서 텍스트를 찾을 수 없습니다.");
  }

  return { text, raw };
}
