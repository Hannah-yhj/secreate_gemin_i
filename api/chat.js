import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../lib/load-env.js";

loadEnv();

const UPSTAGE_URL = "https://api.upstage.ai/v1/chat/completions";

function loadLocalDB() {
  const filePath = path.join(process.cwd(), "db.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasCardProducts(data) {
  return Array.isArray(data?.products)
    && data.products.some(p => p && p.service_type !== "통신사");
}

async function loadCatalog() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { data: products, error: pErr } = await supabase.from("products").select("*");
      const { data: benefits, error: bErr } = await supabase.from("benefits").select("*");
      const { data: sources, error: sErr } = await supabase.from("sources").select("source_id, title, published_or_reviewed_date");

      if (!pErr && !bErr) {
        const payload = {
          products: products || [],
          benefits: benefits || [],
          sources: sources || [],
        };
        if (hasCardProducts(payload)) return { data: payload, source: "supabase" };
      }
    } catch (_) {
      /* fall through to local */
    }
  }

  const local = loadLocalDB();
  return {
    data: {
      products: local.products || [],
      benefits: local.benefits || [],
      sources: (local.sources || []).map(s => ({
        source_id: s.source_id,
        title: s.title,
        published_or_reviewed_date: s.published_or_reviewed_date,
      })),
    },
    source: "db.json",
  };
}

/** Solar 컨텍스트용으로 혜택을 짧게 요약 (토큰 절약) */
function buildCatalogContext(catalog) {
  const products = (catalog.products || []).filter(p => p.service_type !== "통신사" || p.carrier_code);
  const byProduct = new Map(products.map(p => [p.product_id, { ...p, benefits: [] }]));

  for (const b of catalog.benefits || []) {
    const row = byProduct.get(b.product_id);
    if (!row) continue;
    row.benefits.push({
      name: b.benefit_name,
      category: b.category,
      merchants: b.merchants_or_scope,
      type: b.benefit_type,
      value: b.benefit_value,
      unit: b.benefit_unit,
      spend_min: b.spend_min,
      channel: b.payment_channel,
      end_date: b.end_date,
      required_grade: b.required_grade || null,
    });
  }

  const lines = [];
  for (const p of byProduct.values()) {
    if (!p.benefits.length && p.service_type === "통신사") continue;
    const head = `- ${p.product_name} (${p.provider}, ${p.product_type}${p.carrier_code ? `, ${p.carrier_code}` : ""})`;
    lines.push(head);
    const top = p.benefits.slice(0, 12);
    for (const b of top) {
      const rate = b.unit === "%"
        ? `${b.value}%`
        : b.unit
          ? `${b.value}${b.unit}`
          : String(b.value ?? "");
      const bits = [
        b.name,
        b.category && `카테고리:${b.category}`,
        b.merchants && `대상:${String(b.merchants).slice(0, 80)}`,
        rate && `혜택:${rate}`,
        b.spend_min != null && `실적≥${b.spend_min}`,
        b.required_grade && `등급:${b.required_grade}+`,
        b.end_date && `~${b.end_date}`,
      ].filter(Boolean);
      lines.push(`  · ${bits.join(" | ")}`);
    }
    if (p.benefits.length > top.length) {
      lines.push(`  · …외 ${p.benefits.length - top.length}개 혜택`);
    }
  }
  return lines.join("\n");
}

function systemPrompt(catalogText, dataSource) {
  return `당신은 "결제 지시서" 서비스의 카드 추천 챗봇입니다.
아래는 ${dataSource === "supabase" ? "Supabase" : "로컬 DB"}에 있는 전체 결제수단·혜택 데이터입니다.
이 데이터에 있는 카드/혜택만 근거로 추천하세요. 데이터에 없는 카드·수치·조건을 지어내지 마세요.
정보가 부족하면 질문을 짧게 되묻고, 확실하지 않은 조건(실적·횟수·기간)은 "확인 필요"라고 말하세요.

답변 규칙:
- 한국어, 친근하고 짧게 (핵심 2~5개 카드/혜택)
- 카드명, 왜 맞는지, 주요 조건(실적·등급 등)을 적기
- 필요하면 마이페이지에서 카드/통신사를 등록하라고 안내
- 마크다운 굵게(**)는 써도 되지만 HTML은 쓰지 말 것

[카탈로그]
${catalogText}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "UPSTAGE_API_KEY가 서버에 설정되어 있지 않습니다." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = String(body.message || "").trim();
    if (!message) return res.status(400).json({ error: "message가 비어 있습니다." });

    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const { data: catalog, source } = await loadCatalog();
    const catalogText = buildCatalogContext(catalog);
    const model = process.env.UPSTAGE_MODEL || "solar-pro3";

    const messages = [
      { role: "system", content: systemPrompt(catalogText, source) },
      ...history
        .filter(m => m && (m.role === "user" || m.role === "assistant") && m.content)
        .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
      { role: "user", content: message.slice(0, 2000) },
    ];

    const upstream = await fetch(UPSTAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 1200,
      }),
    });

    const raw = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = raw?.error?.message || raw?.message || `Upstage HTTP ${upstream.status}`;
      return res.status(502).json({ error: `Solar API 오류: ${detail}` });
    }

    const reply = raw?.choices?.[0]?.message?.content?.trim();
    if (!reply) return res.status(502).json({ error: "Solar 응답이 비어 있습니다." });

    return res.status(200).json({
      reply,
      meta: {
        model,
        dataSource: source,
        productCount: (catalog.products || []).length,
        benefitCount: (catalog.benefits || []).length,
      },
    });
  } catch (err) {
    console.error("chat api error:", err);
    return res.status(500).json({ error: err.message || "챗봇 처리 중 오류가 발생했습니다." });
  }
}
