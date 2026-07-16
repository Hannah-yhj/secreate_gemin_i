let DB = null;


  /* ===== 결제 최적화 엔진 ===== */
const Engine = (() => {

  // ---------- 유틸 ----------
  const split = (s) => (s ? String(s).split('|').map(t => t.trim()).filter(Boolean) : []);
  const cats = (s) => (s ? String(s).split('/').map(t => t.trim()) : []);
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';

  // 나라사랑 Life 통합 한도 (전월실적 구간별)
  const NARA_TIERS = [
    { min: 100000, max: 200000, limit: 5000 },
    { min: 200000, max: 500000, limit: 20000 },
    { min: 500000, max: 700000, limit: 30000 },
    { min: 700000, max: 1000000, limit: 40000 },
    { min: 1000000, max: Infinity, limit: 50000 },
  ];
  // 노리2 통합 한도
  const NORI2_TIERS = [
    { min: 200000, max: 400000, limit: 20000 },
    { min: 400000, max: 600000, limit: 30000 },
    { min: 600000, max: 800000, limit: 40000 },
    { min: 800000, max: Infinity, limit: 50000 },
  ];

  const FUEL_PRICE = 1700; // 리터당 기준유가 가정 (원/L 환산용)

  let engineDB = null;
  let productById = {};
  let brandCategory = {}; // 브랜드 → Set(카테고리)

  function init(db) {
    engineDB = db;
    productById = {};
    engineDB.products.forEach(p => productById[p.product_id] = p);
    brandCategory = {};
    db.benefits.forEach(b => {
      const cs = cats(b.category);
      split(b.merchants_or_scope).forEach(tok => {
        if (tok.includes('업종') || tok.includes('가맹점')) return;
        if (!brandCategory[tok]) brandCategory[tok] = new Set();
        cs.forEach(c => brandCategory[tok].add(c));
      });
    });
  }

  // 검색용 브랜드 목록
  function brandList() {
    return Object.keys(brandCategory).sort((a, b) => a.localeCompare(b, 'ko'));
  }

  // 카테고리에 속한 브랜드만 (예: 카페 → 스타벅스, 커피빈 …)
  function brandsByCategory(category) {
    if (!category) return brandList();
    return Object.keys(brandCategory)
      .filter(b => {
        const cs = brandCategory[b];
        return cs.has(category) || [...cs].some(c => c === category || c.includes(category) || category.includes(c));
      })
      .sort((a, b) => a.localeCompare(b, 'ko'));
  }

  function categoriesOfBrand(brand) {
    return brandCategory[brand] ? [...brandCategory[brand]] : [];
  }

  // ---------- 매칭 ----------
  // input: { brand, category, amount, channel('offline'|'online'|null), date(Date), time('HH:MM'|null) }
  function matchesTarget(b, input) {
    // KB Pay 등 결제방식 스코프 혜택: 국내 모든 가맹점에서 해당 방식으로 결제 시 적용
    if (b.merchant_scope_type === 'payment_method') return !input.overseas && !input.categoryOnly;
    if (b.merchant_scope_type === 'region') return !!input.overseas;
    const toks = split(b.merchants_or_scope);
    const bCats = cats(b.category);
    if (input.brand) {
      // 1) 브랜드 직접 매칭
      if (toks.some(t => t === input.brand || t.includes(input.brand) || input.brand.includes(t.replace(' 업종', '')))) return true;
      // 2) 업종(카테고리) 범위 혜택 → 브랜드의 카테고리와 교집합
      const scope = b.merchant_scope_type;
      const isCategoryScope = toks.some(t => t.includes('업종')) || scope === 'mixed';
      if (isCategoryScope) {
        const brandCats = categoriesOfBrand(input.brand);
        if (brandCats.some(c => bCats.includes(c))) {
          // 브랜드명이 명시된 리스트형 혜택(예: 스타벅스|커피빈)은 직접 매칭 실패 시 제외
          const isExplicitList = toks.length > 0 && !toks.some(t => t.includes('업종'));
          if (!isExplicitList) return true;
        }
      }
      return false;
    }
    if (input.category) {
      return bCats.some(c => cats(input.category).includes(c) || c === input.category);
    }
    return false;
  }

  // ---------- 개별 혜택 평가 ----------
  // 반환: null(대상 아님) 또는 { benefit, value, isPoint, status, checks[], notes[], excluded, reason }
  function evalBenefit(b, input, state) {
    const checks = []; // 확인 필요 조건 (conditional 사유)
    const notes = [];  // 참고 문구
    let status = 'eligible';
    const amount = input.amount;
    const p = productById[b.product_id];

    // 옵션 그룹 (My WE:SH 서비스팩 / 노리2 변형)
    if (b.option_group_id === 'OG_MYWISH_PACK') {
      if (state.mywishPack && state.mywishPack !== b.option_value) return { excluded: true };
      if (!state.mywishPack) checks.push(`서비스팩 '${b.option_value}' 선택 시에만 적용`);
    }
    if (b.option_group_id === 'OG_NORI2_VARIANT') {
      if (state.nori2Variant && state.nori2Variant !== b.option_value) return { excluded: true };
      if (!state.nori2Variant) checks.push(`${b.option_value}형 발급 카드만 적용`);
    }

    // 기간
    if (b.start_date || b.end_date) {
      const d = input.date;
      const ds = d.toISOString().slice(0, 10);
      if (b.start_date && ds < b.start_date) return { excluded: true, reason: '프로모션 시작 전' };
      if (b.end_date && ds > b.end_date) return { excluded: true, reason: '프로모션 종료' };
      const dday = Math.ceil((new Date(b.end_date) - d) / 86400000);
      if (dday >= 0 && dday <= 31) notes.push(`~${b.end_date} 한정 (D-${dday})`);
    }

    // 요일
    if (b.eligible_days && b.eligible_days !== 'ALL') {
      const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const today = dayMap[input.date.getDay()];
      if (!split(b.eligible_days).includes(today)) {
        if (input.ignoreDays) { checks.push('토·일 결제 시에만 적용'); status = 'conditional'; }
        else return { excluded: true, reason: '요일 조건(주말 전용) 미충족' };
      } else notes.push('주말(토·일) 전용');
    }

    // 시간대 (21:00~09:00 야간 등)
    if (b.time_start && b.time_end) {
      const label = `${b.time_start}~${b.time_end} 결제 시에만 적용`;
      if (input.time) {
        const t = input.time;
        const inWindow = b.time_start > b.time_end
          ? (t >= b.time_start || t < b.time_end)
          : (t >= b.time_start && t < b.time_end);
        if (!inWindow) return { excluded: true, reason: '시간대 조건 미충족' };
        notes.push(label);
      } else {
        checks.push(label);
        status = 'conditional';
      }
    }

    // 최소 결제금액
    if (b.min_payment && b.min_payment > 1 && amount < b.min_payment) {
      return { excluded: true, reason: `최소 결제금액 ${won(b.min_payment)} 미만` };
    }

    // 결제 채널
    const ch = b.payment_channel || '';
    if (input.channel === 'offline' && /온라인|온라인\/앱|공식 홈페이지|정기결제|결제창/.test(ch) && !/오프라인|온오프라인|전체/.test(ch)) {
      return { excluded: true, reason: '온라인 전용 혜택' };
    }
    if (input.channel === 'online' && /오프라인/.test(ch) && !/온라인|온오프라인|전체/.test(ch)) {
      return { excluded: true, reason: '오프라인 전용 혜택' };
    }
    if (/자동납부/.test(ch)) { checks.push('자동납부 등록 필요'); status = 'conditional'; }
    if (/앱 내 카드결제/.test(ch)) notes.push('앱 내 카드결제만 적용');
    if (/공식 홈페이지/.test(ch)) notes.push('공식 홈페이지/앱 정기결제 기준');
    if (/결제창/.test(ch)) notes.push('해당 브랜드 결제창에서 결제');

    // 전월 실적
    const spend = state.spend[b.product_id]; // number | null(모름)
    if (b.spend_min) {
      if (spend == null) {
        checks.push(`전월실적 ${won(b.spend_min)} 이상 필요 (미확인)`);
        status = 'conditional';
      } else if (spend < b.spend_min) {
        // 실적구간 티어 행: 다른 티어가 잡힐 수 있으므로 제외
        return { excluded: true, reason: `전월실적 미달 (${won(b.spend_min)} 이상 필요)` };
      } else if (b.spend_max && spend >= b.spend_max) {
        return { excluded: true, reason: '상위 실적 구간 적용' };
      }
    }

    // 통신사 멤버십 등급 조건
    if (b.required_grade) {
      const order = split(p.grade_order);
      const need = order.indexOf(b.required_grade);
      const have = state.grade ? order.indexOf(state.grade) : -1;
      if (need === -1) {
        checks.push(`${b.required_grade} 등급 확인 필요`);
        status = 'conditional';
      } else if (have === -1) {
        checks.push(`${b.required_grade} 이상 등급에서 제공 (등급 미선택)`);
        status = 'conditional';
      } else if (have < need) {
        return { excluded: true, reason: `${b.required_grade} 이상 등급 필요` };
      } else {
        notes.push(`${b.required_grade} 이상 등급 혜택`);
      }
    }

    // 결제 수단/자금원 조건
    if (b.required_funding_method) {
      const f = b.required_funding_method;
      if (/삼성카드|우리카드/.test(f)) { checks.push(`${f} 연결 필요`); status = 'conditional'; }
      else if (/계좌|머니/.test(f)) notes.push('토스 계좌/머니 결제 기준');
    }

    // 사용자 세그먼트
    if (b.user_segment && b.user_segment !== '전체') {
      if (/첫 결제/.test(b.user_segment)) { checks.push('첫 결제 고객 한정'); status = 'conditional'; }
      else if (/나라사랑/.test(b.user_segment)) notes.push('나라사랑카드 발급 대상자 전용');
      else if (/네이버ID/.test(b.user_segment)) notes.push('네이버ID 실명인증 필요');
      else if (/KB Pay형|Global형/.test(b.user_segment)) { /* 옵션그룹에서 처리 */ }
    }

    // 횟수 제한
    if (b.frequency_period && b.frequency_count) {
      const per = { day: '일', month: '월', year: '연', event: '행사기간 중', lifetime: '최초' }[b.frequency_period] || b.frequency_period;
      notes.push(`${per} ${b.frequency_count}회 한도 (이번 달 사용 여부 확인)`);
      if (status === 'eligible') status = 'conditional';
      checks.push(`${per} ${b.frequency_count}회 이내인지 확인`);
    }

    // ---------- 할인액 계산 ----------
    let value = 0, isPoint = false, estimate = false, isGift = false;
    const unit = b.benefit_unit;
    if (unit === '증정') {
      value = 0;
      isGift = true;
    } else if (unit === '%') {
      value = amount * b.benefit_value / 100;
      if (b.per_tx_discount_limit) value = Math.min(value, b.per_tx_discount_limit);
    } else if (unit === '원') {
      value = b.benefit_value;
    } else if (unit === '원/L') {
      const liters = amount / FUEL_PRICE;
      value = liters * b.benefit_value;
      estimate = true;
      notes.push(`유가 ${FUEL_PRICE.toLocaleString()}원/L 가정 추정치`);
    } else if (unit === '원_결제가') {
      // 정액판매: 결제가가 benefit_value로 고정 → 할인 = 정가 - 정액
      if (amount <= b.benefit_value) return { excluded: true, reason: '정액판매가 이하 금액' };
      value = amount - b.benefit_value;
      notes.push(`${won(b.benefit_value)} 정액 구매 (1인 최대 2매)`);
    } else if (unit === '포인트') {
      value = b.benefit_value; isPoint = true;
    } else {
      value = b.benefit_value || 0;
    }

    // 월 한도
    if (b.monthly_discount_limit) {
      if (value > b.monthly_discount_limit) {
        value = b.monthly_discount_limit;
        notes.push(`월 한도 ${won(b.monthly_discount_limit)} 적용`);
      } else {
        notes.push(`월 한도 ${won(b.monthly_discount_limit)} (잔여분 미확인)`);
      }
    }

    // 공유 통합 한도 (나라사랑 Life / 노리2)
    if (b.limit_group_id === 'LG_NARA_LIFE') {
      const tier = spend != null ? NARA_TIERS.find(t => spend >= t.min && spend < t.max) : null;
      if (spend != null && !tier) return { excluded: true, reason: '전월실적 10만원 미만' };
      const cap = tier ? tier.limit : NARA_TIERS[0].limit;
      if (value > cap) { value = cap; }
      notes.push(tier
        ? `Life 통합 캐시백 한도 월 ${won(cap)} 구간`
        : 'Life 통합 캐시백 한도: 실적 구간별 월 5천~5만원');
    }
    if (b.limit_group_id && b.limit_group_id.startsWith('LG_NORI2_COMMON')) {
      const tier = spend != null ? NORI2_TIERS.find(t => spend >= t.min && spend < t.max) : null;
      const isCoffee = b.benefit_id === 'B_NORI2_CAFE';
      if (spend != null && spend < 200000 && !isCoffee) return { excluded: true, reason: '전월실적 20만원 미만 (커피만 제공)' };
      const cap = tier ? tier.limit : NORI2_TIERS[0].limit;
      if (value > cap) value = cap;
      notes.push(isCoffee ? '커피 혜택은 전월실적 무관 제공' : `노리2 통합 월 한도 ${spend != null ? won(cap) : '2만~5만원(실적 구간별)'}`);
    }

    // 결제 방식 지시
    if (b.merchant_scope_type === 'payment_method') notes.push(`${split(b.merchants_or_scope)[0]}(으)로 결제해야 적용`);

    // 제외 조건
    if (b.exclusions_summary) { checks.push(`제외: ${b.exclusions_summary}`); }

    // 원문 조건 (동반할인 등 스키마로 못 담는 세부조항을 참고용으로 노출)
    if (b.raw_condition_note) { notes.push(b.raw_condition_note); }

    value = Math.floor(value);
    if (value <= 0 && !isGift) return { excluded: true, reason: '할인액 0원' };
    return { benefit: b, value, isPoint, isGift, estimate, status, checks, notes };
  }

  // ---------- 티어 중복 제거 ----------
  // 같은 상품·같은 혜택명은 실적/금액 구간 중 최적 1행만
  function dedupeTiers(results, state) {
    const groups = {};
    results.forEach(r => {
      const key = r.benefit.product_id + '|' + r.benefit.benefit_name + '|' + r.benefit.category;
      (groups[key] = groups[key] || []).push(r);
    });
    const out = [];
    Object.values(groups).forEach(g => {
      if (g.length === 1) { out.push(g[0]); return; }
      const isSpendTier = g.some(r => r.benefit.spend_min);
      const spendKnown = !isSpendTier || state.spend[g[0].benefit.product_id] != null;
      // 실적 확인됨(또는 애초에 실적 구간이 아니라 등급 구간 등) → evalBenefit에서 이미 구간 필터됨 → 가치 최대 1행
      // 실적 미확인 → 최소 실적 구간(보수적) 행 선택 + 상위 구간 가능성 표기
      g.sort((a, b) => (a.benefit.spend_min || 0) - (b.benefit.spend_min || 0) || b.value - a.value);
      let pick;
      if (spendKnown) {
        pick = g.reduce((m, r) => r.value > m.value ? r : m, g[0]);
      } else {
        pick = g[0];
        const best = g.reduce((m, r) => r.value > m.value ? r : m, g[0]);
        if (best.value > pick.value) {
          pick.notes.push(`실적 상위 구간이면 최대 ${won(best.value)}까지 가능`);
        }
      }
      // 금액 구간 티어(min_payment 상이, 예: 신라면세점): 충족 중 최대가치 행
      const byMin = g.filter(r => !r.benefit.spend_min);
      if (byMin.length === g.length) pick = g.reduce((m, r) => r.value > m.value ? r : m, g[0]);
      out.push(pick);
    });
    return out;
  }

  // ---------- 상품별 결제 조합 구성 ----------
  function buildCombos(input, state, wallet) {
    const matched = [];
    engineDB.benefits.forEach(b => {
      if (!wallet.includes(b.product_id)) return;
      if (!matchesTarget(b, input)) return;
      const r = evalBenefit(b, input, state);
      if (r && !r.excluded) matched.push(r);
    });
    const deduped = dedupeTiers(matched, state);

    // 상품별 그룹
    const byProduct = {};
    deduped.forEach(r => (byProduct[r.benefit.product_id] = byProduct[r.benefit.product_id] || []).push(r));

    const combos = [];
    Object.entries(byProduct).forEach(([pid, rs]) => {
      const p = productById[pid];
      // application_order 1(기본) 중 최대 1개 + order 2(추가 적립형) 스택
      // 증정형(무료 제공)은 금액이 없어 순위 계산에서 제외하고, 있으면 항상 별도로 덧붙여 보여준다
      const gifts = rs.filter(r => r.isGift);
      const primaries = rs.filter(r => (r.benefit.application_order || 1) === 1 && !r.isGift);
      const stackers = rs.filter(r => (r.benefit.application_order || 1) > 1 && r.benefit.stackable && !r.isGift);
      if (!primaries.length && !stackers.length && !gifts.length) return;

      let items = [];
      if (primaries.length) {
        // 특수 스택: 나라사랑 CU 즉시할인 → 캐시백 (즉시할인 후 금액 기준)
        const cuEvent = primaries.find(r => r.benefit.benefit_id === 'B_NARA_CU_EVENT');
        const cuCash = primaries.find(r => r.benefit.benefit_id === 'B_NARA_CVS');
        if (cuEvent && cuCash) {
          const net = input.amount - cuEvent.value;
          let cash = Math.min(net * 0.2, cuCash.benefit.per_tx_discount_limit || Infinity, cuCash.value);
          cuCash.value = Math.floor(cash);
          cuCash.notes.push('즉시할인 차감 후 금액 기준 캐시백');
          cuEvent.checks.push('CU 행사상품에 한해 즉시할인');
          cuEvent.status = 'conditional';
          items = [cuEvent, cuCash];
        } else {
          const best = primaries.reduce((m, r) => r.value > m.value ? r : m, primaries[0]);
          items = [best];
        }
      }
      if (stackers.length) {
        const bestStack = stackers.reduce((m, r) => r.value > m.value ? r : m, stackers[0]);
        if (items.length) {
          bestStack.notes.push('기본 혜택과 중복 적용(추가 환급)');
          items.push(bestStack);
        }
      }
      if (gifts.length) {
        items.push(gifts[0]);
      }

      if (!items.length) return;
      const total = items.reduce((s, r) => s + (r.isPoint ? 0 : r.value), 0);
      const points = items.reduce((s, r) => s + (r.isPoint ? r.value : 0), 0);
      const status = items.some(r => r.status === 'conditional') ? 'conditional' : 'eligible';
      const conf = items.map(r => r.benefit.confidence).includes('medium') ? 'medium' : 'high';
      const srcIds = [...new Set(items.map(r => r.benefit.source_id))];
      combos.push({
        product: p, items, total, points,
        grandTotal: total + points,
        status, confidence: conf, sourceIds: srcIds,
      });
    });

    combos.sort((a, b) => b.grandTotal - a.grandTotal || (a.status === 'eligible' ? -1 : 1));
    return combos;
  }

  // ---------- 홈: 카테고리별 최고 혜택 ----------
  const HOME_CATS = [
    { key: '카페', icon: '☕', sample: 6000 },
    { key: '편의점', icon: '🏪', sample: 8000 },
    { key: '외식', icon: '🍽️', sample: 30000 },
    { key: '배달', icon: '🛵', sample: 25000 },
    { key: '영화', icon: '🎬', sample: 15000 },
    { key: '구독', icon: '📺', sample: 17000 },
    { key: '통신', icon: '📱', sample: 60000 },
    { key: '교통', icon: '🚌', sample: 60000 },
    { key: '택시', icon: '🚕', sample: 12000 },
    { key: '대형마트', icon: '🛒', sample: 80000 },
    { key: '주유', icon: '⛽', sample: 70000 },
    { key: '온라인쇼핑', icon: '📦', sample: 50000 },
    { key: '의료', icon: '💊', sample: 15000 },
    { key: '도서', icon: '📚', sample: 20000 },
    { key: '패션', icon: '👕', sample: 80000 },
    { key: '뷰티', icon: '💄', sample: 30000 },
    { key: '테마파크', icon: '🎢', sample: 62000 },
    { key: '여행', icon: '✈️', sample: 200000 },
    { key: '면세점', icon: '🛍️', sample: 300000 },
    { key: '공과금', icon: '🧾', sample: 50000 },
  ];

  function homeBoard(state, wallet, date) {
    return HOME_CATS.map(c => {
      const input = { category: c.key, amount: c.sample, channel: null, date: date || new Date(), time: null, ignoreDays: true, categoryOnly: true };
      const combos = buildCombos(input, state, wallet);
      const best = combos[0] || null;
      return { ...c, best };
    });
  }

  function sourceById(id) { return engineDB.sources.find(s => s.source_id === id); }

  return { init, brandList, brandsByCategory, categoriesOfBrand, buildCombos, homeBoard, sourceById, won, HOME_CATS, productById: () => productById };
})();

