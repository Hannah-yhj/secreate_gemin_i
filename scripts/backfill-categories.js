import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('merchant_aliases').select('*').is('category', null);
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`Found ${data.length} aliases with null category.`);
  
  if (data.length === 0) return;
  
  const BATCH_SIZE = 50;
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const chunk = data.slice(i, i + BATCH_SIZE);
    const names = chunk.map(d => d.original_name);
    
    const prompt = `당신은 가맹점 명칭을 널리 쓰이는 대표 브랜드명과 업종 카테고리로 분류하는 도우미입니다.
다음 가맹점 목록을 보고, 널리 쓰이는 대표 브랜드명으로 정규화하고 가장 알맞은 카테고리로 분류한 뒤 JSON 형식으로 반환해 주세요.
카테고리는 다음 중 하나를 선택하세요: 외식, 카페/베이커리, 쇼핑, 배달, 마트/편의점, 교통, 주유/차량, 통신/공과금, 의료, 여행/숙박, 뷰티/미용, 교육, 엔터/문화, 기타.

목록:
${names.join('\n')}

출력 형식:
{
  "merchant_normalization_flags": [
    {
      "original": "원문 가맹점명",
      "category": "분류된 카테고리"
    }
  ]
}`;

    const res = await fetch('https://api.upstage.ai/v1/solar/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.UPSTAGE_MODEL || 'solar-pro',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    });
    
    const resData = await res.json();
    try {
      const parsed = JSON.parse(resData.choices[0].message.content);
      for (const flag of parsed.merchant_normalization_flags) {
        await supabase.from('merchant_aliases').update({ category: flag.category || '기타' }).eq('original_name', flag.original);
      }
      console.log(`Processed ${i + chunk.length} / ${data.length}`);
    } catch(err) {
      console.error(err);
    }
  }
}

run();
