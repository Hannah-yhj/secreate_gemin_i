import { getServiceClient } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabase = getServiceClient();

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });
    
    // Fetch all benefits and their associated products
    const { data: benefits, error: benErr } = await supabase
      .from('benefits')
      .select('*, products(product_name, provider)');

    if (benErr) throw benErr;

    const anomalies = [];

    // Detect anomalies
    for (const b of benefits) {
      let isAnomaly = false;
      let reasons = [];

      // Case 1: Unit is % but value > 100
      if (b.benefit_unit === '%' && b.benefit_value && b.benefit_value > 100) {
        isAnomaly = true;
        reasons.push(`할인율/적립율이 100%를 초과합니다 (${b.benefit_value}%)`);
      }

      // Case 2: Very high numeric values for single transactions
      if (b.per_tx_discount_limit && b.per_tx_discount_limit >= 1000000) {
        isAnomaly = true;
        reasons.push(`건당 한도가 너무 높습니다 (${b.per_tx_discount_limit}원)`);
      }
      
      // Case 3: Very low numeric values for Won limits
      if ((b.benefit_unit === '원' || b.benefit_unit === null) && b.benefit_value > 0 && b.benefit_value < 10) {
        isAnomaly = true;
        reasons.push(`원 단위 할인이 너무 낮습니다 (${b.benefit_value}원)`);
      }

      // Case 4: High flat discount values
      if (b.benefit_unit === '원' && b.benefit_value && b.benefit_value >= 1000000) {
        isAnomaly = true;
        reasons.push(`정액 혜택이 너무 높습니다 (${b.benefit_value}원)`);
      }

      if (isAnomaly) {
        anomalies.push({
          ...b,
          reasons
        });
      }
    }

    res.status(200).json({ success: true, anomalies });
  } catch (err) {
    console.error("Get anomalies error:", err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
