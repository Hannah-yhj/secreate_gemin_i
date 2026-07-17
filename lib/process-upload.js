import { createHash } from "crypto";
import { computeFileHash } from "./hash.js";
import { parseDocument } from "./parse.js";
import { extractProviderAndName } from "./extract-name.js";
import { resolveProduct } from "./compare-product.js";
import { extractFullData } from "./extract-benefits.js";
import { validateProduct, validateBenefit, validateRule, validateSource } from "./validator.js";
import { findSourceByHash, insertNewCard, updateExistingCard } from "./supabase.js";

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

function buildPayload({ extracted, provider, productName, productId, sourceId, documentHash, fileName, aliasMatchType, note }) {
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
    source_url: null,
    note: note || "AI 자동 등록",
    document_hash: documentHash,
    product_id: productId,
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

// buffer: Buffer, fileName: string, note?: string
// 반환: { status: 'duplicate'|'new'|'updated', provider, product_name, product_id }
// 실패 시 throw (호출자가 처리). validation 실패는 err.statusCode = 422, err.details = [...]
export async function processCardUpload({ buffer, fileName, note }) {
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
  const { provider, product_name } = await extractProviderAndName(text);
  const match = await resolveProduct({ provider, product_name });

  const extracted = await extractFullData(text, { provider, product_name });

  const productId = match.status === "existing" ? match.product_id : slugId("P", provider, product_name);
  const sourceId = slugId("SRC", provider, product_name, documentHash);

  const payload = buildPayload({
    extracted,
    provider,
    productName: product_name,
    productId,
    sourceId,
    documentHash,
    fileName,
    aliasMatchType: match.status === "existing" ? "AI" : "official",
    note,
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
    product_name,
    product_id: rpcResult.product_id,
  };
}
