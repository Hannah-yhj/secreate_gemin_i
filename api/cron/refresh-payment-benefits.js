import { loadEnv } from "../../lib/load-env.js";
import { fetchRenderedPagesTextServerless, fetchPageText } from "../../lib/fetch-page.js";
import { processUrlBenefits } from "../../lib/process-upload.js";

loadEnv();

// 간편결제 혜택 월별 갱신 (Vercel Cron이 매달 자동 호출).
// 로컬에서 수동으로 돌릴 땐 bulk-upload-payment-benefits.mjs를 대신 쓴다
// (그쪽은 일반 playwright라 서버리스 배포에 못 들어가서 별도 유지).
const SERVICES = [
  {
    provider: "네이버파이낸셜",
    productName: "네이버페이",
    renderedUrls: [
      "https://pay.naver.com/benefit/payment/list?firstCategory=SEASONAL",
      "https://pay.naver.com/benefit/payment/list?firstCategory=DOMESTIC_INSTORE",
      "https://pay.naver.com/benefit/payment/list?firstCategory=ONLINE",
    ],
  },
  {
    provider: "토스",
    productName: "토스페이",
    staticUrls: ["https://toss.im/tossfeed/article/tosspay-promotion-july"],
  },
  {
    provider: "페이코",
    productName: "페이코",
    staticUrls: ["https://www.payco.com/point/reward.nhn"],
  },
];

export default async function handler(req, res) {
  // Vercel Cron이 호출할 때 자동으로 Authorization: Bearer $CRON_SECRET 헤더를 붙인다.
  // Vercel 프로젝트 설정(Environment Variables)에 CRON_SECRET을 등록해둬야
  // 이 값이 검증되고, 외부에서 이 URL을 직접 두드려서 실행시키는 걸 막을 수 있다.
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "인증되지 않은 요청입니다." });
  }

  const results = [];
  for (const svc of SERVICES) {
    try {
      const sources = [];
      if (svc.renderedUrls?.length) {
        const rendered = await fetchRenderedPagesTextServerless(svc.renderedUrls);
        sources.push(...rendered);
      }
      if (svc.staticUrls?.length) {
        for (const url of svc.staticUrls) sources.push({ url, text: await fetchPageText(url) });
      }

      const result = await processUrlBenefits({
        sources,
        provider: svc.provider,
        productName: svc.productName,
        note: `월별 혜택 자동 갱신 (${new Date().toISOString().slice(0, 10)}, cron)`,
      });
      results.push({ provider: svc.provider, productName: svc.productName, ok: true, ...result });
    } catch (err) {
      results.push({ provider: svc.provider, productName: svc.productName, ok: false, error: err.message });
    }
  }

  const failed = results.filter(r => !r.ok);
  return res.status(failed.length ? 207 : 200).json({ results });
}
