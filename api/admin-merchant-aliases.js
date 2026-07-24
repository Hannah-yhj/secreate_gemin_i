import { getServiceClient } from '../lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getServiceClient();

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const status = req.query.status || 'pending_review';
      let query = supabase
        .from('merchant_aliases')
        .select('*')
        .order('created_at', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch sample context for each alias
      const aliasesWithContext = await Promise.all(data.map(async (alias) => {
        // Find one benefit containing this original_name
        const { data: benData } = await supabase
          .from('benefits')
          .select('product_id')
          .ilike('merchants_or_scope', `%${alias.original_name}%`)
          .limit(1);
          
        let sampleContext = null;
        if (benData && benData.length > 0 && benData[0].product_id) {
          const productId = benData[0].product_id;
          // Find product details
          const { data: prodData } = await supabase
            .from('products')
            .select('provider, product_name, source_id')
            .eq('product_id', productId)
            .limit(1);
            
          if (prodData && prodData.length > 0) {
            const product = prodData[0];
            let pdfUrl = null;
            if (product.source_id) {
              const { data: sourceData } = await supabase
                .from('sources')
                .select('source_url')
                .eq('source_id', product.source_id)
                .limit(1);
              if (sourceData && sourceData.length > 0) {
                pdfUrl = sourceData[0].source_url;
              }
            }
            sampleContext = {
              provider: product.provider,
              product_name: product.product_name,
              pdf_url: pdfUrl
            };
          }
        }
        
        return {
          ...alias,
          sampleContext
        };
      }));

      return res.status(200).json({ aliases: aliasesWithContext });

    } else if (req.method === 'POST') {
      const { id, status, canonical_name } = req.body;
      if (!id || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const { data: currentAlias, error: fetchErr } = await supabase
        .from('merchant_aliases')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr || !currentAlias) {
        return res.status(404).json({ error: 'Alias not found' });
      }

      const updateData = { status };
      if (canonical_name && canonical_name !== currentAlias.canonical_name) {
        updateData.canonical_name = canonical_name;
      }

      const { error: updateErr } = await supabase
        .from('merchant_aliases')
        .update(updateData)
        .eq('id', id);

      if (updateErr) throw updateErr;

      if (status === 'approved') {
        const finalCanonicalName = canonical_name || currentAlias.canonical_name;
        const originalName = currentAlias.original_name;

        const { data: benefits, error: benErr } = await supabase
          .from('benefits')
          .select('benefit_id, merchants_or_scope')
          .not('merchants_or_scope', 'is', null);

        if (benErr) throw benErr;

        const updates = [];
        for (const b of benefits) {
          if (b.merchants_or_scope.includes(originalName)) {
            const parts = b.merchants_or_scope.split('|').map(p => p.trim());
            let changed = false;
            const newParts = parts.map(p => {
              if (p === originalName) {
                changed = true;
                return finalCanonicalName;
              }
              return p;
            });

            if (changed) {
              updates.push({
                benefit_id: b.benefit_id,
                merchants_or_scope: newParts.join(' | ')
              });
            }
          }
        }

        for (const update of updates) {
          await supabase
            .from('benefits')
            .update({ merchants_or_scope: update.merchants_or_scope })
            .eq('benefit_id', update.benefit_id);
        }
      }

      return res.status(200).json({ success: true });
    } else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (err) {
    console.error('admin-merchant-aliases error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
