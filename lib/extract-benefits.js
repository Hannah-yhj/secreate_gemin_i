const CHAT_URL = "https://api.upstage.ai/v1/chat/completions";

const SYSTEM_PROMPT = `당신은 카드 약관/상품안내장 문서에서 상품 정보, 혜택, 이용 규칙을 구조화된 JSON으로 추출하는 도우미입니다.
반드시 아래 형태의 JSON 객체 하나만 출력하세요. 다른 설명, 마크다운, 코드블록 없이 순수 JSON만 출력합니다.
어떤 필드에도 id 값(product_id, benefit_id, rule_id, source_id 등)을 만들어내지 마세요 — 시스템이 별도로 부여합니다.

{
  "product": {
    "product_type": "신용카드 | 체크카드 | 간편결제 | 통신사 멤버십 등 문서에 명시된 상품 유형",
    "product_name": "이미 확인된 정확한 공식 상품명 (아래 [확인된 정보] 값을 그대로 사용)",
    "provider": "이미 확인된 카드사명 (아래 [확인된 정보] 값을 그대로 사용)",
    "service_type": "카드 | 간편결제 | 통신사 중 하나",
    "supported_funding": "지원 브랜드/결제망 (예: \\"국내전용|Mastercard|AMEX\\") 또는 null",
    "eligibility": "가입 대상/자격 요건 텍스트 또는 null",
    "data_status": "활성"
  },
  "benefits": [
    {
      "benefit_name": "혜택명",
      "category": "외식 | 편의점 | 통신 | 간편결제 | 쇼핑 | 교통 | 문화 등",
      "merchant_scope_type": "payment_method | merchant | mixed 중 하나 또는 null",
      "merchants_or_scope": "적용 가맹점/범위 (여러 개면 | 로 구분) 또는 null",
      "benefit_type": "청구할인 | 적립 | 캐시백 등",
      "benefit_value": 숫자 또는 null,
      "benefit_unit": "% | 원 등 또는 null",
      "min_payment": 숫자(최소 결제금액) 또는 null,
      "per_tx_discount_limit": 숫자(건당 한도) 또는 null,
      "monthly_discount_limit": 숫자(월 한도) 또는 null,
      "annual_discount_limit": 숫자(연 한도) 또는 null,
      "limit_group_id": "여러 혜택이 월 한도를 공유하면 같은 임의 문자열(예: GROUP_FOOD)을 부여, 아니면 null",
      "spend_min": 숫자(전월실적 최소 조건) 또는 null,
      "spend_max": 숫자(전월실적 최대 조건) 또는 null,
      "frequency_period": "적용 주기 (예: 월, 일) 또는 null",
      "frequency_count": 숫자 또는 null,
      "eligible_days": "ALL 등 적용 요일 또는 null",
      "time_start": "적용 시작 시각 문자열 또는 null",
      "time_end": "적용 종료 시각 문자열 또는 null",
      "payment_channel": "오프라인/온라인/자동납부 등 결제 채널 또는 null",
      "required_funding_method": "요구되는 결제수단 (예: KB Pay) 또는 null",
      "requires_coupon": true 또는 false,
      "user_segment": "대상 회원군 (기본값 \\"전체\\")",
      "option_group_id": "여러 혜택 중 택1 옵션이면 같은 임의 문자열, 아니면 null",
      "option_value": "옵션 값 또는 null",
      "stackable": true 또는 false (기본값 true),
      "application_order": 숫자(적용 순서, 모르면 1),
      "start_date": "YYYY-MM-DD 또는 null",
      "end_date": "YYYY-MM-DD 또는 null",
      "exclusions_summary": "제외 대상 요약 또는 null",
      "raw_condition_note": "원문의 조건 원문 요약 또는 null",
      "confidence": "high | medium | low 중 문서에서 이 혜택을 얼마나 명확하게 읽어냈는지"
    }
  ],
  "rules": [
    {
      "rule_type": "conditional_limit_multiplier | spend_assist | spend_exclusion | time_window 등",
      "scope_id": "product 또는 특정 혜택군을 가리키는 임의 문자열 또는 null",
      "rule_expression": "규칙을 나타내는 짧은 표현식/설명",
      "ui_message": "사용자에게 보여줄 안내 문구 또는 null",
      "priority": "optional | important 중 하나 또는 null"
    }
  ],
  "source": {
    "title": "문서 제목 (예: \\"OO카드 상품설명서\\")",
    "published_or_reviewed_date": "문서에 명시된 발행/개정일 (YYYY-MM-DD) 또는 null"
  }
}

benefits/rules 배열은 문서에서 실제로 확인 가능한 항목만 포함하고, 근거 없는 값은 만들어내지 마세요.`;

export async function extractFullData(parsedText, context) {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    throw new Error("UPSTAGE_API_KEY가 설정되어 있지 않습니다.");
  }
  const model = process.env.UPSTAGE_CHAT_MODEL || "solar-pro2";

  const userContent = `[확인된 정보]
provider: ${context.provider}
product_name: ${context.product_name}

[문서 본문]
${parsedText.slice(0, 60000)}`;

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
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 16000,
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
    throw new Error(`Information Extractor 응답이 JSON 형식이 아닙니다: ${content.slice(0, 500)}`);
  }

  if (!parsed.product || !Array.isArray(parsed.benefits) || !Array.isArray(parsed.rules) || !parsed.source) {
    throw new Error(`Information Extractor 응답 형식이 올바르지 않습니다: ${content.slice(0, 500)}`);
  }

  return parsed;
}
