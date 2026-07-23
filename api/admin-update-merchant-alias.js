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

    const { id, status, canonical_name } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1. Get the current alias record to know the original_name
    const { data: currentAlias, error: fetchErr } = await supabase
      .from('merchant_aliases')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !currentAlias) {
      return res.status(404).json({ error: 'Alias not found' });
    }

    // 2. Update the alias record
    const updateData = { status };
    if (canonical_name && canonical_name !== currentAlias.canonical_name) {
      updateData.canonical_name = canonical_name;
    }

    const { error: updateErr } = await supabase
      .from('merchant_aliases')
      .update(updateData)
      .eq('id', id);

    if (updateErr) throw updateErr;

    // 3. If approved, update existing benefits
    if (status === 'approved') {
      const finalCanonicalName = canonical_name || currentAlias.canonical_name;
      const originalName = currentAlias.original_name;

      // Find all benefits containing the original_name
      // Using ilike or similar is tricky with pipes, but we can fetch all where merchants_or_scope is not null
      // and do the filtering in Node.js for accuracy.
      const { data: benefits, error: benErr } = await supabase
        .from('benefits')
        .select('benefit_id, merchants_or_scope')
        .not('merchants_or_scope', 'is', null);

      if (benErr) throw benErr;

      const updates = [];
      for (const b of benefits) {
        if (b.merchants_or_scope.includes(originalName)) {
          // Replace exactly the originalName with finalCanonicalName.
          // Note: This simple replace might replace partial matches if originalName is short.
          // In a real app, a regex with word boundaries (handling pipes) might be better.
          // But for now, a simple split and map is safest for pipe-separated strings.
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

      // Perform updates
      for (const update of updates) {
        await supabase
          .from('benefits')
          .update({ merchants_or_scope: update.merchants_or_scope })
          .eq('benefit_id', update.benefit_id);
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('admin-update-merchant-alias error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
