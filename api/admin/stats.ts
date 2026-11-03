
import { getDb, ensureSessionsTable } from "../_db.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    await ensureSessionsTable();

    const db = getDb();

    const thirtySecondsAgo = Date.now() - 30000;

    const result = await db.execute({
      sql: `
        SELECT COUNT(*) AS activeSessions
        FROM sessions
        WHERE last_ping >= ?
      `,
      args: [thirtySecondsAgo],
    });

    const activeSessions = Number(
      result.rows[0].activeSessions
    );

    return res.status(200).json({
      activeSessions,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Error obteniendo estadísticas",
    });
  }
}

