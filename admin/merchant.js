const API_URL = '/api'; // 서버리스 함수 경로
let currentToken = null;

import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabase = createClient(
  "https://cnqonqbmvrfkhcncqopa.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucW9ucWJtdnJma2hjbmNxb3BhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTk1MDcsImV4cCI6MjA5OTQ5NTUwN30.Y5RiaO7zopsdyGClGceuihLWE_M_ru8Fh92_bFiiITY"
);
window.supabase = supabase;

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentToken = session.access_token;
  }
}

async function fetchAliases(status) {
  await getToken();
  if (!currentToken) throw new Error("로그인이 필요합니다.");
  
  const res = await fetch(`${API_URL}/admin-get-merchant-aliases?status=${status}`, {
    headers: { 'Authorization': `Bearer ${currentToken}` }
  });
  if (!res.ok) throw new Error('조회 실패');
  const data = await res.json();
  return data.aliases;
}

async function updateAlias(id, status, canonicalName) {
  await getToken();
  if (!currentToken) throw new Error("로그인이 필요합니다.");

  const res = await fetch(`${API_URL}/admin-update-merchant-alias`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentToken}`
    },
    body: JSON.stringify({ id, status, canonical_name: canonicalName })
  });
  if (!res.ok) throw new Error('업데이트 실패');
}

function renderList(aliases) {
  const list = document.getElementById('merchant-list');
  list.innerHTML = '';

  if (aliases.length === 0) {
    list.innerHTML = '<li class="queue-item">데이터가 없습니다.</li>';
    return;
  }

  aliases.forEach(a => {
    const li = document.createElement('li');
    li.className = 'queue-item';
    
    let actionHtml = '';
    if (a.status === 'pending_review') {
      actionHtml = `
        <button class="btn" onclick="handleApprove('${a.id}')">승인</button>
        <button class="btn secondary" onclick="handleReject('${a.id}')">거절</button>
      `;
    } else {
      actionHtml = `<span class="status-badge status-${a.status}">${a.status}</span>`;
    }

    li.innerHTML = `
      <div class="item-info">
        <strong>원문:</strong> ${a.original_name} <br/>
        <strong>대표명:</strong> <input type="text" id="canonical-${a.id}" value="${a.canonical_name || ''}" />
        <div class="meta">Confidence: ${a.status === 'approved' ? 'high' : 'medium/low'} | 생성일: ${new Date(a.created_at).toLocaleString()}</div>
      </div>
      <div class="item-actions">
        ${actionHtml}
      </div>
    `;
    list.appendChild(li);
  });
}

async function loadData() {
  const status = document.getElementById('status-filter').value;
  try {
    const aliases = await fetchAliases(status);
    renderList(aliases || []);
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

window.handleApprove = async (id) => {
  const canonical = document.getElementById(`canonical-${id}`).value;
  try {
    await updateAlias(id, 'approved', canonical);
    loadData();
  } catch (err) {
    alert(err.message);
  }
};

window.handleReject = async (id) => {
  try {
    await updateAlias(id, 'rejected', null);
    loadData();
  } catch (err) {
    alert(err.message);
  }
};

document.getElementById('status-filter').addEventListener('change', loadData);

// 초기 로딩
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    loadData();
  } else {
    // 로그인이 안되어있으면 index.html 로 보내거나 알림 표시
    alert("관리자 로그인이 필요합니다.");
    location.href = "index.html";
  }
});
