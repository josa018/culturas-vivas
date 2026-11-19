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
  patch?<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  delete?<T = unknown>(
    url: string,
    headers?: Record<string, string>,
  ): Promise<T>;
  putBinary?(
    url: string,
    body: Blob,
    headers?: Record<string, string>,
  ): Promise<void>;
}

export interface AdminMediaFetcher extends AdminNetworkFetcher {
  patch<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  delete<T = unknown>(
    url: string,
    headers?: Record<string, string>,
  ): Promise<T>;
  putBinary(
    url: string,
    body: Blob,
    headers?: Record<string, string>,
  ): Promise<void>;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new AdminHttpError(
      response.status,
      `HTTP ${response.status} from ${url}`,
    );
  }
  return (await response.json()) as T;
}

/**
 * Default fetch-backed adapter for administrative JSON and presigned binary endpoints.
 */
export function createDefaultAdminFetcher(): AdminMediaFetcher {
  return {
    get: <T = unknown>(
      url: string,
      headers: Record<string, string> = {},
    ): Promise<T> =>
      requestJson<T>(url, {
        method: "GET",
        headers: { Accept: "application/json", ...headers },
      }),

    post: <T = unknown>(
      url: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<T> =>
      requestJson<T>(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),

    patch: <T = unknown>(
      url: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<T> =>
      requestJson<T>(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),

    delete: <T = unknown>(
      url: string,
      headers: Record<string, string> = {},
    ): Promise<T> =>
      requestJson<T>(url, {
        method: "DELETE",
        headers: { Accept: "application/json", ...headers },
      }),

    putBinary: async (
      url: string,
      body: Blob,
      headers: Record<string, string> = {},
    ): Promise<void> => {
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body,
      });
      if (!response.ok) {
        throw new AdminHttpError(
          response.status,
          `Binary PUT failed with HTTP ${response.status}`,
        );
      }
    },
  };
}
