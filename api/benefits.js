import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../lib/load-env.js";

loadEnv();

function loadLocalDB() {
  const filePath = path.join(process.cwd(), "db.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasCardProducts(data) {
  return Array.isArray(data?.products)
    && data.products.some(p => p && p.service_type !== "통신사");
}

// Supabase/PostgREST는 .select()에 range를 안 주면 기본 1000행까지만 돌려준다.
// 테이블 row 수가 1000을 넘으면(예: benefits) 나머지가 조용히 잘려나가므로
// 전부 받을 때까지 range를 밀어가며 이어붙인다.
async function fetchAll(supabase, table) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;

    if (url && key) {
      const supabase = createClient(url, key);
      const [
        { data: products, error: pErr },
        { data: benefits, error: bErr },
        { data: rules, error: rErr },
        { data: sources, error: sErr }
      ] = await Promise.all([
        fetchAll(supabase, "products"),
        fetchAll(supabase, "benefits"),
        fetchAll(supabase, "rules"),
        fetchAll(supabase, "sources")
      ]);

      if (!pErr && !bErr && !rErr && !sErr) {
        const payload = { products, benefits, rules, sources };
        if (hasCardProducts(payload)) {
          res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
          return res.status(200).json(payload);
        }
      }
    }

    // Supabase 미설정·오류·카드 데이터 부족 시 로컬 db.json 사용
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
    return res.status(200).json(loadLocalDB());
  } catch (error) {
    try {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
      return res.status(200).json(loadLocalDB());
    } catch (e) {
      return res.status(500).json({ error: error.message || e.message });
    }
  }
}
