const API_URL = '/api';
let currentToken = null;

import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabase = createClient(
  "https://cnqonqbmvrfkhcncqopa.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucW9ucWJtdnJma2hjbmNxb3BhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTk1MDcsImV4cCI6MjA5OTQ5NTUwN30.Y5RiaO7zopsdyGClGceuihLWE_M_ru8Fh92_bFiiITY"
);

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentToken = session.access_token;
  }
}

async function fetchAnomalies() {
  await getToken();
  if (!currentToken) throw new Error("로그인이 필요합니다.");
  
  const res = await fetch(`${API_URL}/admin-anomalies`, {
    headers: { 'Authorization': `Bearer ${currentToken}` }
  });
  
  if (!res.ok) throw new Error('조회 실패');
  const data = await res.json();
  return data.anomalies;
}

function renderList(anomalies) {
  const list = document.getElementById('anomaly-list');
  list.innerHTML = '';

  if (anomalies.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: #888; padding: 2rem;">탐지된 이상 혜택이 없습니다. 👏</div>';
    return;
  }

  anomalies.forEach(a => {
    const card = document.createElement('div');
    card.className = 'anomaly-card';
    
    let reasonsHtml = a.reasons.map(r => `<li>${r}</li>`).join('');
    
    // Fallback if product info is missing
    const provider = a.products ? a.products.provider : '알 수 없음';
    const productName = a.products ? a.products.product_name : '알 수 없음';

    card.innerHTML = `
      <div class="anomaly-info">
        <div class="anomaly-title">${provider} ${productName} - [${a.benefit_name}]</div>
        <div class="anomaly-details">
          <strong>혜택 종류:</strong> ${a.benefit_type || 'N/A'} <br/>
          <strong>제공 혜택:</strong> ${a.benefit_value || 0}${a.benefit_unit || ''} <br/>
          <strong>건당 한도:</strong> ${a.per_tx_discount_limit ? a.per_tx_discount_limit + '원' : '없음'}
        </div>
        <ul class="anomaly-reasons">
          ${reasonsHtml}
        </ul>
      </div>
      <div class="item-actions">
        <!-- Edit will redirect to index.html with the product_id to trigger edit modal -->
        <button class="btn" onclick="goToEdit('${a.product_id}')">카드 수정하기</button>
      </div>
    `;
    list.appendChild(card);
  });
}

window.goToEdit = (productId) => {
  // Pass the product_id via hash or query to index.html so it can auto-open
  location.href = `index.html?edit=${productId}`;
};

async function loadData() {
  try {
    const anomalies = await fetchAnomalies();
    renderList(anomalies || []);
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    loadData();
  } else {
    alert("관리자 로그인이 필요합니다.");
    location.href = "index.html";
  }
});
