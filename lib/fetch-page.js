function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// 정적(서버 렌더링) 페이지용. 자바스크립트로 내용을 나중에 채우는 페이지(예: 네이버페이)는
// 이 함수로 못 읽으므로, 그런 경우엔 사람이 내용을 복사해서 텍스트로 넘겨야 한다.
export async function fetchPageText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  if (!res.ok) {
    throw new Error(`페이지 요청 실패 (${res.status}): ${url}`);
  }
  const html = await res.text();
  const text = stripHtml(html);
  if (text.length < 200) {
    throw new Error(`페이지 내용이 너무 적습니다 (자바스크립트 렌더링 페이지일 수 있음): ${url}`);
  }
  return text;
}
