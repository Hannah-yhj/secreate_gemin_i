import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

import { readdir, readFile } from "fs/promises";
import path from "path";
import { processCardUpload } from "./lib/process-upload.js";

const args = process.argv.slice(2);
const dirArg = args.find(a => !a.startsWith("--"));
const limitArg = args.find(a => a.startsWith("--limit="));
const onlyArg = args.find(a => a.startsWith("--only="));

const DIR = dirArg || "D:/26-summer/upstage 대회/우리카드";
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const SKIP_PATTERNS = ["사원증"];

async function main() {
  const allFiles = (await readdir(DIR)).filter(f => f.toLowerCase().endsWith(".pdf"));
  let files = allFiles.filter(f => !SKIP_PATTERNS.some(p => f.includes(p)));

  if (onlyArg) {
    const names = onlyArg.slice("--only=".length).split("|");
    files = files.filter(f => names.includes(f));
  }

  files = files.slice(0, LIMIT);

  console.log(`대상 폴더: ${DIR}`);
  console.log(`전체 PDF: ${allFiles.length}개, 스킵 제외 후: ${files.length}개 처리 예정\n`);

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    process.stdout.write(`[${i + 1}/${files.length}] ${fileName} ... `);
    try {
      const buffer = await readFile(path.join(DIR, fileName));
      const result = await processCardUpload({ buffer, fileName, note: "AI 자동 등록 (일괄 업로드)" });
      console.log(`OK - ${result.status} (${result.provider} / ${result.product_name})`);
      results.push({ fileName, ok: true, ...result });
    } catch (err) {
      console.log(`FAIL - ${err.message}`);
      results.push({ fileName, ok: false, error: err.message, details: err.details });
    }
  }

  const succeeded = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const byStatus = succeeded.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  console.log("\n==== 요약 ====");
  console.log(`성공: ${succeeded.length} (${JSON.stringify(byStatus)})`);
  console.log(`실패: ${failed.length}`);
  if (failed.length) {
    console.log("\n실패 목록:");
    failed.forEach(f => console.log(`- ${f.fileName}: ${f.error}${f.details ? " | " + JSON.stringify(f.details) : ""}`));
  }
}

main();
