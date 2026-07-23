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

// 자바스크립트로 내용을 나중에 채우는 페이지(예: 네이버페이)용.
// 실제 브라우저 엔진(Playwright)으로 렌더링한 뒤 텍스트를 읽는다.
// 여러 URL을 한 번에 처리할 때는 브라우저를 한 번만 띄우고 재사용한다.
export async function fetchRenderedPagesText(urls) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const results = [];
    for (const url of urls) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(1000);
        const text = await page.evaluate(() => document.body.innerText);
        if (text.length < 100) {
          throw new Error(`페이지 내용이 너무 적습니다: ${url}`);
        }
        results.push({ url, text });
      } finally {
        await page.close();
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

// fetchRenderedPagesText()와 동일하지만, 로컬 스크립트가 아니라 Vercel 서버리스
// 함수(월별 자동 갱신 크론) 안에서 쓰기 위한 버전. 일반 playwright는 브라우저
// 바이너리를 통째로 포함해서 서버리스 배포에 못 들어가므로, 대신 서버리스용
// 경량 크로미움(@sparticuz/chromium, 약 50MB)을 playwright-core와 함께 쓴다.
export async function fetchRenderedPagesTextServerless(urls) {
  const chromiumPkg = (await import("@sparticuz/chromium")).default;
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    args: chromiumPkg.args,
    executablePath: await chromiumPkg.executablePath(),
    headless: true,
  });
  try {
    const results = [];
    for (const url of urls) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(1000);
        const text = await page.evaluate(() => document.body.innerText);
        if (text.length < 100) {
          throw new Error(`페이지 내용이 너무 적습니다: ${url}`);
        }
        results.push({ url, text });
      } finally {
        await page.close();
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

// 정적(서버 렌더링) 페이지용. 자바스크립트로 내용을 나중에 채우는 페이지(예: 네이버페이)는
// 이 함수로 못 읽으므로, 그런 경우엔 fetchRenderedPagesText를 쓴다.
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
