import { describe, it, expect } from "vitest";
import { SESSION_CONSTANTS } from "../../src/session/constants";
import type {
  SessionNetworkFetcher,
  SessionStorageAdapter,
} from "../../src/session/visitor-session-manager";
import { SURVEY_CONSTANTS } from "../../src/survey/constants";
import { SurveySubmissionService } from "../../src/survey/survey-submission-service";

class InMemorySessionStorage implements SessionStorageAdapter {
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

class StubSurveyFetcher implements SessionNetworkFetcher {
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
    const storage = new InMemorySessionStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, ` ${VALID_UPPERCASE_UUID} `);
    const fetcher = new StubSurveyFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    const result = await service.submit({
      rating: 4,
      feedback: "  Excelente sala Wixarika  ",
    });

    expect(result).toEqual({
      status: "submitted",
      httpStatus: 201,
    });
    expect(fetcher.calls).toEqual([
      {
        url: "/api/survey/submit",
        body: {
          sessionId: VALID_LOWERCASE_UUID,
          rating: 4,
          feedback: "Excelente sala Wixarika",
        },
      },
    ]);
  });

  it("omits feedback when whitespace-only or undefined", async () => {
    const storage = new InMemorySessionStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, VALID_LOWERCASE_UUID);
    const fetcher = new StubSurveyFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    const result = await service.submit({ rating: 5, feedback: "   \n\t  " });

    expect(result.status).toBe("submitted");
    expect(fetcher.calls[0]?.body).toEqual({
      sessionId: VALID_LOWERCASE_UUID,
      rating: 5,
    });
  });

  it("skips network request when sessionId is missing or malformed", async () => {
    const storage = new InMemorySessionStorage();
    const fetcher = new StubSurveyFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    expect(await service.submit({ rating: 5 })).toEqual({
      status: "skipped_no_session",
    });

    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, "not-a-uuid-v4");
    expect(await service.submit({ rating: 5 })).toEqual({
      status: "skipped_no_session",
    });
    expect(fetcher.calls).toHaveLength(0);
  });

  it.each([
    { label: "rating 0", input: { rating: 0 } },
    { label: "rating 6", input: { rating: 6 } },
    { label: "fractional rating 3.5", input: { rating: 3.5 } },
    {
      label: "oversized feedback",
      input: {
        rating: 4,
        feedback: "a".repeat(SURVEY_CONSTANTS.FEEDBACK.MAX_LENGTH + 1),
      },
    },
  ])("rejects $label locally without calling network", async ({ input }) => {
    const storage = new InMemorySessionStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, VALID_LOWERCASE_UUID);
    const fetcher = new StubSurveyFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    expect(await service.submit(input)).toEqual({ status: "failed" });
    expect(fetcher.calls).toHaveLength(0);
  });

  it("captures HTTP status when fetcher throws HTTP error and omits it on generic network errors", async () => {
    const storage = new InMemorySessionStorage();
    storage.setItem(SESSION_CONSTANTS.STORAGE_KEY, VALID_LOWERCASE_UUID);
    const fetcher = new StubSurveyFetcher();
    const service = new SurveySubmissionService(storage, fetcher);

    fetcher.errorToThrow = new Error("HTTP error 409 from /api/survey/submit");
    expect(await service.submit({ rating: 5 })).toEqual({
      status: "failed",
      httpStatus: 409,
    });

    fetcher.errorToThrow = new Error("Failed to fetch");
    expect(await service.submit({ rating: 5 })).toEqual({
      status: "failed",
      httpStatus: undefined,
    });
  });
});
