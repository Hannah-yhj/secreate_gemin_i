import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { getUpstageApiKey, getUpstageModel, loadEnv } from "../lib/load-env.js";
import { Engine } from "../lib/engine.js";

loadEnv();

/** Upstage Chat Completions */
const UPSTAGE_URL = "https://api.upstage.ai/v1/chat/completions";

function projectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function loadLocalDB() {
  const filePath = path.join(projectRoot(), "db.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasCardProducts(data) {
  return Array.isArray(data?.products) && data.products.some((p) => p && p.service_type !== "통신사");
}

// Supabase/PostgREST는 .select()에 range를 안 주면 기본 1000행까지만 돌려준다.
// benefits처럼 1000행을 넘는 테이블은 range를 밀어가며 전부 받아야 한다.
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

async function loadCatalog() {
  loadEnv();
  const url = (process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { data: products, error: pErr } = await fetchAll(supabase, "products");
      const { data: benefits, error: bErr } = await fetchAll(supabase, "benefits");

      if (!pErr && !bErr) {
        const payload = { products: products || [], benefits: benefits || [] };
        if (hasCardProducts(payload)) return { data: payload, source: "supabase" };
      }
    } catch (_) {
      /* fall through */
    }
  }

  const local = loadLocalDB();
  return {
    data: { products: local.products || [], benefits: local.benefits || [] },
    source: "db.json",
  };
}

/** Solar는 이제 "선택"이 아니라 "설명"만 담당한다 */
function systemPrompt(candidateText, { includeMembership = false } = {}) {
  const scope = includeMembership
    ? "이번 답변은 사용자가 멤버십을 요청했으므로 통신사 멤버십 후보를 설명할 수 있습니다."
    : "기본은 카드(신용/체크)만 추천합니다. 통신사 멤버십은 후보에 없으면 언급하지 마세요. 사용자가 멤버십을 원할 때만 멤버십을 다룹니다.";

  return `당신은 "결제 지시서" 서비스의 카드 추천 챗봇입니다.
아래 [추천 후보]는 이미 시스템이 규칙 기반으로 계산해서 선정한 결과입니다.
절대로 순서를 변경하지 마세요.
절대로 새로운 카드를 추가하지 마세요.
당신의 역할은 이 후보 카드만 사용자에게 자연스럽게 설명하는 것뿐입니다.
${scope}

절대 하지 말아야 할 것:
- [추천 후보]에 없는 상품을 언급하지 않는다.
- 후보의 순서를 임의로 바꾸지 않는다.
- 후보 데이터에 없는 수치·조건을 새로 만들어내지 않는다.
- 생각 과정(reasoning), "Let me check", "Hmm", "Wait" 같은 문장을 출력하지 않는다.
- '자동 적용', '무조건', '가장 좋다'처럼 후보 데이터로 확인할 수 없는 단정적 표현을 쓰지 않는다.
- 데이터에 없는 카드·수치·조건을 지어내지 않는다.
- 정보가 부족하면 질문을 짧게 되묻고, 확실하지 않은 조건(실적·횟수·기간)은 "확인 필요"라고 말한다.


답변은 반드시 아래 형식을 따른다 (한국어, 친근하고 간결하게):

추천 ${includeMembership ? "멤버십/혜택" : "카드"}

각 항목마다
1. 상품명
2. 추천 이유 (후보의 매칭 혜택을 근거로 자연스럽게 설명)
3. 주요 혜택 (불릿 형식)
4. 이용 조건 (전월실적, 등급 등)

마지막에: 마이페이지에서 카드/통신사를 등록하면 더 정확한 추천이 가능하다고 짧게 안내한다.
마크다운 굵게(**)는 써도 되지만 HTML은 쓰지 않는다.

[추천 후보]
${candidateText}`;
}

async function extractEntities(message, apiKey, model) {
  const systemPrompt = `당신은 사용자의 질문에서 결제 혜택 검색을 위한 핵심 키워드를 추출하는 AI입니다. 
오직 JSON 형식으로만 응답해야 합니다. 다른 말은 덧붙이지 마세요.

추출할 키워드:
- brand: 사용자가 언급한 특정 브랜드나 매장 이름 (예: "스타벅스", "아웃백", "배달의민족", "넷플릭스"). 언급이 없으면 null.
- category: 사용자가 언급한 업종 카테고리 (예: "카페", "영화", "통신", "교통", "쇼핑", "편의점", "외식"). 언급이 없으면 null.
- amount: 예상 결제 금액 (숫자만 추출, 예: 50000). 금액 언급이 없으면 기본값 30000.
- wantsMembership: 통신사 멤버십 할인 등 멤버십 혜택을 원하면 true, 아니면 false.

응답 예시:
{"brand": "아웃백", "category": null, "amount": 100000, "wantsMembership": false}
{"brand": null, "category": "영화", "amount": 15000, "wantsMembership": true}`;

  try {
    const upstream = await fetch(UPSTAGE_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ]
      }),
    });
    const raw = await upstream.json();
    let text = raw?.choices?.[0]?.message?.content?.trim() || "{}";
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(text);
    return {
      brand: parsed.brand || null,
      category: parsed.category || null,
      amount: parsed.amount || 30000,
      includeMembership: !!parsed.wantsMembership
    };
  } catch (e) {
    console.error("Entity extraction failed:", e);
    return { brand: null, category: null, amount: 30000, includeMembership: false };
  }
}

function findBestCards(catalog, entities, topN = 3) {
  Engine.init(catalog);
  const wallet = catalog.products.map(p => p.product_id); // 기본적으로 모든 카드를 대상으로 검색
  const state = { spend: {}, grade: 'VIP' }; // 최고 혜택을 보여주기 위해 실적 및 등급을 낙관적으로 가정
  
  const input = {
    brand: entities.brand,
    category: entities.category,
    amount: entities.amount,
    channel: null,
    date: new Date(),
    time: null,
    ignoreDays: true
  };
  
  const combos = Engine.buildCombos(input, state, wallet) || [];
  return combos.slice(0, topN);
}

function buildCandidateText(candidates) {
  if (!candidates || candidates.length === 0) return "조건에 맞는 추천 카드나 혜택이 없습니다.";
  let text = "";
  candidates.forEach((combo, idx) => {
    text += `[후보 ${idx + 1}] 상품명: ${combo.product.product_name} (${combo.product.provider})\n`;
    text += `- 총 할인/적립 예상 금액: ${Engine.won(combo.grandTotal)}\n`;
    combo.items.forEach(item => {
      text += `  * 혜택명: ${item.benefit.benefit_name} (${item.value > 0 ? Engine.won(item.value) : '포인트/기타'})\n`;
      if (item.notes && item.notes.length > 0) text += `    참고사항: ${item.notes.join(', ')}\n`;
      if (item.checks && item.checks.length > 0) text += `    확인조건: ${item.checks.join(', ')}\n`;
    });
    text += "\n";
  });
  return text.trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  loadEnv();
  const apiKey = getUpstageApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: "UPSTAGE_API_KEY가 서버에 없습니다. 로컬은 .env.local, Vercel은 Environment Variables에 UPSTAGE_API_KEY를 넣어 주세요.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const message = String(body.message || "").trim();
    if (!message) return res.status(400).json({ error: "message가 비어 있습니다." });

    /* ---- ① LLM을 이용한 질문 분석 (엔티티 추출) ---- */
    const model = getUpstageModel();
    const entities = await extractEntities(message, apiKey, model);
    
    /* ---- ② 카탈로그 로드 ---- */
    const { data: catalog, source } = await loadCatalog();

    /* ---- ③ Engine.buildCombos() — 규칙 기반 엔진으로 혜택액 정확히 계산 ---- */
    const candidates = findBestCards(catalog, entities, 3);

    /* ---- ④ 설명 생성을 위한 텍스트 조립 ---- */
    const candidateText = buildCandidateText(candidates);

    /* ---- ⑤ Solar-Pro: 설명만 작성 ---- */
    const messages = [
      { role: "system", content: systemPrompt(candidateText, { includeMembership: entities.includeMembership }) },
      { role: "user", content: message.slice(0, 2000) },
    ];

    const upstream = await fetch(UPSTAGE_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
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
        category: entities.category,
        brand: entities.brand,
        amount: entities.amount,
        includeMembership: entities.includeMembership,
        candidateCount: candidates.length,
        candidateProducts: candidates.map((c) => c.product_id),
      },
    });
  } catch (err) {
    console.error("chat api error:", err);
    return res.status(500).json({ error: err.message || "챗봇 처리 중 오류가 발생했습니다." });
  }
}