import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../lib/load-env.js";

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const upstageKey = process.env.UPSTAGE_API_KEY;

if (!supabaseUrl || !supabaseKey || !upstageKey) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function run() {
  console.log("Starting batch merchant normalization...");

  // 1. Fetch all benefits with merchants_or_scope
  const { data: benefits, error: benErr } = await supabase
    .from('benefits')
    .select('merchants_or_scope')
    .not('merchants_or_scope', 'is', null);

  if (benErr) {
    console.error("Failed to fetch benefits:", benErr);
    return;
  }

  // 2. Extract unique merchant names
  const merchantSet = new Set();
  for (const b of benefits) {
    if (!b.merchants_or_scope) continue;
    const parts = b.merchants_or_scope.split('|').map(p => p.trim()).filter(p => p.length > 0);
    parts.forEach(p => merchantSet.add(p));
  }
  
  const allMerchants = Array.from(merchantSet);
  console.log(`Found ${allMerchants.length} unique merchant names in DB.`);

  if (allMerchants.length === 0) {
    console.log("Nothing to normalize.");
    return;
  }

  // 3. Filter out those already in merchant_aliases
  const { data: existingAliases, error: aliasErr } = await supabase
    .from('merchant_aliases')
    .select('original_name');
    
  if (aliasErr) {
    console.error("Failed to fetch existing aliases:", aliasErr);
    return;
  }
  
  const existingSet = new Set(existingAliases.map(a => a.original_name));
  const toProcess = allMerchants.filter(m => !existingSet.has(m));
  
  console.log(`${toProcess.length} merchants need normalization (not in aliases table yet).`);
  
  if (toProcess.length === 0) {
    console.log("All merchants are already in the aliases table.");
    return;
  }

  // Process in chunks to avoid overwhelming the prompt
  const chunkSize = 50;
  for (let i = 0; i < toProcess.length; i += chunkSize) {
    const chunk = toProcess.slice(i, i + chunkSize);
    console.log(`Processing chunk ${i / chunkSize + 1} (${chunk.length} items)...`);
    
    await normalizeChunk(chunk);
  }

  console.log("Batch normalization completed!");
}

async function normalizeChunk(merchants) {
  const prompt = `
당신은 가맹점 명칭을 널리 쓰이는 대표 브랜드명으로 정규화하는 도우미입니다.
다음 가맹점 목록을 보고, 널리 쓰이는 대표 브랜드명으로 정규화한 뒤 확신도(confidence)와 함께 JSON 형식으로 반환해 주세요.
확신이 서지 않는다면 원문을 그대로 유지하고 confidence를 low로 설정하세요.

목록:
${merchants.join('\n')}

출력 형식:
{
  "merchant_normalization_flags": [
    {
      "original": "원문 가맹점명",
      "normalized": "정규화된 대표명",
      "confidence": "high | medium | low"
    }
  ]
}`;

  try {
    const res = await fetch("https://api.upstage.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.UPSTAGE_CHAT_MODEL || "solar-pro2",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });

    const raw = await res.json();
    if (!res.ok) {
      console.error(`Upstage API error:`, raw);
      return;
    }

    const content = raw?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    
    const flags = parsed.merchant_normalization_flags || [];
    
    for (const flag of flags) {
      if (!flag.original || !flag.normalized) continue;
      if (flag.original === flag.normalized) continue;
      
      // Force pending_review for ALL items so the admin can review them,
      // and when they click "Approve", the `benefits` table gets properly updated via API!
      const status = 'pending_review';
      
      const { error: upsertErr } = await supabase.from('merchant_aliases').upsert({
        original_name: flag.original,
        canonical_name: flag.normalized,
        status: status
      }, { onConflict: 'original_name' });

      if (upsertErr) {
        console.error("Failed to upsert alias:", flag.original, upsertErr.message);
      } else {
        console.log(`Upserted: ${flag.original} -> ${flag.normalized} (${status})`);
      }
    }
  } catch (err) {
    console.error("Failed to process chunk:", err);
  }
}

run();
