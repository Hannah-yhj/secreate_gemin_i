import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadLocalDB() {
  const filePath = path.join(process.cwd(), "db.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasCardProducts(data) {
  return Array.isArray(data?.products)
    && data.products.some(p => p && p.service_type !== "통신사");
}

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (url && key) {
      const supabase = createClient(url, key);
      const { data: products, error: pErr } = await supabase.from("products").select("*");
      const { data: benefits, error: bErr } = await supabase.from("benefits").select("*");
      const { data: rules, error: rErr } = await supabase.from("rules").select("*");
      const { data: sources, error: sErr } = await supabase.from("sources").select("*");

      if (!pErr && !bErr && !rErr && !sErr) {
        const payload = { products, benefits, rules, sources };
        if (hasCardProducts(payload)) {
          return res.status(200).json(payload);
        }
      }
    }

    // Supabase 미설정·오류·카드 데이터 부족 시 로컬 db.json 사용
    return res.status(200).json(loadLocalDB());
  } catch (error) {
    try {
      return res.status(200).json(loadLocalDB());
    } catch (e) {
      return res.status(500).json({ error: error.message || e.message });
    }
  }
}
