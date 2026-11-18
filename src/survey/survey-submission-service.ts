import { SESSION_CONSTANTS } from "../session/constants";
import {
  createBrowserStorageAdapter,
  createDefaultFetcher,
  type SessionNetworkFetcher,
  type SessionStorageAdapter,
} from "../session/visitor-session-manager";
import { SURVEY_CONSTANTS } from "./constants";

export interface SurveySubmissionInput {
  readonly rating: number;
  readonly feedback?: string;
}

export type SurveySubmissionStatus =
  | "submitted"
  | "skipped_no_session"
  | "failed";

export interface SurveySubmissionResult {
  readonly status: SurveySubmissionStatus;
  readonly httpStatus?: number;
}

export interface SurveySubmissionPayload {
  readonly sessionId: string;
  readonly rating: number;
  readonly feedback?: string;
}

const HTTP_ERROR_STATUS_PATTERN = /^HTTP error (\d+)\b/;

function extractHttpStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  const match = HTTP_ERROR_STATUS_PATTERN.exec(error.message);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Coordinates anonymous single-question survey submission without DOM dependencies.
 * Composes storage and network fetcher adapters for isolated headless testing.
 */
export class SurveySubmissionService {
  private readonly storage: SessionStorageAdapter;
  private readonly fetcher: SessionNetworkFetcher;

  constructor(
    storage: SessionStorageAdapter = createBrowserStorageAdapter(),
    fetcher: SessionNetworkFetcher = createDefaultFetcher(),
  ) {
    this.storage = storage;
    this.fetcher = fetcher;
  }

  public async submit(
    input: SurveySubmissionInput,
  ): Promise<SurveySubmissionResult> {
    const rawSessionId = this.storage.getItem(SESSION_CONSTANTS.STORAGE_KEY);
    const normalizedSessionId =
      typeof rawSessionId === "string"
        ? rawSessionId.trim().toLowerCase()
        : null;

    if (
      !normalizedSessionId ||
      !SESSION_CONSTANTS.REGEX.UUID_V4.test(normalizedSessionId)
    ) {
      return { status: "skipped_no_session" };
    }

    if (
      !Number.isInteger(input.rating) ||
      input.rating < SURVEY_CONSTANTS.RATING.MIN ||
      input.rating > SURVEY_CONSTANTS.RATING.MAX
    ) {
      return { status: "failed" };
    }

    const trimmedFeedback =
      typeof input.feedback === "string" ? input.feedback.trim() : "";

    if (trimmedFeedback.length > SURVEY_CONSTANTS.FEEDBACK.MAX_LENGTH) {
      return { status: "failed" };
    }

    const payload: SurveySubmissionPayload = trimmedFeedback
      ? {
          sessionId: normalizedSessionId,
          rating: input.rating,
          feedback: trimmedFeedback,
        }
      : {
          sessionId: normalizedSessionId,
          rating: input.rating,
        };

    try {
      await this.fetcher.post(SURVEY_CONSTANTS.ENDPOINTS.SUBMIT, payload);
      return {
        status: "submitted",
        httpStatus: SURVEY_CONSTANTS.HTTP_STATUS.CREATED,
      };
    } catch (error) {
      return {
        status: "failed",
        httpStatus: extractHttpStatus(error),
      };
    }
  }
}
