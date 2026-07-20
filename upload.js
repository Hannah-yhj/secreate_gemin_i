import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// .env.local 읽기
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// db.json 읽기
const db = JSON.parse(
  fs.readFileSync("./db.json", "utf8")
);

async function uploadTable(tableName, data, pk) {
  console.log(`Uploading ${tableName}...`);

  const { error } = await supabase
    .from(tableName)
    .upsert(data, {
      onConflict: pk
    });

  if (error) {
    throw error;
  }

  console.log(`✔ ${tableName}: ${data.length} rows`);
}

async function main() {
  try {

    console.log("================================");
    console.log(" Start Upload");
    console.log("================================");

    // 외래키 순서 고려
    await uploadTable("sources", db.sources, "source_id");
    await uploadTable("products", db.products, "product_id");
    await uploadTable("rules", db.rules, "rule_id");
    await uploadTable("benefits", db.benefits, "benefit_id");

    console.log("");
    console.log("================================");
    console.log(" Upload Complete");
    console.log("================================");

  } catch (err) {
    console.error("");
    console.error(" Upload Failed");
    console.error(err);
  }
}

main();