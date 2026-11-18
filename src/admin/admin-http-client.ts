export class AdminHttpError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminHttpError";
    this.status = status;
  }
}

export interface AdminNetworkFetcher {
  get<T = unknown>(url: string, headers?: Record<string, string>): Promise<T>;
  post<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
}

/**
 * Default fetch-backed adapter for administrative JSON endpoints.
 */
export function createDefaultAdminFetcher(): AdminNetworkFetcher {
  return {
    get: async <T = unknown>(
      url: string,
      headers: Record<string, string> = {},
    ): Promise<T> => {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...headers },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new AdminHttpError(
          response.status,
          `HTTP ${response.status} from ${url}`,
        );
      }
      return (await response.json()) as T;
    },
    post: async <T = unknown>(
      url: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<T> => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new AdminHttpError(
          response.status,
          `HTTP ${response.status} from ${url}`,
        );
      }
      return (await response.json()) as T;
    },
  };
}
