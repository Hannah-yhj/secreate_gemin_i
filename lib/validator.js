import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadSchema(name) {
  const filePath = path.join(__dirname, "..", "schema", `${name}.schema.json`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

// removeAdditional: AI가 스키마에 없는 필드(예: benefit_value_2 같은 임의 필드)를 만들어내는 경우,
// 전체를 거부하는 대신 그 필드만 제거하고 통과시킨다. 정의된 필드가 정상이면 여분 필드 하나 때문에
// 카드 전체가 등록 실패하는 걸 막기 위함 (DB 저장 SQL도 정의된 필드만 읽으므로 안전함).
const ajv = new Ajv({ allErrors: true, strict: false, removeAdditional: true });
addFormats(ajv);

const validators = {
  product: ajv.compile(loadSchema("product")),
  benefit: ajv.compile(loadSchema("benefit")),
  rule: ajv.compile(loadSchema("rule")),
  source: ajv.compile(loadSchema("source")),
};

function run(kind, obj) {
  const validate = validators[kind];
  const valid = validate(obj);
  return {
    valid,
    errors: valid ? [] : (validate.errors || []).map(e => `${e.instancePath || "(root)"} ${e.message}`),
  };
}

export function validateProduct(obj) {
  return run("product", obj);
}

export function validateBenefit(obj) {
  return run("benefit", obj);
}

export function validateRule(obj) {
  return run("rule", obj);
}

export function validateSource(obj) {
  return run("source", obj);
}
