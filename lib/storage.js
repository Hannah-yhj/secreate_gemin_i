import { getServiceClient } from "./supabase.js";

// 쿠폰 이미지 업로드 등에서 사용 (api/upload-coupon.js)
// 모듈이 import되는 시점이 아니라 실제로 사용되는 시점에 클라이언트를 생성해야 함
// (import 시점엔 .env.local이 아직 로드되지 않은 경우가 있어 즉시 생성하면 로컬에서 크래시남)
export const supabase = new Proxy({}, {
  get(_target, prop) {
    return getServiceClient()[prop];
  },
});

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
