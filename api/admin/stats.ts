import type { Client } from "@libsql/client";
import { getDb } from "../_db.js";
import {
  verifyAdminBearerToken,
  type AdminTokenClaims,
} from "../_auth.js";
import {
  API_HTTP_STATUS,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../_http.js";

export const ADMIN_STATS_CONFIG = {
  ACTIVE_WINDOW_MS: 30_000,
  MUSEUM_UTC_OFFSET_HOURS: -7,
  HOURS_PER_DAY: 24,
  MS_PER_HOUR: 3_600_000,
  RECENT_SURVEYS_LIMIT: 50,
} as const;

export interface AdminStatsHandlerDeps {
  readonly resolveDb?: () => Client;
  readonly verifyToken?: (
    headers?: Record<string, string | string[] | undefined>,
  ) => Promise<AdminTokenClaims | null>;
  readonly now?: () => number;
}

function getMuseumDayBoundsUtcMs(nowMs: number): {
  readonly dayStartUtcMs: number;
  readonly dayEndUtcMs: number;
} {
  const offsetMs =
    ADMIN_STATS_CONFIG.MUSEUM_UTC_OFFSET_HOURS * ADMIN_STATS_CONFIG.MS_PER_HOUR;
  const shifted = new Date(nowMs + offsetMs);
  const dayStartUtcMs =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - offsetMs;
  const dayEndUtcMs =
    dayStartUtcMs +
    ADMIN_STATS_CONFIG.HOURS_PER_DAY * ADMIN_STATS_CONFIG.MS_PER_HOUR;
  return { dayStartUtcMs, dayEndUtcMs };
}

/**
 * Authenticated telemetry endpoint returning live visitor concurrency,
 * 24-hour (`UTC-7`) session buckets, SQL average rating, and persisted surveys.
 */
export function createAdminStatsHandler(deps: AdminStatsHandlerDeps = {}) {
  const resolveDb = deps.resolveDb ?? getDb;
  const verifyToken = deps.verifyToken ?? ((h) => verifyAdminBearerToken(h));
  const now = deps.now ?? (() => Date.now());

  return async function handler(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    if (req.method !== "GET") {
      res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
        error: "Method not allowed. Use GET.",
      });
      return;
    }

    const claims = await verifyToken(req.headers);
    if (!claims) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    try {
      const nowMs = now();
      const activeCutoffMs = nowMs - ADMIN_STATS_CONFIG.ACTIVE_WINDOW_MS;
      const { dayStartUtcMs, dayEndUtcMs } = getMuseumDayBoundsUtcMs(nowMs);
      const offsetModifier = `${ADMIN_STATS_CONFIG.MUSEUM_UTC_OFFSET_HOURS} hours`;

      const db = resolveDb();
      const [activeRes, hourlyRes, summaryRes, surveysRes] = await db.batch(
        [
          {
            sql: "SELECT COUNT(*) AS activeSessions FROM visitor_sessions WHERE last_ping >= ?",
            args: [activeCutoffMs],
          },
          {
            sql: `SELECT
                    CAST(strftime('%H', datetime(created_at / 1000, 'unixepoch', ?)) AS INTEGER) AS hourBucket,
                    COUNT(*) AS count
                  FROM visitor_sessions
                  WHERE created_at >= ? AND created_at < ?
                  GROUP BY hourBucket`,
            args: [offsetModifier, dayStartUtcMs, dayEndUtcMs],
          },
          {
            sql: "SELECT COALESCE(ROUND(AVG(rating), 1), 0) AS averageRating, COUNT(*) AS totalSurveys FROM surveys",
            args: [],
          },
          {
            sql: `SELECT
                    s.id AS id,
                    CAST(strftime('%s', s.created_at) AS INTEGER) * 1000 AS timestampMs,
                    s.rating AS rating,
                    COALESCE(s.feedback, '') AS feedback,
                    (
                      SELECT al.mode
                      FROM access_logs al
                      WHERE al.session_uuid = s.session_uuid
                      ORDER BY al.id DESC
                      LIMIT 1
                    ) AS viewMode
                  FROM surveys s
                  ORDER BY s.id DESC
                  LIMIT ?`,
            args: [ADMIN_STATS_CONFIG.RECENT_SURVEYS_LIMIT],
          },
        ],
        "read",
      );

      const activeSessions = Number(activeRes.rows[0]?.activeSessions ?? 0);

      const labels = Array.from(
        { length: ADMIN_STATS_CONFIG.HOURS_PER_DAY },
        (_, hour) => `${String(hour).padStart(2, "0")}:00`,
      );
      const values = Array.from(
        { length: ADMIN_STATS_CONFIG.HOURS_PER_DAY },
        () => 0,
      );

      for (const row of hourlyRes.rows) {
        const bucket = Number(row.hourBucket);
        const count = Number(row.count ?? 0);
        if (
          Number.isInteger(bucket) &&
          bucket >= 0 &&
          bucket < ADMIN_STATS_CONFIG.HOURS_PER_DAY
        ) {
          values[bucket] = Math.max(0, count);
        }
      }

      const peak = values.length > 0 ? Math.max(...values) : 0;
      const averageRating = Number(summaryRes.rows[0]?.averageRating ?? 0);
      const totalSurveys = Number(summaryRes.rows[0]?.totalSurveys ?? 0);

      const surveys = surveysRes.rows.map((row) => ({
        id: String(row.id),
        timestamp: Number(row.timestampMs ?? nowMs),
        rating: Number(row.rating),
        feedback: String(row.feedback ?? ""),
        viewMode:
          row.viewMode === "vr" || row.viewMode === "2d" ? row.viewMode : null,
      }));

      res.status(API_HTTP_STATUS.OK).json({
        activeSessions,
        hourlyAttendance: {
          labels,
          values,
          peak,
        },
        surveys,
        averageRating,
        totalSurveys,
        timestamp: nowMs,
      });
    } catch {
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Could not retrieve administrative telemetry.",
      });
    }
  };
}

export default createAdminStatsHandler();
