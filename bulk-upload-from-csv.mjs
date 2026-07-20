import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

import { readFile } from "fs/promises";
import path from "path";
import { processCardUploadWithKnownName } from "./lib/process-upload.js";

const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith("--"));
const dirArg = args.find(a => a.startsWith("--dir="));
const DIR = dirArg ? dirArg.slice("--dir=".length) : "D:/26-summer/upstage 대회/우리카드";

if (!csvPath) {
  console.error("사용법: node bulk-upload-from-csv.mjs <csv경로> [--dir=PDF폴더경로]");
  process.exit(1);
}

// 간단한 CSV 파서 (따옴표로 감싼 필드의 쉼표/줄바꿈도 처리)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some(v => v !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const raw = await readFile(csvPath, "utf8");
  const rows = parseCsv(raw.replace(/^﻿/, "")); // BOM 제거 (엑셀 저장 CSV 대비)
  const [header, ...dataRows] = rows;
  const idx = {
    provider: header.findIndex(h => h.trim() === "provider" || h.trim() === "카드사"),
    product_name: header.findIndex(h => h.trim() === "product_name" || h.trim() === "카드명"),
    file_name: header.findIndex(h => h.trim() === "file_name" || h.trim() === "파일명"),
  };
  if (idx.provider < 0 || idx.product_name < 0 || idx.file_name < 0) {
    console.error("CSV 헤더에 카드사/카드명/파일명(또는 provider/product_name/file_name) 컬럼이 필요합니다.");
    console.error("현재 헤더:", header);
    process.exit(1);
  }

  console.log(`대상 CSV: ${csvPath}`);
  console.log(`PDF 폴더: ${DIR}`);
  console.log(`총 ${dataRows.length}행 처리 예정\n`);

  const results = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const provider = row[idx.provider]?.trim();
    const productName = row[idx.product_name]?.trim();
    const fileName = row[idx.file_name]?.trim();

    process.stdout.write(`[${i + 1}/${dataRows.length}] ${provider} / ${productName} (${fileName}) ... `);
    try {
      const buffer = await readFile(path.join(DIR, fileName));
      const result = await processCardUploadWithKnownName({ buffer, fileName, provider, productName, note: "수동 확인 카드명 + AI 혜택 추출" });
      console.log(`OK - ${result.status}`);
      if (result.benefits) {
        console.log(`   혜택 ${result.benefits.length}개: ${result.benefits.join(", ")}`);
      }
      results.push({ provider, productName, fileName, ok: true, ...result });
    } catch (err) {
      console.log(`FAIL - ${err.message}`);
      results.push({ provider, productName, fileName, ok: false, error: err.message, details: err.details });
    }
  }

  const succeeded = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  console.log("\n==== 요약 ====");
  console.log(`성공: ${succeeded.length} / 실패: ${failed.length}`);
  if (failed.length) {
    console.log("\n실패 목록:");
    failed.forEach(f => console.log(`- ${f.provider} / ${f.productName} (${f.fileName}): ${f.error}`));
  }
}

main();
