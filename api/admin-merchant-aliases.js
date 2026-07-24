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
      
      // OPTIMIZATION: Fetch all benefits, products, and sources once to prevent N+1 queries
      const [{ data: allBenefits }, { data: allProducts }, { data: allSources }] = await Promise.all([
        supabase.from('benefits').select('product_id, merchants_or_scope').not('merchants_or_scope', 'is', null),
        supabase.from('products').select('product_id, provider, product_name, source_id'),
        supabase.from('sources').select('source_id, source_url')
      ]);

      const productMap = {};
      if (allProducts) allProducts.forEach(p => productMap[p.product_id] = p);
      const sourceMap = {};
      if (allSources) allSources.forEach(s => sourceMap[s.source_id] = s);

      // Resolve context in memory
      const aliasesWithContext = data.map(alias => {
        let sampleContext = null;
        
        if (allBenefits) {
          const ben = allBenefits.find(b => b.merchants_or_scope.includes(alias.original_name));
          if (ben && ben.product_id) {
            const prod = productMap[ben.product_id];
            if (prod) {
              let pdfUrl = null;
              if (prod.source_id && sourceMap[prod.source_id]) {
                pdfUrl = sourceMap[prod.source_id].source_url;
              }
              sampleContext = {
                provider: prod.provider,
                product_name: prod.product_name,
                pdf_url: pdfUrl
              };
            }
          }
        }
        
        return {
          ...alias,
          sampleContext
        };
      });

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

        await Promise.all(updates.map(update => 
          supabase
            .from('benefits')
            .update({ merchants_or_scope: update.merchants_or_scope })
            .eq('benefit_id', update.benefit_id)
        ));
      }

      return res.status(200).json({ success: true });

    } else if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Missing required field: id' });
      }

      const { error: deleteErr } = await supabase
        .from('merchant_aliases')
        .delete()
        .eq('id', id);

      if (deleteErr) throw deleteErr;

      return res.status(200).json({ success: true });

    } else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (err) {
    console.error('admin-merchant-aliases error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
