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
    
    const { queue_id, type, status } = req.body;
    if (!queue_id || !status) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const tableName = type === 'user_request' ? 'user_card_requests' : 'admin_card_queue';
    
    console.log(`Updating ${tableName} ${queue_id} status to ${status}`);

    const { error: updateError } = await supabase
      .from(tableName)
      .update({ status })
      .eq('id', queue_id);

    if (updateError) {
      throw new Error(`Failed to update status: ${updateError.message}`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
  }
}
