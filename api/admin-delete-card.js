import { getServiceClient } from '../lib/supabase.js';

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
    
    const { product_id, provider, product_name } = req.body;
    if (!product_id) {
      return res.status(400).json({ error: 'Missing product_id' });
    }

    console.log(`Rolling back card: ${product_id} (${provider} ${product_name})`);

    // 1. Break circular dependency if products.source_id references sources
    await supabase.from('products').update({ source_id: null }).eq('product_id', product_id);

    // 2. Delete dependent rows
    const resBen = await supabase.from('benefits').delete().eq('product_id', product_id);
    if (resBen.error) throw new Error('benefits: ' + resBen.error.message);

    const resRule = await supabase.from('rules').delete().eq('product_id', product_id);
    if (resRule.error) throw new Error('rules: ' + resRule.error.message);

    const resAlias = await supabase.from('product_aliases').delete().eq('product_id', product_id);
    if (resAlias.error && resAlias.error.code !== '42P01') throw new Error('product_aliases: ' + resAlias.error.message);

    const resSrc = await supabase.from('sources').delete().eq('product_id', product_id);
    if (resSrc.error) throw new Error('sources: ' + resSrc.error.message);
    
    // 2. Delete main product row
    const { error: delErr } = await supabase.from('products').delete().eq('product_id', product_id);
    if (delErr) throw new Error('Failed to delete product: ' + delErr.message);

    // 3. Revert queue status (if it exists)
    if (provider && product_name) {
      const { data: adminQ } = await supabase.from('admin_card_queue')
        .select('id').eq('provider', provider).eq('card_name', product_name).limit(1);
      
      if (adminQ && adminQ.length > 0) {
        await supabase.from('admin_card_queue').update({ status: 'ignored' }).eq('id', adminQ[0].id);
      }

      const { data: userQ } = await supabase.from('user_card_requests')
        .select('id').eq('provider_hint', provider).eq('card_name_hint', product_name).limit(1);
      
      if (userQ && userQ.length > 0) {
        await supabase.from('user_card_requests').update({ status: 'ignored' }).eq('id', userQ[0].id);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Delete card error:", err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
