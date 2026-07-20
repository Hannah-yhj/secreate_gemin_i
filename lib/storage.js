import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "./supabase.js";

// 쿠폰 이미지 업로드 등에서 사용 (api/upload-coupon.js)
export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "card-pdfs";

// 카드 PDF 업로드에서 사용 (lib/process-upload.js)
// path: 버킷 내 파일 경로 (예: `${documentHash}.pdf`). 반환: 공개 URL
export async function uploadPdf(buffer, path) {
  const client = getServiceClient();
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
