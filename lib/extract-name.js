const CHAT_URL = "https://api.upstage.ai/v1/chat/completions";

function normalizeForMatch(s) {
  return (s || "").replace(/\s+/g, "");
}

const SYSTEM_PROMPT = `당신은 카드 약관/상품안내장 문서에서 카드사명과 정확한 카드 상품명만 추출하는 도우미입니다.
반드시 아래 형태의 JSON 객체 하나만 출력하세요. 다른 설명, 마크다운, 코드블록 없이 순수 JSON만 출력합니다.
{"provider": "카드사명", "product_name": "카드 상품명"}
문서 본문에 실제로 등장하는 공식 명칭을 그대로 사용하세요. 요약하거나 줄이거나 새로 만들어내지 마세요.
혜택 내용은 절대 추출하지 마세요. provider와 product_name 두 필드만 반환합니다.

카드 상품명을 찾을 때 주의할 점:
- 문서 앞부분에 카드사명(예: "우리카드")이 단독으로 한 줄 나온 직후, 혜택 설명이 시작되기 전에 나오는 짧은 제목 형태의 텍스트가 보통 실제 카드 상품명입니다.
- "해외겸용", "국내전용", "VISA", "Mastercard", "BC", "AMEX" 같은 결제망/브랜드 표기나 연회비 표 안의 문구는 카드 상품명이 아닙니다. 이런 문구만 있는 부분을 상품명으로 사용하지 마세요.
- 상품명이 여러 줄에 걸쳐 나뉘어 있으면(예: "카드의정석" 다음 줄에 "ELFARE" 다음 줄에 "Allday") 그 줄들을 공백으로 이어 붙여 하나의 상품명으로 만드세요.`;

export async function extractProviderAndName(parsedText) {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    throw new Error("UPSTAGE_API_KEY가 설정되어 있지 않습니다.");
  }
  const model = process.env.UPSTAGE_CHAT_MODEL || "solar-pro2";

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: parsedText.slice(0, 12000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  const raw = await res.json();
  if (!res.ok) {
    throw new Error(`Upstage Chat Completion 실패 (${res.status}): ${raw?.error?.message || JSON.stringify(raw)}`);
  }

  const content = raw?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Upstage Chat Completion 응답에 content가 없습니다.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Solar Pro 응답이 JSON 형식이 아닙니다: ${content}`);
  }

  const provider = typeof parsed.provider === "string" ? parsed.provider.trim() : "";
  const product_name = typeof parsed.product_name === "string" ? parsed.product_name.trim() : "";

  if (!provider || !product_name) {
    throw new Error(`provider/product_name 추출 실패 (응답: ${content})`);
  }

  // AI가 이름을 지어내지 않았는지 기계적으로 재확인: 추출된 상품명이 실제 원문에 등장하는지 검증
  const haystack = normalizeForMatch(parsedText.slice(0, 12000));
  if (!haystack.includes(normalizeForMatch(product_name))) {
    throw new Error(`추출된 카드 상품명("${product_name}")이 원문 텍스트에서 확인되지 않습니다 (AI가 이름을 지어냈을 가능성).`);
  }

  return { provider, product_name };
}
