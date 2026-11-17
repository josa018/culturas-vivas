import { describe, it, expect } from "vitest";
import { SESSION_CONSTANTS } from "../../src/session/constants";
import type {
  SessionNetworkFetcher,
  SessionStorageAdapter,
} from "../../src/session/visitor-session-manager";
import { SURVEY_CONSTANTS } from "../../src/survey/constants";
import { SurveySubmissionService } from "../../src/survey/survey-submission-service";

class MockStorage implements SessionStorageAdapter {
  private readonly store = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  public removeItem(key: string): void {
    this.store.delete(key);
  }
}

class MockFetcher implements SessionNetworkFetcher {
  public readonly calls: Array<{ url: string; body?: unknown }> = [];
  public errorToThrow: Error | null = null;

  public async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    this.calls.push({ url, body });
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }
    return { ok: true } as T;
  }
}

const VALID_UPPERCASE_UUID = "3F2B8C1E-5A4D-4E7B-9C12-8D6F0A1B2C3D";
const VALID_LOWERCASE_UUID = VALID_UPPERCASE_UUID.toLowerCase();

describe("SurveySubmissionService", () => {
  it("submits normalized sessionId, integer rating, and trimmed feedback", async () => {
    const storage = new MockStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, ` ${VALID_UPPERCASE_UUID} `);
    const fetcher = new MockFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    const result = await service.submit({
      rating: 4,
      feedback: "  Excelente sala Wixarika  ",
    });

    expect(result).toEqual({
      status: "submitted",
      httpStatus: SURVEY_CONSTANTS.HTTP_STATUS.CREATED,
    });
    expect(fetcher.calls).toEqual([
      {
        url: SURVEY_CONSTANTS.ENDPOINTS.SUBMIT,
        body: {
          sessionId: VALID_LOWERCASE_UUID,
          rating: 4,
          feedback: "Excelente sala Wixarika",
        },
      },
    ]);
  });

  it("omits feedback when whitespace-only or undefined", async () => {
    const storage = new MockStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, VALID_LOWERCASE_UUID);
    const fetcher = new MockFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    const result = await service.submit({ rating: 5, feedback: "   \n\t  " });

    expect(result.status).toBe("submitted");
    expect(fetcher.calls[0]?.body).toEqual({
      sessionId: VALID_LOWERCASE_UUID,
      rating: 5,
    });
  });

  it("skips network request when sessionId is missing or malformed", async () => {
    const storage = new MockStorage();
    const fetcher = new MockFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    const missingResult = await service.submit({ rating: 5 });
    expect(missingResult).toEqual({ status: "skipped_no_session" });

    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, "not-a-uuid-v4");
    const invalidResult = await service.submit({ rating: 5 });
    expect(invalidResult).toEqual({ status: "skipped_no_session" });
    expect(fetcher.calls.length).toBe(0);
  });

  it("rejects out-of-bounds ratings and oversized feedback locally", async () => {
    const storage = new MockStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, VALID_LOWERCASE_UUID);
    const fetcher = new MockFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    expect(await service.submit({ rating: 0 })).toEqual({ status: "failed" });
    expect(await service.submit({ rating: 6 })).toEqual({ status: "failed" });
    expect(await service.submit({ rating: 3.5 })).toEqual({ status: "failed" });
    expect(
      await service.submit({
        rating: 4,
        feedback: "a".repeat(SURVEY_CONSTANTS.FEEDBACK.MAX_LENGTH + 1),
      }),
    ).toEqual({ status: "failed" });
    expect(fetcher.calls.length).toBe(0);
  });

  it("suppresses network errors and captures HTTP status when available", async () => {
    const storage = new MockStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, VALID_LOWERCASE_UUID);
    const fetcher = new MockFetcher();
    fetcher.errorToThrow = new Error(
      `HTTP error 409 from ${SURVEY_CONSTANTS.ENDPOINTS.SUBMIT}`,
    );
    const service = new SurveySubmissionService(storage, fetcher);

    const result = await service.submit({ rating: 5 });
    expect(result).toEqual({ status: "failed", httpStatus: 409 });
  });
});
