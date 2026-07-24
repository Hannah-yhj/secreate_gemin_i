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
        <button class="btn-approve" onclick="handleApprove('${a.id}')">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
          승인
        </button>
        <button class="btn-reject" onclick="handleReject('${a.id}')">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          거절
        </button>
      `;
    } else if (a.status === 'rejected') {
      actionHtml = `
        <button class="btn-restore" onclick="handleRestore('${a.id}')">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>
          복구
        </button>
        <button class="btn-delete" onclick="handleDelete('${a.id}')">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          삭제
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

    const catLabel = a.category || '기타';
    li.dataset.original = (a.original_name || '').toLowerCase();
    li.dataset.canonical = (a.canonical_name || '').toLowerCase();
    li.dataset.category = catLabel;
    
    li.innerHTML = `
      <div class="item-info">
        <div style="display: inline-block; padding: 2px 8px; border-radius: 12px; background: rgba(255,255,255,0.1); font-size: 0.75em; margin-bottom: 4px;">${catLabel}</div><br/>
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
  
  applyFilters();
}

let allAliases = [];
let currentStatus = 'pending_review';
let currentCategory = '전체';
let currentSearch = '';

async function loadData() {
  try {
    const aliases = await fetchAliases(currentStatus);
    allAliases = aliases || [];
    renderList(allAliases);
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

function applyFilters() {
  const listItems = document.querySelectorAll('#merchant-list .queue-item');
  if (listItems.length === 1 && listItems[0].textContent.includes('데이터가 없습니다')) return;

  listItems.forEach(li => {
    const orig = li.dataset.original || '';
    const can = li.dataset.canonical || '';
    const cat = li.dataset.category || '';
    
    let matchSearch = true;
    if (currentSearch) {
      matchSearch = orig.includes(currentSearch) || can.includes(currentSearch);
    }
    
    let matchCat = true;
    if (currentCategory !== '전체') {
      if (currentCategory === '기타') {
        matchCat = cat === '기타' || cat === '';
      } else {
        matchCat = cat.includes(currentCategory);
      }
    }
    
    if (matchSearch && matchCat) {
      li.style.display = 'flex';
    } else {
      li.style.display = 'none';
    }
  });
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
  const inputEl = document.getElementById(`canonical-input-${id}`);
  const canonical = inputEl ? inputEl.value : '';
  try {
    await updateAlias(id, 'rejected', canonical);
    loadData();
  } catch (err) {
    alert(err.message);
  }
};

window.handleRestore = async (id) => {
  const inputEl = document.getElementById(`canonical-input-${id}`);
  const canonical = inputEl ? inputEl.value : '';
  try {
    await updateAlias(id, 'pending_review', canonical);
    loadData();
  } catch (err) {
    alert(err.message);
  }
};

window.handleDelete = async (id) => {
  if (!confirm('이 항목을 정말 데이터베이스에서 영구 삭제하시겠습니까? 복구할 수 없습니다.')) return;
  await getToken();
  try {
    const res = await fetch(`${API_URL}/admin-merchant-aliases?id=${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error || '삭제 실패');
    }
    loadData();
  } catch (err) {
    alert(err.message);
  }
};

// Event Listeners for tabs and filters
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
  
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }
  
  const chips = document.querySelectorAll('.chip');
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      chips.forEach(c => {
        c.classList.remove('active');
        c.style.background = 'transparent';
        c.style.color = '#aaa';
      });
      e.target.classList.add('active');
      e.target.style.background = '#333';
      e.target.style.color = 'white';
      currentCategory = e.target.getAttribute('data-category');
      applyFilters();
    });
  });
});

supabase.auth.onAuthStateChange((event, session) => {
  const nav = document.getElementById('main-nav');
  if (nav) {
    nav.style.display = session ? 'flex' : 'none';
  }
  
  if (session) {
    loadData();
  } else {
    alert("관리자 로그인이 필요합니다.");
    location.href = "index.html";
  }
});
