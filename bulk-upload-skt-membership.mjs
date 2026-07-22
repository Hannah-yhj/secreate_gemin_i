// SKT T멤버십 제휴 브랜드 할인 자동 수집.
// sktmembership.tworld.co.kr의 공개 브랜드 목록 HTML을 페이지네이션으로 전부 받아서
// (할인형 tier만 사용, 적립형/포인트사용 문구는 제외 - 팀원이 이미 그렇게 정리해뒀음),
// 여러 배치로 나눠 Upstage로 구조화 추출한 뒤 한 번에 합쳐서 저장한다.
// (배치별로 각각 update_existing_card를 호출하면 delete-then-reinsert 특성상 이전
//  배치가 지워지므로, 반드시 전부 합친 뒤 마지막에 딱 한 번만 써야 한다.)
import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });
import { createHash } from "crypto";
import { extractFullData } from "./lib/extract-benefits.js";
import { slugId, buildPayload, validatePayload } from "./lib/process-upload.js";
import { updateExistingCard } from "./lib/supabase.js";

const PROVIDER = "SKT";
const PRODUCT_NAME = "SKT T멤버십";
const PRODUCT_ID = "P_SKT_MEMBERSHIP";
const API = "https://sktmembership.tworld.co.kr/mps/pc-bff/benefitbrand/brandList.do";
const BATCH_SIZE = 15;

async function fetchPage(pageNum) {
  const url = `${API}?pageNum=${pageNum}&pageSize=20&sortType=BRAND_FAVORITE&mediumCategoryId=-1&benefitTypeId=ALL&searchText=`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`SKT API 실패 (${res.status}), page=${pageNum}`);
  return res.text();
}

function parseInfoDiv(html) {
  const grades = [...html.matchAll(/badge-circle (vip|gold|silver|lite)/g)].map(m => m[1].toUpperCase());
  const withoutBadgeIcons = html.replace(/<i class="badge-circle[^"]*">[\s\S]*?<\/i>/g, "");
  const desc = withoutBadgeIcons.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { grades, desc };
}

function parseBrands(html) {
  const brands = [];
  const blocks = html.split("<a href='javascript:;' class='benefit-box'").slice(1);
  for (const block of blocks) {
    const brandMatch = block.match(/<span class='brand'>([^<]+)<\/span>/);
    if (!brandMatch) continue;
    const brand = brandMatch[1].trim();
    const discountMatch = block.match(/<dt>할인형<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
    if (!discountMatch) continue;
    const infoDivs = [...discountMatch[1].matchAll(/<div class='info'>([\s\S]*?)<\/div>/g)];
    const tiers = infoDivs
      .map(m => parseInfoDiv(m[1]))
      .filter(t => t.desc && t.grades.length && !t.desc.includes("포인트 사용"));
    if (tiers.length) brands.push({ brand, tiers });
  }
  return brands;
}

async function fetchAllBrands() {
  const first = await fetchPage(1);
  const totalMatch = first.match(/var totalCount = (\d+);/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  console.log(`전체 브랜드 수: ${total} (${totalPages}페이지)`);

  let all = parseBrands(first);
  for (let p = 2; p <= totalPages; p++) {
    const html = await fetchPage(p);
    all = all.concat(parseBrands(html));
  }
  return all;
}

function brandsToText(brands) {
  const header = `[SKT 멤버십 등급 순서 (낮은 것부터 높은 것 순): SILVER, GOLD, VIP]
아래 각 항목의 "적용 등급"은 그 할인이 적용되는 등급들이다. 여러 등급이 나열되어 있으면
(예: VIP, GOLD) 그중 가장 낮은 등급을 required_grade로 쓸 것 (더 높은 등급은 이미 자동으로 포함됨).
`;
  const body = brands.map(b => {
    const lines = b.tiers.map(t => `- 적용 등급: ${t.grades.join(", ")} / 혜택: ${t.desc}`).join("\n");
    return `[${b.brand}]\n${lines}`;
  }).join("\n\n");
  return `${header}\n${body}`;
}

async function main() {
  const brands = await fetchAllBrands();
  console.log(`파싱된 브랜드(할인형 tier 있는 것만): ${brands.length}개`);

  const batches = [];
  for (let i = 0; i < brands.length; i += BATCH_SIZE) batches.push(brands.slice(i, i + BATCH_SIZE));
  console.log(`배치 수: ${batches.length} (배치당 최대 ${BATCH_SIZE}개 브랜드)`);

  let allBenefits = [];
  let allRules = [];
  let lastSource = null;
  let lastProduct = null;

  for (let i = 0; i < batches.length; i++) {
    const text = brandsToText(batches[i]);
    process.stdout.write(`[배치 ${i + 1}/${batches.length}] (${batches[i].length}개 브랜드) 추출 중... `);
    try {
      const extracted = await extractFullData(text, { provider: PROVIDER, product_name: PRODUCT_NAME });
      allBenefits = allBenefits.concat(extracted.benefits);
      allRules = allRules.concat(extracted.rules);
      lastSource = extracted.source;
      lastProduct = extracted.product;
      console.log(`OK - 혜택 ${extracted.benefits.length}개`);
    } catch (err) {
      console.log(`FAIL - ${err.message}`);
    }
  }

  console.log(`\n총 추출된 혜택: ${allBenefits.length}개`);

  const combinedRawText = brandsToText(brands);
  const documentHash = createHash("sha256").update(combinedRawText).digest("hex");
  const sourceId = slugId("SRC", PROVIDER, PRODUCT_NAME, `${documentHash}-${Date.now()}`);

  const payload = buildPayload({
    extracted: { product: lastProduct, benefits: allBenefits, rules: allRules, source: lastSource },
    provider: PROVIDER,
    productName: PRODUCT_NAME,
    productId: PRODUCT_ID,
    sourceId,
    documentHash,
    fileName: `SKT 멤버십 브랜드 할인 (${new Date().toISOString().slice(0, 10)})`,
    aliasMatchType: "AI",
    note: `SKT 멤버십 브랜드 할인 자동 수집 (${new Date().toISOString().slice(0, 10)})`,
    sourceUrl: API,
    sourceType: "URL",
  });

  const errors = validatePayload(payload);
  if (errors.length) {
    console.log("검증 실패:", errors);
    process.exit(1);
  }

  const result = await updateExistingCard(payload);
  console.log(`\n완료: ${result.status}, product_id: ${result.product_id}, 혜택 ${payload.benefits.length}개 저장`);
}

main();
