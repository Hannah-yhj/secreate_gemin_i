import { processCardUpload } from "../lib/process-upload.js";

export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 4.4 * 1024 * 1024;

async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error("업로드 파일이 너무 큽니다 (4.4MB 제한).");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function decodeHeader(value) {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST 요청만 지원합니다." });
    }

    const buffer = await readRawBody(req);
    const fileName = decodeHeader(req.headers["x-filename"]) || "upload.pdf";
    const note = decodeHeader(req.headers["x-note"]);

    const result = await processCardUpload({ buffer, fileName, note });
    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message || "알 수 없는 오류가 발생했습니다.", details: error.details });
  }
}
