import {
  adminClient,
  audit,
  E,
  failFromRpc,
  handle,
  parseJson,
  requireUser,
  rpc,
  uuid,
  z,
} from '../_shared/http.ts';
import { BUCKET } from '../_shared/upload.ts';
import { sha256Hex } from '../_shared/files.ts';

handle(async (ctx) => {
  const user = await requireUser(ctx);
  const { document_id, disposition } = await parseJson(
    ctx,
    z.object({
      document_id: uuid,
      disposition: z.enum(['inline', 'attachment']).default('attachment'),
    }),
  );
  const preview = disposition === 'inline';
  // Decision + audit row are ONE transaction, evaluated against CURRENT grants.
  // No decision is cached and no signed URL is ever issued.
  const r = await rpc(ctx, 'rpc_authorize_document', {
    p_actor: user.id,
    p_document: document_id,
    p_action: preview ? 'read' : 'download',
  });
  if (!r.ok) failFromRpc(r);

  const { data, error } = await adminClient().storage.from(BUCKET).download(String(r.storage_key));
  if (error || !data) {
    await audit(
      ctx,
      user.id,
      document_id,
      'document.download',
      'error',
      { reason: 'storage_read_failed' },
      false,
    );
    throw E.internal();
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if ((await sha256Hex(bytes)) !== r.sha256) {
    await audit(ctx, user.id, document_id, 'document.integrity_failure', 'error', {}, false);
    throw E.internal(); // corrupted/tampered object: never serve it
  }
  const safe = String(r.original_filename).replace(/[^\w.\- ]/g, '_');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': String(r.mime_type),
      'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(String(r.original_filename))}`,
      'X-Content-Type-Options': 'nosniff',
      'X-Content-SHA256': String(r.sha256),
    },
  });
});
