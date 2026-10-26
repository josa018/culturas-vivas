import { createClient } from '@libsql/client';

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let listo = false;
export async function iniciarTablas() {
  if (listo) return;
  await db.execute(`CREATE TABLE IF NOT EXISTS sesiones (
    id TEXT PRIMARY KEY,
    creada_en INTEGER NOT NULL,
    ultimo_ping INTEGER NOT NULL,
    pings INTEGER NOT NULL DEFAULT 0
  )`);
  listo = true;
}