import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("chart.js", () => {
  class MockChart {
    static register = vi.fn();
    data: { labels: string[]; datasets: Array<{ data: number[] }> };
    update = vi.fn();
    destroy = vi.fn();
    constructor(
      _canvas: unknown,
      config: { data: { labels: string[]; datasets: Array<{ data: number[] }> } },
    ) {
      this.data = config.data;
    }
  }
  return {
    Chart: MockChart,
    BarController: class {},
    BarElement: class {},
    CategoryScale: class {},
    LinearScale: class {},
    Tooltip: class {},
  };
});
import {
  ADMIN_AUDIO_ENDPOINTS,
  ADMIN_AUDIO_LIMITS,
  ADMIN_HTTP_ERROR_TEXT,
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
  AdminAuthStore,
  AdminDashboardStore,
  AdminDashboardView,
  AdminHttpError,
  type AdminNetworkFetcher,
} from "../../src/admin/index";
import { AdminAudioStore } from "../../src/admin/audio-store";
import { PlaylistManagerWidget } from "../../src/admin/views/playlist-manager-widget";
import { RoomId } from "../../src/shared/room-catalog";

class StubAudioFetcher implements AdminNetworkFetcher {
  public getCalls: string[] = [];
  public postCalls: Array<{ url: string; body: unknown }> = [];
  public patchCalls: Array<{ url: string; body: unknown }> = [];
  public putCalls: Array<{ url: string; body: unknown }> = [];
  public deleteCalls: string[] = [];
  public putBinaryCalls: Array<{ url: string; size: number }> = [];

  public listResponse = {
    roomId: RoomId.LOBBY,
    playbackMode: "SEQUENTIAL" as const,
    tracks: [
      {
        id: "t1",
        roomId: RoomId.LOBBY,
        title: "Bienvenida Sierra",
        artistCredit: "Colectivo Sonora",
        licenseNote: "CC BY 4.0",
        mediaKey: "audio/lobby/t1.m4a",
        mediaUrl: "https://cdn.example/audio/lobby/t1.m4a",
        mimeType: "audio/mp4",
        fileSizeBytes: 1_200_000,
        durationMs: 95_000,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "t2",
        roomId: RoomId.LOBBY,
        title: "Brisa del Alba",
        artistCredit: "",
        licenseNote: "",
        mediaKey: "audio/lobby/t2.mp3",
        mediaUrl: "https://cdn.example/audio/lobby/t2.mp3",
        mimeType: "audio/mpeg",
        fileSizeBytes: 800_000,
        durationMs: 60_000,
        sortOrder: 1,
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    storageUsageBytes: 2_000_000,
    maxStorageBytes: 8_589_934_592,
  };

  async get<T = unknown>(url: string): Promise<T> {
    this.getCalls.push(url);
    return this.listResponse as unknown as T;
  }

  async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    this.postCalls.push({ url, body });
    if (url.includes("/presign")) {
      return {
        audio: {
          key: "audio/lobby/new.m4a",
          uploadUrl: "https://r2.example/put-audio",
          headers: { "Content-Type": "audio/mp4" },
        },
        storageUsageBytes: 2_000_000,
        maxStorageBytes: 8_589_934_592,
      } as unknown as T;
    }
    const createdTrack = {
      id: "t3",
      roomId: RoomId.LOBBY,
      title: "Danza de Lluvia",
      artistCredit: "Trío Nayar",
      licenseNote: "Archivo comunitario",
      mediaKey: "audio/lobby/new.m4a",
      mediaUrl: "https://cdn.example/audio/lobby/new.m4a",
      mimeType: "audio/mp4" as const,
      fileSizeBytes: 512,
      durationMs: 110_000,
      sortOrder: 2,
      createdAt: 3,
      updatedAt: 3,
    };
    this.listResponse = {
      ...this.listResponse,
      tracks: [...this.listResponse.tracks, createdTrack],
    };
    return {
      track: createdTrack,
      storageUsageBytes: 2_000_512,
      maxStorageBytes: 8_589_934_592,
    } as unknown as T;
  }

  async patch<T = unknown>(url: string, body?: unknown): Promise<T> {
    this.patchCalls.push({ url, body });
    const payload = body as Record<string, unknown>;
    if (Array.isArray(payload.orderedIds)) {
      const byId = new Map(this.listResponse.tracks.map((t) => [t.id, t]));
      return {
        roomId: payload.roomId,
        tracks: (payload.orderedIds as string[]).map((id, idx) => ({
          ...byId.get(id)!,
          sortOrder: idx,
        })),
      } as unknown as T;
    }
    return {
      track: {
        ...this.listResponse.tracks[0],
        title: (payload.title as string) ?? this.listResponse.tracks[0].title,
        artistCredit:
          (payload.artistCredit as string) ??
          this.listResponse.tracks[0].artistCredit,
        licenseNote:
          (payload.licenseNote as string) ??
          this.listResponse.tracks[0].licenseNote,
      },
    } as unknown as T;
  }

  async put<T = unknown>(url: string, body?: unknown): Promise<T> {
    this.putCalls.push({ url, body });
    return body as unknown as T;
  }

  async delete<T = unknown>(url: string): Promise<T> {
    this.deleteCalls.push(url);
    return {
      ok: true,
      id: "t2",
      storageUsageBytes: 1_200_000,
      maxStorageBytes: 8_589_934_592,
    } as unknown as T;
  }

  async putBinary(url: string, body: Blob): Promise<void> {
    this.putBinaryCalls.push({ url, size: body.size });
  }
}

describe("AdminAudioStore & PlaylistManagerWidget", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("uploads tracks with ROOM_AUDIO presign + duration probe, previews audio, reorders, edits playback mode, and deletes", async () => {
    const fetcher = new StubAudioFetcher();
    const probeDurationMs = vi.fn(async () => 110_000);
    const store = new AdminAudioStore({
      getToken: () => "jwt-token",
      onUnauthorized: vi.fn(),
      fetcher,
      probeDurationMs,
    });

    const widget = new PlaylistManagerWidget(store);
    widget.mount(root);
    await store.fetchPlaylist(RoomId.LOBBY);

    // Room selector includes LOBBY and guidance mentions -16 LUFS
    const roomSelect = root.querySelector(
      'select[data-audio-filter="room"]',
    ) as HTMLSelectElement;
    expect(roomSelect).not.toBeNull();
    expect(
      Array.from(roomSelect.options).some((o) => o.value === RoomId.LOBBY),
    ).toBe(true);
    expect(root.textContent).toContain("-16 LUFS");

    // Inline audio preview renders for tracks
    const previews = root.querySelectorAll("audio[controls]");
    expect(previews.length).toBe(2);
    expect((previews[0] as HTMLAudioElement).src).toContain(
      "https://cdn.example/audio/lobby/t1.m4a",
    );

    // Upload a new .m4a track via store
    const audioFile = new File(["mock-aac-bytes"], "danza.m4a", {
      type: "audio/mp4",
    });
    await store.uploadTrack({
      roomId: RoomId.LOBBY,
      file: audioFile,
      title: "Danza de Lluvia",
      artistCredit: "Trío Nayar",
      licenseNote: "Archivo comunitario",
    });

    expect(probeDurationMs).toHaveBeenCalledWith(audioFile);
    expect(fetcher.postCalls[0]?.body).toMatchObject({
      assetKind: "ROOM_AUDIO",
      roomId: RoomId.LOBBY,
      mimeType: "audio/mp4",
      fileSizeBytes: audioFile.size,
    });
    expect(fetcher.putBinaryCalls).toEqual([
      { url: "https://r2.example/put-audio", size: audioFile.size },
    ]);
    expect(fetcher.postCalls[1]?.body).toMatchObject({
      roomId: RoomId.LOBBY,
      title: "Danza de Lluvia",
      artistCredit: "Trío Nayar",
      licenseNote: "Archivo comunitario",
      durationMs: 110_000,
    });

    // Reject oversized file before calling presign
    const giantBlob = {
      size: ADMIN_AUDIO_LIMITS.MAX_AUDIO_BYTES + 1,
      type: "audio/mp4",
      name: "huge.m4a",
    } as unknown as File;
    await store.uploadTrack({
      roomId: RoomId.LOBBY,
      file: giantBlob,
      title: "Demasiado grande",
      artistCredit: "",
      licenseNote: "",
    });
    expect(store.getState().error).toBeTruthy();

    // Move track down via button click (UI reorder -> PATCH)
    const moveDownBtn = root.querySelector(
      '[data-audio-action="move-down"][data-track-id="t1"]',
    ) as HTMLButtonElement;
    expect(moveDownBtn).not.toBeNull();
    moveDownBtn.click();
    await vi.waitFor(() => {
      expect(fetcher.patchCalls.length).toBe(1);
    });
    expect(fetcher.patchCalls[0]?.body).toEqual({
      roomId: RoomId.LOBBY,
      orderedIds: ["t2", "t1", "t3"],
    });

    // Change playback mode selector to SHUFFLE -> PUT
    const modeSelect = root.querySelector(
      'select[data-audio-control="playback-mode"]',
    ) as HTMLSelectElement;
    expect(modeSelect).not.toBeNull();
    modeSelect.value = "SHUFFLE";
    modeSelect.dispatchEvent(new Event("change"));
    await vi.waitFor(() => {
      expect(fetcher.putCalls.length).toBe(1);
    });
    expect(fetcher.putCalls[0]?.body).toEqual({
      roomId: RoomId.LOBBY,
      playbackMode: "SHUFFLE",
    });

    // Delete track via compact ⋯ menu -> two-step inline confirmation -> DELETE
    const t2MoreBtn = root.querySelector(
      '[data-audio-action="more-actions"][data-track-id="t2"]',
    ) as HTMLButtonElement;
    expect(t2MoreBtn).not.toBeNull();
    t2MoreBtn.click();
    const deleteBtn = root.querySelector(
      '[data-audio-action="delete"][data-track-id="t2"]',
    ) as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    deleteBtn.click();
    expect(fetcher.deleteCalls.length).toBe(0);

    const confirmDeleteBtn = root.querySelector(
      '[data-audio-action="confirm-delete"][data-track-id="t2"]',
    ) as HTMLButtonElement;
    expect(confirmDeleteBtn).not.toBeNull();
    confirmDeleteBtn.click();
    await vi.waitFor(() => {
      expect(fetcher.deleteCalls.length).toBe(1);
    });
    expect(fetcher.deleteCalls[0]).toContain("id=t2");
  });

  it("PlaylistManagerWidget renders visible labels, friendly MP3/M4A chips, collapsible -16 LUFS details, validation, cancelable delete, and download button", async () => {
    const downloadTrigger = vi.fn();
    const fetcher = new StubAudioFetcher();
    const origGet = fetcher.get.bind(fetcher);
    fetcher.get = vi.fn(async (url: string) => {
      if (url.includes("downloadId=t1")) {
        return {
          downloadUrl: "https://r2.example/t1.m4a",
          filename: "bienvenida-sierra.m4a",
          expiresInSeconds: 300,
        } as never;
      }
      return origGet(url);
    });

    const store = new AdminAudioStore({
      getToken: () => "jwt-token",
      onUnauthorized: vi.fn(),
      fetcher,
      downloadTrigger,
    });
    const widget = new PlaylistManagerWidget(store);
    widget.mount(root);
    await store.fetchPlaylist(RoomId.LOBBY);

    // Visible labels for filters & inputs
    const labelsText = Array.from(root.querySelectorAll("label")).map(
      (l) => l.textContent,
    );
    expect(labelsText).toContain(ADMIN_UI_TEXT.AUDIO_ROOM_LABEL);
    expect(labelsText).toContain(ADMIN_UI_TEXT.AUDIO_PLAYBACK_MODE_LABEL);
    expect(labelsText).toContain(ADMIN_UI_TEXT.AUDIO_FILE_LABEL);
    expect(labelsText).toContain(ADMIN_UI_TEXT.AUDIO_TITLE_LABEL);

    // Audio upload uses modern custom file picker with SVG button
    const audioFileInput = root.querySelector(
      '[data-audio-upload="file"]',
    ) as HTMLInputElement;
    const audioPicker = audioFileInput.closest(
      `.${ADMIN_UI_CLASSES.FILE_PICKER}`,
    ) as HTMLElement;
    expect(audioPicker).not.toBeNull();
    expect(
      audioPicker.querySelector(`.${ADMIN_UI_CLASSES.FILE_PICKER_BTN} svg`),
    ).not.toBeNull();
    expect(
      audioPicker.querySelector('[data-file-name="true"]')?.textContent,
    ).toBe(ADMIN_UI_TEXT.FILE_PICKER_EMPTY);

    // Collapsible technical details preserves -16 LUFS and AAC-LC
    const detailsEl = root.querySelector("details");
    expect(detailsEl).not.toBeNull();
    expect(detailsEl?.textContent).toContain("-16 LUFS");

    // Friendly format chips instead of raw MIME strings
    const chips = Array.from(
      root.querySelectorAll(`.${ADMIN_UI_CLASSES.MEDIA_FORMAT_CHIP}`),
    ).map((el) => el.textContent);
    expect(chips).toEqual([
      ADMIN_UI_TEXT.AUDIO_FORMAT_M4A,
      ADMIN_UI_TEXT.AUDIO_FORMAT_MP3,
    ]);
    expect(root.textContent).not.toContain("audio/mp4");
    expect(root.textContent).not.toContain("audio/mpeg");

    // Empty-file form submit shows inline validation message
    const form = root.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(root.textContent).toContain(ADMIN_UI_TEXT.AUDIO_MISSING_FILE_ERROR);

    // Compact overflow menu hides Edit/Download/Delete until clicked; two-step delete cancel restores compact strip
    const t1MoreBtn = root.querySelector(
      '[data-audio-action="more-actions"][data-track-id="t1"]',
    ) as HTMLButtonElement;
    const t1Menu = root.querySelector(
      '[data-track-id="t1"] [role="menu"]',
    ) as HTMLElement;
    expect(t1MoreBtn).not.toBeNull();
    expect(t1Menu.hidden).toBe(true);
    t1MoreBtn.click();
    expect(t1Menu.hidden).toBe(false);

    const delBtn = root.querySelector(
      '[data-audio-action="delete"][data-track-id="t1"]',
    ) as HTMLButtonElement;
    delBtn.click();
    const cancelBtn = root.querySelector(
      '[data-audio-action="cancel-delete"][data-track-id="t1"]',
    ) as HTMLButtonElement;
    expect(cancelBtn).not.toBeNull();
    cancelBtn.click();
    expect(fetcher.deleteCalls.length).toBe(0);

    // Reorder aria-label and download action inside overflow menu
    const moveDownBtn = root.querySelector(
      '[data-audio-action="move-down"][data-track-id="t1"]',
    ) as HTMLButtonElement;
    expect(moveDownBtn.getAttribute("aria-label")).toBe(
      ADMIN_UI_TEXT.MEDIA_MOVE_DOWN_ARIA,
    );

    (
      root.querySelector(
        '[data-audio-action="more-actions"][data-track-id="t1"]',
      ) as HTMLButtonElement
    ).click();
    const dlBtn = root.querySelector(
      '[data-audio-action="download"][data-track-id="t1"]',
    ) as HTMLButtonElement;
    expect(dlBtn).not.toBeNull();
    dlBtn.click();
    await vi.waitFor(() => {
      expect(downloadTrigger).toHaveBeenCalledWith(
        "https://r2.example/t1.m4a",
        "bienvenida-sierra.m4a",
      );
    });
  });

  it("mounts a third playlists tab in AdminDashboardView and fetches lobby playlist when activated", async () => {
    const authStore = new AdminAuthStore();
    const dashboardStore = new AdminDashboardStore();
    const audioFetcher = new StubAudioFetcher();
    const audioStore = new AdminAudioStore({
      getToken: () => "jwt",
      onUnauthorized: vi.fn(),
      fetcher: audioFetcher,
    });
    const dashboard = new AdminDashboardView({
      authStore,
      dashboardStore,
      audioStore,
      onLogout: vi.fn(),
    });
    dashboard.mount(root);

    const playlistsTab = root.querySelector(
      '[data-admin-tab="playlists"]',
    ) as HTMLButtonElement;
    expect(playlistsTab).not.toBeNull();
    expect(playlistsTab.textContent).toBe(ADMIN_UI_TEXT.TAB_PLAYLISTS);

    playlistsTab.click();
    expect(dashboard.getActiveTab()).toBe("playlists");
    await vi.waitFor(() => {
      expect(audioFetcher.getCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("AdminAudioStore maps HTTP/network errors to plain Spanish and triggers presigned downloads", async () => {
    const downloadTrigger = vi.fn();
    const fetcher = new StubAudioFetcher();
    const getSpy = vi.spyOn(fetcher, "get").mockResolvedValueOnce({
      downloadUrl: "https://r2.example/audio-get",
      filename: "bienvenida-sierra.m4a",
      expiresInSeconds: 300,
    });

    const store = new AdminAudioStore({
      getToken: () => "jwt",
      onUnauthorized: vi.fn(),
      fetcher,
      downloadTrigger,
    });

    await store.requestDownload("t1");
    expect(getSpy).toHaveBeenCalledWith(
      `${ADMIN_AUDIO_ENDPOINTS.AUDIO}?downloadId=t1`,
      { Authorization: "Bearer jwt" },
    );
    expect(downloadTrigger).toHaveBeenCalledWith(
      "https://r2.example/audio-get",
      "bienvenida-sierra.m4a",
    );
    expect(store.getState().successMessage).toBe(
      ADMIN_UI_TEXT.AUDIO_SUCCESS_DOWNLOAD,
    );

    vi.spyOn(fetcher, "post").mockRejectedValueOnce(
      new AdminHttpError(413, "HTTP 413 from /api/admin/media/presign"),
    );
    await store.uploadTrack({
      roomId: RoomId.LOBBY,
      file: new File(["bytes"], "canto.mp3", { type: "audio/mpeg" }),
      title: "Canto",
      artistCredit: "",
      licenseNote: "",
    });
    expect(store.getState().error).toBe(
      ADMIN_HTTP_ERROR_TEXT.PAYLOAD_TOO_LARGE,
    );
    expect(store.getState().error).not.toContain("HTTP 413");
    expect(store.getState().error).not.toContain("/api/");
  });

  it("PlaylistManagerWidget renders real-time audio upload progress bar and hides it on completion", async () => {
    const fetcher = new StubAudioFetcher();
    let resolveUpload: (() => void) | null = null;
    fetcher.putBinary = async (
      _url: string,
      _body: Blob,
      _headers?: Record<string, string>,
      onProgress?: (p: { loaded: number; total: number; percent: number }) => void,
    ) => {
      onProgress?.({ loaded: 70, total: 100, percent: 70 });
      await new Promise<void>((resolve) => {
        resolveUpload = resolve;
      });
    };

    const store = new AdminAudioStore({
      getToken: () => "jwt",
      onUnauthorized: vi.fn(),
      fetcher,
      probeDurationMs: vi.fn(async () => 60_000),
    });
    const widget = new PlaylistManagerWidget(store);
    widget.mount(root);
    await store.fetchPlaylist(RoomId.LOBBY);

    const progressEl = root.querySelector(
      '[data-upload-progress="audio"]',
    ) as HTMLElement;
    expect(progressEl).not.toBeNull();
    expect(progressEl.hidden).toBe(true);

    const uploadPromise = store.uploadTrack({
      roomId: RoomId.LOBBY,
      file: new File(["audio"], "tema.mp3", { type: "audio/mpeg" }),
      title: "Tema de Sala",
      artistCredit: "",
      licenseNote: "",
    });

    await vi.waitFor(() => {
      expect(resolveUpload).not.toBeNull();
      expect(progressEl.hidden).toBe(false);
      expect(progressEl.getAttribute("aria-valuenow")).toBe("70");
      expect(progressEl.textContent).toContain("70%");
    });

    resolveUpload?.();
    await uploadPromise;
    expect(progressEl.hidden).toBe(true);
  });
});
