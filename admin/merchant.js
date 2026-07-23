document.addEventListener('DOMContentLoaded', () => {
  const supabase = window.supabase;
  if (!supabase) {
    console.error("Supabase client not loaded");
    return;
  }

  // --- Auth State Management ---
  const authPanel = document.getElementById('authPanel');
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  let currentSession = null;

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    currentSession = session;
    updateAuthUI(session);
    if (session) {
      loadAliases('pending_review', 'pendingList');
    }
  }

  function updateAuthUI(session) {
    if (session) {
      authPanel.innerHTML = `
        <span class="user-email">${session.user.email}</span>
        <button id="logoutBtn" class="btn-secondary">로그아웃</button>
      `;
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        checkSession();
      });
      loginView.hidden = true;
      dashboardView.hidden = false;
    } else {
      authPanel.innerHTML = ``;
      loginView.hidden = false;
      dashboardView.hidden = true;
    }
  }

  // --- Login Form ---
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('adminEmail').value;
      const password = document.getElementById('adminPassword').value;
      const errorDiv = document.getElementById('loginError');
      
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        errorDiv.textContent = '로그인 실패: ' + error.message;
      } else {
        errorDiv.textContent = '';
        checkSession();
      }
    });
  }

  checkSession();

  // --- Tabs ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.hidden = true);
      
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).hidden = false;
      
      if (targetId === 'pendingTab') loadAliases('pending_review', 'pendingList');
      if (targetId === 'approvedTab') loadAliases('approved', 'approvedList');
      if (targetId === 'rejectedTab') loadAliases('rejected', 'rejectedList');
    });
  });

  // --- Refresh Buttons ---
  document.querySelectorAll('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const status = e.target.getAttribute('data-status');
      const targetListId = status === 'pending_review' ? 'pendingList' : (status === 'approved' ? 'approvedList' : 'rejectedList');
      loadAliases(status, targetListId);
    });
  });

  // --- Load Data ---
  async function loadAliases(status, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !currentSession) return;
    
    container.innerHTML = '<div class="loading-state">데이터를 불러오는 중입니다...</div>';
    
    try {
      const res = await fetch(`/api/admin-get-merchant-aliases?status=${status}`, {
        headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
      });
      
      if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
      const { aliases } = await res.json();
      
      if (!aliases || aliases.length === 0) {
        container.innerHTML = `<div class="empty-state">해당 상태의 항목이 없습니다.</div>`;
        return;
      }
      
      container.innerHTML = '';
      aliases.forEach(item => {
        const el = document.createElement('div');
        el.className = 'queue-item glass-panel';
        
        const dateStr = new Date(item.created_at).toLocaleString();
        
        let actionButtons = '';
        if (status === 'pending_review') {
          actionButtons = `
            <button class="btn-primary approve-btn" data-id="${item.id}" style="background:#2ecc71;">승인</button>
            <button class="btn-action reject-btn" data-id="${item.id}" style="background:#dc2626;">거절</button>
          `;
        } else if (status === 'approved') {
          actionButtons = `
            <button class="btn-action reject-btn" data-id="${item.id}" style="background:#dc2626;">승인 취소(거절)</button>
          `;
        } else if (status === 'rejected') {
          actionButtons = `
            <button class="btn-primary approve-btn" data-id="${item.id}" style="background:#2ecc71;">다시 승인</button>
          `;
        }

        el.innerHTML = `
          <div class="item-info">
            <div class="item-meta">
              <span class="provider-badge">원문: ${item.original_name}</span>
            </div>
            <h3 class="item-title">정규화: 
              <input type="text" id="canonical-${item.id}" value="${item.canonical_name}" class="canonical-input" />
            </h3>
            <div class="item-date">발생일: ${dateStr}</div>
          </div>
          <div class="item-actions">
            ${actionButtons}
          </div>
        `;
        
        container.appendChild(el);
      });

      // Attach event listeners for buttons
      container.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.getAttribute('data-id');
          const canonical = document.getElementById(`canonical-${id}`).value;
          await updateAlias(id, 'approved', canonical);
          loadAliases(status, containerId); // reload current tab
        });
      });

      container.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.getAttribute('data-id');
          const canonical = document.getElementById(`canonical-${id}`).value;
          await updateAlias(id, 'rejected', canonical);
          loadAliases(status, containerId); // reload current tab
        });
      });

    } catch (err) {
      container.innerHTML = `<div class="error-text">${err.message}</div>`;
    }
  }

  async function updateAlias(id, status, canonical_name) {
    if (!currentSession) return;
    try {
      const res = await fetch('/api/admin-update-merchant-alias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`
        },
        body: JSON.stringify({ id, status, canonical_name })
      });
      
      if (!res.ok) {
        let errMsg = '업데이트 실패';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch(e) {}
        throw new Error(errMsg);
      }
      
      alert(status === 'approved' ? '승인 및 DB 업데이트가 완료되었습니다.' : '거절 처리되었습니다.');
    } catch (err) {
      alert('오류: ' + err.message);
    }
  }

});
