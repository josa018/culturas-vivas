/**
 * Declarative constants for visitor satisfaction survey validation and submission.
 */
export const SURVEY_CONSTANTS = {
  ENDPOINTS: {
    SUBMIT: "/api/survey/submit",
  },
  RATING: {
    MIN: 1,
    MAX: 5,
    DEFAULT: 5,
  },
  FEEDBACK: {
    MAX_LENGTH: 500,
    TEXTAREA_ROWS: 3,
  },
  HTTP_STATUS: {
    CREATED: 201,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
  },
} as const;
