// lib/engine.js
// "선택"은 여기서 결정론적으로(Node 코드로) 처리하고,
// Solar는 이 결과를 설명하는 역할만 하도록 분리한다.

// ⚠️ 아래 카테고리/키워드, 필드명(spend_min, required_grade, per_tx_discount_limit 등)은
//    실제 benefits 테이블 컬럼명에 맞춰 조정이 필요할 수 있어요.
const CATEGORY_KEYWORDS = {

  대중교통:[
      "교통","버스","지하철","택시","카카오t","카카오택시","철도","ktx","환승"
  ],

  카페:[
      "카페","커피","스타벅스","투썸","이디야","폴바셋","메가커피","빽다방","컴포즈"
  ],

  편의점:[
      "편의점","cu","gs25","세븐일레븐","이마트24"
  ],

  영화:[
      "영화","cgv","메가박스","롯데시네마"
  ],

  쇼핑:[
      "쇼핑","쿠팡","11번가","g마켓","옥션","온라인쇼핑","백화점"
  ],

  배달:[
      "배달","배민","배달의민족","요기요","쿠팡이츠"
  ],

  통신비:[
      "통신","휴대폰","핸드폰","통신비","통신비","휴대폰요금", "핸드폰요금", "핸드폰비"
  ],

  주유:[
      "주유","기름","gs칼텍스","s-oil","현대오일","sk에너지","오일뱅크"
  ],

  마트:[
      "마트","이마트","홈플러스","롯데마트","코스트코"
  ],

  여행:[
      "항공","호텔","여행","숙박","아고다","야놀자"
  ]

};
  
  /** 사용자 메시지에서 카테고리를 추정 (AI 호출 없이 키워드 매칭) */
  export function detectCategory(message) {
    const lower = String(message || "").toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((k) => lower.includes(k.toLowerCase()))) return category;
    }
    return null;
  }

  export function detectBrand(message, catalog) {

    const text = String(message || "").toLowerCase();
  
    const merchants = new Set();
  
    for (const benefit of catalog.benefits || []) {
  
      if (!benefit.merchants_or_scope)
        continue;
  
      String(benefit.merchants_or_scope)
  
        .split("|")
  
        .map(x => x.trim())
  
        .filter(Boolean)
  
        .forEach(x => merchants.add(x));
  
    }
  
    const merchantList =
      [...merchants].sort(
  
        (a, b) => b.length - a.length
  
      );
  
    for (const merchant of merchantList) {
  
      if (
  
        text.includes(
  
          merchant.toLowerCase()
  
        )
  
      ) {
  
        return merchant;
  
      }
  
    }
  
    return null;
  
  }

  /** 통신사 멤버십 상품 여부 */
  export function isMembershipProduct(product){
    if(!product)
        return false;
    if(product.service_type==="통신사")
        return true;
    if(product.carrier_code)
        return true;
    const text=`

${product.product_name||""}

${product.product_type||""}

`.toLowerCase();

    return /멤버십|membership/.test(text);

}

  /**
   * 사용자가 멤버십을 직접 언급했는지.
   * "통신비 할인 카드" 같은 카드 질문은 멤버십 요청으로 보지 않음.
   */
  export function wantsMembership(message) {
    const t = String(message || "");
    return /멤버[십쉽]|membership|통신사\s*멤버|멤버십\s*(혜택|할인|등급)|t멤버|티멤버/i.test(t)
      || /\b(kt|skt|lgu\+?|유플러스|lg\s*u\+)\s*(멤버|등급|vip|vvip)/i.test(t);
  }
  
  /** "1만원", "12000원", "3천원" 같은 표현에서 금액 추정 */
  export function detectAmount(message){

    const text=String(message);

    let m=text.match(/(\d+(?:\.\d+)?)\s*만/);

    if(m){

        return Math.round(

            Number(m[1])*10000

        );

    }

    m=text.match(/(\d+(?:\.\d+)?)\s*천/);

    if(m){

        return Math.round(

            Number(m[1])*1000

        );

    }
    m=text.match(/(\d+)\s*원/);
    if(m){
        return Number(m[1]);
    }

    return null;
  }
  
  
  /** 혜택 하나의 예상 절감액을 계산 (비교 기준 금액이 없으면 1만원 기준) */
  function estimateSavings(

    benefit,

    amount

){

    const spend=

        amount||10000;

    let saving=0;

    if(

        benefit.benefit_unit==="%"

    ){

        saving=

            spend*

            Number(

                benefit.benefit_value||0

            )/100;

    }

    else{

        saving=

            Number(

                benefit.benefit_value||0

            );

    }

    // 1회 한도

    if(

        benefit.per_tx_discount_limit

    ){

        saving=Math.min(

            saving,

            Number(

                benefit.per_tx_discount_limit

            )

        );

    }

    // 월 한도

    if(

        benefit.monthly_discount_limit

    ){

        saving=Math.min(

            saving,

            Number(

                benefit.monthly_discount_limit

            )

        );

    }

    return Math.round(saving);

}
  
  /**
   * TOP N 카드를 Node가 결정론적으로 선정한다. (여기엔 AI 호출이 없음)
   * 기본은 카드만. includeMembership=true일 때만 통신사 멤버십 포함.
   * @returns {Array} 상위 후보 목록 (각 후보에 bestBenefit, score 포함)
   */
  function matchesBenefit(
    benefit,
    category,
    brand
){

    const text = `
${benefit.category || ""}
${benefit.merchants_or_scope || ""}
${benefit.benefit_name || ""}
`
    .toLowerCase();

    // 브랜드가 있으면 브랜드 우선
    if(brand){
        return text.includes(
            brand.toLowerCase()
        );
    }

    // 브랜드 없으면 카테고리
    if(category){
        if(
            text.includes(
                category.toLowerCase()
            )
        )
            return true;
        return (

            CATEGORY_KEYWORDS[category] || []

        ).some(
            k => text.includes(
                k.toLowerCase()
            )
        )
    }

    return true;

}

export function findBestCards(
  catalog,
  {
    category = null,
    brand = null,
    amount = null,
    includeMembership = false,
  } = {},
  topN = 3
) {

  //----------------------------------
  // product_id -> product
  //----------------------------------

  const products = new Map();

  for (const product of catalog.products || []) {

    // 카드 추천
    if (!includeMembership) {

      if (isMembershipProduct(product))
        continue;

      const isCard =
        product.service_type === "카드" ||
        /신용|체크/.test(product.product_type || "");

      if (!isCard)
        continue;
    }

    // 통신사 추천
    else {

      if (!isMembershipProduct(product))
        continue;

    }

    products.set(product.product_id, {

      ...product,

      matchedBenefits: []

    });

  }

  //----------------------------------
  // benefit 연결
  //----------------------------------

  for (const benefit of catalog.benefits || []) {

    if (

      !matchesBenefit(

        benefit,

        category,

        brand

      )

    )

      continue;

    const product =

      products.get(

        benefit.product_id

      );

    if (!product)

      continue;

    //----------------------------------
    // 절감액 계산
    //----------------------------------

    const saving =

      estimateSavings(

        benefit,

        amount

      );

    product.matchedBenefits.push({

      ...benefit,

      estimatedSavings: saving

    });

  }

  //----------------------------------
  // 후보 생성
  //----------------------------------

  const candidates = [];

  for (const product of products.values()) {

    if (

      product.matchedBenefits.length === 0

    )

      continue;

    //----------------------------------
    // 혜택 정렬
    //----------------------------------

    product.matchedBenefits.sort(

      (a, b) =>

        b.estimatedSavings -

        a.estimatedSavings

    );

    //----------------------------------
    // 총 점수
    //----------------------------------

    const topBenefits =product.matchedBenefits.slice(0,3);
    const score =topBenefits.reduce((sum,b)=>sum+b.estimatedSavings,0);

    candidates.push({

      ...product,

      score,

      bestBenefit:

        product.matchedBenefits[0]

    });

  }

  //----------------------------------
  // 점수순 정렬
  //----------------------------------

  candidates.sort((a, b) => {

    if (

      b.score !== a.score

    )

      return b.score - a.score;

    return (

      b.matchedBenefits.length -

      a.matchedBenefits.length

    );

  });

  //----------------------------------
  // TOP N
  //----------------------------------

  return candidates.slice(

    0,

    topN

  );

}
  
  /** Node가 고른 후보를 Solar에게 넘길 텍스트로 변환 (전체 카탈로그 아님, 후보 3개만) */
  export function buildCandidateText(
    candidates,
    { category, brand, amount } = {}
  ) {
    if (!candidates.length) {
      return `
  조건에 맞는 상품을 찾지 못했습니다.
  사용자에게 조건을 조금 더 구체적으로 물어보세요.
  `;
    }
  
    return candidates
      .map((card, index) => {
  
        const benefits = card.matchedBenefits
          .slice(0, 3)
          .map((b) => {
  
            const value =
              b.benefit_unit === "%"
                ? `${b.benefit_value}%`
                : `${b.benefit_value}${b.benefit_unit || ""}`;
  
            return `
  • ${b.benefit_name}
  
    대상 : ${b.merchants_or_scope || "-"}
  
    혜택 : ${value}
  
    전월실적 : ${
      b.spend_min != null
        ? `${Number(b.spend_min).toLocaleString()}원 이상`
        : "없음/확인 필요"
    }
  
    ${
      b.frequency_count
        ? `횟수 제한 : ${b.frequency_period || ""} ${b.frequency_count}회`
        : ""
    }
  
    ${
      b.end_date
        ? `종료일 : ${b.end_date}`
        : ""
    }
  
  `;
          })
          .join("\n");
  
        return `
  ${index + 1}. ${card.product_name}
  
  카드사 : ${card.provider}
  
  예상 절감액 :
  약 ${Math.round(card.score).toLocaleString()}원
  
  주요 혜택
  
  ${benefits}
  `;
      })
      .join("\n-----------------------------\n");
  }