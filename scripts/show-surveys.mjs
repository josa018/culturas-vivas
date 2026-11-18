import dotenv from "dotenv";
import { createClient } from "@libsql/client";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const dbUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl) {
  console.error("Missing TURSO_DATABASE_URL (check .env.local or .env).");
  process.exit(1);
}

const db = createClient({ url: dbUrl, authToken });

try {
  const r = await db.execute(
    "SELECT id, session_uuid, rating, feedback, created_at FROM surveys ORDER BY id DESC LIMIT 10",
  );
  console.table(
    r.rows.map((row) => ({
      id: row.id,
      session_uuid: row.session_uuid,
      rating: row.rating,
      feedback: row.feedback,
      created_at: row.created_at,
    })),
  );
} finally {
  db.close();
}
