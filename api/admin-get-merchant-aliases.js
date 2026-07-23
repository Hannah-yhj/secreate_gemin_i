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

    const status = req.query.status || 'pending_review'; // pending_review | approved | rejected | all

    let query = supabase
      .from('merchant_aliases')
      .select('*')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ aliases: data });
  } catch (err) {
    console.error('admin-get-merchant-aliases error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
