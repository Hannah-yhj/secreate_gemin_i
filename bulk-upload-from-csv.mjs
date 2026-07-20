import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

import { readFile, readdir } from "fs/promises";
import path from "path";
import { processCardUploadWithKnownName } from "./lib/process-upload.js";

function normalizeFileName(s) {
  return (s || "").replace(/[\s_]+/g, "").toLowerCase();
}

// 파일명이 정확히 일치하지 않으면(언더스코어/공백 표기 차이 등) 정규화해서 다시 찾아본다.
async function resolveFileName(dir, requested) {
  try {
    await readFile(path.join(dir, requested));
    return { fileName: requested, fuzzy: false };
  } catch {
    // fall through to fuzzy match
  }
  const files = await readdir(dir);
  const target = normalizeFileName(requested);
  const match = files.find(f => normalizeFileName(f) === target);
  if (match) return { fileName: match, fuzzy: true };
  return null;
}

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
  console.log(`총 ${dataRows.length}행 처리 예정`);

  // 같은 카드명이 여러 행에 있으면 미리 알려줌 (의도한 갱신인지, 실수로 중복 입력한 건지 확인용)
  const nameCounts = {};
  dataRows.forEach(row => {
    const name = row[idx.product_name]?.trim();
    if (name) nameCounts[name] = (nameCounts[name] || 0) + 1;
  });
  const dupNames = Object.entries(nameCounts).filter(([, c]) => c > 1);
  if (dupNames.length) {
    console.log("\n주의: 같은 카드명이 여러 행에 있습니다 (의도한 게 아니면 확인해주세요):");
    dupNames.forEach(([name, count]) => console.log(`  - "${name}" (${count}행)`));
  }
  console.log("");

  const results = [];
  let lastProvider = "";
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    let provider = row[idx.provider]?.trim();
    if (provider) lastProvider = provider;
    else provider = lastProvider; // 빈 칸은 바로 위 행 값으로 채움 (엑셀에서 반복값 생략하는 경우 대비)
    const productName = row[idx.product_name]?.trim();
    const requestedFileName = row[idx.file_name]?.trim();

    process.stdout.write(`[${i + 1}/${dataRows.length}] ${provider} / ${productName} (${requestedFileName}) ... `);

    const resolved = await resolveFileName(DIR, requestedFileName);
    if (!resolved) {
      console.log(`FAIL - 파일을 찾을 수 없습니다: ${requestedFileName}`);
      results.push({ provider, productName, fileName: requestedFileName, ok: false, error: "파일을 찾을 수 없습니다." });
      continue;
    }
    const fileName = resolved.fileName;
    if (resolved.fuzzy) {
      console.log(`\n   (참고: CSV 파일명과 정확히 안 맞아서 유사한 실제 파일로 매칭함 -> "${fileName}")`);
    }

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
