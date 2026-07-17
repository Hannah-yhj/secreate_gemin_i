import { createHash } from "crypto";
import { computeFileHash } from "../lib/hash.js";
import { parseDocument } from "../lib/parse.js";
import { extractProviderAndName } from "../lib/extract-name.js";
import { resolveProduct } from "../lib/compare-product.js";
import { extractFullData } from "../lib/extract-benefits.js";
import { validateProduct, validateBenefit, validateRule, validateSource } from "../lib/validator.js";
import { findSourceByHash, insertNewCard, updateExistingCard } from "../lib/supabase.js";

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

function decodeHeader(value) {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST 요청만 지원합니다." });
    }

    const buffer = await readRawBody(req);
    if (!buffer.length) {
      return res.status(400).json({ error: "업로드된 파일이 없습니다." });
    }
    const fileName = decodeHeader(req.headers["x-filename"]) || "upload.pdf";

    const documentHash = computeFileHash(buffer);

    const duplicate = await findSourceByHash(documentHash);
    if (duplicate) {
      return res.status(200).json({
        status: "duplicate",
        provider: duplicate.product?.provider ?? null,
        product_name: duplicate.product?.product_name ?? null,
        product_id: duplicate.product?.product_id ?? null,
      });
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
      note: decodeHeader(req.headers["x-note"]),
    });

    const validationErrors = validatePayload(payload);
    if (validationErrors.length) {
      return res.status(422).json({ error: "추출된 데이터가 스키마 검증을 통과하지 못했습니다.", details: validationErrors });
    }

    const rpcResult = match.status === "existing"
      ? await updateExistingCard(payload)
      : await insertNewCard(payload);

    return res.status(200).json({
      status: rpcResult.status,
      provider,
      product_name,
      product_id: rpcResult.product_id,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message || "알 수 없는 오류가 발생했습니다." });
  }
}
