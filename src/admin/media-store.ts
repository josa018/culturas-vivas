import {
  isHalfSbsMediaType,
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
import { mapAdminErrorMessage } from "./admin-error-mapper";
import {
  AdminHttpError,
  createDefaultAdminFetcher,
  type AdminNetworkFetcher,
  type UploadProgressState,
} from "./admin-http-client";
import {
  ADMIN_MEDIA_ENDPOINTS,
  ADMIN_MEDIA_LIMITS,
  ADMIN_UI_TEXT,
} from "./constants";
import {
  createDefaultAdminDownloadTrigger,
  type AdminDownloadTrigger,
} from "./download-trigger";
import { AdminMediaProcessor } from "./media-processor";

export interface AdminMediaItemRecord extends StandMediaItem {
  readonly mediaKey?: string;
  readonly posterKey?: string | null;
  readonly fileSizeBytes?: number;
}

export type { UploadProgressState };

export interface AdminMediaState {
  readonly items: readonly AdminMediaItemRecord[];
  readonly isLoading: boolean;
  readonly isUploading: boolean;
  readonly uploadProgress: UploadProgressState | null;
  readonly error: string | null;
  readonly successMessage: string | null;
  readonly selectedRoomId: RoomId;
  readonly selectedStandId: StandId;
  readonly storageUsageBytes: number;
  readonly maxStorageBytes: number;
}

export interface UploadMediaInput {
  readonly roomId: RoomId;
  readonly standId: StandId;
  readonly file: Blob;
  readonly customPosterFile?: Blob | null;
  readonly posterSeekSeconds?: number;
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
  readonly posterKey?: string;
}

export interface AdminMediaStoreOptions {
  readonly getToken: () => string | null;
  readonly onUnauthorized: () => void;
  readonly fetcher?: AdminNetworkFetcher;
  readonly processor?: AdminMediaProcessor;
  readonly downloadTrigger?: AdminDownloadTrigger;
}

interface MediaDownloadResponsePayload {
  readonly downloadUrl?: string;
  readonly filename?: string;
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
  private readonly downloadTrigger: AdminDownloadTrigger;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: () => void;
  private readonly listeners = new Set<AdminMediaListener>();

  private state: AdminMediaState = {
    items: [],
    isLoading: false,
    isUploading: false,
    uploadProgress: null,
    error: null,
    successMessage: null,
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
    this.downloadTrigger =
      options.downloadTrigger ?? createDefaultAdminDownloadTrigger();
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
      successMessage: null,
    });
  }

  public setValidationError(message: string): void {
    this.updateState({ error: message, successMessage: null });
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

    this.updateState({ isLoading: true, error: null, successMessage: null });
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

    this.updateState({
      isUploading: true,
      uploadProgress: {
        percent: 5,
        stageLabel: ADMIN_UI_TEXT.UPLOAD_STAGE_PREPARING,
      },
      error: null,
      successMessage: null,
    });
    const emitUploadPercent = (rawPercent: number) => {
      const scaled = Math.min(
        95,
        Math.max(10, Math.round(10 + (rawPercent * 85) / 100)),
      );
      this.updateState({
        uploadProgress: {
          percent: scaled,
          stageLabel: ADMIN_UI_TEXT.UPLOAD_STAGE_UPLOADING,
        },
      });
    };
    try {
      const isVideo = isVideoMediaType(input.mediaKind);

      if (isVideo) {
        const preparedVideo =
          typeof this.processor.prepareMp4ForUpload === "function"
            ? (await this.processor.prepareMp4ForUpload(input.file)).file
            : input.file;

        let posterBlob: Blob;
        let posterMimeType: typeof ADMIN_MEDIA_LIMITS.OUTPUT_IMAGE_MIME;
        let videoWidth: number;
        let videoHeight: number;

        const isHalfSbs = isHalfSbsMediaType(input.mediaKind);

        if (input.customPosterFile) {
          if (typeof this.processor.optimizePosterImage === "function") {
            const customPoster = await this.processor.optimizePosterImage(
              input.customPosterFile,
            );
            posterBlob = customPoster.posterBlob;
            posterMimeType = customPoster.posterMimeType;
          } else {
            const customImg = await this.processor.optimizeImage(
              input.customPosterFile,
            );
            posterBlob = customImg.blob;
            posterMimeType = customImg.mimeType;
          }
          const extractedDims = await this.processor.extractVideoPoster(
            preparedVideo,
            input.posterSeekSeconds,
            { cropHalfSbsLeft: isHalfSbs },
          );
          videoWidth = extractedDims.videoWidth;
          videoHeight = extractedDims.videoHeight;
        } else {
          const extracted = await this.processor.extractVideoPoster(
            preparedVideo,
            input.posterSeekSeconds,
            { cropHalfSbsLeft: isHalfSbs },
          );
          posterBlob = extracted.posterBlob;
          posterMimeType = extracted.posterMimeType;
          videoWidth = extracted.videoWidth;
          videoHeight = extracted.videoHeight;
        }

        const presign = await this.fetcher.post<PresignResponsePayload>(
          ADMIN_MEDIA_ENDPOINTS.PRESIGN,
          {
            roomId: input.roomId,
            standId: input.standId,
            mediaKind: input.mediaKind,
            mimeType: "video/mp4",
            fileSizeBytes: preparedVideo.size,
            posterMimeType,
            posterSizeBytes: posterBlob.size,
          },
          headers,
        );

        emitUploadPercent(0);
        await this.fetcher.putBinary(
          presign.media.uploadUrl,
          preparedVideo,
          presign.media.headers,
          (progress) => emitUploadPercent(progress.percent),
        );
        this.updateState({
          uploadProgress: {
            percent: 96,
            stageLabel: ADMIN_UI_TEXT.UPLOAD_STAGE_SAVING,
          },
        });
        if (presign.poster) {
          await this.fetcher.putBinary(
            presign.poster.uploadUrl,
            posterBlob,
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
            fileSizeBytes: preparedVideo.size,
            width: videoWidth,
            height: videoHeight,
          },
          headers,
        );

        this.updateState({
          items: [...this.state.items, created.item],
          storageUsageBytes:
            created.storageUsageBytes ??
            this.state.storageUsageBytes + preparedVideo.size,
          maxStorageBytes:
            created.maxStorageBytes ?? this.state.maxStorageBytes,
          isUploading: false,
          uploadProgress: null,
          successMessage: ADMIN_UI_TEXT.MEDIA_SUCCESS_UPLOAD,
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

      emitUploadPercent(0);
      await this.fetcher.putBinary(
        presign.media.uploadUrl,
        optimized.blob,
        presign.media.headers,
        (progress) => emitUploadPercent(progress.percent),
      );

      this.updateState({
        uploadProgress: {
          percent: 96,
          stageLabel: ADMIN_UI_TEXT.UPLOAD_STAGE_SAVING,
        },
      });
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
        uploadProgress: null,
        successMessage: ADMIN_UI_TEXT.MEDIA_SUCCESS_UPLOAD,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo subir el archivo multimedia.", {
        isUploading: false,
        uploadProgress: null,
      });
    }
  }

  public async previewVideoPoster(
    file: Blob,
    seekSeconds?: number,
    isHalfSbs = false,
  ): Promise<Blob | null> {
    if (typeof this.processor.extractVideoPoster !== "function") {
      return null;
    }
    const extracted = await this.processor.extractVideoPoster(file, seekSeconds, {
      cropHalfSbsLeft: isHalfSbs,
    });
    return extracted.posterBlob;
  }

  public async replaceVideoPoster(id: string, posterFile: Blob): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.putBinary || !this.fetcher.patch) {
      return;
    }
    const targetItem = this.state.items.find((item) => item.id === id);
    if (!targetItem || !isVideoMediaType(targetItem.mediaType)) {
      this.updateState({
        error: "Hubo un error: solo se puede cambiar la miniatura de los videos.",
      });
      return;
    }

    this.updateState({ isUploading: true, error: null, successMessage: null });
    try {
      let posterBlob: Blob;
      let posterMimeType: typeof ADMIN_MEDIA_LIMITS.OUTPUT_IMAGE_MIME;
      if (typeof this.processor.optimizePosterImage === "function") {
        const optimizedPoster =
          await this.processor.optimizePosterImage(posterFile);
        posterBlob = optimizedPoster.posterBlob;
        posterMimeType = optimizedPoster.posterMimeType;
      } else {
        const optimizedImg = await this.processor.optimizeImage(posterFile);
        posterBlob = optimizedImg.blob;
        posterMimeType = optimizedImg.mimeType;
      }

      const presign = await this.fetcher.post<{
        poster?: PresignTargetPayload;
      }>(
        ADMIN_MEDIA_ENDPOINTS.PRESIGN,
        {
          posterOnly: true,
          roomId: targetItem.roomId,
          standId: targetItem.standId,
          posterMimeType,
          posterSizeBytes: posterBlob.size,
        },
        headers,
      );

      if (!presign.poster) {
        throw new Error(
          "Hubo un error al preparar la subida de la miniatura. Inténtalo de nuevo.",
        );
      }

      await this.fetcher.putBinary(
        presign.poster.uploadUrl,
        posterBlob,
        presign.poster.headers,
      );

      const response = await this.fetcher.patch<{ item: AdminMediaItemRecord }>(
        ADMIN_MEDIA_ENDPOINTS.MEDIA,
        {
          id,
          posterKey: presign.poster.key,
        },
        headers,
      );

      this.updateState({
        items: this.state.items.map((item) =>
          item.id === id && response?.item ? response.item : item,
        ),
        isUploading: false,
        successMessage: ADMIN_UI_TEXT.MEDIA_SUCCESS_POSTER,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo actualizar la miniatura.", {
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
          successMessage: ADMIN_UI_TEXT.MEDIA_SUCCESS_EDIT,
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
        successMessage: ADMIN_UI_TEXT.MEDIA_SUCCESS_REORDER,
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
        successMessage: ADMIN_UI_TEXT.MEDIA_SUCCESS_DELETE,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo eliminar el elemento.");
    }
  }

  public async requestDownload(id: string): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers) {
      return;
    }

    this.updateState({ error: null, successMessage: null });
    try {
      const payload = await this.fetcher.get<MediaDownloadResponsePayload>(
        `${ADMIN_MEDIA_ENDPOINTS.MEDIA}?downloadId=${encodeURIComponent(id)}`,
        headers,
      );
      if (!payload?.downloadUrl) {
        throw new Error(ADMIN_UI_TEXT.MEDIA_ERROR_DOWNLOAD);
      }
      this.downloadTrigger(payload.downloadUrl, payload.filename ?? "archivo");
      this.updateState({
        error: null,
        successMessage: ADMIN_UI_TEXT.MEDIA_SUCCESS_DOWNLOAD,
      });
    } catch (error) {
      this.handleApiError(error, ADMIN_UI_TEXT.MEDIA_ERROR_DOWNLOAD);
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
      this.updateState({ ...extraPatch, error: null, successMessage: null });
      this.onUnauthorized();
      return;
    }
    const message = mapAdminErrorMessage(error, fallbackMessage);
    this.updateState({ ...extraPatch, error: message, successMessage: null });
  }

  private updateState(patch: Partial<AdminMediaState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
