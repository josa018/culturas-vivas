import { ROOM_CATALOG, RoomId } from "../../shared/room-catalog";
import {
  ADMIN_AUDIO_LIMITS,
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
} from "../constants";
import type { UploadProgressState } from "../admin-http-client";
import type {
  AdminAudioPlaybackMode,
  AdminAudioState,
  AdminAudioStore,
  AdminAudioTrackRecord,
} from "../audio-store";
import {
  createCounterField,
  createInlineDeleteControls,
  createLabeledField,
  createModernFileInput,
  createStatusBanners,
  createTechnicalHintDetails,
  createUploadProgressBar,
} from "./admin-form-helpers";

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

function getFriendlyAudioFormatLabel(mimeType: string): string {
  return mimeType.toLowerCase().includes("mp4")
    ? ADMIN_UI_TEXT.AUDIO_FORMAT_M4A
    : ADMIN_UI_TEXT.AUDIO_FORMAT_MP3;
}

/**
 * Interactive /admin panel widget for managing, previewing, and downloading per-room music playlists.
 */
export class PlaylistManagerWidget {
  private readonly store: AdminAudioStore;
  private container: HTMLElement | null = null;
  private quotaLabelEl: HTMLElement | null = null;
  private quotaFillEl: HTMLElement | null = null;
  private roomSelectEl: HTMLSelectElement | null = null;
  private modeSelectEl: HTMLSelectElement | null = null;
  private syncProgressFn: ((progress: UploadProgressState | null) => void) | null =
    null;
  private syncBannersFn:
    | ((error: string | null, success: string | null) => void)
    | null = null;
  private submitBtnEl: HTMLButtonElement | null = null;
  private listEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private editingTrackId: string | null = null;
  private confirmingDeleteId: string | null = null;

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

    const titleGroup = document.createElement("div");
    titleGroup.className = ADMIN_UI_CLASSES.CARD_TITLE_GROUP;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.AUDIO_SECTION_TITLE;

    const subtitle = document.createElement("p");
    subtitle.className = ADMIN_UI_CLASSES.CARD_SUBTITLE;
    subtitle.textContent = ADMIN_UI_TEXT.AUDIO_SECTION_SUBTITLE;

    titleGroup.append(title, subtitle);

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
    header.append(titleGroup, quotaContainer);

    const { errorBanner, successBanner, syncBanners } = createStatusBanners();
    this.syncBannersFn = syncBanners;

    // Room + playback mode controls with visible labels
    const controlsRow = document.createElement("div");
    controlsRow.className = ADMIN_UI_CLASSES.MEDIA_FILTERS;

    const roomSelect = document.createElement("select");
    roomSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    roomSelect.setAttribute("data-audio-filter", "room");

    for (const roomEntry of Object.values(ROOM_CATALOG)) {
      const opt = document.createElement("option");
      opt.value = roomEntry.id;
      opt.textContent = roomEntry.title;
      roomSelect.appendChild(opt);
    }

    roomSelect.addEventListener("change", () => {
      this.editingTrackId = null;
      this.confirmingDeleteId = null;
      void this.store.setRoom(roomSelect.value as RoomId);
    });

    const modeSelect = document.createElement("select");
    modeSelect.className = `${ADMIN_UI_CLASSES.INPUT_TEXT} ${ADMIN_UI_CLASSES.AUDIO_MODE_SELECT}`;
    modeSelect.setAttribute("data-audio-control", "playback-mode");

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

    controlsRow.append(
      createLabeledField({
        id: "cv-audio-filter-room",
        labelText: ADMIN_UI_TEXT.AUDIO_ROOM_LABEL,
        control: roomSelect,
      }),
      createLabeledField({
        id: "cv-audio-playback-mode",
        labelText: ADMIN_UI_TEXT.AUDIO_PLAYBACK_MODE_LABEL,
        control: modeSelect,
      }),
    );

    const techDetails = createTechnicalHintDetails(
      ADMIN_UI_TEXT.AUDIO_TECH_HINT_SUMMARY,
      ADMIN_UI_TEXT.AUDIO_TECH_HINT_BODY,
    );

    // Upload form
    const form = document.createElement("form");
    form.className = ADMIN_UI_CLASSES.MEDIA_FORM;
    form.noValidate = true;

    const filePicker = createModernFileInput({
      id: "cv-audio-upload-file",
      accept: ".mp3,.m4a,audio/mpeg,audio/mp4",
      dataAttrName: "data-audio-upload",
      dataAttrValue: "file",
      form,
    });
    const fileInput = filePicker.input;

    const fileField = createLabeledField({
      id: "cv-audio-upload-file",
      labelText: ADMIN_UI_TEXT.AUDIO_FILE_LABEL,
      control: filePicker.wrapper,
      controlTargetForId: fileInput,
    });

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = ADMIN_UI_TEXT.AUDIO_TITLE_PLACEHOLDER;
    titleInput.required = true;
    titleInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    titleInput.setAttribute("data-audio-upload", "title");
    const titleField = createCounterField({
      id: "cv-audio-upload-title",
      labelText: ADMIN_UI_TEXT.AUDIO_TITLE_LABEL,
      input: titleInput,
      counterAttrName: "data-audio-counter",
      counterAttrValue: "title",
      maxLength: ADMIN_AUDIO_LIMITS.MAX_TITLE_LENGTH,
    });

    const creditInput = document.createElement("input");
    creditInput.type = "text";
    creditInput.placeholder = ADMIN_UI_TEXT.AUDIO_CREDIT_PLACEHOLDER;
    creditInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    creditInput.setAttribute("data-audio-upload", "artistCredit");
    const creditField = createCounterField({
      id: "cv-audio-upload-credit",
      labelText: ADMIN_UI_TEXT.AUDIO_CREDIT_LABEL,
      input: creditInput,
      counterAttrName: "data-audio-counter",
      counterAttrValue: "artistCredit",
      maxLength: ADMIN_AUDIO_LIMITS.MAX_CREDIT_LENGTH,
    });

    const licenseInput = document.createElement("input");
    licenseInput.type = "text";
    licenseInput.placeholder = ADMIN_UI_TEXT.AUDIO_LICENSE_PLACEHOLDER;
    licenseInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    licenseInput.setAttribute("data-audio-upload", "licenseNote");
    const licenseField = createCounterField({
      id: "cv-audio-upload-license",
      labelText: ADMIN_UI_TEXT.AUDIO_LICENSE_LABEL,
      input: licenseInput,
      counterAttrName: "data-audio-counter",
      counterAttrValue: "licenseNote",
      maxLength: ADMIN_AUDIO_LIMITS.MAX_LICENSE_LENGTH,
    });

    const progressBar = createUploadProgressBar("audio");
    this.syncProgressFn = progressBar.syncProgress;

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = `${ADMIN_UI_CLASSES.BUTTON_SUBMIT} ${ADMIN_UI_CLASSES.MEDIA_FORM_FULL}`;
    submitBtn.textContent = ADMIN_UI_TEXT.AUDIO_UPLOAD_BTN;

    form.append(
      fileField,
      titleField.wrapper,
      creditField.wrapper,
      licenseField.wrapper,
      techDetails,
      progressBar.container,
      submitBtn,
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const selectedFile = fileInput.files?.[0];
      if (!selectedFile) {
        this.store.setValidationError(ADMIN_UI_TEXT.AUDIO_MISSING_FILE_ERROR);
        return;
      }
      if (!titleInput.value.trim()) {
        this.store.setValidationError(ADMIN_UI_TEXT.AUDIO_MISSING_TITLE_ERROR);
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
            filePicker.syncFileName();
            titleField.syncCounter();
            creditField.syncCounter();
            licenseField.syncCounter();
          }
        });
    });

    const listEl = document.createElement("div");
    listEl.className = ADMIN_UI_CLASSES.MEDIA_LIST;

    section.append(
      header,
      errorBanner,
      successBanner,
      controlsRow,
      form,
      listEl,
    );
    parent.appendChild(section);

    this.container = section;
    this.quotaLabelEl = quotaLabel;
    this.quotaFillEl = quotaFill;
    this.roomSelectEl = roomSelect;
    this.modeSelectEl = modeSelect;
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
            Math.round(
              (state.storageUsageBytes / state.maxStorageBytes) * PERCENT_MAX,
            ),
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

    this.syncBannersFn?.(state.error, state.successMessage);
    this.syncProgressFn?.(state.uploadProgress);

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
    mimeChip.textContent = getFriendlyAudioFormatLabel(track.mimeType);
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
    upBtn.setAttribute("aria-label", ADMIN_UI_TEXT.MEDIA_MOVE_UP_ARIA);
    upBtn.addEventListener("click", () => {
      void this.store.moveTrack(track.id, "up");
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = ADMIN_UI_TEXT.MEDIA_MOVE_DOWN;
    downBtn.disabled = isLast;
    downBtn.setAttribute("data-audio-action", "move-down");
    downBtn.setAttribute("data-track-id", track.id);
    downBtn.setAttribute("aria-label", ADMIN_UI_TEXT.MEDIA_MOVE_DOWN_ARIA);
    downBtn.addEventListener("click", () => {
      void this.store.moveTrack(track.id, "down");
    });

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = ADMIN_UI_CLASSES.BUTTON_DOWNLOAD;
    downloadBtn.textContent = ADMIN_UI_TEXT.MEDIA_DOWNLOAD_BTN;
    downloadBtn.setAttribute("data-audio-action", "download");
    downloadBtn.setAttribute("data-track-id", track.id);
    downloadBtn.addEventListener("click", () => {
      void this.store.requestDownload(track.id);
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = ADMIN_UI_TEXT.MEDIA_EDIT_BTN;
    editBtn.setAttribute("data-audio-action", "edit");
    editBtn.setAttribute("data-track-id", track.id);
    editBtn.addEventListener("click", () => {
      this.confirmingDeleteId = null;
      this.editingTrackId = this.editingTrackId === track.id ? null : track.id;
      this.renderTrackList(this.store.getState());
    });

    const deleteControl = createInlineDeleteControls({
      itemId: track.id,
      isConfirming: this.confirmingDeleteId === track.id,
      actionAttr: "data-audio-action",
      idAttr: "data-track-id",
      promptText: ADMIN_UI_TEXT.AUDIO_DELETE_CONFIRM_PROMPT,
      deleteLabel: ADMIN_UI_TEXT.MEDIA_DELETE_BTN,
      confirmLabel: ADMIN_UI_TEXT.MEDIA_DELETE_CONFIRM_BTN,
      cancelLabel: ADMIN_UI_TEXT.MEDIA_CANCEL_BTN,
      onRequestConfirm: () => {
        this.confirmingDeleteId = track.id;
        this.renderTrackList(this.store.getState());
      },
      onConfirm: () => {
        this.confirmingDeleteId = null;
        void this.store.deleteTrack(track.id);
      },
      onCancel: () => {
        this.confirmingDeleteId = null;
        this.renderTrackList(this.store.getState());
      },
    });

    actions.append(upBtn, downBtn, downloadBtn, editBtn, deleteControl);
    card.append(preview, info, actions);

    if (this.editingTrackId === track.id) {
      card.appendChild(this.buildInlineEditForm(track));
    }

    return card;
  }

  private buildInlineEditForm(track: AdminAudioTrackRecord): HTMLFormElement {
    const form = document.createElement("form");
    form.className = ADMIN_UI_CLASSES.MEDIA_EDIT_FORM;
    form.noValidate = true;

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = track.title;
    titleInput.placeholder = ADMIN_UI_TEXT.AUDIO_TITLE_PLACEHOLDER;
    titleInput.required = true;
    titleInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    const titleField = createCounterField({
      id: `cv-audio-edit-title-${track.id}`,
      labelText: ADMIN_UI_TEXT.AUDIO_TITLE_LABEL,
      input: titleInput,
      counterAttrName: "data-audio-counter",
      counterAttrValue: "edit-title",
      maxLength: ADMIN_AUDIO_LIMITS.MAX_TITLE_LENGTH,
    });

    const creditInput = document.createElement("input");
    creditInput.type = "text";
    creditInput.value = track.artistCredit ?? "";
    creditInput.placeholder = ADMIN_UI_TEXT.AUDIO_CREDIT_PLACEHOLDER;
    creditInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    const creditField = createCounterField({
      id: `cv-audio-edit-credit-${track.id}`,
      labelText: ADMIN_UI_TEXT.AUDIO_CREDIT_LABEL,
      input: creditInput,
      counterAttrName: "data-audio-counter",
      counterAttrValue: "edit-artistCredit",
      maxLength: ADMIN_AUDIO_LIMITS.MAX_CREDIT_LENGTH,
    });

    const licenseInput = document.createElement("input");
    licenseInput.type = "text";
    licenseInput.value = track.licenseNote ?? "";
    licenseInput.placeholder = ADMIN_UI_TEXT.AUDIO_LICENSE_PLACEHOLDER;
    licenseInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    const licenseField = createCounterField({
      id: `cv-audio-edit-license-${track.id}`,
      labelText: ADMIN_UI_TEXT.AUDIO_LICENSE_LABEL,
      input: licenseInput,
      counterAttrName: "data-audio-counter",
      counterAttrValue: "edit-licenseNote",
      maxLength: ADMIN_AUDIO_LIMITS.MAX_LICENSE_LENGTH,
      fullWidth: true,
    });

    const editActions = document.createElement("div");
    editActions.className = `${ADMIN_UI_CLASSES.MEDIA_ITEM_ACTIONS} ${ADMIN_UI_CLASSES.MEDIA_FORM_FULL}`;

    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "cv-btn cv-btn--primary cv-admin-btn-inline";
    saveBtn.textContent = ADMIN_UI_TEXT.MEDIA_SAVE_BTN;

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = ADMIN_UI_TEXT.MEDIA_CANCEL_BTN;
    cancelBtn.addEventListener("click", () => {
      this.editingTrackId = null;
      this.renderTrackList(this.store.getState());
    });

    editActions.append(saveBtn, cancelBtn);

    form.append(
      titleField.wrapper,
      creditField.wrapper,
      licenseField.wrapper,
      editActions,
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!titleInput.value.trim()) {
        this.store.setValidationError(ADMIN_UI_TEXT.AUDIO_MISSING_TITLE_ERROR);
        return;
      }
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
    this.syncBannersFn = null;
    this.submitBtnEl = null;
    this.listEl = null;
    this.editingTrackId = null;
    this.confirmingDeleteId = null;
  }
}
