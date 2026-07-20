import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let loaded = false;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM 제거

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  return true;
}

/**
 * 키는 코드에 넣지 않고 .env.local / .env / process.env 에서만 읽습니다.
 * Vercel 대시보드에 넣은 값이 있으면 그걸 우선합니다.
 */
export function loadEnv() {
  if (loaded) return;
  loaded = true;

  const libDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(libDir, ".."), // 프로젝트 루트 (lib/ 기준)
    process.cwd(),
  ];

  for (const root of candidates) {
    parseEnvFile(path.join(root, ".env.local"));
    parseEnvFile(path.join(root, ".env"));
  }
}

export function getUpstageApiKey() {
  loadEnv();
  const key = (process.env.UPSTAGE_API_KEY || "").trim();
  return key || null;
}

export function getUpstageModel() {
  loadEnv();
  return (
    (process.env.UPSTAGE_MODEL || "").trim()
    || (process.env.UPSTAGE_CHAT_MODEL || "").trim()
    || "solar-pro3"
  );
}
