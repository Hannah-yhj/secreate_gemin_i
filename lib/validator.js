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

const ajv = new Ajv({ allErrors: true, strict: false });
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
