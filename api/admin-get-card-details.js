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
    
    const { product_id } = req.query;
    if (!product_id) {
      return res.status(400).json({ error: 'Missing product_id' });
    }

    // Fetch product
    const { data: product, error: pErr } = await supabase
      .from('products')
      .select('*')
      .eq('product_id', product_id)
      .single();
    if (pErr) throw new Error('Product fetch failed: ' + pErr.message);

    // Fetch benefits
    const { data: benefits, error: bErr } = await supabase
      .from('benefits')
      .select('*')
      .eq('product_id', product_id);
    if (bErr) throw new Error('Benefits fetch failed: ' + bErr.message);

    // Fetch rules
    const { data: rules, error: rErr } = await supabase
      .from('rules')
      .select('*')
      .eq('product_id', product_id);
    if (rErr) throw new Error('Rules fetch failed: ' + rErr.message);

    // Fetch source
    const { data: sources, error: sErr } = await supabase
      .from('sources')
      .select('*')
      .eq('product_id', product_id)
      .limit(1);
    if (sErr) throw new Error('Source fetch failed: ' + sErr.message);

    const payload = {
      product,
      benefits: benefits || [],
      rules: rules || [],
      source: (sources && sources.length > 0) ? sources[0] : null,
      aliases: [] // We skip aliases in the editor to avoid complications, or we can fetch them too if needed.
    };

    res.status(200).json({ success: true, payload });
  } catch (err) {
    console.error("Get card details error:", err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
