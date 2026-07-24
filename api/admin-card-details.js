import { getServiceClient, updateExistingCard } from '../lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getServiceClient();

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const { product_id } = req.query;
      if (!product_id) return res.status(400).json({ error: 'Missing product_id' });

      const { data: product, error: pErr } = await supabase
        .from('products').select('*').eq('product_id', product_id).single();
      if (pErr) throw new Error('Product fetch failed: ' + pErr.message);

      const { data: benefits, error: bErr } = await supabase
        .from('benefits').select('*').eq('product_id', product_id);
      if (bErr) throw new Error('Benefits fetch failed: ' + bErr.message);

      const { data: rules, error: rErr } = await supabase
        .from('rules').select('*').eq('product_id', product_id);
      if (rErr) throw new Error('Rules fetch failed: ' + rErr.message);

      const { data: sources, error: sErr } = await supabase
        .from('sources').select('*').eq('product_id', product_id).limit(1);
      if (sErr) throw new Error('Source fetch failed: ' + sErr.message);

      const payload = {
        product,
        benefits: benefits || [],
        rules: rules || [],
        source: (sources && sources.length > 0) ? sources[0] : null,
        aliases: [] 
      };

      return res.status(200).json({ success: true, payload });

    } else if (req.method === 'PUT' || req.method === 'POST') {
      const { payload } = req.body;
      if (!payload || !payload.product) {
        return res.status(400).json({ error: 'Missing or invalid payload' });
      }

      console.log(`Updating card via JSON editor: ${payload.product.product_id}`);
      const rpcResult = await updateExistingCard(payload);
      return res.status(200).json({ success: true, product_id: rpcResult.product_id });

    } else if (req.method === 'DELETE') {
      const { product_id, provider, product_name } = req.body;
      if (!product_id) return res.status(400).json({ error: 'Missing product_id' });

      console.log(`Rolling back card: ${product_id} (${provider} ${product_name})`);

      await supabase.from('products').update({ source_id: null }).eq('product_id', product_id);

      const resBen = await supabase.from('benefits').delete().eq('product_id', product_id);
      if (resBen.error) throw new Error('benefits: ' + resBen.error.message);

      const resRule = await supabase.from('rules').delete().eq('product_id', product_id);
      if (resRule.error) throw new Error('rules: ' + resRule.error.message);

      const resAlias = await supabase.from('product_aliases').delete().eq('product_id', product_id);
      if (resAlias.error && resAlias.error.code !== '42P01') throw new Error('product_aliases: ' + resAlias.error.message);

      const resSrc = await supabase.from('sources').delete().eq('product_id', product_id);
      if (resSrc.error) throw new Error('sources: ' + resSrc.error.message);
      
      const { error: delErr } = await supabase.from('products').delete().eq('product_id', product_id);
      if (delErr) throw new Error('Failed to delete product: ' + delErr.message);

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

      return res.status(200).json({ success: true });
    } else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (err) {
    console.error("admin-card-details error:", err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
