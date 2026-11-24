import { DEFAULT_ROOM_ID, RoomId } from "../shared/room-catalog";
import { mapAdminErrorMessage } from "./admin-error-mapper";
import {
  AdminHttpError,
  createDefaultAdminFetcher,
  type AdminNetworkFetcher,
  type UploadProgressState,
} from "./admin-http-client";
import {
  ADMIN_AUDIO_ENDPOINTS,
  ADMIN_AUDIO_LIMITS,
  ADMIN_MEDIA_LIMITS,
  ADMIN_UI_TEXT,
} from "./constants";
import {
  createDefaultAdminDownloadTrigger,
  type AdminDownloadTrigger,
} from "./download-trigger";

export type AdminAudioPlaybackMode = "SEQUENTIAL" | "SHUFFLE";

export interface AdminAudioTrackRecord {
  readonly id: string;
  readonly roomId: RoomId;
  readonly title: string;
  readonly artistCredit: string;
  readonly licenseNote: string;
  readonly mediaKey: string;
  readonly mediaUrl: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly durationMs: number | null;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AdminAudioState {
  readonly selectedRoomId: RoomId;
  readonly playbackMode: AdminAudioPlaybackMode;
  readonly tracks: readonly AdminAudioTrackRecord[];
  readonly isLoading: boolean;
  readonly isUploading: boolean;
  readonly uploadProgress: UploadProgressState | null;
  readonly error: string | null;
  readonly successMessage: string | null;
  readonly storageUsageBytes: number;
  readonly maxStorageBytes: number;
}

export interface UploadAudioTrackInput {
  readonly roomId: RoomId;
  readonly file: Blob;
  readonly title: string;
  readonly artistCredit: string;
  readonly licenseNote: string;
}

export interface UpdateAudioTrackMetadataInput {
  readonly id: string;
  readonly title?: string;
  readonly artistCredit?: string;
  readonly licenseNote?: string;
}

export type AudioDurationProbe = (file: Blob) => Promise<number | null>;

export interface AdminAudioStoreOptions {
  readonly getToken: () => string | null;
  readonly onUnauthorized: () => void;
  readonly fetcher?: AdminNetworkFetcher;
  readonly probeDurationMs?: AudioDurationProbe;
  readonly downloadTrigger?: AdminDownloadTrigger;
}

interface AudioDownloadResponsePayload {
  readonly downloadUrl?: string;
  readonly filename?: string;
}

interface PresignAudioTarget {
  readonly key: string;
  readonly uploadUrl: string;
  readonly headers: Record<string, string>;
}

interface PresignAudioResponsePayload {
  readonly audio: PresignAudioTarget;
  readonly storageUsageBytes?: number;
  readonly maxStorageBytes?: number;
}

interface AudioListResponsePayload {
  readonly roomId?: RoomId;
  readonly playbackMode?: AdminAudioPlaybackMode;
  readonly tracks?: AdminAudioTrackRecord[];
  readonly storageUsageBytes?: number;
  readonly maxStorageBytes?: number;
}

interface AudioTrackResponsePayload {
  readonly track: AdminAudioTrackRecord;
  readonly storageUsageBytes?: number;
  readonly maxStorageBytes?: number;
}

interface AudioReorderResponsePayload {
  readonly roomId: RoomId;
  readonly tracks: AdminAudioTrackRecord[];
}

interface AudioDeleteResponsePayload {
  readonly storageUsageBytes?: number;
  readonly maxStorageBytes?: number;
}

export type AdminAudioListener = (state: AdminAudioState) => void;

const HTTP_STATUS_UNAUTHORIZED = 401;
const DURATION_PROBE_TIMEOUT_MS = 3000;
const MS_PER_SECOND = 1000;

function resolveCanonicalAudioMime(
  file: Blob,
): "audio/mpeg" | "audio/mp4" | null {
  const mime = (file.type || "").toLowerCase().trim();
  const fileName =
    "name" in file && typeof (file as File).name === "string"
      ? (file as File).name.toLowerCase()
      : "";

  if (mime === "audio/mpeg" || mime === "audio/mp3" || fileName.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (
    mime === "audio/mp4" ||
    mime === "audio/x-m4a" ||
    mime === "audio/m4a" ||
    fileName.endsWith(".m4a")
  ) {
    return "audio/mp4";
  }
  return null;
}

export function createDefaultAudioDurationProbe(): AudioDurationProbe {
  return (file: Blob) =>
    new Promise((resolve) => {
      if (
        typeof document === "undefined" ||
        typeof URL === "undefined" ||
        typeof URL.createObjectURL !== "function"
      ) {
        resolve(null);
        return;
      }

      const audio = document.createElement("audio");
      const objectUrl = URL.createObjectURL(file);
      let settled = false;

      const finish = (value: number | null) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        audio.removeEventListener("loadedmetadata", onMetadata);
        audio.removeEventListener("error", onError);
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(objectUrl);
        }
        resolve(value);
      };

      const onMetadata = () => {
        const seconds = audio.duration;
        if (Number.isFinite(seconds) && seconds > 0) {
          finish(Math.round(seconds * MS_PER_SECOND));
        } else {
          finish(null);
        }
      };

      const onError = () => finish(null);

      const timer = setTimeout(() => finish(null), DURATION_PROBE_TIMEOUT_MS);
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", onMetadata);
      audio.addEventListener("error", onError);
      audio.src = objectUrl;
    });
}

export class AdminAudioStore {
  private readonly fetcher: AdminNetworkFetcher;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: () => void;
  private readonly probeDurationMs: AudioDurationProbe;
  private readonly downloadTrigger: AdminDownloadTrigger;
  private readonly listeners = new Set<AdminAudioListener>();

  private state: AdminAudioState = {
    selectedRoomId: DEFAULT_ROOM_ID,
    playbackMode: "SEQUENTIAL",
    tracks: [],
    isLoading: false,
    isUploading: false,
    uploadProgress: null,
    error: null,
    successMessage: null,
    storageUsageBytes: 0,
    maxStorageBytes: ADMIN_MEDIA_LIMITS.MAX_TOTAL_BYTES,
  };

  constructor(options: AdminAudioStoreOptions) {
    this.getToken = options.getToken;
    this.onUnauthorized = options.onUnauthorized;
    this.fetcher = options.fetcher ?? createDefaultAdminFetcher();
    this.probeDurationMs =
      options.probeDurationMs ?? createDefaultAudioDurationProbe();
    this.downloadTrigger =
      options.downloadTrigger ?? createDefaultAdminDownloadTrigger();
  }

  public getState(): AdminAudioState {
    return this.state;
  }

  public subscribe(listener: AdminAudioListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async setRoom(roomId: RoomId): Promise<void> {
    this.updateState({ selectedRoomId: roomId, error: null, successMessage: null });
    await this.fetchPlaylist(roomId);
  }

  public setValidationError(message: string): void {
    this.updateState({ error: message, successMessage: null });
  }

  public async fetchPlaylist(
    roomId: RoomId = this.state.selectedRoomId,
  ): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers) {
      return;
    }

    this.updateState({ isLoading: true, error: null, successMessage: null });
    try {
      const payload = await this.fetcher.get<AudioListResponsePayload>(
        `${ADMIN_AUDIO_ENDPOINTS.AUDIO}?roomId=${encodeURIComponent(roomId)}`,
        headers,
      );
      const sortedTracks = Array.isArray(payload.tracks)
        ? [...payload.tracks].sort((a, b) => a.sortOrder - b.sortOrder)
        : [];
      this.updateState({
        selectedRoomId: roomId,
        playbackMode: payload.playbackMode ?? "SEQUENTIAL",
        tracks: sortedTracks,
        storageUsageBytes: payload.storageUsageBytes ?? this.state.storageUsageBytes,
        maxStorageBytes:
          payload.maxStorageBytes ?? ADMIN_MEDIA_LIMITS.MAX_TOTAL_BYTES,
        isLoading: false,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo cargar la playlist de la sala.", {
        isLoading: false,
      });
    }
  }

  public async uploadTrack(input: UploadAudioTrackInput): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.putBinary) {
      return;
    }

    const mimeType = resolveCanonicalAudioMime(input.file);
    if (!mimeType) {
      this.updateState({
        error: "Formato no compatible. Usa únicamente archivos .mp3 o .m4a (AAC).",
      });
      return;
    }
    if (
      !Number.isFinite(input.file.size) ||
      input.file.size <= 0 ||
      input.file.size > ADMIN_AUDIO_LIMITS.MAX_AUDIO_BYTES
    ) {
      this.updateState({
        error: "El archivo de audio debe pesar entre 1 byte y 20 MiB.",
      });
      return;
    }

    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length === 0) {
      this.updateState({ error: "El título de la pista es obligatorio." });
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
      const durationMs = await this.probeDurationMs(input.file);
      const presign = await this.fetcher.post<PresignAudioResponsePayload>(
        ADMIN_AUDIO_ENDPOINTS.PRESIGN,
        {
          assetKind: "ROOM_AUDIO",
          roomId: input.roomId,
          mimeType,
          fileSizeBytes: input.file.size,
        },
        headers,
      );

      emitUploadPercent(0);
      await this.fetcher.putBinary(
        presign.audio.uploadUrl,
        input.file,
        presign.audio.headers,
        (progress) => emitUploadPercent(progress.percent),
      );

      this.updateState({
        uploadProgress: {
          percent: 96,
          stageLabel: ADMIN_UI_TEXT.UPLOAD_STAGE_SAVING,
        },
      });
      const created = await this.fetcher.post<AudioTrackResponsePayload>(
        ADMIN_AUDIO_ENDPOINTS.AUDIO,
        {
          roomId: input.roomId,
          title: trimmedTitle,
          artistCredit: input.artistCredit.trim(),
          licenseNote: input.licenseNote.trim(),
          mediaKey: presign.audio.key,
          mimeType,
          fileSizeBytes: input.file.size,
          durationMs,
        },
        headers,
      );

      const nextTracks =
        input.roomId === this.state.selectedRoomId
          ? [...this.state.tracks, created.track].sort(
              (a, b) => a.sortOrder - b.sortOrder,
            )
          : this.state.tracks;

      this.updateState({
        tracks: nextTracks,
        storageUsageBytes:
          created.storageUsageBytes ??
          this.state.storageUsageBytes + input.file.size,
        maxStorageBytes: created.maxStorageBytes ?? this.state.maxStorageBytes,
        isUploading: false,
        uploadProgress: null,
        successMessage: ADMIN_UI_TEXT.AUDIO_SUCCESS_UPLOAD,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo subir la pista de audio.", {
        isUploading: false,
        uploadProgress: null,
      });
    }
  }

  public async moveTrack(
    id: string,
    direction: "up" | "down",
  ): Promise<void> {
    const ordered = [...this.state.tracks].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const index = ordered.findIndex((t) => t.id === id);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) {
      return;
    }
    const swapped = [...ordered];
    const current = swapped[index];
    const adjacent = swapped[targetIndex];
    if (!current || !adjacent) {
      return;
    }
    swapped[index] = adjacent;
    swapped[targetIndex] = current;

    await this.reorderTracks(
      this.state.selectedRoomId,
      swapped.map((t) => t.id),
    );
  }

  public async reorderTracks(
    roomId: RoomId,
    orderedIds: readonly string[],
  ): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.patch) {
      return;
    }

    try {
      const response = await this.fetcher.patch<AudioReorderResponsePayload>(
        ADMIN_AUDIO_ENDPOINTS.AUDIO,
        { roomId, orderedIds },
        headers,
      );
      if (roomId === this.state.selectedRoomId) {
        const nextTracks = Array.isArray(response?.tracks)
          ? [...response.tracks].sort((a, b) => a.sortOrder - b.sortOrder)
          : this.state.tracks;
        this.updateState({
          tracks: nextTracks,
          error: null,
          successMessage: ADMIN_UI_TEXT.AUDIO_SUCCESS_REORDER,
        });
      }
    } catch (error) {
      this.handleApiError(error, "No se pudo reordenar la playlist.");
    }
  }

  public async updateTrackMetadata(
    input: UpdateAudioTrackMetadataInput,
  ): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.patch) {
      return;
    }

    try {
      const response = await this.fetcher.patch<AudioTrackResponsePayload>(
        ADMIN_AUDIO_ENDPOINTS.AUDIO,
        input,
        headers,
      );
      if (response?.track) {
        this.updateState({
          tracks: this.state.tracks.map((track) =>
            track.id === input.id ? response.track : track,
          ),
          error: null,
          successMessage: ADMIN_UI_TEXT.AUDIO_SUCCESS_EDIT,
        });
      }
    } catch (error) {
      this.handleApiError(error, "No se pudieron guardar los cambios de la pista.");
    }
  }

  public async setPlaybackMode(
    roomId: RoomId,
    playbackMode: AdminAudioPlaybackMode,
  ): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.put) {
      return;
    }

    try {
      await this.fetcher.put(
        ADMIN_AUDIO_ENDPOINTS.AUDIO,
        { roomId, playbackMode },
        headers,
      );
      if (roomId === this.state.selectedRoomId) {
        this.updateState({
          playbackMode,
          error: null,
          successMessage: ADMIN_UI_TEXT.AUDIO_SUCCESS_MODE,
        });
      }
    } catch (error) {
      this.handleApiError(
        error,
        "No se pudo actualizar el modo de reproducción.",
      );
    }
  }

  public async deleteTrack(id: string): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers || !this.fetcher.delete) {
      return;
    }

    try {
      const response = await this.fetcher.delete<AudioDeleteResponsePayload>(
        `${ADMIN_AUDIO_ENDPOINTS.AUDIO}?id=${encodeURIComponent(id)}`,
        headers,
      );
      this.updateState({
        tracks: this.state.tracks.filter((track) => track.id !== id),
        storageUsageBytes:
          response?.storageUsageBytes ?? this.state.storageUsageBytes,
        maxStorageBytes:
          response?.maxStorageBytes ?? this.state.maxStorageBytes,
        error: null,
        successMessage: ADMIN_UI_TEXT.AUDIO_SUCCESS_DELETE,
      });
    } catch (error) {
      this.handleApiError(error, "No se pudo eliminar la pista.");
    }
  }

  public async requestDownload(id: string): Promise<void> {
    const headers = this.buildAuthHeaders();
    if (!headers) {
      return;
    }

    this.updateState({ error: null, successMessage: null });
    try {
      const payload = await this.fetcher.get<AudioDownloadResponsePayload>(
        `${ADMIN_AUDIO_ENDPOINTS.AUDIO}?downloadId=${encodeURIComponent(id)}`,
        headers,
      );
      if (!payload?.downloadUrl) {
        throw new Error(ADMIN_UI_TEXT.AUDIO_ERROR_DOWNLOAD);
      }
      this.downloadTrigger(payload.downloadUrl, payload.filename ?? "pista.mp3");
      this.updateState({
        error: null,
        successMessage: ADMIN_UI_TEXT.AUDIO_SUCCESS_DOWNLOAD,
      });
    } catch (error) {
      this.handleApiError(error, ADMIN_UI_TEXT.AUDIO_ERROR_DOWNLOAD);
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
    extraPatch: Partial<AdminAudioState> = {},
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

  private updateState(patch: Partial<AdminAudioState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
