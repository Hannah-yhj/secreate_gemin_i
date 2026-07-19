// lib/engine.js
// "선택"은 여기서 결정론적으로(Node 코드로) 처리하고,
// Solar는 이 결과를 설명하는 역할만 하도록 분리한다.

// ⚠️ 아래 카테고리/키워드, 필드명(spend_min, required_grade, per_tx_discount_limit 등)은
//    실제 benefits 테이블 컬럼명에 맞춰 조정이 필요할 수 있어요.
const CATEGORY_KEYWORDS = {
    대중교통: ["버스", "지하철", "택시", "카카오t", "환승", "교통"],
    카페: ["카페", "커피", "스타벅스", "이디야", "투썸", "폴바셋"],
    편의점: ["편의점", "cu", "gs25", "세븐일레븐", "이마트24"],
    주유: ["주유", "기름", "오일뱅크", "sk에너지", "gs칼텍스", "현대오일"],
    영화: ["영화", "cgv", "메가박스", "롯데시네마"],
    쇼핑: ["쇼핑", "온라인쇼핑", "쿠팡", "11번가", "g마켓"],
    배달: ["배달", "배달의민족", "요기요", "쿠팡이츠"],
    통신비: ["통신비", "휴대폰요금", "핸드폰요금", "핸드폰비"],
  };
  
  /** 사용자 메시지에서 카테고리를 추정 (AI 호출 없이 키워드 매칭) */
  export function detectCategory(message) {
    const lower = String(message || "").toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((k) => lower.includes(k.toLowerCase()))) return category;
    }
    return null;
  }

  /** 통신사 멤버십 상품 여부 */
  export function isMembershipProduct(p) {
    if (!p) return false;
    if (p.service_type === "통신사") return true;
    if (p.carrier_code) return true;
    const blob = `${p.product_type || ""} ${p.product_name || ""}`;
    return /멤버[십쉽]|membership/i.test(blob);
  }

  /**
   * 사용자가 멤버십을 직접 언급했는지.
   * "통신비 할인 카드" 같은 카드 질문은 멤버십 요청으로 보지 않음.
   */
  export function wantsMembership(message) {
    const t = String(message || "");
    return /멤버[십쉽]|membership|통신사\s*멤버|멤버십\s*(혜택|할인|등급)|t멤버|티멤버/i.test(t)
      || /\b(kt|skt|lgu\+?|유플러스|lg\s*u\+)\s*(멤버|등급|vip|vvip)/i.test(t);
  }
  
  /** "1만원", "12000원", "3천원" 같은 표현에서 금액 추정 */
  export function detectAmount(message) {
    const text = String(message || "");
    const man = text.match(/(\d+(?:\.\d+)?)\s*만\s*원?/);
    if (man) return Math.round(parseFloat(man[1]) * 10000);
    const cheon = text.match(/(\d+(?:\.\d+)?)\s*천\s*원?/);
    if (cheon) return Math.round(parseFloat(cheon[1]) * 1000);
    const won = text.match(/(\d{3,7})\s*원/);
    if (won) return parseInt(won[1], 10);
    return null;
  }
  
  function matchesCategory(benefit, category) {
    if (!category) return true; // 카테고리를 못 잡았으면 전체 대상으로 비교
    const haystack = `${benefit.category || ""} ${benefit.merchants_or_scope || ""} ${benefit.benefit_name || ""}`.toLowerCase();
    if (haystack.includes(category.toLowerCase())) return true;
    return (CATEGORY_KEYWORDS[category] || []).some((k) => haystack.includes(k.toLowerCase()));
  }
  
  /** 혜택 하나의 예상 절감액을 계산 (비교 기준 금액이 없으면 1만원 기준) */
  function estimateSavings(benefit, amount) {
    const base = amount || 10000;
    if (benefit.benefit_unit === "%") {
      let value = (base * (Number(benefit.benefit_value) || 0)) / 100;
      if (benefit.per_tx_discount_limit != null) {
        value = Math.min(value, Number(benefit.per_tx_discount_limit));
      }
      return Math.round(value);
    }
    return Number(benefit.benefit_value) || 0;
  }
  
  /**
   * TOP N 카드를 Node가 결정론적으로 선정한다. (여기엔 AI 호출이 없음)
   * 기본은 카드만. includeMembership=true일 때만 통신사 멤버십 포함.
   * @returns {Array} 상위 후보 목록 (각 후보에 bestBenefit, score 포함)
   */
  export function findBestCards(catalog, { category, amount, includeMembership = false } = {}, topN = 3) {
    const byProduct = new Map();
    for (const p of catalog.products || []) {
      if (includeMembership) {
        if (!isMembershipProduct(p)) continue;
      } else {
        if (isMembershipProduct(p)) continue;
        const st = String(p.service_type || "");
        const pt = String(p.product_type || "");
        const isCard = st === "카드" || /신용|체크/.test(pt);
        if (!isCard) continue;
      }
      byProduct.set(p.product_id, { ...p, matchedBenefits: [] });
    }
  
    for (const b of catalog.benefits || []) {
      if (!matchesCategory(b, category)) continue;
      const product = byProduct.get(b.product_id);
      if (!product) continue;
      product.matchedBenefits.push({ ...b, estimatedSavings: estimateSavings(b, amount) });
    }
  
    return [...byProduct.values()]
      .filter((p) => p.matchedBenefits.length > 0)
      .map((p) => {
        const best = [...p.matchedBenefits].sort((a, b) => b.estimatedSavings - a.estimatedSavings)[0];
        return { ...p, bestBenefit: best, score: best.estimatedSavings };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }
  
  /** Node가 고른 후보를 Solar에게 넘길 텍스트로 변환 (전체 카탈로그 아님, 후보 3개만) */
  export function buildCandidateText(candidates, { category, amount } = {}) {
    if (!candidates.length) {
      return "(조건에 맞는 카드를 찾지 못했습니다. 사용자에게 조건을 더 구체적으로 물어보세요.)";
    }
    return candidates
      .map((c, i) => {
        const b = c.bestBenefit;
        const rate = b.benefit_unit === "%" ? `${b.benefit_value}%` : `${b.benefit_value}${b.benefit_unit || ""}`;
        return [
          `${i + 1}. ${c.product_name} (${c.provider})`,
          `   - 매칭 혜택명: ${b.benefit_name || "-"}`,
          `   - 대상: ${b.merchants_or_scope || "-"}`,
          `   - 혜택률/금액: ${rate}`,
          `   - 예상 절감액(추정): 약 ${b.estimatedSavings.toLocaleString()}원 (비교 기준금액 ${(amount || 10000).toLocaleString()}원)`,
          `   - 전월실적 조건: ${b.spend_min != null ? b.spend_min.toLocaleString() + "원 이상" : "조건 없음/확인 필요"}`,
          `   - 등급 조건: ${b.required_grade || "없음"}`,
          `   - 종료일: ${b.end_date || "확인 필요"}`,
        ].join("\n");
      })
      .join("\n\n");
  }