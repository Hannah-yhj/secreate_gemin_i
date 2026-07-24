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

async function callLLM(messages, apiKey, model) {
  const upstream = await fetch(UPSTAGE_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  const raw = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(raw?.error?.message || raw?.message || `Upstage HTTP ${upstream.status}`);
  }
  return raw?.choices?.[0]?.message?.content?.trim();
}

async function analyzeIntentAndExtract(message, apiKey, model) {
  const systemPrompt = `당신은 사용자의 질문 의도를 분석하고 필요한 정보를 추출하는 라우터(Router) AI입니다.
오직 JSON 형식으로만 응답하세요.

질문을 다음 3가지 모드 중 하나로 분류하세요:
- "A": 정확한 계산 필요 (특정 브랜드, 업종, 결제 금액 등 명시적인 조건이 있는 경우. 예: "스타벅스 15000원 결제", "배민 할인카드", "햄버거 먹을건데 어떤 카드")
- "B": 추상적 추천 필요 (상황, 대상, 목적 등 모호한 조건으로 카드를 추천받으려는 경우. 예: "해외여행 갈 때 쓸 카드", "20대 대학생 카드 추천")
- "C": 비교 및 정보 조회 (특정 카드들의 혜택을 비교하거나 상세 정보를 물어보는 경우. 예: "A카드랑 B카드 비교해줘", "내 통신사 혜택 알려줘")

응답 JSON 구조:
{
  "mode": "A", // 또는 "B", "C"
  "brand": "아웃백", // Mode A인 경우 (언급 없으면 null)
  "category": "영화", // Mode A인 경우 (언급 없으면 null)
  "amount": 50000, // Mode A인 경우 (언급 없으면 기본값 30000)
  "wantsMembership": false, // Mode A인 경우
  "keywords": ["해외여행", "라운지"] // Mode B, C인 경우 검색 키워드
}`;

  try {
    const text = await callLLM([
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ], apiKey, model);
    
    let cleanText = text || "{}";
    if (cleanText.startsWith("```json")) cleanText = cleanText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    
    const parsed = JSON.parse(cleanText);
    return {
      mode: parsed.mode === "B" || parsed.mode === "C" ? parsed.mode : "A",
      brand: parsed.brand || null,
      category: parsed.category || null,
      amount: parsed.amount || 30000,
      includeMembership: !!parsed.wantsMembership,
      keywords: parsed.keywords || []
    };
  } catch (e) {
    console.error("Intent extraction failed:", e);
    return { mode: "A", brand: null, category: null, amount: 30000, includeMembership: false, keywords: [] };
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
  
  let combos = Engine.buildCombos(input, state, wallet) || [];
  
  // 챗봇 맞춤형 필터링 로직:
  // 사용자가 특정 브랜드를 명시하지 않고 카테고리(예: 햄버거, 외식)만 물어본 경우,
  // 연간 1회 제공되는 프리미엄 바우처(예: 호텔 뷔페 25만원)나 과도한 혜택이 일상 소비 추천 1위로 뜨는 것을 방지
  if (!entities.brand) {
    combos = combos.filter(combo => {
      return !combo.items.some(item => {
        const b = item.benefit;
        const isAnnualVoucher = b.frequency_period === 'year' || b.frequency_period === '연';
        // 카테고리만 검색 시, 고액 고정(원) 혜택(공항 커피 3만원, 이벤트성 1.5만원 등)이 1위로 도배되는 것을 방지.
        // 일반적인 일상 카테고리 고정 할인은 대개 1000원~3000원 선이므로 5000원 초과를 고액으로 간주하여 필터링합니다.
        const isExcessiveFixed = b.benefit_unit === '원' && item.value > 5000;
        return isAnnualVoucher || isExcessiveFixed;
      });
    });
  }

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

function buildCatalogSummary(catalog) {
  let summary = "";
  catalog.products.forEach(p => {
    const bens = catalog.benefits.filter(b => b.product_id === p.product_id);
    const keyBenefits = bens.map(b => b.benefit_name).slice(0, 10).join(", ");
    summary += `- ${p.product_name} (${p.provider}): 주요 혜택 [${keyBenefits}]\n`;
  });
  return summary;
}

function systemPromptForModeBC(catalogSummary, mode) {
  return `당신은 "결제 지시서" 서비스의 카드 추천/상담 챗봇입니다.
사용자의 질문이 ${mode === "B" ? "추상적인 상황/목적을 가진 카드 추천" : "카드 혜택 비교나 정보 조회"}입니다.

아래는 현재 시스템에 등록된 전체 카드들의 이름과 주요 혜택 요약 목록입니다.
이 정보를 참고하여 사용자에게 가장 적합한 대답을 생성해주세요.
만약 모르는 정보라면 지어내지 말고, "현재 등록된 카드 정보에서는 확인이 어렵습니다"라고 정직하게 대답하세요.

[카드 카탈로그 요약]
${catalogSummary}

답변은 한국어로 친절하게 작성하며, 마크다운(굵은 글씨, 목록 등)을 적절히 사용하여 가독성 있게 작성하세요.
답변 마지막에는 항상 "마이페이지에서 카드/통신사를 등록하면 더 정확한 혜택 비교가 가능합니다." 라고 안내해주세요.`;
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

    /* ---- ① LLM을 이용한 질문 분석 (인텐트 라우팅) ---- */
    const model = getUpstageModel();
    const intent = await analyzeIntentAndExtract(message, apiKey, model);
    
    /* ---- ② 카탈로그 로드 ---- */
    const { data: catalog, source } = await loadCatalog();

    let reply = "";
    let candidates = [];

    if (intent.mode === "A") {
      /* ---- Mode A: 규칙 엔진 기반 정확한 계산 ---- */
      candidates = findBestCards(catalog, intent, 3);
      const candidateText = buildCandidateText(candidates);
      const messages = [
        { role: "system", content: systemPrompt(candidateText, { includeMembership: intent.includeMembership }) },
        { role: "user", content: message.slice(0, 2000) },
      ];
      reply = await callLLM(messages, apiKey, model);
      if (!reply) return res.status(502).json({ error: "Solar 응답이 비어 있습니다." });
    } else {
      /* ---- Mode B/C: LLM 중심의 시맨틱 검색 / 펑션 콜링 모방 ---- */
      const catalogSummary = buildCatalogSummary(catalog);
      const messages = [
        { role: "system", content: systemPromptForModeBC(catalogSummary, intent.mode) },
        { role: "user", content: message.slice(0, 2000) },
      ];
      reply = await callLLM(messages, apiKey, model);
      if (!reply) return res.status(502).json({ error: "Solar 응답이 비어 있습니다." });
    }

    return res.status(200).json({
      reply,
      meta: {
        model,
        dataSource: source,
        mode: intent.mode,
        category: intent.category,
        brand: intent.brand,
        amount: intent.amount,
        includeMembership: intent.includeMembership,
        candidateCount: candidates.length,
        candidates: candidates,
        candidateProducts: candidates.map((c) => c.product_id),
      },
    });
  } catch (err) {
    console.error("chat api error:", err);
    return res.status(500).json({ error: err.message || "챗봇 처리 중 오류가 발생했습니다." });
  }
}