import { getServiceClient } from '../lib/supabase.js';
import { updateExistingCard, insertNewCard } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const supabase = getServiceClient();

  try {
    // 1. Auth check
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { queue_id, type, previewData } = req.body;
    if (!queue_id || !previewData || !previewData.payload) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const tableName = type === 'user_request' ? 'user_card_requests' : 'admin_card_queue';
    
    console.log(`Committing queue ${queue_id} to DB`);

    const { isExisting, payload } = previewData;

    // 2. Commit to DB
    const rpcResult = isExisting
      ? await updateExistingCard(payload)
      : await insertNewCard(payload);

    // 3. Update queue status to completed
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ status: 'completed' })
      .eq('id', queue_id);

    if (updateError) {
      throw new Error(`Failed to update queue status: ${updateError.message}`);
    }

    res.status(200).json({ success: true, product_id: rpcResult.product_id });
  } catch (err) {
    console.error("Queue commit error:", err);
    
    if (req.body?.queue_id) {
      const failTable = req.body.type === 'user_request' ? 'user_card_requests' : 'admin_card_queue';
      await supabase
        .from(failTable)
        .update({ status: 'failed' })
        .eq('id', req.body.queue_id)
        .catch(console.error); // Best effort
    }
    
    res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
  }
}
