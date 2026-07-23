document.addEventListener('DOMContentLoaded', () => {
  const supabase = window.supabase;
  if (!supabase) {
    console.error("Supabase client not loaded");
    return;
  }

  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const authPanel = document.getElementById('authPanel');
  const loginForm = document.getElementById('loginForm');
  const queueList = document.getElementById('queueList');
  const refreshQueueBtn = document.getElementById('refreshQueueBtn');
  const userQueueList = document.getElementById('userQueueList');
  const refreshUserQueueBtn = document.getElementById('refreshUserQueueBtn');
  const ignoredList = document.getElementById('ignoredList');
  const refreshIgnoredBtn = document.getElementById('refreshIgnoredBtn');
  
  // Manage Cards Elements
  const cardsList = document.getElementById('cardsList');
  const refreshCardsBtn = document.getElementById('refreshCardsBtn');
  const editModal = document.getElementById('editModal');
  const closeEditBtn = document.getElementById('closeEditBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const saveEditBtn = document.getElementById('saveEditBtn');
  const editJson = document.getElementById('editJson');
  let editingProductId = null;
  
  // Filtering Elements
  const cardSearchInput = document.getElementById('cardSearchInput');
  const providerFilters = document.getElementById('providerFilters');
  let allRegisteredCards = [];
  let selectedProvider = '전체';

  // Preview Modal Elements
  const previewModal = document.getElementById('previewModal');
  const closePreviewBtn = document.getElementById('closePreviewBtn');
  const cancelCommitBtn = document.getElementById('cancelCommitBtn');
  const confirmCommitBtn = document.getElementById('confirmCommitBtn');
  const previewMeta = document.getElementById('previewMeta');
  const previewJson = document.getElementById('previewJson');
  let pendingCommit = null;

  // Tabs logic
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.hidden = true);
      
      e.target.classList.add('active');
      document.getElementById(e.target.dataset.target).hidden = false;
      document.getElementById(e.target.dataset.target).classList.add('active');
    });
  });

  // Auth state handling
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      loginView.hidden = true;
      dashboardView.hidden = false;
      authPanel.innerHTML = `
        <span>${session.user.email}</span>
        <button id="logoutBtn" class="btn-logout">로그아웃</button>
      `;
      document.getElementById('logoutBtn').addEventListener('click', () => supabase.auth.signOut());
      loadQueue();
      loadUserQueue();
      loadIgnoredQueue();
      loadCardsTab();
    } else {
      loginView.hidden = false;
      dashboardView.hidden = true;
      authPanel.innerHTML = ``;
    }
  });

  // Initial session check
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      loginView.hidden = false;
      dashboardView.hidden = true;
    }
  });

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      loginError.textContent = '로그인 실패: ' + error.message;
    }
  });

  // Queue Loading
  async function loadQueue() {
    queueList.innerHTML = '<div class="loading-state">데이터를 불러오는 중입니다...</div>';
    
    const { data, error } = await supabase
      .from('admin_card_queue')
      .select('*')
      .in('status', ['pending', 'failed'])
      .order('created_at', { ascending: false });

    if (error) {
      queueList.innerHTML = `<div class="error-text">대기열을 불러오지 못했습니다: ${error.message}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      queueList.innerHTML = '<div class="empty-state">🎉 처리할 대기열이 없습니다!</div>';
      return;
    }

    renderQueue(data);
  }

  function renderQueue(items) {
    queueList.innerHTML = '';
    
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'queue-item';
      
      const isFailed = item.status === 'failed';
      
      el.innerHTML = `
        <div class="item-info">
          <div class="item-provider">${item.provider}</div>
          <h3 class="item-name">${item.card_name}</h3>
          <div class="item-date">수집일: ${new Date(item.created_at).toLocaleString()} ${isFailed ? '<span style="color:red">(이전 처리 실패)</span>' : ''}</div>
        </div>
        <div class="item-actions">
          <button class="btn-secondary" id="ignore-btn-${item.id}" style="font-size:0.85rem; padding:0.4rem 0.8rem; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; cursor:pointer;">제외</button>
          <div class="file-upload-wrapper">
            <input type="file" id="file-${item.id}" accept="application/pdf">
          </div>
          <button class="btn-action" id="btn-${item.id}">AI 전송 (승인)</button>
        </div>
      `;
      
      queueList.appendChild(el);

      const btn = document.getElementById(`btn-${item.id}`);
      const fileInput = document.getElementById(`file-${item.id}`);
      const ignoreBtn = document.getElementById(`ignore-btn-${item.id}`);

      btn.addEventListener('click', () => handleApprove(item, fileInput, btn, el));
      ignoreBtn.addEventListener('click', () => handleIgnore(item, el, 'admin_queue'));
    });
  }

  async function handleApprove(item, fileInput, btn, rowEl) {
    const file = fileInput.files[0];
    if (!file) {
      alert('약관 PDF 파일을 첨부해주세요.');
      return;
    }

    btn.disabled = true;
    btn.textContent = '처리 중...';

    try {
      // 1. Upload to Supabase Storage (card-pdfs bucket)
      const fileName = `${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('card-pdfs')
        .upload(fileName, file);

      if (uploadError) throw new Error('파일 업로드 실패: ' + uploadError.message);

      const storagePath = uploadData.path;

      // 2. Update DB status to processing
      await supabase.from('admin_card_queue').update({ status: 'processing' }).eq('id', item.id);

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin-process-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          queue_id: item.id,
          provider: item.provider,
          product_name: item.card_name,
          storage_path: storagePath,
          preview: true
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `서버 응답 오류 (${response.status})`);
      }

      const resData = await response.json();

      pendingCommit = {
        queue_id: item.id,
        type: 'admin_queue',
        previewData: resData.previewData,
        rowEl, btn,
        info: { provider: item.provider, name: item.card_name }
      };
      
      showPreviewModal(resData.previewData);
      
    } catch (err) {
      console.error(err);
      alert(err.message);
      btn.disabled = false;
      btn.textContent = '다시 시도';
      // Revert status on UI level if needed, or leave it for next load
    }
  }

  async function loadUserQueue() {
    userQueueList.innerHTML = '<div class="loading-state">데이터를 불러오는 중입니다...</div>';
    
    const { data, error } = await supabase
      .from('user_card_requests')
      .select('*')
      .in('status', ['pending', 'failed'])
      .order('created_at', { ascending: false });

    if (error) {
      userQueueList.innerHTML = `<div class="error-text">대기열을 불러오지 못했습니다: ${error.message}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      userQueueList.innerHTML = '<div class="empty-state">🎉 처리할 유저 요청이 없습니다!</div>';
      return;
    }

    renderUserQueue(data);
  }

  function renderUserQueue(items) {
    userQueueList.innerHTML = '';
    
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'queue-item';
      
      const isFailed = item.status === 'failed';
      const hasPdf = !!item.attached_file_path;
      
      el.innerHTML = `
        <div class="item-info">
          <div class="item-provider">${item.provider_hint}</div>
          <h3 class="item-name">${item.card_name_hint}</h3>
          <div class="item-date">유저: ${item.user_contact || '익명'} | 요청일: ${new Date(item.created_at).toLocaleString()} ${isFailed ? '<span style="color:red">(이전 처리 실패)</span>' : ''}</div>
          ${hasPdf ? `<div style="color:green; font-size:0.8rem; margin-top:5px;">✅ 유저가 첨부한 PDF가 있습니다.</div>` : ''}
        </div>
        <div class="item-actions">
          <button class="btn-secondary" id="user-ignore-btn-${item.id}" style="font-size:0.85rem; padding:0.4rem 0.8rem; background:#fee2e2; color:#dc2626; border:none; border-radius:6px; cursor:pointer;">제외</button>
          <div class="file-upload-wrapper">
            <input type="file" id="user-file-${item.id}" accept="application/pdf">
            ${hasPdf ? '<div style="font-size:0.75rem; color:#888;">(새 파일 업로드 시 덮어씁니다)</div>' : ''}
          </div>
          <button class="btn-action" id="user-btn-${item.id}">AI 전송 (승인)</button>
        </div>
      `;
      
      userQueueList.appendChild(el);

      const btn = document.getElementById(`user-btn-${item.id}`);
      const fileInput = document.getElementById(`user-file-${item.id}`);
      const ignoreBtn = document.getElementById(`user-ignore-btn-${item.id}`);

      btn.addEventListener('click', () => handleUserApprove(item, fileInput, btn, el));
      ignoreBtn.addEventListener('click', () => handleIgnore(item, el, 'user_request'));
    });
  }

  async function handleUserApprove(item, fileInput, btn, rowEl) {
    let storagePath = item.attached_file_path;
    const file = fileInput.files[0];
    
    if (!file && !storagePath) {
      alert('약관 PDF 파일을 첨부해주세요. (유저가 첨부하지 않음)');
      return;
    }

    btn.disabled = true;
    btn.textContent = '처리 중...';

    try {
      if (file) {
        // Upload new file
        const fileName = `${Date.now()}_${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('card-pdfs')
          .upload(fileName, file);

        if (uploadError) throw new Error('파일 업로드 실패: ' + uploadError.message);
        storagePath = uploadData.path;
      }

      await supabase.from('user_card_requests').update({ status: 'processing', attached_file_path: storagePath }).eq('id', item.id);

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin-process-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          type: 'user_request',
          queue_id: item.id,
          provider: item.provider_hint,
          product_name: item.card_name_hint,
          storage_path: storagePath,
          preview: true
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `서버 응답 오류 (${response.status})`);
      }

      const resData = await response.json();

      pendingCommit = {
        queue_id: item.id,
        type: 'user_request',
        previewData: resData.previewData,
        rowEl, btn,
        info: { provider: item.provider_hint, name: item.card_name_hint }
      };
      
      showPreviewModal(resData.previewData);
      
    } catch (err) {
      console.error(err);
      alert(err.message);
      btn.disabled = false;
      btn.textContent = '다시 시도';
    }
  }

  function showPreviewModal(previewData) {
    previewMeta.innerHTML = previewData.isExisting 
      ? `<span style="color:#d97706;">⚠️ 기존에 등록된 카드를 찾아 덮어쓰기(업데이트) 합니다.</span>`
      : `<span style="color:#059669;">✨ 새로운 카드로 신규 등록됩니다.</span>`;
    
    previewJson.textContent = JSON.stringify(previewData.payload, null, 2);
    previewModal.removeAttribute('hidden');
    previewModal.style.display = 'flex';
  }

  function closePreview() {
    previewModal.setAttribute('hidden', '');
    previewModal.style.display = 'none';
    if (pendingCommit && pendingCommit.btn) {
      pendingCommit.btn.disabled = false;
      pendingCommit.btn.textContent = 'AI 전송 (승인)';
    }
    pendingCommit = null;
  }

  closePreviewBtn.addEventListener('click', closePreview);
  cancelCommitBtn.addEventListener('click', closePreview);

  confirmCommitBtn.addEventListener('click', async () => {
    if (!pendingCommit) return;
    
    const { queue_id, type, previewData, rowEl, btn, info } = pendingCommit;
    confirmCommitBtn.disabled = true;
    confirmCommitBtn.textContent = '저장 중...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin-commit-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ queue_id, type, previewData })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `서버 응답 오류 (${response.status})`);
      }

      // Success
      rowEl.innerHTML = `
        <div class="item-info">
          <div class="item-provider">${info.provider}</div>
          <h3 class="item-name">${info.name}</h3>
        </div>
        <div class="item-actions">
          <span class="status-badge status-completed">처리 완료</span>
        </div>
      `;
      previewModal.hidden = true;
      pendingCommit = null;
    } catch (err) {
      console.error(err);
      alert('저장 실패: ' + err.message);
    } finally {
      confirmCommitBtn.disabled = false;
      confirmCommitBtn.textContent = '최종 승인 (DB 저장)';
    }
  });

  refreshQueueBtn.addEventListener('click', loadQueue);
  refreshUserQueueBtn.addEventListener('click', loadUserQueue);
  refreshIgnoredBtn.addEventListener('click', loadIgnoredQueue);

  // Ignored Queue logic
  async function loadIgnoredQueue() {
    ignoredList.innerHTML = '<div class="loading-state">데이터를 불러오는 중입니다...</div>';
    
    // Load from both tables
    const [adminRes, userRes] = await Promise.all([
      supabase.from('admin_card_queue').select('*').eq('status', 'ignored').order('created_at', { ascending: false }),
      supabase.from('user_card_requests').select('*').eq('status', 'ignored').order('created_at', { ascending: false })
    ]);

    if (adminRes.error || userRes.error) {
      ignoredList.innerHTML = `<div class="error-text">대기열을 불러오지 못했습니다.</div>`;
      return;
    }

    const items = [
      ...(adminRes.data || []).map(d => ({ ...d, _type: 'admin_queue' })),
      ...(userRes.data || []).map(d => ({ ...d, _type: 'user_request' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (items.length === 0) {
      ignoredList.innerHTML = '<div class="empty-state">휴지통이 비어있습니다.</div>';
      return;
    }

    renderIgnoredQueue(items);
  }

  function renderIgnoredQueue(items) {
    ignoredList.innerHTML = '';
    
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'queue-item';
      
      const provider = item._type === 'admin_queue' ? item.provider : item.provider_hint;
      const name = item._type === 'admin_queue' ? item.card_name : item.card_name_hint;
      
      el.innerHTML = `
        <div class="item-info">
          <div class="item-provider">${provider} <span style="font-size:0.8rem; color:#888;">(${item._type === 'admin_queue' ? '크롤러' : '유저요청'})</span></div>
          <h3 class="item-name" style="text-decoration: line-through; color:#9ca3af;">${name}</h3>
          <div class="item-date">수집일: ${new Date(item.created_at).toLocaleString()}</div>
        </div>
        <div class="item-actions">
          <button class="btn-secondary" id="restore-btn-${item.id}">복구 (대기열로 이동)</button>
        </div>
      `;
      
      ignoredList.appendChild(el);

      document.getElementById(`restore-btn-${item.id}`).addEventListener('click', () => handleRestore(item, el, item._type));
    });
  }

  async function handleIgnore(item, rowEl, type) {
    if (!confirm('이 카드를 대기열에서 제외하시겠습니까? (휴지통으로 이동)')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ queue_id: item.id, type, status: 'ignored' })
      });
      if (!res.ok) throw new Error('업데이트 실패');
      
      rowEl.remove();
      loadIgnoredQueue(); // refresh ignored tab
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRestore(item, rowEl, type) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ queue_id: item.id, type, status: 'pending' })
      });
      if (!res.ok) throw new Error('업데이트 실패');
      
      rowEl.remove();
      if (type === 'admin_queue') loadQueue();
      else loadUserQueue();
    } catch (err) {
      alert(err.message);
    }
  }

  // --- Manage Registered Cards (Edit & Delete) ---
  
  refreshCardsBtn.addEventListener('click', loadCardsTab);
  closeEditBtn.addEventListener('click', () => editModal.hidden = true);
  cancelEditBtn.addEventListener('click', () => editModal.hidden = true);

  async function loadCardsTab() {
    cardsList.innerHTML = '<div class="loading-state">데이터를 불러오는 중입니다...</div>';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-get-cards', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('불러오기 실패');
      const json = await res.json();
      
      if (!json.cards || json.cards.length === 0) {
        cardsList.innerHTML = '<div class="empty-state">등록된 카드가 없습니다.</div>';
        allRegisteredCards = [];
        return;
      }
      allRegisteredCards = json.cards;
      renderProviderFilters();
      applyFiltersAndRender();
    } catch (err) {
      cardsList.innerHTML = `<div class="error-text">${err.message}</div>`;
    }
  }

  function renderProviderFilters() {
    const providers = ['전체', ...new Set(allRegisteredCards.map(c => c.provider))].filter(Boolean);
    providerFilters.innerHTML = '';
    
    providers.forEach(p => {
      const btn = document.createElement('button');
      btn.className = selectedProvider === p ? 'btn-primary' : 'btn-secondary';
      btn.textContent = p;
      btn.style.padding = '0.4rem 0.8rem';
      btn.style.fontSize = '0.9rem';
      
      btn.addEventListener('click', () => {
        selectedProvider = p;
        renderProviderFilters();
        applyFiltersAndRender();
      });
      
      providerFilters.appendChild(btn);
    });
  }

  cardSearchInput.addEventListener('input', applyFiltersAndRender);

  function applyFiltersAndRender() {
    let filtered = allRegisteredCards;
    
    if (selectedProvider !== '전체') {
      filtered = filtered.filter(c => c.provider === selectedProvider);
    }
    
    const query = cardSearchInput.value.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(c => 
        c.product_name.toLowerCase().includes(query) || 
        c.provider.toLowerCase().includes(query)
      );
    }
    
    // Sort alphabetically by card name
    filtered.sort((a, b) => a.product_name.localeCompare(b.product_name, 'ko-KR'));
    
    renderCardsTab(filtered);
  }

  function renderCardsTab(cards) {
    cardsList.innerHTML = '';
    if (cards.length === 0) {
      cardsList.innerHTML = '<div class="empty-state">검색 결과가 없습니다.</div>';
      return;
    }

    cards.forEach(card => {
      const el = document.createElement('div');
      el.className = 'queue-item';
      
      el.innerHTML = `
        <div class="item-info">
          <div class="item-provider">${card.provider}</div>
          <h3 class="item-name">${card.product_name}</h3>
          <div class="item-date">등록일: ${new Date(card.created_at).toLocaleString()}</div>
        </div>
        <div class="item-actions">
          <button class="btn-secondary" id="edit-btn-${card.product_id}" style="color:#2563eb; background:#eff6ff;">DB 수정 (JSON)</button>
          <button class="btn-secondary" id="del-btn-${card.product_id}" style="color:#dc2626; background:#fee2e2;">삭제 (큐로 롤백)</button>
        </div>
      `;
      cardsList.appendChild(el);

      document.getElementById(`edit-btn-${card.product_id}`).addEventListener('click', () => handleEditCard(card));
      document.getElementById(`del-btn-${card.product_id}`).addEventListener('click', () => handleDeleteCard(card, el));
    });
  }

  async function handleDeleteCard(card, el) {
    if (!confirm(`'${card.provider} ${card.product_name}' 카드를 DB에서 완전히 삭제하고 대기열로 되돌리겠습니까? 이 작업은 복구할 수 없습니다.`)) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-delete-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ product_id: card.product_id, provider: card.provider, product_name: card.product_name })
      });
      
      if (!res.ok) throw new Error('삭제 실패');
      
      alert('성공적으로 삭제 및 롤백되었습니다.');
      el.remove();
      loadQueue(); // refresh the queue to show the rolled back item
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleEditCard(card) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin-get-card-details?product_id=${card.product_id}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('상세 정보 불러오기 실패');
      const json = await res.json();
      
      editingProductId = card.product_id;
      editJson.value = JSON.stringify(json.payload, null, 2);
      editModal.hidden = false;
    } catch (err) {
      alert(err.message);
    }
  }

  saveEditBtn.addEventListener('click', async () => {
    try {
      const parsed = JSON.parse(editJson.value);
      
      saveEditBtn.disabled = true;
      saveEditBtn.textContent = '저장 중...';

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin-update-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ payload: parsed })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || '저장 실패');
      }

      alert('성공적으로 저장되었습니다!');
      editModal.hidden = true;
      loadCardsTab(); // refresh to show any changes in name/provider
    } catch (err) {
      alert('저장 실패 (JSON 문법을 확인하세요):\n' + err.message);
    } finally {
      saveEditBtn.disabled = false;
      saveEditBtn.textContent = '수정 사항 저장';
    }
  });
});
