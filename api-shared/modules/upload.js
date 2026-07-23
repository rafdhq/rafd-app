import { supabase } from '../db-client';
import { withApi } from '../handler';

/**
 * Image upload with optional server-side size guard.
 * Client should compress via src/lib/imageCompress.ts first.
 */
export const handler = withApi(
  async function handler(req, res, { tenantId }) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { fileName, fileBase64, contentType, folder, max_bytes } = req.body || {};
    if (!fileName || !fileBase64) {
      return res.status(400).json({ error: 'fileName and fileBase64 required' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const limit = Number(max_bytes || 2_500_000);
    if (buffer.length > limit) {
      return res.status(413).json({
        error: `File too large (${buffer.length} bytes). Compress before upload (max ${limit}).`,
      });
    }

    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const prefix = folder || `tenants/${tenantId || 'shared'}/uploads`;
    const path = `${prefix}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage.from('rafd-media').upload(path, buffer, {
      contentType: contentType || 'image/jpeg',
      upsert: true,
    });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from('rafd-media').getPublicUrl(path);
    return res.status(200).json({
      url: urlData.publicUrl,
      path,
      bytes: buffer.length,
      content_type: contentType || 'image/jpeg',
    });
  },
  {
    permissions: {
      POST: 'products:write',
    },
  }
);
