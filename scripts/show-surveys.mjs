import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

dotenv.config({ path: '.env.local', quiet: true });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const r = await db.execute(
  'SELECT id, session_uuid, q1_rating, q2_ease, q3_recommend, created_at FROM surveys ORDER BY id DESC LIMIT 10',
);
console.table(
  r.rows.map((row) => ({
    id: row.id,
    session_uuid: row.session_uuid,
    q1: row.q1_rating,
    q2: row.q2_ease,
    q3: row.q3_recommend,
    created_at: row.created_at,
  })),
);
db.close();