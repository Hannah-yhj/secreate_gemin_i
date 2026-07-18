import fs from "fs";
import path from "path";

let loaded = false;

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
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
    // 이미 설정된 값은 덮어쓰지 않음 (Vercel 대시보드 env 우선)
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

/** .env.local → .env 순으로 로드 (dotenv 패키지 불필요) */
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const root = process.cwd();
  parseEnvFile(path.join(root, ".env.local"));
  parseEnvFile(path.join(root, ".env"));
}
