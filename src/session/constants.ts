/**
 * Declarative constants for anonymous visitor session management and telemetry.
 */
export const SESSION_CONSTANTS = {
  STORAGE_KEY: "cv_visitor_session_id",
  HEARTBEAT_INTERVAL_MS: 30000,
  ENDPOINTS: {
    START: "/api/session/start",
    PING: "/api/session/ping",
  },
  REGEX: {
    UUID_V4: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
} as const;

export type SessionEndpoints = typeof SESSION_CONSTANTS.ENDPOINTS;
