/* ===================== UI ===================== */
const PLATE_COLORS = {
  P_KB_MYWISH:'#5B4B8A', P_SH_MRLIFE:'#1D4ED8', P_SH_NARASARANG:'#0E7A5F',
  P_KB_NORI2:'#C9A227', P_TOSSPAY:'#1B64DA', P_NPAY:'#03A75C'
};
const PLATE_LABEL = {
  P_KB_MYWISH:'WE:SH', P_SH_MRLIFE:'Mr.L', P_SH_NARASARANG:'나라', P_KB_NORI2:'노리2', P_TOSSPAY:'toss', P_NPAY:'Npay'
};
const SPEND_OPTS = [
  [null,'모름 (기본)'],[0,'0원 (실적 없음)'],[100000,'10만원대'],[200000,'20만원대'],[300000,'30만원대'],
  [400000,'40만원대'],[500000,'50만원대'],[700000,'70만원대'],[1000000,'100만원 이상']
];
const CARRIERS = ['SKT', 'KT', 'LGU+'];
const GRADES = ['일반', '실버', '골드', 'VIP'];

const S = {
  page: 'mypage',
  benefitTab: 'map',
  wallet: [],
  state: { spend: {}, mywishPack: null, nori2Variant: null },
  user: { loggedIn: false, name: '', email: '' },
  carrier: null,
  grade: null,
  q: {
    brand: '', category: null, amount: 10000,
    channel: null, dayMode: 'today', day: null, time: ''
  },
  chat: {
    messages: [
      { role: 'bot', text: '안녕하세요! 카드 추천 챗봇이에요.\n소비 패턴이나 원하는 혜택을 말씀해 주세요. 예: "카페 많이 가요", "교통비 아끼고 싶어요"' }
    ]
  }
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const won = n => Math.round(n).toLocaleString('ko-KR');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

document.getElementById('todayLabel').textContent =
  new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

/* ---- 사이드바 / 모바일 드로어 ---- */
function isMobileNav() {
  return window.matchMedia('(max-width: 760px)').matches;
}
function openDrawer() {
  if (!isMobileNav()) return;
  const d = $('#drawer'), b = $('#drawerBackdrop'), btn = $('#menuBtn');
  d.classList.add('open');
  b.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}
function closeDrawer() {
  const d = $('#drawer'), b = $('#drawerBackdrop'), btn = $('#menuBtn');
  d.classList.remove('open');
  b.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

$('#menuBtn').addEventListener('click', () => {
  $('#drawer').classList.contains('open') ? closeDrawer() : openDrawer();
});
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawerBackdrop').addEventListener('click', closeDrawer);
window.addEventListener('resize', () => {
  if (!isMobileNav()) closeDrawer();
});

$$('.drawer-nav [data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    S.page = btn.dataset.page;
    if (isMobileNav()) closeDrawer();
    render();
  });
});

/* ---- 데이터 로드 ---- */
fetch('/api/benefits')
  .then(res => res.json())
  .then(data => {
    DB = data;
    Engine.init(DB);
    S.wallet = DB.products.map(p => p.product_id);
    S.state.spend = Object.fromEntries(DB.products.map(p => [p.product_id, null]));
    render();
  })
  .catch(err => {
    console.error('DB 로딩 실패:', err);
    $('#main').innerHTML = `<div class="emptywallet"><b>데이터를 불러오지 못했어요</b>서버(/api/benefits) 연결을 확인해 주세요.</div>`;
  });

function paymentDate() {
  const now = new Date();
  if (S.q.dayMode === 'today') return now;
  const target = Number(S.q.day);
  const d = new Date(now);
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  return d;
}

function shortName(p) {
  return p.product_name
    .replace('KB국민 ', '').replace('신한카드 ', '')
    .replace(' 카드', '').replace(' 체크카드', '').replace(' 체크', '');
}

function spendStatus(pid) {
  const spend = S.state.spend[pid];
  if (spend == null) return { cls: 'unk', label: '실적 미입력' };
  const mins = DB.benefits
    .filter(b => b.product_id === pid && b.spend_min)
    .map(b => b.spend_min);
  if (!mins.length) return { cls: 'ok', label: '실적 조건 없음' };
  const need = Math.min(...mins);
  if (spend >= need) return { cls: 'ok', label: `기본 ${won(need)}원↑ 충족` };
  return { cls: 'need', label: `${won(need)}원 미달` };
}

function render() {
  $$('.drawer-nav [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === S.page));
  const m = $('#main');
  if (!DB) {
    m.innerHTML = `<div class="emptywallet"><b>불러오는 중…</b></div>`;
    return;
  }
  if (S.page === 'mypage') m.innerHTML = viewMyPage();
  else if (S.page === 'benefits') m.innerHTML = viewBenefits();
  else m.innerHTML = viewMore();
  bind();
  window.scrollTo(0, 0);
}

/* ==================== 마이페이지 ==================== */
function viewMyPage() {
  return `
  <div class="page-head">
    <h2>마이페이지</h2>
    <p>로그인 · 통신사 · 카드 추가/관리</p>
  </div>
  <div class="mypage-grid">
    <div class="mypage-col">
      ${sectionLogin()}
      <div style="height:16px"></div>
      ${sectionCarrier()}
    </div>
    <div class="mypage-col">
      ${sectionCards()}
      <div style="height:16px"></div>
      ${sectionSpend()}
    </div>
    <div class="cta-row">
      <button class="cta" id="goBenefits" type="button">저장하고 혜택 추천 보기</button>
    </div>
  </div>`;
}

function sectionLogin() {
  if (S.user.loggedIn) {
    const initial = (S.user.name || 'U').slice(0, 1);
    return `<section class="sheet">
      <h3 class="sec"><span class="sec-num">1</span>로그인</h3>
      <div class="login-status">
        <div class="avatar">${esc(initial)}</div>
        <div>
          <div class="nm">${esc(S.user.name || '회원')}</div>
          <div class="em">${esc(S.user.email)}</div>
        </div>
      </div>
      <button class="cta ghost" id="logoutBtn" type="button">로그아웃</button>
    </section>`;
  }
  return `<section class="sheet">
    <h3 class="sec"><span class="sec-num">1</span>로그인</h3>
    <p class="sub">데모용 로그인이에요. 아무 이메일·비밀번호나 입력해도 됩니다.</p>
    <div class="login-box">
      <div class="field" style="margin:0">
        <label class="fl" for="loginEmail">이메일</label>
        <input type="email" id="loginEmail" placeholder="you@example.com" value="${esc(S.user.email)}">
      </div>
      <div class="field" style="margin:0">
        <label class="fl" for="loginPw">비밀번호</label>
        <input type="password" id="loginPw" placeholder="••••••••">
      </div>
      <button class="cta" id="loginBtn" type="button">로그인</button>
    </div>
  </section>`;
}

function sectionCarrier() {
  return `<section class="sheet">
    <h3 class="sec"><span class="sec-num">2</span>통신사 선택 및 등급</h3>
    <p class="sub">통신사 제휴 혜택 추천에 활용해요.</p>
    <div class="carrier-grid">
      ${CARRIERS.map(c => `<button type="button" data-carrier="${c}" class="${S.carrier === c ? 'on' : ''}">${c}</button>`).join('')}
    </div>
    <label class="fl">멤버십 등급</label>
    <div class="grade-row">
      ${GRADES.map(g => `<button type="button" data-grade="${g}" class="${S.grade === g ? 'on' : ''}">${g}</button>`).join('')}
    </div>
  </section>`;
}

function sectionCards() {
  const rows = DB.products.map(p => {
    const on = S.wallet.includes(p.product_id);
    let opts = '';
    if (p.product_id === 'P_KB_MYWISH' && on) {
      opts = `<div class="opts"><select data-opt="mywishPack" aria-label="My WE:SH 서비스팩">
        <option value="">서비스팩 미선택</option>
        ${['먹는데 진심', '노는데 진심', '관리에 진심'].map(v =>
          `<option ${S.state.mywishPack === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div>`;
    }
    if (p.product_id === 'P_KB_NORI2' && on) {
      opts = `<div class="opts"><select data-opt="nori2Variant" aria-label="노리2 발급 유형">
        <option value="">발급 유형 미선택</option>
        ${['KB Pay', 'Global'].map(v =>
          `<option ${S.state.nori2Variant === v ? 'selected' : ''}>${v}형</option>`).join('')}
      </select></div>`;
    }
    return `<div class="pm">
      <span class="plate" style="background:${PLATE_COLORS[p.product_id]}">${PLATE_LABEL[p.product_id]}</span>
      <div class="info">
        <div class="nm">${esc(p.product_name)}</div>
        <div class="tp">${esc(p.product_type)} · ${esc(p.provider)}</div>
        ${opts}
      </div>
      <label class="sw">
        <input type="checkbox" data-pm="${p.product_id}" ${on ? 'checked' : ''} aria-label="${esc(p.product_name)} 보유">
        <span class="tr"></span><span class="kn"></span>
      </label>
    </div>`;
  }).join('');

  return `<section class="sheet">
    <h3 class="sec"><span class="sec-num">3</span>카드 추가 및 삭제</h3>
    <p class="sub">켜 둔 수단끼리만 비교해서 추천해요. 끄면 지갑에서 제외됩니다.</p>
    <div>${rows}</div>
  </section>`;
}

function sectionSpend() {
  const spendRows = DB.products
    .filter(p => p.product_type !== '간편결제' && S.wallet.includes(p.product_id))
    .map(p => {
      const st = spendStatus(p.product_id);
      return `<div class="spendrow">
        <div style="flex:1;min-width:0">
          <span class="lb">${esc(p.product_name)}</span>
          <div style="margin-top:4px"><span class="spend-badge ${st.cls}">${st.label}</span></div>
        </div>
        <select data-spend="${p.product_id}" aria-label="${esc(p.product_name)} 전월실적">
          ${SPEND_OPTS.map(([v, l]) =>
            `<option value="${v === null ? '' : v}" ${S.state.spend[p.product_id] === v ? 'selected' : ''}>${l}</option>`
          ).join('')}
        </select>
      </div>`;
    }).join('');

  return `<section class="sheet">
    <h3 class="sec"><span class="sec-num">4</span>카드 관리 <span style="font-weight:500;font-size:12px;color:var(--mut)">(실적 충족)</span></h3>
    <p class="sub">전월 실적을 입력하면 혜택 조건·한도 계산이 더 정확해져요.</p>
    ${spendRows || '<p class="sub" style="padding:8px 0">실적이 필요한 카드가 지갑에 없어요.</p>'}
  </section>`;
}

/* ==================== 혜택 추천 ==================== */
function viewBenefits() {
  return `
  <div class="page-head">
    <h2>혜택 추천</h2>
    <p>카테고리 지도와 결제 지시서를 확인하세요</p>
  </div>
  <div class="subtabs">
    <button type="button" data-btab="map" class="${S.benefitTab === 'map' ? 'on' : ''}">혜택 지도</button>
    <button type="button" data-btab="calc" class="${S.benefitTab === 'calc' ? 'on' : ''}">결제 계산</button>
  </div>
  ${S.benefitTab === 'map' ? viewHome() : viewCalc()}`;
}

function viewHome() {
  if (!S.wallet.length) {
    return `<div class="emptywallet"><b>지갑이 비어 있어요</b>마이페이지에서 결제수단을 먼저 켜 주세요.
      <button class="cta" id="goMyPage" style="margin-top:14px">마이페이지로</button></div>`;
  }
  const board = Engine.homeBoard(S.state, S.wallet, new Date());
  const cards = board.map(c => {
    if (!c.best) {
      return `<button type="button" class="cat" data-cat="${c.key}">
        <span class="ic">${c.icon}</span><span class="ct">${c.key}</span>
        <span class="none">등록된 혜택 없음</span></button>`;
    }
    const b = c.best, it = b.items[0], bf = it.benefit;
    const isWknd = b.items.some(x => x.checks.some(k => k.includes('토·일')));
    const dday = b.items.map(x => (x.notes.find(n => n.includes('D-')) || '').match(/D-\d+/)).find(Boolean);
    const rate = bf.benefit_unit === '%' ? `${bf.benefit_value}%`
      : bf.benefit_unit === '원/L' ? `L당 ${bf.benefit_value}원`
      : bf.benefit_unit === '원_결제가' ? `${won(bf.benefit_value)}원 정액`
      : `${won(bf.benefit_value)}${bf.benefit_unit === '포인트' ? 'P' : '원'}`;
    return `<button type="button" class="cat" data-cat="${c.key}">
      ${dday ? `<span class="badge dday">${dday[0]}</span>` : isWknd ? `<span class="badge wknd">주말</span>` : ''}
      <span class="ic">${c.icon}</span><span class="ct">${c.key}</span>
      <span class="best"><b>${esc(shortName(b.product))}</b> · ${esc(bf.benefit_name)} <b>${rate}</b></span>
      <span class="val">~${won(b.grandTotal)}원 <small>${won(c.sample)}원 결제 시</small></span>
    </button>`;
  }).join('');

  const carrierNote = S.carrier
    ? `${S.carrier}${S.grade ? ' · ' + S.grade : ''} 기준으로도 함께 보면 좋아요.`
    : '통신사는 마이페이지에서 설정할 수 있어요.';

  return `
  <div class="hint-bar">카테고리를 누르면 결제 계산으로 넘어가요. ${carrierNote}</div>
  <div class="homegrid">${cards}</div>
  <p class="homenote">기간 한정은 D-day, 주말 전용은 '주말' 뱃지로 표시해요. 실적 미입력 시 최소 구간 기준으로 보수적으로 계산합니다.</p>`;
}

function viewCalc() {
  const brands = Engine.brandList();
  const catChips = Engine.HOME_CATS.map(c =>
    `<button type="button" data-chip="${c.key}" class="${S.q.category === c.key ? 'on' : ''}">${c.icon} ${c.key}</button>`
  ).join('');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  return `
  <div class="calc-layout">
    <section class="sheet">
      <h3 class="sec">어디서, 얼마를 결제하나요?</h3>
      <div class="field">
        <label class="fl" for="brandInput">브랜드/매장</label>
        <input type="search" id="brandInput" list="brandDl" placeholder="예: 스타벅스, CU, 넷플릭스…" value="${esc(S.q.brand)}" autocomplete="off">
        <datalist id="brandDl">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
      </div>
      <div class="field">
        <label class="fl">또는 카테고리로 찾기</label>
        <div class="chips">${catChips}</div>
      </div>
      <div class="field">
        <label class="fl" for="amtInput">결제 예정 금액</label>
        <div class="amt-wrap"><input inputmode="numeric" id="amtInput" value="${won(S.q.amount)}"><span class="unit">원</span></div>
        <div class="quick">
          <button type="button" data-amt="5000">5천</button>
          <button type="button" data-amt="10000">1만</button>
          <button type="button" data-amt="30000">3만</button>
          <button type="button" data-amt="50000">5만</button>
          <button type="button" data-amt="100000">10만</button>
        </div>
      </div>
      <details class="more" ${S.q.channel || S.q.time || S.q.dayMode !== 'today' ? 'open' : ''}>
        <summary>선택 정보 입력 — 정확도가 올라가요</summary>
        <div class="field"><label class="fl">결제 채널</label>
          <div class="seg" data-seg="channel">
            <button type="button" data-v="" class="${!S.q.channel ? 'on' : ''}">모름</button>
            <button type="button" data-v="offline" class="${S.q.channel === 'offline' ? 'on' : ''}">오프라인</button>
            <button type="button" data-v="online" class="${S.q.channel === 'online' ? 'on' : ''}">온라인</button>
          </div></div>
        <div class="field"><label class="fl">결제 시점</label>
          <div class="timegrid">
            <select id="daySel">
              <option value="today" ${S.q.dayMode === 'today' ? 'selected' : ''}>오늘 (${dayNames[new Date().getDay()]}요일)</option>
              ${dayNames.map((d, i) =>
                `<option value="${i}" ${S.q.dayMode === 'day' && S.q.day == i ? 'selected' : ''}>${d}요일</option>`
              ).join('')}
            </select>
            <input type="time" id="timeInput" value="${S.q.time}" aria-label="결제 시간 (선택)">
          </div></div>
        <p class="hintlink">카드별 전월 실적은 <a id="goMyPageLink">마이페이지</a>에서 입력할 수 있어요.</p>
      </details>
      <button class="cta block" id="calcBtn" type="button">지시서 발행</button>
    </section>
    <div class="results" id="results"></div>
  </div>`;
}

function renderResults() {
  const box = $('#results');
  if (!box) return;
  if (!S.wallet.length) {
    box.innerHTML = `<div class="emptywallet"><b>지갑이 비어 있어요</b>마이페이지에서 결제수단을 먼저 켜 주세요.</div>`;
    return;
  }
  if (!S.q.brand && !S.q.category) {
    box.innerHTML = `<div class="noresult"><div class="big">브랜드나 카테고리를 골라 주세요</div>
      <p>어디서 결제하는지 알아야 지시서를 발행할 수 있어요.</p></div>`;
    return;
  }
  const input = {
    brand: S.q.brand || null,
    category: S.q.brand ? null : S.q.category,
    amount: S.q.amount,
    channel: S.q.channel || null,
    date: paymentDate(),
    time: S.q.time || null,
  };
  const combos = Engine.buildCombos(input, S.state, S.wallet);
  const target = S.q.brand || S.q.category;
  if (!combos.length) {
    box.innerHTML = `<div class="res-head"><span><span class="q">${esc(target)}</span> · ${won(S.q.amount)}원</span></div>
    <div class="noresult"><div class="big">이 조건으로 적용 가능한 혜택이 없어요</div>
    <p>지갑에 켜 둔 수단 중 ${esc(target)}에서 쓸 수 있는 혜택을 찾지 못했어요.</p></div>
    ${disclaimHtml()}`;
    return;
  }
  box.innerHTML = `<div class="res-head"><span><span class="q">${esc(target)}</span> · ${won(S.q.amount)}원 결제</span>
    <span class="cnt">${combos.length}개 수단 비교</span></div>
    <div class="results-grid">
      ${combos.map((c, i) => receiptHtml(c, i)).join('')}
      ${disclaimHtml()}
    </div>`;
}

function receiptHtml(c, i) {
  const p = c.product;
  const allChecks = [...new Set(c.items.flatMap(x => x.checks))];
  const allNotes = [...new Set(c.items.flatMap(x => x.notes))];
  const items = c.items.map(x =>
    `<div class="r-it"><span class="n">${esc(x.benefit.benefit_name)}${x.estimate ? ' <small style="color:var(--mut)">(추정)</small>' : ''}</span>
    <span class="v ${x.isPoint ? 'pt' : ''}">${x.isPoint ? '+' : '-'}${won(x.value)}${x.isPoint ? 'P' : '원'}</span></div>`
  ).join('');
  const how = buildInstruction(c);
  const srcs = c.sourceIds.map(id => Engine.sourceById(id)).filter(Boolean);
  const srcTxt = srcs.map(s =>
    `${esc(s.title)}${s.published_or_reviewed_date ? ` (기준 ${String(s.published_or_reviewed_date).slice(0, 10)})` : ''}`
  ).join('<br>');
  return `<article class="receipt ${i === 0 ? 'top1' : ''}">
    <div class="r-body">
      <div class="r-rank">
        <div><div class="no">${i === 0 ? '★ BEST' : 'NO.' + (i + 1)}</div>
          <div class="r-name">${esc(p.product_name)}</div>
          <div class="r-type">${esc(p.product_type)} · ${esc(p.provider)}</div></div>
        <span class="stamp ${c.status === 'eligible' ? 'ok' : 'cond'}">${c.status === 'eligible' ? '적용<br>가능' : '조건<br>확인'}</span>
      </div>
      <div class="r-total"><span class="tl">예상 혜택 합계</span>
        <span class="tv">${won(c.grandTotal)}<small>원</small></span></div>
      ${c.points ? `<div class="r-pt">할인 ${won(c.total)}원 + 포인트 ${won(c.points)}P</div>` : ''}
      <div class="r-items">${items}
        <div class="r-it" style="border-top:1px dashed var(--line);margin-top:5px;padding-top:8px">
          <span class="n" style="color:var(--mut-ink)">실 부담 예상</span>
          <span class="v">${won(Math.max(0, S.q.amount - c.total))}원</span></div>
      </div>
      ${how ? `<div class="r-how">${how}</div>` : ''}
      ${allChecks.length ? `<div class="r-checks"><div class="ck-t">결제 전 확인하세요</div><ul>${allChecks.map(k => `<li>${esc(k)}</li>`).join('')}</ul></div>` : ''}
      ${allNotes.length ? `<ul class="r-notes">${allNotes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="r-foot">
      <span class="conf ${c.confidence}">${c.confidence === 'high' ? '신뢰도 높음 · 약관 기반' : '프로모션 · 변동 가능'}</span>
      <span class="src">${srcTxt}</span>
    </div>
  </article>`;
}

function buildInstruction(c) {
  const steps = [];
  c.items.forEach(x => {
    const b = x.benefit;
    if (b.merchant_scope_type === 'payment_method')
      steps.push(`<b>${esc(b.merchants_or_scope)}</b>에 이 카드를 등록하고 ${esc(b.merchants_or_scope)}로 결제`);
    else if (/결제창/.test(b.payment_channel || ''))
      steps.push(`브랜드 결제창에서 <b>${esc(shortName(c.product))}</b> 선택 후 결제`);
    else if (/자동납부/.test(b.payment_channel || ''))
      steps.push(`<b>자동납부 수단</b>을 이 카드로 등록`);
    else if (/앱 내/.test(b.payment_channel || ''))
      steps.push(`앱 안에서 <b>이 카드로 직접 결제</b>`);
    else if (b.benefit_id === 'B_NARA_CU_EVENT')
      steps.push(`행사상품은 <b>즉시할인</b> 먼저 적용`);
    else if (b.benefit_id === 'B_NARA_CVS')
      steps.push(`남은 금액에 <b>캐시백 20%</b> 중복 적용`);
  });
  if (!steps.length) steps.push(`<b>${esc(c.product.product_name)}</b>(으)로 결제`);
  return '결제 방법: ' + steps.join(' <span class="arrow">→</span> ');
}

function disclaimHtml() {
  return `<p class="disclaim">이 지시서는 첨부된 약관·프로모션 데이터(샘플 6종) 기준의 예상치예요. 잔여 한도·사용 횟수·매장별 제외 조건에 따라 실제 혜택은 달라질 수 있어요.</p>`;
}

/* ==================== 추가 기능 (챗봇) ==================== */
function chatBubbleHtml(m) {
  if (m.role === 'bot') {
    const body = m.html || esc(m.text).replace(/\n/g, '<br>');
    return `<div class="bubble bot"><span class="bot-label">카드 추천 봇</span>${body}</div>`;
  }
  return `<div class="bubble user">${esc(m.text)}</div>`;
}

function viewMore() {
  const msgs = S.chat.messages.map(chatBubbleHtml).join('');

  return `
  <div class="page-head">
    <h2>추가 기능</h2>
    <p>카드 추천 챗봇과 곧 추가될 기능들</p>
  </div>
  <div class="more-layout">
    <div class="feature-list">
      <button type="button" class="feature-card on">
        <span class="fi">💬</span>
        <span><b>카드 추천 챗봇</b><small>소비 패턴에 맞는 카드를 대화로 찾아요</small></span>
      </button>
      <button type="button" class="feature-card coming">
        <span class="fi">📊</span>
        <span><b>월간 혜택 리포트</b><small>준비 중</small></span>
      </button>
      <button type="button" class="feature-card coming">
        <span class="fi">🔔</span>
        <span><b>한도 알림</b><small>준비 중</small></span>
      </button>
    </div>
    <div class="chat-wrap">
      <div class="chat-msgs" id="chatMsgs">${msgs}</div>
      <div class="chat-quick">
        <button type="button" data-quick="카페를 자주 가요">카페 많이 가요</button>
        <button type="button" data-quick="교통·택시 혜택 원해요">교통 아끼고 싶어요</button>
        <button type="button" data-quick="편의점이랑 배달을 자주 시켜요">편의점·배달</button>
        <button type="button" data-quick="통신비 할인 되는 카드 알려줘">통신 할인</button>
      </div>
      <div class="chat-input">
        <input type="text" id="chatInput" placeholder="원하는 혜택을 적어 주세요" autocomplete="off">
        <button type="button" id="chatSend" aria-label="전송">➤</button>
      </div>
    </div>
  </div>`;
}

function chatbotReply(text) {
  const t = text.toLowerCase();
  const tips = [];
  const products = Engine.productById();

  const pick = (pid, reason) => {
    const p = products[pid];
    if (p) tips.push(`• <b>${esc(p.product_name)}</b> — ${reason}`);
  };

  if (/카페|커피|스타벅스|이디야/.test(t)) {
    pick('P_KB_NORI2', '커피 할인 강점 (실적 무관 구간도 있음)');
    pick('P_KB_MYWISH', '먹는데 진심 팩 + 카페/외식');
  }
  if (/편의점|cu|gs|이마트24|배달|배민|요기요/.test(t)) {
    pick('P_SH_NARASARANG', 'CU 즉시할인 + 편의점 캐시백 스택');
    pick('P_TOSSPAY', '배달·간편결제 프로모션이 자주 열려요');
  }
  if (/교통|버스|지하철|택시|대중교통/.test(t)) {
    pick('P_SH_MRLIFE', '교통·생활 영역 할인');
    pick('P_KB_NORI2', '대중교통·택시 체크카드 혜택');
  }
  if (/통신|skt|kt|lgu|휴대폰|요금/.test(t) || (/통신/.test(t) && S.carrier)) {
    const c = S.carrier ? `${S.carrier}${S.grade ? ' ' + S.grade : ''}` : '통신';
    pick('P_SH_MRLIFE', `${c} 자동납부·통신 영역과 궁합이 좋아요`);
  }
  if (/영화|구독|넷플릭스|ott/.test(t)) {
    pick('P_KB_MYWISH', '노는데 진심 팩으로 여가·구독 혜택');
    pick('P_NPAY', '온라인·쇼핑·프로모션 연계');
  }
  if (/주유|마트|쇼핑|온라인/.test(t)) {
    pick('P_SH_MRLIFE', '생활비·마트·공과금 영역');
    pick('P_KB_MYWISH', '전월실적 충족 시 KB Pay·업종 할인');
  }

  if (!tips.length) {
    return {
      text: '소비 패턴을 조금만 더 알려 주세요!\n예: "카페·배달 위주예요", "교통비랑 통신비 줄이고 싶어요"\n\n마이페이지에서 보유 카드와 통신사를 설정해 두면 추천이 더 정확해져요.',
      html: null
    };
  }

  const walletNote = S.wallet.length
    ? `\n\n현재 지갑에 ${S.wallet.length}개 수단이 켜져 있어요. 혜택 추천 페이지에서 바로 비교해 보세요.`
    : '\n\n먼저 마이페이지에서 보유 카드를 켜 주세요.';

  const html = `이런 카드를 먼저 살펴보시면 좋아요:<br><br>${tips.join('<br>')}${walletNote.replace(/\n/g, '<br>')}`;
  return {
    text: html.replace(/<br>/g, '\n').replace(/<\/?b>/g, ''),
    html
  };
}

function sendChat(text) {
  const msg = text.trim();
  if (!msg) return;
  S.chat.messages.push({ role: 'user', text: msg });
  const reply = chatbotReply(msg);
  S.chat.messages.push({ role: 'bot', text: reply.text, html: reply.html });
  render();
  const box = $('#chatMsgs');
  if (box) box.scrollTop = box.scrollHeight;
}

/* ==================== 이벤트 ==================== */
function bind() {
  const goB = $('#goBenefits');
  if (goB) goB.addEventListener('click', () => { S.page = 'benefits'; S.benefitTab = 'map'; render(); });

  const goM = $('#goMyPage');
  if (goM) goM.addEventListener('click', () => { S.page = 'mypage'; render(); });
  const goML = $('#goMyPageLink');
  if (goML) goML.addEventListener('click', () => { S.page = 'mypage'; render(); });

  const loginBtn = $('#loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', () => {
    const email = ($('#loginEmail')?.value || '').trim();
    const name = email.split('@')[0] || '회원';
    if (!email) { alert('이메일을 입력해 주세요.'); return; }
    S.user = { loggedIn: true, name, email };
    render();
  });
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    S.user = { loggedIn: false, name: '', email: S.user.email };
    render();
  });

  $$('[data-carrier]').forEach(el => el.addEventListener('click', () => {
    S.carrier = el.dataset.carrier;
    render();
  }));
  $$('[data-grade]').forEach(el => el.addEventListener('click', () => {
    S.grade = el.dataset.grade;
    render();
  }));

  $$('[data-pm]').forEach(el => el.addEventListener('change', e => {
    const id = e.target.dataset.pm;
    S.wallet = e.target.checked
      ? [...new Set([...S.wallet, id])]
      : S.wallet.filter(x => x !== id);
    render();
  }));
  $$('[data-spend]').forEach(el => el.addEventListener('change', e => {
    S.state.spend[e.target.dataset.spend] = e.target.value === '' ? null : Number(e.target.value);
    render();
  }));
  $$('[data-opt]').forEach(el => el.addEventListener('change', e => {
    S.state[e.target.dataset.opt] = e.target.value || null;
  }));

  $$('[data-btab]').forEach(el => el.addEventListener('click', () => {
    S.benefitTab = el.dataset.btab;
    render();
  }));

  $$('[data-cat]').forEach(el => el.addEventListener('click', () => {
    const c = Engine.HOME_CATS.find(x => x.key === el.dataset.cat);
    S.q.category = c.key;
    S.q.brand = '';
    S.q.amount = c.sample;
    S.page = 'benefits';
    S.benefitTab = 'calc';
    render();
    renderResults();
  }));

  const brandInput = $('#brandInput');
  if (brandInput) {
    brandInput.addEventListener('input', e => {
      S.q.brand = e.target.value.trim();
      if (S.q.brand) {
        S.q.category = null;
        $$('[data-chip]').forEach(b => b.classList.remove('on'));
      }
    });
    brandInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { updateAmt(); renderResults(); }
    });
  }
  $$('[data-chip]').forEach(el => el.addEventListener('click', () => {
    S.q.category = el.dataset.chip;
    S.q.brand = '';
    const bi = $('#brandInput');
    if (bi) bi.value = '';
    $$('[data-chip]').forEach(b => b.classList.toggle('on', b === el));
  }));

  const amt = $('#amtInput');
  if (amt) {
    amt.addEventListener('input', e => {
      const raw = e.target.value.replace(/[^\d]/g, '');
      e.target.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    });
    amt.addEventListener('change', updateAmt);
  }
  $$('[data-amt]').forEach(el => el.addEventListener('click', () => {
    S.q.amount = Number(el.dataset.amt);
    if (amt) amt.value = won(S.q.amount);
  }));

  const seg = document.querySelector('[data-seg="channel"]');
  if (seg) seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    S.q.channel = b.dataset.v || null;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  }));
  const daySel = $('#daySel');
  if (daySel) daySel.addEventListener('change', e => {
    if (e.target.value === 'today') { S.q.dayMode = 'today'; S.q.day = null; }
    else { S.q.dayMode = 'day'; S.q.day = Number(e.target.value); }
  });
  const ti = $('#timeInput');
  if (ti) ti.addEventListener('change', e => { S.q.time = e.target.value; });

  const calcBtn = $('#calcBtn');
  if (calcBtn) calcBtn.addEventListener('click', () => { updateAmt(); renderResults(); });

  // chat
  const send = () => {
    const input = $('#chatInput');
    if (!input) return;
    const v = input.value;
    input.value = '';
    sendChat(v);
  };
  const chatSend = $('#chatSend');
  if (chatSend) chatSend.addEventListener('click', send);
  const chatInput = $('#chatInput');
  if (chatInput) chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') send();
  });
  $$('[data-quick]').forEach(el => el.addEventListener('click', () => sendChat(el.dataset.quick)));

  const chatMsgs = $('#chatMsgs');
  if (chatMsgs) chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

function updateAmt() {
  const amt = $('#amtInput');
  if (!amt) return;
  const v = Number(amt.value.replace(/[^\d]/g, ''));
  if (v > 0) S.q.amount = v;
  amt.value = won(S.q.amount);
}
