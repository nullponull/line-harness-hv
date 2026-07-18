// [HIDDEN VALUE] LIFF連携受け口。LINEアプリ内で診断完了時、LIFFのIDトークンを検証して
// 本人のLINEユーザーと診断結果(ペアコード)を紐づけ、型カードをpushする。コピペ不要。
import { Hono } from 'hono';
import { LineClient } from '@line-crm/line-sdk';
import type { Env } from '../index.js';
import { ensureFriendFromWebhookUser } from './webhook.js';
import { decodeHvCode, typeCardFlex } from '../services/hv-coach.js';

export const hvLink = new Hono<Env>();

// POST /api/hv-link  { idToken: string, code: string }
// idToken = LIFF の liff.getIDToken()。LINEの verify API で userId を得る。
hvLink.post('/api/hv-link', async (c) => {
  let body: { idToken?: string; code?: string };
  try { body = await c.req.json(); } catch (_) { return c.json({ error: 'bad_request' }, 400); }
  const code = (body.code || '').trim().toUpperCase();
  const dims = decodeHvCode(code);
  if (!dims) return c.json({ error: 'bad_code' }, 400);
  if (!body.idToken) return c.json({ error: 'no_token' }, 400);

  // IDトークン検証 → userId (LINE Login channel ID を audience として検証)
  const channelId = c.env.LINE_LOGIN_CHANNEL_ID || c.env.LINE_CHANNEL_ID;
  const vr = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `id_token=${encodeURIComponent(body.idToken)}&client_id=${encodeURIComponent(channelId)}`,
  });
  if (!vr.ok) return c.json({ error: 'verify_failed' }, 401);
  const claims = await vr.json() as { sub?: string };
  const userId = claims.sub;
  if (!userId) return c.json({ error: 'no_sub' }, 401);

  const line = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
  const friend = await ensureFriendFromWebhookUser(c.env.DB, line, userId, null);
  if (!friend) return c.json({ error: 'friend_failed' }, 500);

  // メタデータに連携保存
  let meta: Record<string, unknown> = {};
  try { const fr = await c.env.DB.prepare('SELECT metadata FROM friends WHERE id = ?').bind(friend.id).first<{ metadata: string | null }>(); if (fr?.metadata) meta = JSON.parse(fr.metadata); } catch (_) {}
  meta.hv_code = code; meta.hv_dims = dims; meta.hv_linked_at = new Date().toISOString(); meta.hv_source = 'liff';
  await c.env.DB.prepare('UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(meta), new Date(Date.now() + 9 * 3600_000).toISOString(), friend.id).run();

  // 友だちなら型カードをpush(トークに届く)。未フォローでもリンクは保存される。
  try { await line.pushMessage(userId, [typeCardFlex(code, dims) as never]); } catch (_) {}
  return c.json({ ok: true });
});
