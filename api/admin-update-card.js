import { getServiceClient } from '../lib/supabase.js';
import { updateExistingCard } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabase = getServiceClient();

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { payload } = req.body;
    if (!payload || !payload.product) {
      return res.status(400).json({ error: 'Missing or invalid payload' });
    }

    console.log(`Updating card via JSON editor: ${payload.product.product_id}`);

    // Update using the existing RPC method
    const rpcResult = await updateExistingCard(payload);

    res.status(200).json({ success: true, product_id: rpcResult.product_id });
  } catch (err) {
    console.error("Update card error:", err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
