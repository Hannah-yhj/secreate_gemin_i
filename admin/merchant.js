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
  
  const res = await fetch(`${API_URL}/admin-merchant-aliases?status=${status}`, {
    headers: { 'Authorization': `Bearer ${currentToken}` }
  });
  if (!res.ok) throw new Error('조회 실패');
  const data = await res.json();
  return data.aliases;
}

async function updateAlias(id, status, canonicalName) {
  await getToken();
  if (!currentToken) throw new Error("로그인이 필요합니다.");

  const res = await fetch(`${API_URL}/admin-merchant-aliases`, {
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
        <button class="btn" style="background-color: var(--admin-primary); color: white; display: flex; align-items: center; justify-content: center; gap: 4px; border: none; padding: 6px 12px; border-radius: 4px;" onclick="handleApprove('${a.id}')">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
          승인
        </button>
        <button class="btn" style="background-color: var(--admin-danger); color: white; display: flex; align-items: center; justify-content: center; gap: 4px; border: none; padding: 6px 12px; border-radius: 4px;" onclick="handleReject('${a.id}')">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          거절
        </button>
      `;
    } else {
      actionHtml = `<span class="status-badge status-${a.status}">${a.status}</span>`;
    }

    let contextHtml = '';
    if (a.sampleContext) {
      const pdfLink = a.sampleContext.pdf_url ? `<a href="${a.sampleContext.pdf_url}" target="_blank" style="color:var(--admin-primary); text-decoration: underline; margin-left: 8px;">📄 약관 PDF 보기</a>` : '';
      contextHtml = `<div style="margin-top: 12px; font-size: 0.85em; color: #aaa; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 6px; border-left: 3px solid var(--admin-primary);">
        <strong>발견된 카드:</strong> ${a.sampleContext.provider} ${a.sampleContext.product_name}
        ${pdfLink}
      </div>`;
    }

    li.innerHTML = `
      <div class="item-info">
        <strong>원문:</strong> ${a.original_name} <br/>
        <div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
          <strong>대표명:</strong> 
          <span id="canonical-text-${a.id}" class="canonical-text" style="font-weight:bold; color:var(--admin-primary);">${a.canonical_name || ''}</span>
          <input type="text" id="canonical-input-${a.id}" value="${a.canonical_name || ''}" style="display:none; padding: 4px; border-radius:4px; border:1px solid #ccc; background: white; color: black;" />
          <button id="edit-btn-${a.id}" class="btn secondary" style="padding: 2px 8px; font-size: 0.8rem;" onclick="toggleEdit('${a.id}')">수정</button>
        </div>
        <div class="meta">Confidence: ${a.status === 'approved' ? 'high' : 'medium/low'} | 생성일: ${new Date(a.created_at).toLocaleString()}</div>
        ${contextHtml}
      </div>
      <div class="item-actions" style="display: flex; flex-direction: column; gap: 8px; justify-content: center;">
        ${actionHtml}
      </div>
    `;
    list.appendChild(li);
  });
}

let currentStatus = 'pending_review';

async function loadData() {
  try {
    const aliases = await fetchAliases(currentStatus);
    renderList(aliases || []);
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

window.toggleEdit = async (id) => {
  const textSpan = document.getElementById(`canonical-text-${id}`);
  const inputEl = document.getElementById(`canonical-input-${id}`);
  const btn = document.getElementById(`edit-btn-${id}`);
  
  if (inputEl.style.display === 'none') {
    // Switch to edit mode
    textSpan.style.display = 'none';
    inputEl.style.display = 'inline-block';
    btn.textContent = '수정완료';
    btn.classList.remove('secondary');
    inputEl.focus();
  } else {
    // Save changes
    const newName = inputEl.value.trim();
    if (!newName) {
      alert("대표명을 입력하세요.");
      return;
    }
    
    btn.textContent = '저장 중...';
    btn.disabled = true;
    
    try {
      // Find the current alias status to preserve it
      const res = await fetch(`${API_URL}/admin-merchant-aliases?status=all`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      const alias = data.aliases.find(a => a.id === id);
      
      if (alias) {
        await updateAlias(id, alias.status, newName);
      }
      
      // Update UI manually to avoid full reload if preferred, but reload is safer
      textSpan.textContent = newName;
      textSpan.style.display = 'inline-block';
      inputEl.style.display = 'none';
      btn.textContent = '수정';
      btn.classList.add('secondary');
      btn.disabled = false;
    } catch (err) {
      alert('수정 실패: ' + err.message);
      btn.textContent = '수정완료';
      btn.disabled = false;
    }
  }
};

window.handleApprove = async (id) => {
  const inputEl = document.getElementById(`canonical-input-${id}`);
  const canonical = inputEl ? inputEl.value : '';
  try {
    await updateAlias(id, 'approved', canonical);
    loadData();
  } catch (err) {
    alert(err.message);
  }
};

window.handleReject = async (id) => {
  if (!confirm('정말 거절하시겠습니까?')) return;
  const inputEl = document.getElementById(`canonical-input-${id}`);
  const canonical = inputEl ? inputEl.value : '';
  try {
    await updateAlias(id, 'rejected', canonical);
    loadData();
  } catch (err) {
    alert(err.message);
  }
};

// Event Listeners for tabs
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentStatus = e.target.getAttribute('data-status');
      loadData();
    });
  });
});

supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    loadData();
  } else {
    alert("관리자 로그인이 필요합니다.");
    location.href = "index.html";
  }
});
