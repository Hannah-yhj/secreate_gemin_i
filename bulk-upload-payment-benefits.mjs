// 간편결제 혜택 월별 갱신 스크립트. 월 1회 정도 재실행하면 됨 (내용이 바뀌어도 안 바뀌어도 안전).
import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

import { fetchRenderedPagesText } from "./lib/fetch-page.js";
import { processUrlBenefits } from "./lib/process-upload.js";

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

async function main() {
  for (const svc of SERVICES) {
    console.log(`\n===== ${svc.provider} / ${svc.productName} =====`);
    try {
      const sources = [];
      if (svc.renderedUrls?.length) {
        const rendered = await fetchRenderedPagesText(svc.renderedUrls);
        sources.push(...rendered);
      }
      if (svc.staticUrls?.length) {
        for (const url of svc.staticUrls) sources.push({ url });
      }

      const result = await processUrlBenefits({
        sources,
        provider: svc.provider,
        productName: svc.productName,
        note: `월별 혜택 자동 갱신 (${new Date().toISOString().slice(0, 10)})`,
      });
      console.log(`OK - ${result.status} (${result.product_id})`);
      if (result.benefits) {
        console.log(`혜택 ${result.benefits.length}개: ${result.benefits.join(", ")}`);
      }
    } catch (err) {
      console.log(`FAIL - ${err.message}`);
    }
  }
}

main();
