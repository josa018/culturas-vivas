import type { Client } from "@libsql/client";
import { getDb } from "../_db.js";
import {
  API_HTTP_STATUS,
  isUniqueConstraintError,
  normalizeUuid,
  parseJsonObjectBody,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../_http.js";

export const SURVEY_LIMITS = {
  RATING_MIN: 1,
  RATING_MAX: 5,
  FEEDBACK_MAX_LENGTH: 500,
} as const;

function parseRating(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SURVEY_LIMITS.RATING_MIN &&
    value <= SURVEY_LIMITS.RATING_MAX
    ? value
    : null;
}

type ParsedFeedback =
  | { readonly valid: true; readonly value: string | null }
  | { readonly valid: false };

function parseFeedback(value: unknown): ParsedFeedback {
  if (value === undefined || value === null) {
    return { valid: true, value: null };
  }
  if (typeof value !== "string") {
    return { valid: false };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: true, value: null };
  }
  if (trimmed.length > SURVEY_LIMITS.FEEDBACK_MAX_LENGTH) {
    return { valid: false };
  }
  return { valid: true, value: trimmed };
}

/**
 * Builds the survey submission handler with an injectable database resolver for headless testing.
 */
export function createSurveySubmitHandler(resolveDb: () => Client = getDb) {
  return async function handler(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    if (req.method !== "POST") {
      res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
        error: "Method not allowed. Use POST.",
      });
      return;
    }

    const body = parseJsonObjectBody(req.body);
    if (!body) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Invalid JSON body. Expected an object.",
      });
      return;
    }

    const sessionId = normalizeUuid(body.sessionId);
    if (!sessionId) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Invalid or malformed sessionId. Must be UUID v4.",
      });
      return;
    }

    const rating = parseRating(body.rating);
    if (rating === null) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: `rating must be an integer from ${SURVEY_LIMITS.RATING_MIN} to ${SURVEY_LIMITS.RATING_MAX}.`,
      });
      return;
    }

    const feedbackResult = parseFeedback(body.feedback);
    if (!feedbackResult.valid) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: `feedback must be a string of at most ${SURVEY_LIMITS.FEEDBACK_MAX_LENGTH} characters.`,
      });
      return;
    }

    try {
      // Single statement: inserts only if the session exists in visitor_sessions.
      // The unique index on surveys.session_uuid rejects duplicate submissions.
      const result = await resolveDb().execute({
        sql: `INSERT INTO surveys (session_uuid, rating, feedback)
              SELECT ?, ?, ?
              WHERE EXISTS (SELECT 1 FROM visitor_sessions WHERE id = ?)`,
        args: [sessionId, rating, feedbackResult.value, sessionId],
      });

      if (result.rowsAffected === 0) {
        res.status(API_HTTP_STATUS.NOT_FOUND).json({
          error: "Session not found.",
        });
        return;
      }

      res.status(API_HTTP_STATUS.CREATED).json({ ok: true });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        res.status(API_HTTP_STATUS.CONFLICT).json({
          error: "This session already submitted a survey.",
        });
        return;
      }
      // Do not echo internal database details back to the client
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Could not save the survey.",
      });
    }
  };
}

export default createSurveySubmitHandler();
