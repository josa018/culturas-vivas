import {
  isVideoMediaType,
  type StandMediaItem,
  type StandMediaType,
} from "../experience/media-types";
import {
  DEFAULT_ROOM_ID,
  ROOM_CATALOG,
  RoomId,
  StandId,
} from "../shared/room-catalog";
import {
  AdminHttpError,
  createDefaultAdminFetcher,
  type AdminNetworkFetcher,
} from "./admin-http-client";
import { ADMIN_MEDIA_ENDPOINTS, ADMIN_MEDIA_LIMITS } from "./constants";
import { AdminMediaProcessor } from "./media-processor";

export interface AdminMediaItemRecord extends StandMediaItem {
  readonly mediaKey?: string;
  readonly posterKey?: string | null;
  readonly fileSizeBytes?: number;
}

export interface AdminMediaState {
  readonly items: readonly AdminMediaItemRecord[];
  readonly isLoading: boolean;
  readonly isUploading: boolean;
  readonly error: string | null;
  readonly selectedRoomId: RoomId;
  readonly selectedStandId: StandId;
  readonly storageUsageBytes: number;
  readonly maxStorageBytes: number;
}

export interface UploadMediaInput {
  readonly roomId: RoomId;
  readonly standId: StandId;
  readonly file: Blob;
  readonly mediaKind: StandMediaType;
  readonly title: string;
  readonly creatorName: string;
  readonly description: string;
}

export interface UpdateMediaMetadataInput {
  readonly id: string;
  readonly title?: string;
  readonly creatorName?: string;
  readonly description?: string;
  readonly mediaKind?: StandMediaType;
}

export interface AdminMediaStoreOptions {
  readonly getToken: () => string | null;
  readonly onUnauthorized: () => void;
  readonly fetcher?: AdminNetworkFetcher;
  readonly processor?: AdminMediaProcessor;
}

interface PresignTargetPayload {
  readonly key: string;
  readonly uploadUrl: string;
  readonly headers: Record<string, string>;
}

interface PresignResponsePayload {
  readonly media: PresignTargetPayload;
  readonly poster?: PresignTargetPayload;
  readonly storageUsageBytes: number;
  readonly maxStorageBytes: number;
}

interface MediaCatalogResponsePayload {
  readonly items?: AdminMediaItemRecord[];
  readonly storageUsageBytes?: number;
  readonly maxStorageBytes?: number;
}

interface MediaCreateResponsePayload {
  readonly item: AdminMediaItemRecord;
  readonly storageUsageBytes?: number;
  readonly maxStorageBytes?: number;
}

interface MediaDeleteResponsePayload {
  readonly storageUsageBytes?: number;
  readonly maxStorageBytes?: number;
}

export type AdminMediaListener = (state: AdminMediaState) => void;

const HTTP_STATUS_UNAUTHORIZED = 401;

function getDefaultStandForRoom(roomId: RoomId): StandId {
  return ROOM_CATALOG[roomId].stands[0]?.standId ?? StandId.BIENVENIDA;
}

export class AdminMediaStore {
  private readonly fetcher: AdminNetworkFetcher;
  private readonly processor: AdminMediaProcessor;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: () => void;
  private readonly listeners = new Set<AdminMediaListener>();

  private state: AdminMediaState = {
    items: [],
    isLoading: false,
    isUploading: false,
    error: null,
    selectedRoomId: DEFAULT_ROOM_ID,
    selectedStandId: getDefaultStandForRoom(DEFAULT_ROOM_ID),
    storageUsageBytes: 0,
    maxStorageBytes: ADMIN_MEDIA_LIMITS.MAX_TOTAL_BYTES,
  };

  constructor(options: AdminMediaStoreOptions) {
    this.getToken = options.getToken;
    this.onUnauthorized = options.onUnauthorized;
    this.fetcher = options.fetcher ?? createDefaultAdminFetcher();
    this.processor = options.processor ?? new AdminMediaProcessor();
  }

  public getState(): AdminMediaState {
    return this.state;
  }

  public subscribe(listener: AdminMediaListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setSelection(roomId: RoomId, standId?: StandId): void {
    const validStandIds = ROOM_CATALOG[roomId].stands.map((s) => s.standId);
    const resolvedStandId =
      standId && validStandIds.includes(standId)
        ? standId
        : getDefaultStandForRoom(roomId);
    this.updateState({
      selectedRoomId: roomId,
      selectedStandId: resolvedStandId,
      error: null,
    });
  }

  public getSelectedItems(): AdminMediaItemRecord[] {
    return this.state.items
      .filter(
        (item) =>
          item.roomId === this.state.selectedRoomId &&
          item.standId === this.state.selectedStandId,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public async fetchCatalog(): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers) {
      return;
    }

    this.updateState({ isLoading: true, error: null });
    try {
      const payload = await this.fetcher.get<MediaCatalogResponsePayload>(
        ADMIN_MEDIA_ENDPOINTS.MEDIA,
        headers,
      );
      this.updateState({
        items: Array.isArray(payload.items) ? payload.items : [],
        storageUsageBytes: payload.storageUsageBytes ?? 0,
        maxStorageBytes:
          payload.maxStorageBytes ?? ADMIN_MEDIA_LIMITS.MAX_TOTAL_BYTES,
        isLoading: false,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo cargar el catálogo multimedia.", {
        isLoading: false,
      });
    }
  }

  public async uploadMedia(input: UploadMediaInput): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.putBinary) {
      return;
    }

    this.updateState({ isUploading: true, error: null });
    try {
      const isVideo = isVideoMediaType(input.mediaKind);

      if (isVideo) {
        const extracted = await this.processor.extractVideoPoster(input.file);
        const presign = await this.fetcher.post<PresignResponsePayload>(
          ADMIN_MEDIA_ENDPOINTS.PRESIGN,
          {
            roomId: input.roomId,
            standId: input.standId,
            mediaKind: input.mediaKind,
            mimeType: "video/mp4",
            fileSizeBytes: input.file.size,
            posterMimeType: extracted.posterMimeType,
            posterSizeBytes: extracted.posterBlob.size,
          },
          headers,
        );

        await this.fetcher.putBinary(
          presign.media.uploadUrl,
          input.file,
          presign.media.headers,
        );
        if (presign.poster) {
          await this.fetcher.putBinary(
            presign.poster.uploadUrl,
            extracted.posterBlob,
            presign.poster.headers,
          );
        }

        const created = await this.fetcher.post<MediaCreateResponsePayload>(
          ADMIN_MEDIA_ENDPOINTS.MEDIA,
          {
            roomId: input.roomId,
            standId: input.standId,
            mediaKind: input.mediaKind,
            title: input.title,
            creatorName: input.creatorName,
            description: input.description,
            mediaKey: presign.media.key,
            posterKey: presign.poster?.key ?? null,
            mimeType: "video/mp4",
            fileSizeBytes: input.file.size,
            width: extracted.videoWidth,
            height: extracted.videoHeight,
          },
          headers,
        );

        this.updateState({
          items: [...this.state.items, created.item],
          storageUsageBytes:
            created.storageUsageBytes ??
            this.state.storageUsageBytes + input.file.size,
          maxStorageBytes:
            created.maxStorageBytes ?? this.state.maxStorageBytes,
          isUploading: false,
        });
        return;
      }

      const optimized = await this.processor.optimizeImage(input.file);
      const presign = await this.fetcher.post<PresignResponsePayload>(
        ADMIN_MEDIA_ENDPOINTS.PRESIGN,
        {
          roomId: input.roomId,
          standId: input.standId,
          mediaKind: input.mediaKind,
          mimeType: optimized.mimeType,
          fileSizeBytes: optimized.blob.size,
        },
        headers,
      );

      await this.fetcher.putBinary(
        presign.media.uploadUrl,
        optimized.blob,
        presign.media.headers,
      );

      const created = await this.fetcher.post<MediaCreateResponsePayload>(
        ADMIN_MEDIA_ENDPOINTS.MEDIA,
        {
          roomId: input.roomId,
          standId: input.standId,
          mediaKind: input.mediaKind,
          title: input.title,
          creatorName: input.creatorName,
          description: input.description,
          mediaKey: presign.media.key,
          mimeType: optimized.mimeType,
          fileSizeBytes: optimized.blob.size,
          width: optimized.width,
          height: optimized.height,
        },
        headers,
      );

      this.updateState({
        items: [...this.state.items, created.item],
        storageUsageBytes:
          created.storageUsageBytes ??
          this.state.storageUsageBytes + optimized.blob.size,
        maxStorageBytes: created.maxStorageBytes ?? this.state.maxStorageBytes,
        isUploading: false,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo subir el archivo multimedia.", {
        isUploading: false,
      });
    }
  }

  public async updateItemMetadata(
    input: UpdateMediaMetadataInput,
  ): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.patch) {
      return;
    }

    try {
      const response = await this.fetcher.patch<{ item: AdminMediaItemRecord }>(
        ADMIN_MEDIA_ENDPOINTS.MEDIA,
        input,
        headers,
      );
      if (response?.item) {
        this.updateState({
          items: this.state.items.map((item) =>
            item.id === input.id ? response.item : item,
          ),
          error: null,
        });
      }
    } catch (error) {
      this.handleApiError(error, "No se pudo actualizar el elemento.");
    }
  }

  public async moveItem(id: string, direction: "up" | "down"): Promise<void> {
    const standItems = this.getSelectedItems();
    const index = standItems.findIndex((item) => item.id === id);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= standItems.length) {
      return;
    }

    const reordered = [...standItems];
    const [moved] = reordered.splice(index, 1);
    if (!moved) {
      return;
    }
    reordered.splice(targetIndex, 0, moved);

    await this.reorderItems(
      this.state.selectedRoomId,
      this.state.selectedStandId,
      reordered.map((item) => item.id),
    );
  }

  public async reorderItems(
    roomId: RoomId,
    standId: StandId,
    orderedIds: readonly string[],
  ): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.patch) {
      return;
    }

    try {
      await this.fetcher.patch(
        ADMIN_MEDIA_ENDPOINTS.MEDIA,
        { roomId, standId, orderedIds },
        headers,
      );
      const orderLookup = new Map(orderedIds.map((id, idx) => [id, idx]));
      this.updateState({
        items: this.state.items.map((item) => {
          if (item.roomId === roomId && item.standId === standId) {
            const nextOrder = orderLookup.get(item.id);
            if (nextOrder !== undefined) {
              return { ...item, sortOrder: nextOrder };
            }
          }
          return item;
        }),
        error: null,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo reordenar el stand.");
    }
  }

  public async deleteItem(id: string): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.delete) {
      return;
    }

    try {
      const response = await this.fetcher.delete<MediaDeleteResponsePayload>(
        `${ADMIN_MEDIA_ENDPOINTS.MEDIA}?id=${encodeURIComponent(id)}`,
        headers,
      );
      this.updateState({
        items: this.state.items.filter((item) => item.id !== id),
        storageUsageBytes:
          response?.storageUsageBytes ?? this.state.storageUsageBytes,
        maxStorageBytes:
          response?.maxStorageBytes ?? this.state.maxStorageBytes,
        error: null,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo eliminar el elemento.");
    }
  }

  private buildAuthHeaders(): Record<string, string> | null {
    const token = this.getToken();
    if (!token) {
      this.onUnauthorized();
      return null;
    }
    return { Authorization: `Bearer ${token}` };
  }

  private handleApiError(
    error: unknown,
    fallbackMessage: string,
    extraPatch: Partial<AdminMediaState> = {},
  ): void {
    if (
      error instanceof AdminHttpError &&
      error.status === HTTP_STATUS_UNAUTHORIZED
    ) {
      this.updateState({ ...extraPatch, error: null });
      this.onUnauthorized();
      return;
    }
    const message = error instanceof Error ? error.message : fallbackMessage;
    this.updateState({ ...extraPatch, error: message });
  }

  private updateState(patch: Partial<AdminMediaState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
