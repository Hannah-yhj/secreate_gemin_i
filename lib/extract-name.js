const CHAT_URL = "https://api.upstage.ai/v1/chat/completions";

const SYSTEM_PROMPT = `당신은 카드 약관/상품안내장 문서에서 카드사명과 정확한 카드 상품명만 추출하는 도우미입니다.
반드시 아래 형태의 JSON 객체 하나만 출력하세요. 다른 설명, 마크다운, 코드블록 없이 순수 JSON만 출력합니다.
{"provider": "카드사명", "product_name": "카드 상품명"}
문서 본문에 실제로 등장하는 공식 명칭을 그대로 사용하세요. 요약하거나 줄이거나 새로 만들어내지 마세요.
혜택 내용은 절대 추출하지 마세요. provider와 product_name 두 필드만 반환합니다.`;

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

  return { provider, product_name };
}
