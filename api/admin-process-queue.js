import { getServiceClient } from '../lib/supabase.js';
import { processCardUploadWithKnownName } from '../lib/process-upload.js';

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
    
    const { queue_id, provider, product_name, storage_path, type } = req.body;
    if (!queue_id || !provider || !product_name || !storage_path) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const tableName = type === 'user_request' ? 'user_card_requests' : 'admin_card_queue';

    console.log(`Processing queue ${queue_id} for ${provider} ${product_name}`);

    // 2. Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('card-pdfs')
      .download(storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file from storage: ${downloadError?.message}`);
    }

    // 3. Convert Blob to Buffer (Node.js environment)
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Process with AI pipeline
    await processCardUploadWithKnownName({
      buffer,
      fileName: storage_path,
      provider,
      productName: product_name,
      note: "Admin Dashboard Upload",
      force: true
    });

    // 5. Update queue status to completed
    const { error: updateError } = await supabase
      .from(tableName)
      .update({ status: 'completed' })
      .eq('id', queue_id);

    if (updateError) {
      throw new Error(`Failed to update queue status: ${updateError.message}`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Queue process error:", err);
    
    // Update queue status to failed if possible
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
