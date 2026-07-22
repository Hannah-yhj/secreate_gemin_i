import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

import { readdir, readFile } from "fs/promises";
import { processCardUpload } from "./lib/process-upload.js";

const ROOT = "D:/26-summer/upstage 대회/카드사DB_0720";

const COMPANIES = [
  "하나카드",
  "IBK기업은행",
];

async function main() {
  const results = [];
  let totalFiles = 0;

  for (const company of COMPANIES) {
    const dir = `${ROOT}/${company}`;
    const files = (await readdir(dir)).filter(f => f.toLowerCase().endsWith(".pdf"));
    totalFiles += files.length;
    console.log(`\n===== ${company} (${files.length}개) =====`);

    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      process.stdout.write(`[${company} ${i + 1}/${files.length}] ${fileName} ... `);
      try {
        const buffer = await readFile(`${dir}/${fileName}`);
        const result = await processCardUpload({ buffer, fileName, note: "AI 자동 등록 (타사 일괄 업로드)", knownProvider: company });
        console.log(`OK - ${result.status} (${result.provider} / ${result.product_name})`);
        results.push({ company, fileName, ok: true, ...result });
      } catch (err) {
        console.log(`FAIL - ${err.message}`);
        results.push({ company, fileName, ok: false, error: err.message, details: err.details });
      }
    }
  }

  const succeeded = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const byStatus = succeeded.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  console.log("\n\n==== 전체 요약 ====");
  console.log(`총 파일: ${totalFiles}`);
  console.log(`성공: ${succeeded.length} (${JSON.stringify(byStatus)})`);
  console.log(`실패: ${failed.length}`);

  console.log("\n회사별 요약:");
  for (const company of COMPANIES) {
    const companyResults = results.filter(r => r.company === company);
    const companySucceeded = companyResults.filter(r => r.ok);
    console.log(`  ${company}: ${companySucceeded.length}/${companyResults.length} 성공`);
  }

  if (failed.length) {
    console.log("\n실패 목록:");
    failed.forEach(f => console.log(`- [${f.company}] ${f.fileName}: ${f.error}`));
  }
}

main();
