import type { RoomId, StandId } from "../shared/room-catalog";
import { MEDIA_CLIENT_CONSTANTS } from "./constants";
import type { RoomMediaProvider, StandMediaItem } from "./media-types";

export interface MediaCatalogClientOptions {
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface CatalogApiResponse {
  readonly items?: unknown;
}

function buildBucketKey(roomId: string, standId: string): string {
  return `${roomId}:${standId}`;
}

function isValidStandMediaItem(value: unknown): value is StandMediaItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<StandMediaItem>;
  return (
    typeof item.id === "string" &&
    typeof item.roomId === "string" &&
    typeof item.standId === "string" &&
    typeof item.mediaType === "string" &&
    typeof item.title === "string" &&
    typeof item.mediaUrl === "string"
  );
}

/**
 * Hydrates and caches public stand multimedia items fetched from GET /api/media.
 */
export class MediaCatalogClient implements RoomMediaProvider {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl?: typeof fetch;
  private readonly buckets = new Map<string, StandMediaItem[]>();

  constructor(options: MediaCatalogClientOptions = {}) {
    this.endpoint = options.endpoint ?? MEDIA_CLIENT_CONSTANTS.CATALOG_ENDPOINT;
    this.timeoutMs =
      options.timeoutMs ?? MEDIA_CLIENT_CONSTANTS.FETCH_TIMEOUT_MS;
    this.fetchImpl =
      options.fetchImpl ??
      (typeof fetch === "function" ? fetch.bind(globalThis) : undefined);
  }

  public async load(): Promise<void> {
    if (!this.fetchImpl) {
      return;
    }

    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId =
      controller !== null
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : null;

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        ...(controller ? { signal: controller.signal } : {}),
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as CatalogApiResponse | null;
      if (!payload || !Array.isArray(payload.items)) {
        return;
      }

      const nextBuckets = new Map<string, StandMediaItem[]>();
      for (const raw of payload.items) {
        if (!isValidStandMediaItem(raw)) {
          continue;
        }
        const normalized: StandMediaItem = {
          ...raw,
          creatorName:
            typeof raw.creatorName === "string" ? raw.creatorName : "",
          description:
            typeof raw.description === "string" ? raw.description : "",
          sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : 0,
        };
        const key = buildBucketKey(normalized.roomId, normalized.standId);
        const list = nextBuckets.get(key) ?? [];
        list.push(normalized);
        nextBuckets.set(key, list);
      }

      this.buckets.clear();
      for (const [key, list] of nextBuckets.entries()) {
        list.sort((a, b) => a.sortOrder - b.sortOrder);
        this.buckets.set(key, list);
      }
    } catch {
      // Non-fatal fallback: preserves empty/existing stand items when offline or timed out.
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  public getStandItems(
    roomId: RoomId,
    standId: StandId,
  ): readonly StandMediaItem[] {
    return this.buckets.get(buildBucketKey(roomId, standId)) ?? [];
  }
}

let sharedMediaCatalogClient = new MediaCatalogClient();

export function getSharedMediaCatalogClient(): MediaCatalogClient {
  return sharedMediaCatalogClient;
}

export function setSharedMediaCatalogClient(client: MediaCatalogClient): void {
  sharedMediaCatalogClient = client;
}
