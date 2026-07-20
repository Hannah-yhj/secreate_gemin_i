import { createHash } from "crypto";
import { computeFileHash } from "./hash.js";
import { parseDocument } from "./parse.js";
import { extractProviderAndName } from "./extract-name.js";
import { resolveProduct } from "./compare-product.js";
import { extractFullData } from "./extract-benefits.js";
import { validateProduct, validateBenefit, validateRule, validateSource } from "./validator.js";
import { findSourceByHash, insertNewCard, updateExistingCard } from "./supabase.js";
import { uploadPdf } from "./storage.js";

function slugId(prefix, provider, productName, salt = "") {
  const hash = createHash("sha256").update(`${provider}|${productName}|${salt}`).digest("hex").slice(0, 10).toUpperCase();
  return `${prefix}_${hash}`;
}

function prefixGroupId(productId, rawGroupId) {
  if (!rawGroupId) return null;
  return `${productId}_${rawGroupId}`;
}

function prefixScopeId(productId, rawScopeId) {
  if (!rawScopeId || rawScopeId === "product") return rawScopeId ?? null;
  return `${productId}_${rawScopeId}`;
}

// DB의 date 컬럼은 완전한 YYYY-MM-DD만 허용한다. AI가 "01-01"(연도 없음), "2022-08"(일 없음)
// 같은 불완전한 날짜를 줄 때가 있는데, 이 필드 하나 때문에 카드 전체 저장이 실패하면 안 되므로
// 형식이 안 맞으면 null로 대체한다.
function sanitizeDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function buildPayload({ extracted, provider, productName, productId, sourceId, documentHash, fileName, aliasMatchType, note, sourceUrl }) {
  const product = {
    ...extracted.product,
    provider,
    product_name: productName,
    product_id: productId,
    source_id: sourceId,
  };

  const benefits = extracted.benefits.map((b, i) => ({
    ...b,
    benefit_id: slugId("B", provider, productName, `benefit_${i}`),
    product_id: productId,
    source_id: sourceId,
    limit_group_id: prefixGroupId(productId, b.limit_group_id),
    option_group_id: prefixGroupId(productId, b.option_group_id),
    requires_coupon: typeof b.requires_coupon === "boolean" ? b.requires_coupon : false,
    stackable: typeof b.stackable === "boolean" ? b.stackable : true,
    start_date: sanitizeDate(b.start_date),
    end_date: sanitizeDate(b.end_date),
  }));

  const rules = extracted.rules.map((r, i) => ({
    ...r,
    rule_id: slugId("R", provider, productName, `rule_${i}`),
    product_id: productId,
    source_id: sourceId,
    scope_id: prefixScopeId(productId, r.scope_id),
  }));

  const source = {
    ...extracted.source,
    source_id: sourceId,
    source_type: "PDF",
    file_name: fileName,
    source_url: sourceUrl || null,
    note: note || "AI 자동 등록",
    document_hash: documentHash,
    product_id: productId,
    published_or_reviewed_date: sanitizeDate(extracted.source?.published_or_reviewed_date),
  };

  const aliases = [{
    alias_id: slugId("AL", provider, productName, "alias"),
    product_id: productId,
    provider,
    alias: productName,
    match_type: aliasMatchType,
  }];

  return { product, benefits, rules, source, aliases };
}

function validatePayload(payload) {
  const errors = [];

  const productResult = validateProduct(payload.product);
  if (!productResult.valid) errors.push(...productResult.errors.map(e => `product: ${e}`));

  payload.benefits.forEach((b, i) => {
    const r = validateBenefit(b);
    if (!r.valid) errors.push(...r.errors.map(e => `benefits[${i}]: ${e}`));
  });

  payload.rules.forEach((r, i) => {
    const res = validateRule(r);
    if (!res.valid) errors.push(...res.errors.map(e => `rules[${i}]: ${e}`));
  });

  const sourceResult = validateSource(payload.source);
  if (!sourceResult.valid) errors.push(...sourceResult.errors.map(e => `source: ${e}`));

  return errors;
}

// provider/product_name이 이미 확정된 상태에서 나머지(혜택 추출 → 스토리지 업로드 → 검증 → DB 저장)를 처리.
// AI 이름 추출 경로와 사람이 이름을 확정해서 주는 경로가 이 함수를 공유한다.
async function finishUpload({ buffer, text, fileName, note, provider, productName, documentHash }) {
  const match = await resolveProduct({ provider, product_name: productName });
  const extracted = await extractFullData(text, { provider, product_name: productName });

  const productId = match.status === "existing" ? match.product_id : slugId("P", provider, productName);
  const sourceId = slugId("SRC", provider, productName, documentHash);

  let sourceUrl = null;
  try {
    sourceUrl = await uploadPdf(buffer, `${documentHash}.pdf`);
  } catch (err) {
    console.error(`PDF 스토리지 업로드 실패 (${fileName}): ${err.message}`);
  }

  const payload = buildPayload({
    extracted,
    provider,
    productName,
    productId,
    sourceId,
    documentHash,
    fileName,
    aliasMatchType: match.status === "existing" ? "AI" : "official",
    note,
    sourceUrl,
  });

  const validationErrors = validatePayload(payload);
  if (validationErrors.length) {
    const err = new Error("추출된 데이터가 스키마 검증을 통과하지 못했습니다.");
    err.statusCode = 422;
    err.details = validationErrors;
    throw err;
  }

  const rpcResult = match.status === "existing"
    ? await updateExistingCard(payload)
    : await insertNewCard(payload);

  return {
    status: rpcResult.status,
    provider,
    product_name: productName,
    product_id: rpcResult.product_id,
    benefits: payload.benefits.map(b => b.benefit_name),
  };
}

// buffer: Buffer, fileName: string, note?: string
// knownProvider: 이미 확실히 알고 있는 카드사명(예: 폴더명)이 있으면 넘긴다 — 넘기면 AI가 추출한
// provider 대신 이 값을 강제로 사용한다 (카드사명은 문서마다 영문/약칭 등으로 표기가 달라 AI가
// 일관되게 뽑지 못하는 경우가 있어, 이미 알고 있는 값이 있으면 신뢰하지 않는 게 안전함).
// product_name은 그대로 AI가 문서에서 추출한다.
// 반환: { status: 'duplicate'|'new'|'updated', provider, product_name, product_id, benefits? }
// 실패 시 throw (호출자가 처리). validation 실패는 err.statusCode = 422, err.details = [...]
export async function processCardUpload({ buffer, fileName, note, knownProvider }) {
  if (!buffer || !buffer.length) {
    const err = new Error("업로드된 파일이 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const documentHash = computeFileHash(buffer);

  const duplicate = await findSourceByHash(documentHash);
  if (duplicate) {
    return {
      status: "duplicate",
      provider: duplicate.product?.provider ?? null,
      product_name: duplicate.product?.product_name ?? null,
      product_id: duplicate.product?.product_id ?? null,
    };
  }

  const { text } = await parseDocument(buffer, fileName);
  const extracted = await extractProviderAndName(text);
  const provider = knownProvider || extracted.provider;

  return finishUpload({ buffer, text, fileName, note, provider, productName: extracted.product_name, documentHash });
}

// provider/productName을 사람이 직접 확정해서 넘기는 경로 (카드명 자동추출 단계를 건너뜀).
// force: true면 이미 처리된 적 있는 파일(해시 중복)이어도 다시 추출해서 반영한다.
// (예: 나쁜 파일로 잘못 갱신된 카드를 좋은 원본으로 다시 처리해 복구할 때 사용)
export async function processCardUploadWithKnownName({ buffer, fileName, note, provider, productName, force = false }) {
  if (!buffer || !buffer.length) {
    const err = new Error("업로드된 파일이 없습니다.");
    err.statusCode = 400;
    throw err;
  }
  if (!provider || !productName) {
    const err = new Error("provider/productName은 필수입니다.");
    err.statusCode = 400;
    throw err;
  }

  const documentHash = computeFileHash(buffer);

  if (!force) {
    const duplicate = await findSourceByHash(documentHash);
    if (duplicate) {
      return {
        status: "duplicate",
        provider: duplicate.product?.provider ?? null,
        product_name: duplicate.product?.product_name ?? null,
        product_id: duplicate.product?.product_id ?? null,
      };
    }
  }

  const { text } = await parseDocument(buffer, fileName);

  return finishUpload({ buffer, text, fileName, note, provider, productName, documentHash: force ? `${documentHash}-force-${Date.now()}` : documentHash });
}
