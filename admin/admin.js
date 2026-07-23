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
  const loginError = document.getElementById('loginError');
  const queueList = document.getElementById('queueList');
  const refreshQueueBtn = document.getElementById('refreshQueueBtn');
  const userQueueList = document.getElementById('userQueueList');
  const refreshUserQueueBtn = document.getElementById('refreshUserQueueBtn');

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
          <div class="file-upload-wrapper">
            <input type="file" id="file-${item.id}" accept="application/pdf">
          </div>
          <button class="btn-action" id="btn-${item.id}">AI 전송 (승인)</button>
        </div>
      `;
      
      queueList.appendChild(el);

      const btn = document.getElementById(`btn-${item.id}`);
      const fileInput = document.getElementById(`file-${item.id}`);

      btn.addEventListener('click', () => handleApprove(item, fileInput, btn, el));
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

      // 3. Call Serverless API to trigger AI pipeline
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
          storage_path: storagePath
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `서버 응답 오류 (${response.status})`);
      }

      // Success
      rowEl.innerHTML = `
        <div class="item-info">
          <div class="item-provider">${item.provider}</div>
          <h3 class="item-name">${item.card_name}</h3>
        </div>
        <div class="item-actions">
          <span class="status-badge status-completed">처리 완료</span>
        </div>
      `;
      
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

      btn.addEventListener('click', () => handleUserApprove(item, fileInput, btn, el));
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
          storage_path: storagePath
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `서버 응답 오류 (${response.status})`);
      }

      rowEl.innerHTML = `
        <div class="item-info">
          <div class="item-provider">${item.provider_hint}</div>
          <h3 class="item-name">${item.card_name_hint}</h3>
        </div>
        <div class="item-actions">
          <span class="status-badge status-completed">처리 완료</span>
        </div>
      `;
      
    } catch (err) {
      console.error(err);
      alert(err.message);
      btn.disabled = false;
      btn.textContent = '다시 시도';
    }
  }

  refreshQueueBtn.addEventListener('click', loadQueue);
  refreshUserQueueBtn.addEventListener('click', loadUserQueue);
});
