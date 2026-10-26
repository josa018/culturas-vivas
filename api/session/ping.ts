import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, iniciarTablas } from '../_db.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  const id = req.body?.id_sesion;
  if (typeof id !== 'string' || !UUID_V4.test(id)) {
    return res.status(400).json({ error: 'id_sesion inválido' });
  }
  await iniciarTablas();
  const r = await db.execute({
    sql: 'UPDATE sesiones SET ultimo_ping = ?, pings = pings + 1 WHERE id = ?',
    args: [Date.now(), id],
  });
  if (r.rowsAffected === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
  return res.status(200).json({ ok: true });
}