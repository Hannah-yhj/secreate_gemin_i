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
const CARRIER_GRADES = {
  SKT: ['SILVER', 'GOLD', 'VIP'],
  KT: ['일반', 'WHITE', 'SILVER', 'GOLD', 'VIP', 'VVIP'],
  'LGU+': ['우수', 'VIP', 'VVIP'],
};

const STORAGE_KEY = 'payment-directive-v1';

const Ico = {
  input: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="16" r="3"/></svg>',
  compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M17 4v16M4 8h6M14 16h6"/></svg>',
  instruct: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h9a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z"/><path d="M10 9h6M10 13h4"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-9z"/><path d="M16 13.5h4V10h-4a1.5 1.5 0 0 0 0 3z"/></svg>',
};

const S = {
  page: 'home',
  benefitTab: 'map',
  wallet: [],
  state: { spend: {}, mywishPack: null, nori2Variant: null },
  user: { loggedIn: false, name: '', email: '', nickname: '', avatar: null, avatarColor: '#1A56DB' },
  showLoginForm: false,
  showProfileEdit: false,
  profileSnap: null,
  carrier: null,
  grade: null,
  cardSearch: '',
  cardProvider: 'all',
  addPanel: null,
  resultsExpanded: false,
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

let calcTimer = null;
let toastTimer = null;

const AVATAR_COLORS = ['#1A56DB', '#0E7A5F', '#C9A227', '#5B4B8A', '#C2410C', '#0F766E', '#1D4ED8', '#B45309'];

function displayName() {
  if (S.user.nickname?.trim()) return S.user.nickname.trim();
  if (S.user.loggedIn) return S.user.name || '회원';
  return '게스트';
}

function displayInitial() {
  return displayName().slice(0, 1).toUpperCase();
}

function avatarHtml(cls = 'avatar', opts = {}) {
  const editable = opts.editable ? ' avatar-btn open-profile-edit' : '';
  const label = opts.editable ? ' aria-label="프로필 편집"' : '';
  const tag = opts.editable ? 'button' : 'span';
  const type = opts.editable ? ' type="button"' : '';
  const color = S.user.avatarColor || '#1A56DB';
  if (S.user.avatar) {
    return `<${tag}${type} class="${cls}${editable} has-photo"${label}><img src="${esc(S.user.avatar)}" alt=""></${tag}>`;
  }
  return `<${tag}${type} class="${cls}${editable}"${label} style="background:${esc(color)}">${esc(displayInitial())}</${tag}>`;
}

function updateDrawerProfile() {
  const box = $('#drawerProfile');
  if (!box) return;
  const sub = S.user.loggedIn ? (S.user.email || '프로필 편집') : '프로필 편집';
  box.innerHTML = `
    <button type="button" class="drawer-profile open-profile-edit" aria-label="프로필 편집">
      ${avatarHtml('avatar')}
      <span class="drawer-profile-text">
        <b>${esc(displayName())}</b>
        <small>${esc(sub)}</small>
      </span>
    </button>`;
}

function openProfileEditor() {
  S.profileSnap = {
    nickname: S.user.nickname || '',
    avatar: S.user.avatar || null,
    avatarColor: S.user.avatarColor || '#1A56DB',
  };
  S.showProfileEdit = true;
  S.showLoginForm = false;
  S.addPanel = null;
  S.page = 'mypage';
  closeDrawer();
  savePersisted();
  render();
}

function closeProfileEditor(restore) {
  if (restore && S.profileSnap) {
    S.user.nickname = S.profileSnap.nickname;
    S.user.avatar = S.profileSnap.avatar;
    S.user.avatarColor = S.profileSnap.avatarColor;
  }
  S.profileSnap = null;
  S.showProfileEdit = false;
  render();
}

function syncNicknameDraft() {
  const el = $('#nicknameInput');
  if (el) S.user.nickname = el.value.trim().slice(0, 20);
}

function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('이미지 파일만 선택할 수 있어요'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('이미지는 8MB 이하로 올려 주세요'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('이미지를 불러오지 못했어요'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했어요'));
    reader.readAsDataURL(file);
  });
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (Array.isArray(d.wallet)) S.wallet = d.wallet;
    if (d.state && typeof d.state === 'object') {
      S.state = {
        spend: d.state.spend && typeof d.state.spend === 'object' ? d.state.spend : {},
        mywishPack: d.state.mywishPack || null,
        nori2Variant: d.state.nori2Variant || null,
      };
    }
    if (d.user && typeof d.user === 'object') {
      S.user = {
        loggedIn: !!d.user.loggedIn,
        name: d.user.name || '',
        email: d.user.email || '',
        nickname: d.user.nickname || '',
        avatar: d.user.avatar || null,
        avatarColor: AVATAR_COLORS.includes(d.user.avatarColor) ? d.user.avatarColor : '#1A56DB',
      };
    }
    if (d.carrier != null) S.carrier = d.carrier;
    if (d.grade != null) S.grade = d.grade;
    const pages = ['home', 'mypage', 'benefits', 'more'];
    if (pages.includes(d.page)) S.page = d.page;
    if (d.benefitTab === 'map' || d.benefitTab === 'calc') S.benefitTab = d.benefitTab;
  } catch (_) { /* ignore corrupt storage */ }
}

function savePersisted() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      wallet: S.wallet,
      state: S.state,
      user: S.user,
      carrier: S.carrier,
      grade: S.grade,
      page: S.page,
      benefitTab: S.benefitTab,
    }));
  } catch (_) { /* quota / private mode */ }
}

function showToast(msg) {
  const host = $('#toastHost');
  if (!host) return;
  host.innerHTML = `<div class="toast">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.innerHTML = ''; }, 2400);
}

loadPersisted();
updateDrawerProfile();

/* ---- 우측 메뉴 패널 ---- */
function openDrawer() {
  const d = $('#drawer'), b = $('#drawerBackdrop'), btn = $('#menuBtn');
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  b.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}
function closeDrawer() {
  const d = $('#drawer'), b = $('#drawerBackdrop'), btn = $('#menuBtn');
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
  b.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}
function closeOverlays() {
  if ($('#drawer')?.classList.contains('open')) closeDrawer();
  if (S.addPanel) {
    S.addPanel = null;
    S.cardSearch = '';
    S.cardProvider = 'all';
    render();
    return;
  }
  if (S.showProfileEdit) {
    closeProfileEditor(true);
  }
}

$('#menuBtn').addEventListener('click', () => {
  $('#drawer').classList.contains('open') ? closeDrawer() : openDrawer();
});
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawerBackdrop').addEventListener('click', closeDrawer);

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('#drawer')?.classList.contains('open') || S.addPanel || S.showProfileEdit) {
    e.preventDefault();
    closeOverlays();
  }
});

function goPage(page) {
  S.page = page;
  S.addPanel = null;
  S.showLoginForm = false;
  S.showProfileEdit = false;
  S.profileSnap = null;
  closeDrawer();
  savePersisted();
  render();
}

document.addEventListener('click', e => {
  const nav = e.target.closest('.drawer-nav [data-page], #bottomNav [data-page], .logo-btn[data-page]');
  if (!nav) return;
  e.preventDefault();
  goPage(nav.dataset.page || 'home');
});

function startApp() {
  if (!S.wallet.length) {
    S.page = 'mypage';
    S.addPanel = 'card';
    S.showLoginForm = false;
  } else {
    S.page = 'benefits';
    S.benefitTab = 'calc';
    S.addPanel = null;
  }
  closeDrawer();
  savePersisted();
  render();
  if (S.page === 'benefits' && S.benefitTab === 'calc') {
    requestAnimationFrame(() => renderResults());
  }
}

/* ---- 데이터 로드 ---- */
render();
function applyDB(data) {
  DB = data;
  Engine.init(DB);
  const spend = { ...Object.fromEntries(DB.products.map(p => [p.product_id, null])), ...S.state.spend };
  S.state.spend = spend;
  S.wallet = S.wallet.filter(id => DB.products.some(p => p.product_id === id));
  savePersisted();
  render();
}
fetch('/api/benefits')
  .then(res => {
    if (!res.ok) throw new Error('api');
    return res.json();
  })
  .then(applyDB)
  .catch(() => {
    fetch('db.json')
      .then(res => {
        if (!res.ok) throw new Error('db.json');
        return res.json();
      })
      .then(applyDB)
      .catch(err => {
        console.error('DB 로딩 실패:', err);
        if (S.page !== 'home') render();
      });
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

function telecomProductId() {
  if (!DB || !S.carrier || !S.grade) return null;
  const p = DB.products.find(p => p.service_type === '통신사' && p.carrier_code === S.carrier);
  return p ? p.product_id : null;
}

function effectiveWallet() {
  const tid = telecomProductId();
  return tid ? [...new Set([...S.wallet, tid])] : S.wallet;
}

function engineState() {
  return { ...S.state, grade: S.grade };
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

function scheduleCalc() {
  clearTimeout(calcTimer);
  calcTimer = setTimeout(() => {
    updateAmt();
    S.resultsExpanded = false;
    renderResults();
  }, 280);
}

function emptyWalletHtml(opts = {}) {
  const { ctaId = 'goMyPage', ctaLabel = '카드 추가하기', hint = '마이페이지에서 결제수단을 먼저 등록해 주세요.' } = opts;
  return `<div class="emptywallet">
    <div class="empty-illu" aria-hidden="true">${Ico.wallet}</div>
    <b>지갑이 비어 있어요</b>
    <p>${esc(hint)}</p>
    <button class="cta" id="${ctaId}" type="button">${esc(ctaLabel)}</button>
  </div>`;
}

function render() {
  $$('.drawer-nav [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === S.page));
  $$('#bottomNav [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === S.page));
  document.querySelector('.app')?.classList.toggle('landing-mode', S.page === 'home');

  const m = $('#main');
  try {
    if (S.page === 'home') {
      m.innerHTML = viewLanding();
    } else if (S.page === 'mypage') {
      m.innerHTML = viewMyPage();
    } else if (!DB) {
      m.innerHTML = `<div class="emptywallet"><b>불러오는 중…</b></div>`;
    } else if (S.page === 'benefits') {
      m.innerHTML = viewBenefits();
    } else {
      m.innerHTML = viewMore();
    }
  } catch (err) {
    console.error('render failed:', err);
    m.innerHTML = `<div class="emptywallet"><b>화면을 불러오지 못했어요</b><p>${esc(err.message || '잠시 후 다시 시도해 주세요.')}</p></div>`;
  }
  updateDrawerProfile();
  bind();
  if (!S.addPanel && !S.showProfileEdit) window.scrollTo(0, 0);
}

/* ==================== 랜딩 ==================== */
function viewLanding() {
  return `
  <section class="hero">
    <div class="hero-orb a" aria-hidden="true"></div>
    <div class="hero-orb b" aria-hidden="true"></div>
    <div class="hero-orb c" aria-hidden="true"></div>
    <div class="hero-inner">
      <h1 class="hero-brand">결제 <span class="hl">지시서</span></h1>
      <p class="hero-lead">결제 직전, 지갑에서 뭘 꺼낼지 한 번에 정해 드려요.</p>
      <p class="hero-sub">보유 카드와 혜택을 비교해 지금 당장 가장 이득인 결제 수단을 알려주는 서비스입니다.</p>
      <button type="button" class="hero-cta" id="startHero">시작하기 <span>→</span></button>
    </div>
  </section>
  <section class="how-section" aria-label="이용 방법">
    <h2 class="how-title">이렇게 쓰면 돼요</h2>
    <p class="how-lead">세 단계면 결제 직전, 최적의 수단이 나옵니다.</p>
    <div class="how-grid">
      <article class="how-step">
        <span class="how-ico">${Ico.input}</span>
        <span class="how-num">01</span>
        <h3>입력</h3>
        <p>브랜드·금액·채널만 알려 주세요.</p>
      </article>
      <article class="how-step">
        <span class="how-ico">${Ico.compare}</span>
        <span class="how-num">02</span>
        <h3>비교</h3>
        <p>보유 카드 혜택을 한눈에 맞춰 봅니다.</p>
      </article>
      <article class="how-step">
        <span class="how-ico">${Ico.instruct}</span>
        <span class="how-num">03</span>
        <h3>지시</h3>
        <p>지금 꺼낼 카드와 결제 방법을 받습니다.</p>
      </article>
    </div>
  </section>`;
}

/* ==================== 마이페이지 ==================== */
function viewMyPage() {
  if (S.showProfileEdit) return viewProfileEdit();
  if (S.showLoginForm && !S.user.loggedIn) return viewLoginGate();
  if (!DB) {
    return `<div class="page-head"><h2>마이페이지</h2><p>내 카드와 통신사를 관리해요</p></div>
      <div class="emptywallet"><b>불러오는 중…</b></div>`;
  }
  return viewMyCards();
}

function viewLoginGate() {
  return `
  <div class="login-gate">
    <section class="sheet login-card">
      <div class="login-hero">
        <div class="login-mark">결제</div>
        <h2>로그인</h2>
        <p>선택 사항이에요. 게스트로도 카드를 관리할 수 있습니다.</p>
      </div>
      <div class="login-box">
        <div class="field" style="margin:0">
          <label class="fl" for="loginEmail">이메일</label>
          <input type="email" id="loginEmail" placeholder="you@example.com" value="${esc(S.user.email)}">
        </div>
        <div class="field" style="margin:0">
          <label class="fl" for="loginPw">비밀번호</label>
          <input type="password" id="loginPw" placeholder="••••••••">
        </div>
        <button class="cta block" id="loginBtn" type="button">로그인</button>
        <button class="cta ghost block" id="skipLoginBtn" type="button">게스트로 계속</button>
        <p class="login-hint">데모용이에요. 아무 이메일·비밀번호나 입력해도 됩니다.</p>
      </div>
    </section>
  </div>`;
}

function viewProfileEdit() {
  const colors = AVATAR_COLORS.map(c =>
    `<button type="button" class="color-swatch ${S.user.avatarColor === c && !S.user.avatar ? 'on' : ''}" data-avatar-color="${c}" style="background:${c}" aria-label="색상 ${c}"></button>`
  ).join('');

  return `
  <div class="page-head profile-edit-head">
    <button type="button" class="back-btn" id="closeProfileEdit" aria-label="뒤로">←</button>
    <div>
      <h2>프로필 편집</h2>
      <p>닉네임과 프로필 사진을 설정해요</p>
    </div>
  </div>
  <section class="sheet profile-edit-card">
    <div class="profile-photo-block">
      ${avatarHtml('avatar profile-avatar-lg')}
      <div class="profile-photo-actions">
        <label class="cta ghost sm profile-upload-label">
          사진 선택
          <input type="file" id="avatarFile" accept="image/*" hidden>
        </label>
        ${S.user.avatar ? `<button type="button" class="linkish" id="removeAvatar">사진 삭제</button>` : ''}
      </div>
      <p class="sub profile-photo-hint">사진을 올리면 원형으로 잘려 저장돼요.</p>
    </div>
    <div class="field">
      <label class="fl">프로필 색상</label>
      <div class="color-row">${colors}</div>
    </div>
    <div class="field">
      <label class="fl" for="nicknameInput">닉네임</label>
      <input type="text" id="nicknameInput" maxlength="20" placeholder="예: 결제고수" value="${esc(S.user.nickname || '')}" autocomplete="nickname">
      <p class="sub" style="margin-top:6px">최대 20자 · 비우면 ${S.user.loggedIn ? '로그인 이름' : '게스트'}로 표시돼요</p>
    </div>
    <button type="button" class="cta block" id="saveProfileBtn">저장</button>
  </section>`;
}

function viewMyCards() {
  const cards = DB.products.filter(p => S.wallet.includes(p.product_id));
  const cardTiles = cards.map(ownedCardTile).join('');

  const carrierLabel = S.carrier === 'LGU+' ? 'LG U+' : S.carrier;
  const carrierBar = S.carrier ? `
    <div class="carrier-bar">
      <div class="carrier-bar-left">
        <span class="carrier-bar-label">통신사</span>
        <span class="carrier-badge">${esc(carrierLabel)}</span>
        <span class="carrier-bar-grade">${esc(S.grade || '등급 미설정')}</span>
      </div>
      <div class="carrier-bar-actions">
        <button type="button" class="linkish" data-open-add="carrier">변경</button>
        <button type="button" class="icon-x" data-remove-carrier aria-label="통신사 삭제">✕</button>
      </div>
    </div>` : `
    <div class="carrier-bar empty">
      <div class="carrier-bar-left">
        <span class="carrier-bar-label">통신사</span>
        <span class="carrier-bar-empty">아직 등록되지 않았어요</span>
      </div>
      <button type="button" class="cta ghost sm" data-open-add="carrier">통신사 추가</button>
    </div>`;

  const cardsEmpty = !cards.length ? `
    <div class="owned-empty">
      <div class="empty-illu sm" aria-hidden="true">${Ico.wallet}</div>
      <b>등록된 카드가 없어요</b>
      <p>오른쪽 아래 <strong>+</strong> 버튼에서 카드를 추가해 주세요.</p>
      <button type="button" class="cta" data-open-add="card">카드 추가하기</button>
    </div>` : '';

  const sub = S.user.loggedIn
    ? (S.user.email || '프로필을 눌러 편집해요')
    : '이 기기에만 저장돼요 · 프로필 편집 가능';

  const userBlock = `
    <div class="user-chip ${S.user.loggedIn ? '' : 'guest'}">
      ${avatarHtml('avatar', { editable: true })}
      <div class="user-chip-text">
        <div class="nm">${esc(displayName())}</div>
        <div class="em">${esc(sub)}</div>
      </div>
      ${S.user.loggedIn
        ? `<button type="button" class="cta ghost sm" id="logoutBtn">로그아웃</button>`
        : `<button type="button" class="cta ghost sm" id="showLoginBtn">로그인</button>`}
    </div>`;

  return `
  <div class="page-head mypage-head">
    <div>
      <h2>마이페이지</h2>
      <p>내 카드와 통신사를 관리해요</p>
    </div>
    ${userBlock}
  </div>

  ${carrierBar}

  <div class="cards-section">
    <div class="cards-section-head">
      <h3>내 카드</h3>
      <span class="cards-count">${cards.length}장</span>
    </div>
    <div class="owned-grid">
      ${cardTiles}
      ${cardsEmpty}
    </div>
  </div>

  ${cards.length ? `
  <div class="mypage-actions">
    <button class="cta" id="goBenefits" type="button">혜택 추천 보기</button>
  </div>` : ''}

  ${fabAndPanel()}`;
}

function ownedCardTile(p) {
  const st = p.product_type === '간편결제'
    ? { cls: 'ok', label: '실적 조건 없음' }
    : spendStatus(p.product_id);

  let opts = '';
  if (p.product_id === 'P_KB_MYWISH') {
    opts = `<select data-opt="mywishPack" aria-label="My WE:SH 서비스팩">
      <option value="">서비스팩 미선택</option>
      ${['먹는데 진심', '노는데 진심', '관리에 진심'].map(v =>
        `<option ${S.state.mywishPack === v ? 'selected' : ''}>${v}</option>`).join('')}
    </select>`;
  }
  if (p.product_id === 'P_KB_NORI2') {
    opts = `<select data-opt="nori2Variant" aria-label="노리2 발급 유형">
      <option value="">발급 유형 미선택</option>
      ${['KB Pay', 'Global'].map(v =>
        `<option ${S.state.nori2Variant === v ? 'selected' : ''}>${v}형</option>`).join('')}
    </select>`;
  }

  const spend = p.product_type === '간편결제' ? '' : `
    <div class="owned-spend">
      <span class="spend-badge ${st.cls}">${st.label}</span>
      <select data-spend="${p.product_id}" aria-label="${esc(p.product_name)} 전월실적">
        ${SPEND_OPTS.map(([v, l]) =>
          `<option value="${v === null ? '' : v}" ${S.state.spend[p.product_id] === v ? 'selected' : ''}>${l}</option>`
        ).join('')}
      </select>
    </div>`;

  return `<article class="owned-tile">
    <div class="owned-top">
      <span class="plate" style="background:${PLATE_COLORS[p.product_id]}">${PLATE_LABEL[p.product_id]}</span>
      <button type="button" class="icon-x" data-remove-card="${p.product_id}" aria-label="카드 삭제">✕</button>
    </div>
    <div class="owned-name">${esc(p.product_name)}</div>
    <div class="owned-meta">${esc(p.product_type)} · ${esc(p.provider)}</div>
    ${opts ? `<div class="owned-opts">${opts}</div>` : ''}
    ${spend}
  </article>`;
}

function fabAndPanel() {
  const open = S.addPanel;
  const menuOpen = open === 'menu';
  const panelOpen = open === 'carrier' || open === 'card';

  let panelBody = '';
  if (open === 'carrier') {
    const grades = S.carrier ? (CARRIER_GRADES[S.carrier] || []) : [];
    const canSave = S.carrier && S.grade && grades.includes(S.grade);
    panelBody = `
      <div class="add-panel-head">
        <button type="button" class="back-btn" data-open-add="menu">←</button>
        <h3>통신사 추가</h3>
        <button type="button" class="icon-x" data-close-add aria-label="닫기">✕</button>
      </div>
      <p class="sub">이용 중인 통신사를 고른 뒤, 해당 통신사 멤버십 등급을 선택하세요.</p>
      <label class="fl">통신사</label>
      <div class="carrier-grid">
        ${CARRIERS.map(c => `<button type="button" data-carrier="${c}" class="${S.carrier === c ? 'on' : ''}">${c === 'LGU+' ? 'LG U+' : c}</button>`).join('')}
      </div>
      ${S.carrier ? `
        <label class="fl">${S.carrier === 'LGU+' ? 'LG U+' : S.carrier} 멤버십 등급</label>
        <div class="grade-row">
          ${grades.map(g => `<button type="button" data-grade="${esc(g)}" class="${S.grade === g ? 'on' : ''}">${esc(g)}</button>`).join('')}
        </div>` : `
        <p class="sub grade-hint">통신사를 먼저 선택하면 등급 목록이 나타납니다.</p>`}
      <button type="button" class="cta block" id="saveCarrierBtn" ${canSave ? '' : 'disabled'}>저장</button>`;
  } else if (open === 'card') {
    panelBody = `
      <div class="add-panel-head">
        <button type="button" class="back-btn" data-open-add="menu">←</button>
        <h3>카드 추가</h3>
        <button type="button" class="icon-x" data-close-add aria-label="닫기">✕</button>
      </div>
      <p class="sub">카드사를 고르거나 검색해서 결제수단을 추가하세요.</p>
      <div class="provider-tabs" id="providerTabs">${renderProviderTabs()}</div>
      <div class="card-search">
        <input type="search" id="cardSearchInput" placeholder="카드 이름 검색…" value="${esc(S.cardSearch)}" autocomplete="off">
      </div>
      <div id="addCardList">${renderAddCardList()}</div>`;
  }

  return `
  <div class="fab-wrap">
    <div class="fab-menu ${menuOpen ? 'open' : ''}" ${menuOpen ? '' : 'hidden'}>
      <button type="button" data-open-add="carrier">
        <span class="fi">📱</span>
        <span><b>통신사 추가</b><small>통신사 · 멤버십 등급</small></span>
      </button>
      <button type="button" data-open-add="card">
        <span class="fi">💳</span>
        <span><b>카드 추가</b><small>결제수단을 지갑에 등록</small></span>
      </button>
    </div>
    <button type="button" class="fab ${open ? 'on' : ''}" id="fabAdd" aria-label="추가" aria-expanded="${open ? 'true' : 'false'}">
      ${open ? '✕' : '+'}
    </button>
  </div>

  <div class="add-backdrop ${panelOpen ? 'show' : ''}" data-close-add ${panelOpen ? '' : 'hidden'}></div>
  <aside class="add-panel ${panelOpen ? 'open' : ''}" aria-hidden="${panelOpen ? 'false' : 'true'}">
    ${panelBody}
  </aside>`;
}

const PROVIDER_SHORT = {
  'KB국민카드': '국민',
  '신한카드': '신한',
  '토스': '토스',
  '네이버파이낸셜': '네이버',
};

function providerList() {
  return [...new Set(DB.products.filter(p => p.service_type !== '통신사').map(p => p.provider))];
}

function renderProviderTabs() {
  const tabs = [
    `<button type="button" data-provider="all" class="${S.cardProvider === 'all' ? 'on' : ''}">전체</button>`,
    ...providerList().map(p =>
      `<button type="button" data-provider="${esc(p)}" class="${S.cardProvider === p ? 'on' : ''}">${esc(PROVIDER_SHORT[p] || p)}</button>`
    ),
  ];
  return tabs.join('');
}

function filteredAddableCards() {
  const q = S.cardSearch.trim().toLowerCase();
  return DB.products.filter(p => {
    if (p.service_type === '통신사') return false;
    if (S.wallet.includes(p.product_id)) return false;
    if (S.cardProvider !== 'all' && p.provider !== S.cardProvider) return false;
    if (!q) return true;
    const hay = `${p.product_name} ${p.provider} ${p.product_type} ${PLATE_LABEL[p.product_id] || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderAddCardList() {
  const inWallet = new Set(S.wallet);
  const pool = DB.products.filter(p => {
    if (p.service_type === '통신사') return false;
    if (inWallet.has(p.product_id)) return false;
    if (S.cardProvider !== 'all' && p.provider !== S.cardProvider) return false;
    return true;
  });
  if (!pool.length) {
    const label = S.cardProvider === 'all' ? '' : (PROVIDER_SHORT[S.cardProvider] || S.cardProvider);
    return label
      ? `<p class="sub">${esc(label)} 카드는 모두 등록되어 있어요.</p>`
      : '<p class="sub">추가할 수 있는 카드가 모두 등록되어 있어요.</p>';
  }
  const list = filteredAddableCards();
  if (!list.length) {
    return `<p class="sub">검색 결과가 없어요.</p>`;
  }
  return list.map(p => `
    <button type="button" class="add-card-row" data-add-card="${p.product_id}">
      <span class="plate" style="background:${PLATE_COLORS[p.product_id]}">${PLATE_LABEL[p.product_id]}</span>
      <span class="info">
        <span class="nm">${esc(p.product_name)}</span>
        <span class="tp">${esc(p.product_type)} · ${esc(p.provider)}</span>
      </span>
      <span class="plus-mini">+</span>
    </button>`).join('');
}

function refreshAddCardList() {
  const box = $('#addCardList');
  if (box) {
    box.innerHTML = renderAddCardList();
    bindAddCardList();
  }
  $$('[data-provider]').forEach(b => b.classList.toggle('on', b.dataset.provider === S.cardProvider));
}

function bindAddCardList() {
  $$('[data-add-card]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.addCard;
    const p = DB.products.find(x => x.product_id === id);
    S.wallet = [...new Set([...S.wallet, id])];
    S.addPanel = 'card';
    savePersisted();
    showToast(p ? `${shortName(p)} 추가됐어요` : '카드가 추가됐어요');
    render();
  }));
}

function bindProviderTabs() {
  $$('[data-provider]').forEach(el => el.addEventListener('click', () => {
    S.cardProvider = el.dataset.provider;
    refreshAddCardList();
  }));
}

function updateBrandDatalist() {
  const brands = S.q.category
    ? Engine.brandsByCategory(S.q.category)
    : Engine.brandList();
  const dl = $('#brandDl');
  if (dl) dl.innerHTML = brands.map(b => `<option value="${esc(b)}">`).join('');
  const bi = $('#brandInput');
  if (bi) {
    bi.placeholder = S.q.category
      ? `${S.q.category} 브랜드만 검색됩니다…`
      : '예: 스타벅스, CU, 넷플릭스…';
  }
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
  const wallet = effectiveWallet();
  if (!wallet.length) {
    return emptyWalletHtml({
      ctaId: 'goMyPageAdd',
      ctaLabel: '카드 추가하기',
      hint: '카드나 통신사를 등록하면 카테고리별 최적 수단이 보여요.',
    });
  }
  const board = Engine.homeBoard(engineState(), wallet, new Date());
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
  const brands = S.q.category
    ? Engine.brandsByCategory(S.q.category)
    : Engine.brandList();
  const catChips = Engine.HOME_CATS.map(c =>
    `<button type="button" data-chip="${c.key}" class="${S.q.category === c.key ? 'on' : ''}">${c.icon} ${c.key}</button>`
  ).join('');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const brandPh = S.q.category
    ? `${S.q.category} 브랜드만 검색됩니다…`
    : '예: 스타벅스, CU, 넷플릭스…';
  return `
  <div class="calc-layout">
    <section class="sheet">
      <h3 class="sec">어디서, 얼마를 결제하나요?</h3>
      <div class="field">
        <label class="fl">카테고리로 찾기</label>
        <div class="chips">${catChips}</div>
      </div>
      <div class="field">
        <label class="fl" for="brandInput">브랜드/매장 ${S.q.category ? `<span class="cat-filter-tag">${esc(S.q.category)}</span>` : ''}</label>
        <input type="search" id="brandInput" list="brandDl" placeholder="${esc(brandPh)}" value="${esc(S.q.brand)}" autocomplete="off">
        <datalist id="brandDl">${brands.map(b => `<option value="${esc(b)}">`).join('')}</datalist>
        ${S.q.category && !brands.length ? '<p class="sub" style="margin-top:8px">이 카테고리에 등록된 브랜드가 없어요. 카테고리만으로도 계산할 수 있어요.</p>' : ''}
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
      <p class="auto-hint">입력하면 지시서가 자동으로 갱신돼요</p>
    </section>
    <div class="results" id="results"></div>
  </div>`;
}

function renderResults() {
  const box = $('#results');
  if (!box) return;
  const wallet = effectiveWallet();
  if (!wallet.length) {
    box.innerHTML = emptyWalletHtml({
      ctaId: 'goMyPageAdd',
      ctaLabel: '카드 추가하기',
      hint: '마이페이지에서 결제수단이나 통신사를 먼저 등록해 주세요.',
    });
    $('#goMyPageAdd')?.addEventListener('click', () => {
      S.page = 'mypage';
      S.addPanel = 'card';
      savePersisted();
      render();
    });
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
  const combos = Engine.buildCombos(input, engineState(), wallet);
  const target = S.q.brand || S.q.category;
  if (!combos.length) {
    box.innerHTML = `<div class="res-head"><span><span class="q">${esc(target)}</span> · ${won(S.q.amount)}원</span></div>
    <div class="noresult"><div class="big">이 조건으로 적용 가능한 혜택이 없어요</div>
    <p>지갑에 켜 둔 수단 중 ${esc(target)}에서 쓸 수 있는 혜택을 찾지 못했어요.</p></div>
    ${disclaimHtml()}`;
    return;
  }

  const visible = S.resultsExpanded ? combos : combos.slice(0, 1);
  const hiddenCount = combos.length - 1;
  const moreBtn = !S.resultsExpanded && hiddenCount > 0
    ? `<button type="button" class="more-results" id="expandResults">다른 수단 ${hiddenCount}개 더 보기</button>`
    : (S.resultsExpanded && hiddenCount > 0
      ? `<button type="button" class="more-results ghost" id="collapseResults">BEST만 보기</button>`
      : '');

  box.innerHTML = `<div class="res-head"><span><span class="q">${esc(target)}</span> · ${won(S.q.amount)}원 결제</span>
    <span class="cnt">${combos.length}개 수단 비교</span></div>
    <div class="results-grid">
      ${visible.map((c, i) => receiptHtml(c, i)).join('')}
      ${moreBtn}
      ${disclaimHtml()}
    </div>`;

  $('#expandResults')?.addEventListener('click', () => {
    S.resultsExpanded = true;
    renderResults();
  });
  $('#collapseResults')?.addEventListener('click', () => {
    S.resultsExpanded = false;
    renderResults();
  });
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
  const startHero = $('#startHero');
  if (startHero) startHero.addEventListener('click', startApp);

  const goB = $('#goBenefits');
  if (goB) goB.addEventListener('click', () => { S.benefitTab = 'map'; goPage('benefits'); });

  const goM = $('#goMyPage');
  if (goM) goM.addEventListener('click', () => goPage('mypage'));
  const goMyPageAdd = $('#goMyPageAdd');
  if (goMyPageAdd) goMyPageAdd.addEventListener('click', () => {
    S.page = 'mypage';
    S.addPanel = 'card';
    S.showLoginForm = false;
    closeDrawer();
    savePersisted();
    render();
  });
  const goML = $('#goMyPageLink');
  if (goML) goML.addEventListener('click', () => goPage('mypage'));

  const showLoginBtn = $('#showLoginBtn');
  if (showLoginBtn) showLoginBtn.addEventListener('click', () => {
    S.showLoginForm = true;
    S.showProfileEdit = false;
    render();
  });
  const skipLoginBtn = $('#skipLoginBtn');
  if (skipLoginBtn) skipLoginBtn.addEventListener('click', () => {
    S.showLoginForm = false;
    render();
  });

  $$('.open-profile-edit').forEach(el => {
    el.addEventListener('click', openProfileEditor);
  });
  const closeProfileEdit = $('#closeProfileEdit');
  if (closeProfileEdit) closeProfileEdit.addEventListener('click', () => closeProfileEditor(true));
  const saveProfileBtn = $('#saveProfileBtn');
  if (saveProfileBtn) saveProfileBtn.addEventListener('click', () => {
    syncNicknameDraft();
    S.profileSnap = null;
    S.showProfileEdit = false;
    savePersisted();
    showToast('프로필이 저장됐어요');
    render();
  });
  const nicknameInput = $('#nicknameInput');
  if (nicknameInput) nicknameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveProfileBtn?.click();
  });
  $$('[data-avatar-color]').forEach(el => el.addEventListener('click', () => {
    syncNicknameDraft();
    S.user.avatarColor = el.dataset.avatarColor;
    S.user.avatar = null;
    render();
  }));
  const avatarFile = $('#avatarFile');
  if (avatarFile) avatarFile.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      syncNicknameDraft();
      S.user.avatar = await compressAvatar(file);
      render();
    } catch (err) {
      showToast(err.message || '사진 업로드에 실패했어요');
      e.target.value = '';
    }
  });
  const removeAvatar = $('#removeAvatar');
  if (removeAvatar) removeAvatar.addEventListener('click', () => {
    syncNicknameDraft();
    S.user.avatar = null;
    render();
  });

  const loginBtn = $('#loginBtn');
  if (loginBtn) loginBtn.addEventListener('click', () => {
    const email = ($('#loginEmail')?.value || '').trim();
    const name = email.split('@')[0] || '회원';
    if (!email) { showToast('이메일을 입력해 주세요'); return; }
    S.user = {
      ...S.user,
      loggedIn: true,
      name,
      email,
      nickname: S.user.nickname || name,
    };
    S.addPanel = null;
    S.showLoginForm = false;
    savePersisted();
    showToast('로그인됐어요');
    render();
  });
  const loginPw = $('#loginPw');
  if (loginPw) loginPw.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn?.click();
  });
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    S.user = {
      loggedIn: false,
      name: '',
      email: '',
      nickname: '',
      avatar: null,
      avatarColor: '#1A56DB',
    };
    S.profileSnap = null;
    S.showProfileEdit = false;
    S.addPanel = null;
    savePersisted();
    showToast('로그아웃됐어요');
    render();
  });

  const fab = $('#fabAdd');
  if (fab) fab.addEventListener('click', () => {
    if (S.addPanel) {
      S.addPanel = null;
      S.cardSearch = '';
      S.cardProvider = 'all';
    } else {
      S.addPanel = 'menu';
    }
    render();
  });
  $$('[data-open-add]').forEach(el => el.addEventListener('click', () => {
    const next = el.dataset.openAdd;
    if (next === 'card' && S.addPanel !== 'card') {
      S.cardSearch = '';
      S.cardProvider = 'all';
    }
    S.addPanel = next;
    render();
  }));
  $$('[data-close-add]').forEach(el => el.addEventListener('click', () => {
    S.addPanel = null;
    S.cardSearch = '';
    S.cardProvider = 'all';
    render();
  }));

  $$('[data-carrier]').forEach(el => el.addEventListener('click', () => {
    const next = el.dataset.carrier;
    if (S.carrier !== next) {
      S.carrier = next;
      S.grade = null;
    }
    render();
  }));
  $$('[data-grade]').forEach(el => el.addEventListener('click', () => {
    S.grade = el.dataset.grade;
    render();
  }));
  const saveCarrier = $('#saveCarrierBtn');
  if (saveCarrier) saveCarrier.addEventListener('click', () => {
    const grades = CARRIER_GRADES[S.carrier] || [];
    if (!S.carrier || !S.grade || !grades.includes(S.grade)) return;
    S.addPanel = null;
    savePersisted();
    const label = S.carrier === 'LGU+' ? 'LG U+' : S.carrier;
    showToast(`${label} ${S.grade} 저장됐어요`);
    render();
  });

  const cardSearch = $('#cardSearchInput');
  if (cardSearch) {
    cardSearch.addEventListener('input', e => {
      S.cardSearch = e.target.value;
      refreshAddCardList();
    });
  }
  bindProviderTabs();
  bindAddCardList();
  $$('[data-remove-card]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.removeCard;
    const p = DB.products.find(x => x.product_id === id);
    S.wallet = S.wallet.filter(x => x !== id);
    savePersisted();
    showToast(p ? `${shortName(p)} 삭제됐어요` : '카드가 삭제됐어요');
    render();
  }));
  const removeCarrier = document.querySelector('[data-remove-carrier]');
  if (removeCarrier) removeCarrier.addEventListener('click', () => {
    S.carrier = null;
    S.grade = null;
    savePersisted();
    showToast('통신사가 삭제됐어요');
    render();
  });

  $$('[data-spend]').forEach(el => el.addEventListener('change', e => {
    S.state.spend[e.target.dataset.spend] = e.target.value === '' ? null : Number(e.target.value);
    savePersisted();
    render();
  }));
  $$('[data-opt]').forEach(el => el.addEventListener('change', e => {
    S.state[e.target.dataset.opt] = e.target.value || null;
    savePersisted();
  }));

  $$('[data-btab]').forEach(el => el.addEventListener('click', () => {
    S.benefitTab = el.dataset.btab;
    savePersisted();
    render();
    if (S.benefitTab === 'calc') requestAnimationFrame(() => renderResults());
  }));

  $$('[data-cat]').forEach(el => el.addEventListener('click', () => {
    const c = Engine.HOME_CATS.find(x => x.key === el.dataset.cat);
    S.q.category = c.key;
    S.q.brand = '';
    S.q.amount = c.sample;
    S.page = 'benefits';
    S.benefitTab = 'calc';
    S.resultsExpanded = false;
    savePersisted();
    render();
    renderResults();
  }));

  const brandInput = $('#brandInput');
  if (brandInput) {
    brandInput.addEventListener('input', e => {
      S.q.brand = e.target.value.trim();
      scheduleCalc();
    });
    brandInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { updateAmt(); S.resultsExpanded = false; renderResults(); }
    });
  }
  $$('[data-chip]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.chip;
    S.q.category = S.q.category === key ? null : key;
    S.q.brand = '';
    const bi = $('#brandInput');
    if (bi) bi.value = '';
    $$('[data-chip]').forEach(b => b.classList.toggle('on', b.dataset.chip === S.q.category));
    updateBrandDatalist();
    const label = document.querySelector('label[for="brandInput"]');
    if (label) {
      label.innerHTML = S.q.category
        ? `브랜드/매장 <span class="cat-filter-tag">${esc(S.q.category)}</span>`
        : '브랜드/매장';
    }
    scheduleCalc();
  }));

  const amt = $('#amtInput');
  if (amt) {
    amt.addEventListener('input', e => {
      const raw = e.target.value.replace(/[^\d]/g, '');
      e.target.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
      scheduleCalc();
    });
    amt.addEventListener('change', () => { updateAmt(); scheduleCalc(); });
  }
  $$('[data-amt]').forEach(el => el.addEventListener('click', () => {
    S.q.amount = Number(el.dataset.amt);
    if (amt) amt.value = won(S.q.amount);
    scheduleCalc();
  }));

  const seg = document.querySelector('[data-seg="channel"]');
  if (seg) seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    S.q.channel = b.dataset.v || null;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    scheduleCalc();
  }));
  const daySel = $('#daySel');
  if (daySel) daySel.addEventListener('change', e => {
    if (e.target.value === 'today') { S.q.dayMode = 'today'; S.q.day = null; }
    else { S.q.dayMode = 'day'; S.q.day = Number(e.target.value); }
    scheduleCalc();
  });
  const ti = $('#timeInput');
  if (ti) ti.addEventListener('change', e => { S.q.time = e.target.value; scheduleCalc(); });

  if (S.page === 'benefits' && S.benefitTab === 'calc') {
    requestAnimationFrame(() => renderResults());
  }

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
