export class AdminHttpError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminHttpError";
    this.status = status;
  }
}

export interface BinaryUploadProgress {
  readonly loaded: number;
  readonly total: number;
  readonly percent: number;
}

export interface UploadProgressState {
  readonly percent: number;
  readonly stageLabel: string;
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
  put?<T = unknown>(
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
    onProgress?: (progress: BinaryUploadProgress) => void,
  ): Promise<void>;
}

export interface AdminMediaFetcher extends AdminNetworkFetcher {
  patch<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T>;
  put<T = unknown>(
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
    onProgress?: (progress: BinaryUploadProgress) => void,
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

    put: <T = unknown>(
      url: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<T> =>
      requestJson<T>(url, {
        method: "PUT",
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
      onProgress?: (progress: BinaryUploadProgress) => void,
    ): Promise<void> => {
      if (typeof XMLHttpRequest === "function") {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", url);
          for (const [key, value] of Object.entries(headers)) {
            xhr.setRequestHeader(key, value);
          }
          if (onProgress && xhr.upload) {
            xhr.upload.addEventListener("progress", (event: ProgressEvent) => {
              if (event.lengthComputable && event.total > 0) {
                const percent = Math.min(
                  100,
                  Math.max(0, Math.round((event.loaded / event.total) * 100)),
                );
                onProgress({
                  loaded: event.loaded,
                  total: event.total,
                  percent,
                });
              }
            });
          }
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(
                new AdminHttpError(
                  xhr.status,
                  `Binary PUT failed with HTTP ${xhr.status}`,
                ),
              );
            }
          });
          xhr.addEventListener("error", () => {
            reject(new AdminHttpError(0, "Binary PUT network error"));
          });
          xhr.addEventListener("abort", () => {
            reject(new AdminHttpError(0, "Binary PUT aborted"));
          });
          xhr.send(body);
        });
        return;
      }

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
