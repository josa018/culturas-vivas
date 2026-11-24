import type { Client } from "@libsql/client";
import { getDb } from "../_db.js";
import {
  verifyAdminBearerToken,
  type AdminTokenClaims,
} from "../_auth.js";
import {
  API_HTTP_STATUS,
  extractQueryParam,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../_http.js";

export type AdminStatsRange = "day" | "week" | "month" | "year";
export type SurveyModeFilter = "all" | "vr" | "2d";
export type SurveyRatingFilter = "all" | 1 | 2 | 3 | 4 | 5;
export type SurveySortOption =
  | "newest"
  | "oldest"
  | "rating_desc"
  | "rating_asc";

export const ADMIN_STATS_CONFIG = {
  ACTIVE_WINDOW_MS: 30_000,
  MUSEUM_UTC_OFFSET_HOURS: -7,
  HOURS_PER_DAY: 24,
  WEEK_DAYS: 7,
  MONTH_DAYS: 30,
  YEAR_MONTHS: 12,
  MS_PER_HOUR: 3_600_000,
  DEFAULT_SURVEY_PAGE: 1,
  DEFAULT_SURVEY_PAGE_SIZE: 10,
  MAX_SURVEY_PAGE_SIZE: 50,
  RECENT_SURVEYS_LIMIT: 50,
  DEFAULT_RANGE: "day" as AdminStatsRange,
  WEEKDAYS_ES: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const,
  MONTHS_ES: [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ] as const,
} as const;

const SURVEY_ORDER_CLAUSE: Record<SurveySortOption, string> = {
  newest: "ORDER BY id DESC",
  oldest: "ORDER BY id ASC",
  rating_desc: "ORDER BY rating DESC, id DESC",
  rating_asc: "ORDER BY rating ASC, id DESC",
};

const JOINED_SURVEYS_CTE = `
  WITH joined_surveys AS (
    SELECT
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
  )
`;

export interface AdminStatsHandlerDeps {
  readonly resolveDb?: () => Client;
  readonly verifyToken?: (
    headers?: Record<string, string | string[] | undefined>,
  ) => Promise<AdminTokenClaims | null>;
  readonly now?: () => number;
}

interface AttendanceWindowSpec {
  readonly startUtcMs: number;
  readonly endUtcMs: number;
  readonly sqlFormat: string;
  readonly bucketKeys: readonly string[];
  readonly labels: readonly string[];
}

function parseStatsRange(raw: string | null): AdminStatsRange {
  if (raw === "week" || raw === "month" || raw === "year" || raw === "day") {
    return raw;
  }
  return ADMIN_STATS_CONFIG.DEFAULT_RANGE;
}

function parseSurveyMode(raw: string | null): SurveyModeFilter {
  if (raw === "vr" || raw === "2d") {
    return raw;
  }
  return "all";
}

function parseSurveyRating(raw: string | null): SurveyRatingFilter {
  const num = Number(raw);
  if (Number.isInteger(num) && num >= 1 && num <= 5) {
    return num as 1 | 2 | 3 | 4 | 5;
  }
  return "all";
}

function parseSurveyHasFeedback(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

function parseSurveySort(raw: string | null): SurveySortOption {
  if (
    raw === "oldest" ||
    raw === "rating_desc" ||
    raw === "rating_asc" ||
    raw === "newest"
  ) {
    return raw;
  }
  return "newest";
}

function parsePositiveInt(
  raw: string | null,
  fallback: number,
  max?: number,
): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

function buildAttendanceWindow(
  nowMs: number,
  range: AdminStatsRange,
): AttendanceWindowSpec {
  const offsetMs =
    ADMIN_STATS_CONFIG.MUSEUM_UTC_OFFSET_HOURS * ADMIN_STATS_CONFIG.MS_PER_HOUR;
  const shifted = new Date(nowMs + offsetMs);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();

  if (range === "day") {
    const startUtcMs = Date.UTC(year, month, day) - offsetMs;
    const endUtcMs =
      startUtcMs +
      ADMIN_STATS_CONFIG.HOURS_PER_DAY * ADMIN_STATS_CONFIG.MS_PER_HOUR;
    const bucketKeys = Array.from(
      { length: ADMIN_STATS_CONFIG.HOURS_PER_DAY },
      (_, hour) => String(hour).padStart(2, "0"),
    );
    const labels = bucketKeys.map((key) => `${key}:00`);
    return { startUtcMs, endUtcMs, sqlFormat: "%H", bucketKeys, labels };
  }

  if (range === "week" || range === "month") {
    const spanDays =
      range === "week"
        ? ADMIN_STATS_CONFIG.WEEK_DAYS
        : ADMIN_STATS_CONFIG.MONTH_DAYS;
    const startUtcMs = Date.UTC(year, month, day - (spanDays - 1)) - offsetMs;
    const endUtcMs = Date.UTC(year, month, day + 1) - offsetMs;
    const bucketKeys: string[] = [];
    const labels: string[] = [];
    for (let offset = -(spanDays - 1); offset <= 0; offset += 1) {
      const d = new Date(Date.UTC(year, month, day + offset));
      const yStr = String(d.getUTCFullYear());
      const mNum = d.getUTCMonth() + 1;
      const dNum = d.getUTCDate();
      const key = `${yStr}-${String(mNum).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
      bucketKeys.push(key);
      if (range === "week") {
        const weekday = ADMIN_STATS_CONFIG.WEEKDAYS_ES[d.getUTCDay()];
        labels.push(`${weekday} ${dNum}`);
      } else {
        labels.push(
          `${String(dNum).padStart(2, "0")}/${String(mNum).padStart(2, "0")}`,
        );
      }
    }
    return { startUtcMs, endUtcMs, sqlFormat: "%Y-%m-%d", bucketKeys, labels };
  }

  // Year: trailing 12 calendar months including current museum month
  const startUtcMs =
    Date.UTC(year, month - (ADMIN_STATS_CONFIG.YEAR_MONTHS - 1), 1) - offsetMs;
  const endUtcMs = Date.UTC(year, month + 1, 1) - offsetMs;
  const bucketKeys: string[] = [];
  const labels: string[] = [];
  for (let offset = -(ADMIN_STATS_CONFIG.YEAR_MONTHS - 1); offset <= 0; offset += 1) {
    const d = new Date(Date.UTC(year, month + offset, 1));
    const yStr = String(d.getUTCFullYear());
    const mIdx = d.getUTCMonth();
    bucketKeys.push(`${yStr}-${String(mIdx + 1).padStart(2, "0")}`);
    labels.push(`${ADMIN_STATS_CONFIG.MONTHS_ES[mIdx]} ${yStr.slice(-2)}`);
  }
  return { startUtcMs, endUtcMs, sqlFormat: "%Y-%m", bucketKeys, labels };
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
      const range = parseStatsRange(extractQueryParam(req, "range"));
      const surveyMode = parseSurveyMode(extractQueryParam(req, "surveyMode"));
      const surveyRating = parseSurveyRating(
        extractQueryParam(req, "surveyRating"),
      );
      const surveyHasFeedback = parseSurveyHasFeedback(
        extractQueryParam(req, "surveyHasFeedback"),
      );
      const surveySort = parseSurveySort(extractQueryParam(req, "surveySort"));
      const requestedPage = parsePositiveInt(
        extractQueryParam(req, "surveyPage"),
        ADMIN_STATS_CONFIG.DEFAULT_SURVEY_PAGE,
      );
      const pageSize = parsePositiveInt(
        extractQueryParam(req, "surveyPageSize"),
        ADMIN_STATS_CONFIG.DEFAULT_SURVEY_PAGE_SIZE,
        ADMIN_STATS_CONFIG.MAX_SURVEY_PAGE_SIZE,
      );

      const conditions: string[] = [];
      const whereArgs: (string | number)[] = [];
      if (surveyMode !== "all") {
        conditions.push("viewMode = ?");
        whereArgs.push(surveyMode);
      }
      if (surveyRating !== "all") {
        conditions.push("rating = ?");
        whereArgs.push(surveyRating);
      }
      if (surveyHasFeedback) {
        conditions.push("LENGTH(TRIM(feedback)) > 0");
      }
      const whereSql =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const orderSql = SURVEY_ORDER_CLAUSE[surveySort];
      const requestedOffset = (requestedPage - 1) * pageSize;

      const activeCutoffMs = nowMs - ADMIN_STATS_CONFIG.ACTIVE_WINDOW_MS;
      const windowSpec = buildAttendanceWindow(nowMs, range);
      const offsetModifier = `${ADMIN_STATS_CONFIG.MUSEUM_UTC_OFFSET_HOURS} hours`;

      const db = resolveDb();
      const [activeRes, bucketRes, summaryRes, filteredCountRes, surveysRes] =
        await db.batch(
          [
            {
              sql: "SELECT COUNT(*) AS activeSessions FROM visitor_sessions WHERE last_ping >= ?",
              args: [activeCutoffMs],
            },
            {
              sql: `SELECT
                      strftime(?, datetime(created_at / 1000, 'unixepoch', ?)) AS bucketKey,
                      COUNT(*) AS count
                    FROM visitor_sessions
                    WHERE created_at >= ? AND created_at < ?
                    GROUP BY bucketKey`,
              args: [
                windowSpec.sqlFormat,
                offsetModifier,
                windowSpec.startUtcMs,
                windowSpec.endUtcMs,
              ],
            },
            {
              sql: "SELECT COALESCE(ROUND(AVG(rating), 1), 0) AS averageRating, COUNT(*) AS totalSurveys FROM surveys",
              args: [],
            },
            {
              sql: `${JOINED_SURVEYS_CTE}
                    SELECT COUNT(*) AS filteredTotal
                    FROM joined_surveys
                    ${whereSql}`,
              args: whereArgs,
            },
            {
              sql: `${JOINED_SURVEYS_CTE}
                    SELECT id, timestampMs, rating, feedback, viewMode
                    FROM joined_surveys
                    ${whereSql}
                    ${orderSql}
                    LIMIT ? OFFSET ?`,
              args: [...whereArgs, pageSize, requestedOffset],
            },
          ],
          "read",
        );

      const activeSessions = Number(activeRes.rows[0]?.activeSessions ?? 0);

      const countsByKey = new Map<string, number>();
      for (const row of bucketRes.rows) {
        const key = String(row.bucketKey ?? "");
        const count = Number(row.count ?? 0);
        if (key.length > 0 && Number.isFinite(count) && count >= 0) {
          countsByKey.set(key, Math.floor(count));
        }
      }

      const labels = [...windowSpec.labels];
      const values = windowSpec.bucketKeys.map(
        (key) => countsByKey.get(key) ?? 0,
      );

      const peak = values.length > 0 ? Math.max(...values) : 0;
      const averageRating = Number(summaryRes.rows[0]?.averageRating ?? 0);
      const totalSurveys = Number(summaryRes.rows[0]?.totalSurveys ?? 0);
      const filteredTotal = Number(filteredCountRes.rows[0]?.filteredTotal ?? 0);
      const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
      const effectivePage = Math.min(requestedPage, totalPages);

      let pageRows = surveysRes.rows;
      if (filteredTotal > 0 && requestedPage > totalPages) {
        const clampedRes = await db.execute({
          sql: `${JOINED_SURVEYS_CTE}
                SELECT id, timestampMs, rating, feedback, viewMode
                FROM joined_surveys
                ${whereSql}
                ${orderSql}
                LIMIT ? OFFSET ?`,
          args: [...whereArgs, pageSize, (effectivePage - 1) * pageSize],
        });
        pageRows = clampedRes.rows;
      }

      const surveys = pageRows.map((row) => ({
        id: String(row.id),
        timestamp: Number(row.timestampMs ?? nowMs),
        rating: Number(row.rating),
        feedback: String(row.feedback ?? ""),
        viewMode:
          row.viewMode === "vr" || row.viewMode === "2d" ? row.viewMode : null,
      }));

      res.status(API_HTTP_STATUS.OK).json({
        range,
        activeSessions,
        hourlyAttendance: {
          labels,
          values,
          peak,
        },
        surveys,
        surveysPagination: {
          page: effectivePage,
          pageSize,
          totalItems: filteredTotal,
          totalPages,
        },
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
