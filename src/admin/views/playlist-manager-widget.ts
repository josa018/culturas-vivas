import { ROOM_CATALOG, RoomId } from "../../shared/room-catalog";
import {
  ADMIN_AUDIO_LIMITS,
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
} from "../constants";
import type {
  AdminAudioPlaybackMode,
  AdminAudioState,
  AdminAudioStore,
  AdminAudioTrackRecord,
} from "../audio-store";

const BYTES_PER_MIB = 1_048_576;
const PERCENT_MAX = 100;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

function formatMegabytes(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MIB);
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  const totalSeconds = Math.round(durationMs / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function createAudioFieldWithCounter(
  input: HTMLInputElement,
  fieldName: string,
  maxLength: number,
): { wrapper: HTMLElement; syncCounter: () => void } {
  input.maxLength = maxLength;

  const wrapper = document.createElement("div");
  wrapper.className = "cv-admin-media-field";

  const counter = document.createElement("span");
  counter.className = ADMIN_UI_CLASSES.MEDIA_FIELD_COUNTER;
  counter.setAttribute("data-audio-counter", fieldName);

  const syncCounter = () => {
    counter.textContent = `${input.value.length} / ${maxLength}`;
  };
  syncCounter();

  input.addEventListener("input", syncCounter);
  wrapper.append(input, counter);
  return { wrapper, syncCounter };
}

/**
 * Interactive /admin panel widget for managing per-room music playlists.
 */
export class PlaylistManagerWidget {
  private readonly store: AdminAudioStore;
  private container: HTMLElement | null = null;
  private quotaLabelEl: HTMLElement | null = null;
  private quotaFillEl: HTMLElement | null = null;
  private roomSelectEl: HTMLSelectElement | null = null;
  private modeSelectEl: HTMLSelectElement | null = null;
  private errorBannerEl: HTMLElement | null = null;
  private submitBtnEl: HTMLButtonElement | null = null;
  private listEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private editingTrackId: string | null = null;

  constructor(store: AdminAudioStore) {
    this.store = store;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const section = document.createElement("section");
    section.className = `${ADMIN_UI_CLASSES.CARD} ${ADMIN_UI_CLASSES.AUDIO_WIDGET}`;

    const header = document.createElement("div");
    header.className = ADMIN_UI_CLASSES.CARD_HEADER;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.AUDIO_SECTION_TITLE;

    const quotaContainer = document.createElement("div");
    quotaContainer.className = ADMIN_UI_CLASSES.MEDIA_QUOTA_BAR;
    const quotaLabel = document.createElement("span");
    quotaLabel.className = ADMIN_UI_CLASSES.MEDIA_QUOTA_LABEL;
    const quotaTrack = document.createElement("div");
    quotaTrack.className = "cv-admin-media-quota-track";
    const quotaFill = document.createElement("div");
    quotaFill.className = ADMIN_UI_CLASSES.MEDIA_QUOTA_FILL;
    quotaTrack.appendChild(quotaFill);
    quotaContainer.append(quotaLabel, quotaTrack);
    header.append(title, quotaContainer);

    const errorBanner = document.createElement("p");
    errorBanner.className = `${ADMIN_UI_CLASSES.ERROR_TEXT} ${ADMIN_UI_CLASSES.ERROR_HIDDEN}`;

    // Room + playback mode controls
    const controlsRow = document.createElement("div");
    controlsRow.className = ADMIN_UI_CLASSES.MEDIA_FILTERS;

    const roomSelect = document.createElement("select");
    roomSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    roomSelect.setAttribute("data-audio-filter", "room");
    roomSelect.setAttribute("aria-label", ADMIN_UI_TEXT.AUDIO_ROOM_LABEL);

    for (const roomEntry of Object.values(ROOM_CATALOG)) {
      const opt = document.createElement("option");
      opt.value = roomEntry.id;
      opt.textContent = roomEntry.title;
      roomSelect.appendChild(opt);
    }

    roomSelect.addEventListener("change", () => {
      this.editingTrackId = null;
      void this.store.setRoom(roomSelect.value as RoomId);
    });

    const modeSelect = document.createElement("select");
    modeSelect.className = `${ADMIN_UI_CLASSES.INPUT_TEXT} ${ADMIN_UI_CLASSES.AUDIO_MODE_SELECT}`;
    modeSelect.setAttribute("data-audio-control", "playback-mode");
    modeSelect.setAttribute(
      "aria-label",
      ADMIN_UI_TEXT.AUDIO_PLAYBACK_MODE_LABEL,
    );

    const seqOpt = document.createElement("option");
    seqOpt.value = "SEQUENTIAL";
    seqOpt.textContent = ADMIN_UI_TEXT.AUDIO_MODE_SEQUENTIAL;
    const shuffleOpt = document.createElement("option");
    shuffleOpt.value = "SHUFFLE";
    shuffleOpt.textContent = ADMIN_UI_TEXT.AUDIO_MODE_SHUFFLE;
    modeSelect.append(seqOpt, shuffleOpt);

    modeSelect.addEventListener("change", () => {
      void this.store.setPlaybackMode(
        this.store.getState().selectedRoomId,
        modeSelect.value as AdminAudioPlaybackMode,
      );
    });

    controlsRow.append(roomSelect, modeSelect);

    const guidance = document.createElement("p");
    guidance.className = ADMIN_UI_CLASSES.AUDIO_GUIDANCE;
    guidance.textContent = ADMIN_UI_TEXT.AUDIO_GUIDANCE_TEXT;

    // Upload form
    const form = document.createElement("form");
    form.className = ADMIN_UI_CLASSES.MEDIA_FORM;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".mp3,.m4a,audio/mpeg,audio/mp4";
    fileInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    fileInput.setAttribute("data-audio-upload", "file");
    fileInput.setAttribute("aria-label", ADMIN_UI_TEXT.AUDIO_FILE_LABEL);

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = ADMIN_UI_TEXT.AUDIO_TITLE_LABEL;
    titleInput.required = true;
    titleInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    titleInput.setAttribute("data-audio-upload", "title");
    const titleField = createAudioFieldWithCounter(
      titleInput,
      "title",
      ADMIN_AUDIO_LIMITS.MAX_TITLE_LENGTH,
    );

    const creditInput = document.createElement("input");
    creditInput.type = "text";
    creditInput.placeholder = ADMIN_UI_TEXT.AUDIO_CREDIT_LABEL;
    creditInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    creditInput.setAttribute("data-audio-upload", "artistCredit");
    const creditField = createAudioFieldWithCounter(
      creditInput,
      "artistCredit",
      ADMIN_AUDIO_LIMITS.MAX_CREDIT_LENGTH,
    );

    const licenseInput = document.createElement("input");
    licenseInput.type = "text";
    licenseInput.placeholder = ADMIN_UI_TEXT.AUDIO_LICENSE_LABEL;
    licenseInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    licenseInput.setAttribute("data-audio-upload", "licenseNote");
    const licenseField = createAudioFieldWithCounter(
      licenseInput,
      "licenseNote",
      ADMIN_AUDIO_LIMITS.MAX_LICENSE_LENGTH,
    );

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = ADMIN_UI_CLASSES.BUTTON_SUBMIT;
    submitBtn.textContent = ADMIN_UI_TEXT.AUDIO_UPLOAD_BTN;

    form.append(
      fileInput,
      titleField.wrapper,
      creditField.wrapper,
      licenseField.wrapper,
      submitBtn,
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const selectedFile = fileInput.files?.[0];
      if (!selectedFile) {
        return;
      }
      const state = this.store.getState();
      void this.store
        .uploadTrack({
          roomId: state.selectedRoomId,
          file: selectedFile,
          title: titleInput.value,
          artistCredit: creditInput.value,
          licenseNote: licenseInput.value,
        })
        .then(() => {
          if (!this.store.getState().error) {
            form.reset();
            titleField.syncCounter();
            creditField.syncCounter();
            licenseField.syncCounter();
          }
        });
    });

    const listEl = document.createElement("div");
    listEl.className = ADMIN_UI_CLASSES.MEDIA_LIST;

    section.append(header, errorBanner, controlsRow, guidance, form, listEl);
    parent.appendChild(section);

    this.container = section;
    this.quotaLabelEl = quotaLabel;
    this.quotaFillEl = quotaFill;
    this.roomSelectEl = roomSelect;
    this.modeSelectEl = modeSelect;
    this.errorBannerEl = errorBanner;
    this.submitBtnEl = submitBtn;
    this.listEl = listEl;

    this.unsubscribe = this.store.subscribe((state) => {
      this.renderState(state);
    });
  }

  private renderState(state: AdminAudioState): void {
    const usedMb = formatMegabytes(state.storageUsageBytes);
    const maxMb = formatMegabytes(state.maxStorageBytes);
    const percent =
      state.maxStorageBytes > 0
        ? Math.min(
            PERCENT_MAX,
            Math.round((state.storageUsageBytes / state.maxStorageBytes) * PERCENT_MAX),
          )
        : 0;

    if (this.quotaLabelEl) {
      this.quotaLabelEl.textContent = `${usedMb} MB / ${maxMb} MB (${percent}%)`;
    }
    if (this.quotaFillEl) {
      this.quotaFillEl.style.width = `${percent}%`;
    }

    if (this.roomSelectEl) {
      this.roomSelectEl.value = state.selectedRoomId;
    }
    if (this.modeSelectEl) {
      this.modeSelectEl.value = state.playbackMode;
    }

    if (this.errorBannerEl) {
      if (state.error) {
        this.errorBannerEl.textContent = state.error;
        this.errorBannerEl.classList.remove(ADMIN_UI_CLASSES.ERROR_HIDDEN);
      } else {
        this.errorBannerEl.textContent = "";
        this.errorBannerEl.classList.add(ADMIN_UI_CLASSES.ERROR_HIDDEN);
      }
    }

    if (this.submitBtnEl) {
      this.submitBtnEl.disabled = state.isUploading;
      this.submitBtnEl.textContent = state.isUploading
        ? ADMIN_UI_TEXT.AUDIO_UPLOADING_BTN
        : ADMIN_UI_TEXT.AUDIO_UPLOAD_BTN;
    }

    this.renderTrackList(state);
  }

  private renderTrackList(state: AdminAudioState): void {
    if (!this.listEl) {
      return;
    }
    if (state.tracks.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.textContent =
        state.selectedRoomId === RoomId.LOBBY
          ? ADMIN_UI_TEXT.AUDIO_LOBBY_EMPTY
          : ADMIN_UI_TEXT.AUDIO_EMPTY_PLAYLIST;
      this.listEl.replaceChildren(emptyMsg);
      return;
    }

    const sorted = [...state.tracks].sort((a, b) => a.sortOrder - b.sortOrder);
    const cards = sorted.map((track, idx) =>
      this.buildTrackCard(track, idx === 0, idx === sorted.length - 1),
    );
    this.listEl.replaceChildren(...cards);
  }

  private buildTrackCard(
    track: AdminAudioTrackRecord,
    isFirst: boolean,
    isLast: boolean,
  ): HTMLElement {
    const card = document.createElement("article");
    card.className = `${ADMIN_UI_CLASSES.MEDIA_ITEM_CARD} ${ADMIN_UI_CLASSES.AUDIO_TRACK_CARD}`;
    card.setAttribute("data-track-id", track.id);

    const preview = document.createElement("audio");
    preview.controls = true;
    preview.preload = "none";
    preview.className = ADMIN_UI_CLASSES.AUDIO_PLAYER_PREVIEW;
    preview.src = track.mediaUrl;

    const info = document.createElement("div");
    info.className = "cv-admin-media-item-info";

    const titleEl = document.createElement("strong");
    const durationLabel = formatDuration(track.durationMs);
    titleEl.textContent = durationLabel
      ? `${track.title} (${durationLabel})`
      : track.title;

    const mimeChip = document.createElement("span");
    mimeChip.className = ADMIN_UI_CLASSES.MEDIA_FORMAT_CHIP;
    mimeChip.textContent = track.mimeType;
    info.append(titleEl, mimeChip);

    const artistCredit = (track.artistCredit ?? "").trim();
    if (artistCredit.length > 0) {
      const creditEl = document.createElement("span");
      creditEl.textContent = `${ADMIN_UI_TEXT.AUDIO_CREDIT_PREFIX}${artistCredit}`;
      info.appendChild(creditEl);
    }
    const licenseNote = (track.licenseNote ?? "").trim();
    if (licenseNote.length > 0) {
      const licenseEl = document.createElement("span");
      licenseEl.textContent = `${ADMIN_UI_TEXT.AUDIO_LICENSE_PREFIX}${licenseNote}`;
      info.appendChild(licenseEl);
    }

    const actions = document.createElement("div");
    actions.className = ADMIN_UI_CLASSES.MEDIA_ITEM_ACTIONS;

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = ADMIN_UI_TEXT.MEDIA_MOVE_UP;
    upBtn.disabled = isFirst;
    upBtn.setAttribute("data-audio-action", "move-up");
    upBtn.setAttribute("data-track-id", track.id);
    upBtn.addEventListener("click", () => {
      void this.store.moveTrack(track.id, "up");
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = ADMIN_UI_TEXT.MEDIA_MOVE_DOWN;
    downBtn.disabled = isLast;
    downBtn.setAttribute("data-audio-action", "move-down");
    downBtn.setAttribute("data-track-id", track.id);
    downBtn.addEventListener("click", () => {
      void this.store.moveTrack(track.id, "down");
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = ADMIN_UI_TEXT.MEDIA_EDIT_BTN;
    editBtn.setAttribute("data-audio-action", "edit");
    editBtn.setAttribute("data-track-id", track.id);
    editBtn.addEventListener("click", () => {
      this.editingTrackId = this.editingTrackId === track.id ? null : track.id;
      this.renderTrackList(this.store.getState());
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = ADMIN_UI_TEXT.MEDIA_DELETE_BTN;
    deleteBtn.setAttribute("data-audio-action", "delete");
    deleteBtn.setAttribute("data-track-id", track.id);
    deleteBtn.addEventListener("click", () => {
      void this.store.deleteTrack(track.id);
    });

    actions.append(upBtn, downBtn, editBtn, deleteBtn);
    card.append(preview, info, actions);

    if (this.editingTrackId === track.id) {
      card.appendChild(this.buildInlineEditForm(track));
    }

    return card;
  }

  private buildInlineEditForm(track: AdminAudioTrackRecord): HTMLFormElement {
    const form = document.createElement("form");
    form.className = ADMIN_UI_CLASSES.MEDIA_EDIT_FORM;

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = track.title;
    titleInput.required = true;
    titleInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    const titleField = createAudioFieldWithCounter(
      titleInput,
      "edit-title",
      ADMIN_AUDIO_LIMITS.MAX_TITLE_LENGTH,
    );

    const creditInput = document.createElement("input");
    creditInput.type = "text";
    creditInput.value = track.artistCredit ?? "";
    creditInput.placeholder = ADMIN_UI_TEXT.AUDIO_CREDIT_LABEL;
    creditInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    const creditField = createAudioFieldWithCounter(
      creditInput,
      "edit-artistCredit",
      ADMIN_AUDIO_LIMITS.MAX_CREDIT_LENGTH,
    );

    const licenseInput = document.createElement("input");
    licenseInput.type = "text";
    licenseInput.value = track.licenseNote ?? "";
    licenseInput.placeholder = ADMIN_UI_TEXT.AUDIO_LICENSE_LABEL;
    licenseInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    const licenseField = createAudioFieldWithCounter(
      licenseInput,
      "edit-licenseNote",
      ADMIN_AUDIO_LIMITS.MAX_LICENSE_LENGTH,
    );

    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.textContent = ADMIN_UI_TEXT.MEDIA_SAVE_BTN;

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = ADMIN_UI_TEXT.MEDIA_CANCEL_BTN;
    cancelBtn.addEventListener("click", () => {
      this.editingTrackId = null;
      this.renderTrackList(this.store.getState());
    });

    form.append(
      titleField.wrapper,
      creditField.wrapper,
      licenseField.wrapper,
      saveBtn,
      cancelBtn,
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.editingTrackId = null;
      void this.store.updateTrackMetadata({
        id: track.id,
        title: titleInput.value,
        artistCredit: creditInput.value,
        licenseNote: licenseInput.value,
      });
    });

    return form;
  }

  public unmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.quotaLabelEl = null;
    this.quotaFillEl = null;
    this.roomSelectEl = null;
    this.modeSelectEl = null;
    this.errorBannerEl = null;
    this.submitBtnEl = null;
    this.listEl = null;
  }
}
