import { getServiceClient } from "./supabase.js";

const BUCKET = "card-pdfs";

// path: 버킷 내 파일 경로 (예: `${documentHash}.pdf`). 반환: 공개 URL
export async function uploadPdf(buffer, path) {
  const supabase = getServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
