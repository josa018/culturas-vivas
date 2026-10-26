import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { db, iniciarTablas } from '../_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  await iniciarTablas();
  const id = randomUUID();
  const ahora = Date.now();
  await db.execute({
    sql: 'INSERT INTO sesiones (id, creada_en, ultimo_ping, pings) VALUES (?, ?, ?, 0)',
    args: [id, ahora, ahora],
  });
  return res.status(201).json({ id_sesion: id });
}