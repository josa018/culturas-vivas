import { ExhibitMediaType } from "../../experience/constants";
import {
  isHalfSbsMediaType,
  isVideoMediaType,
  type StandMediaType,
} from "../../experience/media-types";
import { ROOM_CATALOG, RoomId, StandId } from "../../shared/room-catalog";
import {
  ADMIN_MEDIA_LIMITS,
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
} from "../constants";
import type {
  AdminMediaItemRecord,
  AdminMediaState,
  AdminMediaStore,
  UploadProgressState,
} from "../media-store";
import {
  createCounterField,
  createItemActionMenu,
  createLabeledField,
  createModernFileInput,
  createStatusBanners,
  createUploadProgressBar,
} from "./admin-form-helpers";

const BYTES_PER_MIB = 1_048_576;
const PERCENT_MAX = 100;
const ADMIN_MEDIA_FORMAT = {
  STANDARD_2D: "2D",
  HALF_SBS: "SBS",
} as const;

function resolveMediaKind(
  isVideo: boolean,
  isHalfSbs: boolean,
): StandMediaType {
  if (isVideo) {
    return isHalfSbs
      ? ExhibitMediaType.VIDEO_STEREO_SBS
      : ExhibitMediaType.VIDEO_2D;
  }
  return isHalfSbs
    ? ExhibitMediaType.IMAGE_STEREO_SBS
    : ExhibitMediaType.IMAGE_2D;
}

function getFriendlyMediaTypeLabel(mediaType: StandMediaType): string {
  switch (mediaType) {
    case ExhibitMediaType.IMAGE_STEREO_SBS:
      return ADMIN_UI_TEXT.MEDIA_KIND_IMAGE_SBS;
    case ExhibitMediaType.VIDEO_2D:
      return ADMIN_UI_TEXT.MEDIA_KIND_VIDEO_2D;
    case ExhibitMediaType.VIDEO_STEREO_SBS:
      return ADMIN_UI_TEXT.MEDIA_KIND_VIDEO_SBS;
    case ExhibitMediaType.IMAGE_2D:
    default:
      return ADMIN_UI_TEXT.MEDIA_KIND_IMAGE_2D;
  }
}

function formatMegabytes(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MIB);
}

/**
 * Interactive /admin panel widget for uploading, downloading, editing, reordering, and deleting stand media.
 */
export class MediaManagerWidget {
  private readonly store: AdminMediaStore;
  private container: HTMLElement | null = null;
  private quotaLabelEl: HTMLElement | null = null;
  private quotaFillEl: HTMLElement | null = null;
  private roomSelectEl: HTMLSelectElement | null = null;
  private standSelectEl: HTMLSelectElement | null = null;
  private syncBannersFn:
    | ((error: string | null, success: string | null) => void)
    | null = null;
  private syncProgressFn: ((progress: UploadProgressState | null) => void) | null =
    null;
  private submitBtnEl: HTMLButtonElement | null = null;
  private listEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private editingItemId: string | null = null;
  private confirmingDeleteId: string | null = null;
  private posterPreviewObjectUrl: string | null = null;
  private cardCleanupFns: Array<() => void> = [];

  constructor(store: AdminMediaStore) {
    this.store = store;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const section = document.createElement("section");
    section.className = `${ADMIN_UI_CLASSES.CARD} ${ADMIN_UI_CLASSES.MEDIA_WIDGET}`;

    const header = document.createElement("div");
    header.className = ADMIN_UI_CLASSES.CARD_HEADER;

    const titleGroup = document.createElement("div");
    titleGroup.className = ADMIN_UI_CLASSES.CARD_TITLE_GROUP;

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.MEDIA_SECTION_TITLE;

    const subtitle = document.createElement("p");
    subtitle.className = ADMIN_UI_CLASSES.CARD_SUBTITLE;
    subtitle.textContent = ADMIN_UI_TEXT.MEDIA_SECTION_SUBTITLE;

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

    // Filters with visible labels
    const filtersRow = document.createElement("div");
    filtersRow.className = ADMIN_UI_CLASSES.MEDIA_FILTERS;

    const roomSelect = document.createElement("select");
    roomSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    roomSelect.setAttribute("data-media-filter", "room");

    for (const roomEntry of Object.values(ROOM_CATALOG)) {
      const opt = document.createElement("option");
      opt.value = roomEntry.id;
      opt.textContent = roomEntry.title;
      roomSelect.appendChild(opt);
    }

    const standSelect = document.createElement("select");
    standSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    standSelect.setAttribute("data-media-filter", "stand");

    roomSelect.addEventListener("change", () => {
      this.editingItemId = null;
      this.confirmingDeleteId = null;
      this.store.setSelection(roomSelect.value as RoomId);
    });

    standSelect.addEventListener("change", () => {
      this.editingItemId = null;
      this.confirmingDeleteId = null;
      this.store.setSelection(
        roomSelect.value as RoomId,
        standSelect.value as StandId,
      );
    });

    filtersRow.append(
      createLabeledField({
        id: "cv-media-filter-room",
        labelText: ADMIN_UI_TEXT.MEDIA_ROOM_LABEL,
        control: roomSelect,
      }),
      createLabeledField({
        id: "cv-media-filter-stand",
        labelText: ADMIN_UI_TEXT.MEDIA_STAND_LABEL,
        control: standSelect,
      }),
    );

    // Upload Form with visible labels and collapsible technical hint
    const form = document.createElement("form");
    form.className = ADMIN_UI_CLASSES.MEDIA_FORM;
    form.noValidate = true;

    const filePicker = createModernFileInput({
      id: "cv-media-upload-file",
      accept: "image/jpeg,image/png,image/webp,video/mp4",
      dataAttrName: "data-upload-field",
      dataAttrValue: "file",
      form,
    });
    const fileInput = filePicker.input;

    const fileField = createLabeledField({
      id: "cv-media-upload-file",
      labelText: ADMIN_UI_TEXT.MEDIA_FILE_LABEL,
      control: filePicker.wrapper,
      controlTargetForId: fileInput,
      hintText: ADMIN_UI_TEXT.MEDIA_FILE_HINT,
    });

    const formatSelect = document.createElement("select");
    formatSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    formatSelect.setAttribute("data-upload-field", "format");
    const opt2D = document.createElement("option");
    opt2D.value = ADMIN_MEDIA_FORMAT.STANDARD_2D;
    opt2D.textContent = ADMIN_UI_TEXT.MEDIA_FORMAT_2D;
    const optSbs = document.createElement("option");
    optSbs.value = ADMIN_MEDIA_FORMAT.HALF_SBS;
    optSbs.textContent = ADMIN_UI_TEXT.MEDIA_FORMAT_HALF_SBS;
    formatSelect.append(opt2D, optSbs);

    const formatField = createLabeledField({
      id: "cv-media-upload-format",
      labelText: ADMIN_UI_TEXT.MEDIA_FORMAT_LABEL,
      control: formatSelect,
      help: {
        toggleKey: "format",
        popoverId: "cv-media-format-help",
        ariaLabel: ADMIN_UI_TEXT.MEDIA_FORMAT_HELP_ARIA,
        bodyText: ADMIN_UI_TEXT.MEDIA_TECH_HINT_BODY,
      },
    });

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = ADMIN_UI_TEXT.MEDIA_TITLE_PLACEHOLDER;
    titleInput.required = true;
    titleInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    titleInput.setAttribute("data-upload-field", "title");
    const titleField = createCounterField({
      id: "cv-media-upload-title",
      labelText: ADMIN_UI_TEXT.MEDIA_TITLE_LABEL,
      input: titleInput,
      counterAttrName: "data-counter-for",
      counterAttrValue: "title",
      maxLength: ADMIN_MEDIA_LIMITS.MAX_TITLE_LENGTH,
    });

    const creatorInput = document.createElement("input");
    creatorInput.type = "text";
    creatorInput.placeholder = ADMIN_UI_TEXT.MEDIA_CREATOR_PLACEHOLDER;
    creatorInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    creatorInput.setAttribute("data-upload-field", "creatorName");
    const creatorField = createCounterField({
      id: "cv-media-upload-creator",
      labelText: ADMIN_UI_TEXT.MEDIA_CREATOR_LABEL,
      input: creatorInput,
      counterAttrName: "data-counter-for",
      counterAttrValue: "creatorName",
      maxLength: ADMIN_MEDIA_LIMITS.MAX_CREATOR_LENGTH,
    });

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.placeholder = ADMIN_UI_TEXT.MEDIA_DESC_PLACEHOLDER;
    descInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    descInput.setAttribute("data-upload-field", "description");
    const descField = createCounterField({
      id: "cv-media-upload-description",
      labelText: ADMIN_UI_TEXT.MEDIA_DESC_LABEL,
      input: descInput,
      counterAttrName: "data-counter-for",
      counterAttrValue: "description",
      maxLength: ADMIN_MEDIA_LIMITS.MAX_DESCRIPTION_LENGTH,
      fullWidth: true,
    });

    const posterControls = document.createElement("div");
    posterControls.className = `${ADMIN_UI_CLASSES.MEDIA_POSTER_CONTROLS} ${ADMIN_UI_CLASSES.MEDIA_FORM_FULL}`;
    posterControls.setAttribute("data-video-poster-controls", "true");
    posterControls.hidden = true;

    const posterSectionHeading = document.createElement("strong");
    posterSectionHeading.className = ADMIN_UI_CLASSES.MEDIA_FIELD_LABEL;
    posterSectionHeading.textContent = ADMIN_UI_TEXT.MEDIA_POSTER_SECTION_LABEL;

    const seekInput = document.createElement("input");
    seekInput.type = "number";
    seekInput.min = "0";
    seekInput.step = "0.1";
    seekInput.value = String(ADMIN_MEDIA_LIMITS.POSTER_SEEK_SECONDS);
    seekInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    seekInput.setAttribute("data-upload-field", "posterSeekSeconds");

    const seekField = createLabeledField({
      id: "cv-media-poster-seek",
      labelText: ADMIN_UI_TEXT.MEDIA_POSTER_TIME_LABEL,
      control: seekInput,
    });

    const capturePreviewBtn = document.createElement("button");
    capturePreviewBtn.type = "button";
    capturePreviewBtn.className = "cv-btn cv-btn--outline cv-admin-btn-inline";
    capturePreviewBtn.textContent = ADMIN_UI_TEXT.MEDIA_POSTER_CAPTURE_BTN;
    capturePreviewBtn.setAttribute("data-action", "capture-poster-preview");

    const customPosterPicker = createModernFileInput({
      id: "cv-media-poster-custom",
      accept: "image/jpeg,image/png,image/webp",
      dataAttrName: "data-upload-field",
      dataAttrValue: "customPoster",
      form,
    });
    const customPosterInput = customPosterPicker.input;

    const customPosterField = createLabeledField({
      id: "cv-media-poster-custom",
      labelText: ADMIN_UI_TEXT.MEDIA_POSTER_CUSTOM_LABEL,
      control: customPosterPicker.wrapper,
      controlTargetForId: customPosterInput,
    });

    const posterPreviewImg = document.createElement("img");
    posterPreviewImg.className = ADMIN_UI_CLASSES.MEDIA_POSTER_PREVIEW;
    posterPreviewImg.setAttribute("data-poster-preview", "true");
    posterPreviewImg.alt = ADMIN_UI_TEXT.MEDIA_POSTER_CAPTURE_BTN;
    posterPreviewImg.hidden = true;

    const setPreviewBlob = (blob: Blob) => {
      if (
        this.posterPreviewObjectUrl &&
        typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(this.posterPreviewObjectUrl);
      }
      if (typeof URL.createObjectURL === "function") {
        this.posterPreviewObjectUrl = URL.createObjectURL(blob);
        posterPreviewImg.src = this.posterPreviewObjectUrl;
        posterPreviewImg.hidden = false;
      }
    };

    const clearPreview = () => {
      if (
        this.posterPreviewObjectUrl &&
        typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(this.posterPreviewObjectUrl);
      }
      this.posterPreviewObjectUrl = null;
      posterPreviewImg.hidden = true;
      posterPreviewImg.removeAttribute("src");
    };

    fileInput.addEventListener("change", () => {
      const selectedFile = fileInput.files?.[0];
      const isSelectedVideo = Boolean(selectedFile?.type.startsWith("video/"));
      posterControls.hidden = !isSelectedVideo;
      if (!isSelectedVideo) {
        clearPreview();
      }
    });

    const refreshVideoPosterPreview = () => {
      const selectedFile = fileInput.files?.[0];
      if (!selectedFile || !selectedFile.type.startsWith("video/")) {
        return;
      }
      const parsedSeek = Number(seekInput.value);
      const seekSeconds =
        Number.isFinite(parsedSeek) && parsedSeek >= 0
          ? parsedSeek
          : ADMIN_MEDIA_LIMITS.POSTER_SEEK_SECONDS;
      const isHalfSbs = formatSelect.value === ADMIN_MEDIA_FORMAT.HALF_SBS;
      void this.store
        .previewVideoPoster(selectedFile, seekSeconds, isHalfSbs)
        .then((blob) => {
          if (blob) {
            setPreviewBlob(blob);
          }
        })
        .catch(() => {});
    };

    capturePreviewBtn.addEventListener("click", refreshVideoPosterPreview);

    formatSelect.addEventListener("change", () => {
      const hasCustomPoster = Boolean(
        customPosterInput.files && customPosterInput.files.length > 0,
      );
      if (!hasCustomPoster) {
        refreshVideoPosterPreview();
      }
    });

    customPosterInput.addEventListener("change", () => {
      const customPoster = customPosterInput.files?.[0];
      if (customPoster) {
        setPreviewBlob(customPoster);
      }
    });

    posterControls.append(
      posterSectionHeading,
      seekField,
      capturePreviewBtn,
      customPosterField,
      posterPreviewImg,
    );

    const progressBar = createUploadProgressBar("media");
    this.syncProgressFn = progressBar.syncProgress;

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = `${ADMIN_UI_CLASSES.BUTTON_SUBMIT} ${ADMIN_UI_CLASSES.MEDIA_FORM_FULL}`;
    submitBtn.textContent = ADMIN_UI_TEXT.MEDIA_UPLOAD_BTN;

    form.append(
      fileField,
      formatField,
      titleField.wrapper,
      creatorField.wrapper,
      descField.wrapper,
      posterControls,
      progressBar.container,
      submitBtn,
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const selectedFile = fileInput.files?.[0];
      if (!selectedFile) {
        this.store.setValidationError(ADMIN_UI_TEXT.MEDIA_MISSING_FILE_ERROR);
        return;
      }
      const cleanTitle = titleInput.value.trim();
      if (!cleanTitle) {
        this.store.setValidationError(ADMIN_UI_TEXT.MEDIA_MISSING_TITLE_ERROR);
        return;
      }

      const state = this.store.getState();
      const isVideo = selectedFile.type.startsWith("video/");
      const isHalfSbs = formatSelect.value === ADMIN_MEDIA_FORMAT.HALF_SBS;
      const parsedSeek = Number(seekInput.value);
      const posterSeekSeconds =
        Number.isFinite(parsedSeek) && parsedSeek >= 0 ? parsedSeek : undefined;
      const customPosterFile = isVideo
        ? (customPosterInput.files?.[0] ?? null)
        : null;

      void this.store
        .uploadMedia({
          roomId: state.selectedRoomId,
          standId: state.selectedStandId,
          file: selectedFile,
          customPosterFile,
          posterSeekSeconds,
          mediaKind: resolveMediaKind(isVideo, isHalfSbs),
          title: cleanTitle,
          creatorName: creatorInput.value.trim(),
          description: descInput.value.trim(),
        })
        .then(() => {
          if (!this.store.getState().error) {
            form.reset();
            filePicker.syncFileName();
            customPosterPicker.syncFileName();
            titleField.syncCounter();
            creatorField.syncCounter();
            descField.syncCounter();
            posterControls.hidden = true;
            clearPreview();
          }
        });
    });

    const listEl = document.createElement("div");
    listEl.className = ADMIN_UI_CLASSES.MEDIA_LIST;

    section.append(
      header,
      errorBanner,
      successBanner,
      filtersRow,
      form,
      listEl,
    );
    parent.appendChild(section);

    this.container = section;
    this.quotaLabelEl = quotaLabel;
    this.quotaFillEl = quotaFill;
    this.roomSelectEl = roomSelect;
    this.standSelectEl = standSelect;
    this.submitBtnEl = submitBtn;
    this.listEl = listEl;

    this.unsubscribe = this.store.subscribe((state) => {
      this.renderState(state);
    });
  }

  public unmount(): void {
    this.clearCardCleanups();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (
      this.posterPreviewObjectUrl &&
      typeof URL.revokeObjectURL === "function"
    ) {
      URL.revokeObjectURL(this.posterPreviewObjectUrl);
    }
    this.posterPreviewObjectUrl = null;
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.quotaLabelEl = null;
    this.quotaFillEl = null;
    this.roomSelectEl = null;
    this.standSelectEl = null;
    this.syncBannersFn = null;
    this.syncProgressFn = null;
    this.submitBtnEl = null;
    this.listEl = null;
    this.confirmingDeleteId = null;
    this.editingItemId = null;
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  private renderState(state: AdminMediaState): void {
    if (this.quotaLabelEl && this.quotaFillEl) {
      const usedMb = formatMegabytes(state.storageUsageBytes);
      const maxMb = formatMegabytes(state.maxStorageBytes);
      const pct = Math.min(
        PERCENT_MAX,
        Math.round(
          (state.storageUsageBytes / Math.max(1, state.maxStorageBytes)) *
            PERCENT_MAX,
        ),
      );
      this.quotaLabelEl.textContent = `${usedMb} MB / ${maxMb} MB (${pct}%)`;
      this.quotaFillEl.style.width = `${pct}%`;
    }

    if (this.roomSelectEl && this.standSelectEl) {
      this.roomSelectEl.value = state.selectedRoomId;
      const roomStands = ROOM_CATALOG[state.selectedRoomId].stands;
      const expectedValues = roomStands.map((s) => s.standId);
      const currentValues = Array.from(this.standSelectEl.options).map(
        (o) => o.value,
      );
      if (expectedValues.join(",") !== currentValues.join(",")) {
        this.standSelectEl.replaceChildren(
          ...roomStands.map((stand) => {
            const opt = document.createElement("option");
            opt.value = stand.standId;
            opt.textContent = stand.label;
            return opt;
          }),
        );
      }
      this.standSelectEl.value = state.selectedStandId;
    }

    this.syncBannersFn?.(state.error, state.successMessage);
    this.syncProgressFn?.(state.uploadProgress);

    if (this.submitBtnEl) {
      this.submitBtnEl.disabled = state.isUploading;
      this.submitBtnEl.textContent = state.isUploading
        ? ADMIN_UI_TEXT.MEDIA_UPLOADING_BTN
        : ADMIN_UI_TEXT.MEDIA_UPLOAD_BTN;
    }

    this.renderStandList(this.store.getSelectedItems());
  }

  private clearCardCleanups(): void {
    for (const cleanup of this.cardCleanupFns) {
      cleanup();
    }
    this.cardCleanupFns = [];
  }

  private renderStandList(items: readonly AdminMediaItemRecord[]): void {
    this.clearCardCleanups();
    if (!this.listEl) {
      return;
    }
    if (items.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.textContent = ADMIN_UI_TEXT.MEDIA_EMPTY_STAND;
      this.listEl.replaceChildren(emptyMsg);
      return;
    }

    const cards = items.map((item, idx) =>
      this.buildItemCard(item, idx === 0, idx === items.length - 1),
    );
    this.listEl.replaceChildren(...cards);
  }

  private buildItemCard(
    item: AdminMediaItemRecord,
    isFirst: boolean,
    isLast: boolean,
  ): HTMLElement {
    const card = document.createElement("article");
    card.className = ADMIN_UI_CLASSES.MEDIA_ITEM_CARD;
    card.setAttribute("data-item-id", item.id);

    const thumb = document.createElement("img");
    thumb.className = ADMIN_UI_CLASSES.MEDIA_ITEM_THUMB;
    thumb.src = item.posterUrl || item.mediaUrl;
    thumb.alt = item.title;

    const info = document.createElement("div");
    info.className = "cv-admin-media-item-info";

    const titleEl = document.createElement("strong");
    titleEl.textContent = item.title;

    const chipEl = document.createElement("span");
    chipEl.className = ADMIN_UI_CLASSES.MEDIA_FORMAT_CHIP;
    chipEl.textContent = getFriendlyMediaTypeLabel(item.mediaType);

    info.append(titleEl, chipEl);

    if (item.creatorName.trim().length > 0) {
      const creatorEl = document.createElement("span");
      creatorEl.textContent = `${ADMIN_UI_TEXT.MEDIA_CREATOR_PREFIX}${item.creatorName.trim()}`;
      info.appendChild(creatorEl);
    }

    const actions = createItemActionMenu({
      itemId: item.id,
      isFirst,
      isLast,
      isConfirmingDelete: this.confirmingDeleteId === item.id,
      actionAttr: "data-action",
      onMoveUp: () => {
        void this.store.moveItem(item.id, "up");
      },
      onMoveDown: () => {
        void this.store.moveItem(item.id, "down");
      },
      onDownload: () => {
        void this.store.requestDownload(item.id);
      },
      onEdit: () => {
        this.confirmingDeleteId = null;
        this.editingItemId = this.editingItemId === item.id ? null : item.id;
        this.renderStandList(this.store.getSelectedItems());
      },
      deletePromptText: ADMIN_UI_TEXT.MEDIA_DELETE_CONFIRM_PROMPT,
      onRequestDelete: () => {
        this.confirmingDeleteId = item.id;
        this.renderStandList(this.store.getSelectedItems());
      },
      onConfirmDelete: () => {
        this.confirmingDeleteId = null;
        void this.store.deleteItem(item.id);
      },
      onCancelDelete: () => {
        this.confirmingDeleteId = null;
        this.renderStandList(this.store.getSelectedItems());
      },
      onCleanup: (fn) => {
        this.cardCleanupFns.push(fn);
      },
    });
    card.append(thumb, info, actions);

    const itemSuccess = this.store.getState().itemSuccess;
    if (itemSuccess && itemSuccess.itemId === item.id) {
      const itemBanner = document.createElement("p");
      itemBanner.className = `${ADMIN_UI_CLASSES.SUCCESS_CONTAINER} ${ADMIN_UI_CLASSES.SUCCESS_TEXT} ${ADMIN_UI_CLASSES.ITEM_SUCCESS_BANNER}`;
      itemBanner.setAttribute("role", "status");
      itemBanner.setAttribute("data-item-success", "true");
      itemBanner.textContent = itemSuccess.message;
      card.appendChild(itemBanner);
    }

    if (this.editingItemId === item.id) {
      card.appendChild(this.buildInlineEditForm(item));
    }

    return card;
  }

  private buildInlineEditForm(item: AdminMediaItemRecord): HTMLElement {
    const form = document.createElement("div");
    form.className = ADMIN_UI_CLASSES.MEDIA_EDIT_FORM;

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = item.title;
    titleInput.placeholder = ADMIN_UI_TEXT.MEDIA_TITLE_PLACEHOLDER;
    titleInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    titleInput.setAttribute("data-edit-field", "title");
    const titleField = createCounterField({
      id: `cv-media-edit-title-${item.id}`,
      labelText: ADMIN_UI_TEXT.MEDIA_TITLE_LABEL,
      input: titleInput,
      counterAttrName: "data-counter-for",
      counterAttrValue: "edit-title",
      maxLength: ADMIN_MEDIA_LIMITS.MAX_TITLE_LENGTH,
    });

    const creatorInput = document.createElement("input");
    creatorInput.type = "text";
    creatorInput.value = item.creatorName;
    creatorInput.placeholder = ADMIN_UI_TEXT.MEDIA_CREATOR_PLACEHOLDER;
    creatorInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    creatorInput.setAttribute("data-edit-field", "creatorName");
    const creatorField = createCounterField({
      id: `cv-media-edit-creator-${item.id}`,
      labelText: ADMIN_UI_TEXT.MEDIA_CREATOR_LABEL,
      input: creatorInput,
      counterAttrName: "data-counter-for",
      counterAttrValue: "edit-creatorName",
      maxLength: ADMIN_MEDIA_LIMITS.MAX_CREATOR_LENGTH,
    });

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.value = item.description;
    descInput.placeholder = ADMIN_UI_TEXT.MEDIA_DESC_PLACEHOLDER;
    descInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    descInput.setAttribute("data-edit-field", "description");
    const descField = createCounterField({
      id: `cv-media-edit-desc-${item.id}`,
      labelText: ADMIN_UI_TEXT.MEDIA_DESC_LABEL,
      input: descInput,
      counterAttrName: "data-counter-for",
      counterAttrValue: "edit-description",
      maxLength: ADMIN_MEDIA_LIMITS.MAX_DESCRIPTION_LENGTH,
      fullWidth: true,
    });

    const formatSelect = document.createElement("select");
    formatSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    formatSelect.setAttribute("data-edit-field", "format");
    const opt2D = document.createElement("option");
    opt2D.value = ADMIN_MEDIA_FORMAT.STANDARD_2D;
    opt2D.textContent = ADMIN_UI_TEXT.MEDIA_FORMAT_2D;
    const optSbs = document.createElement("option");
    optSbs.value = ADMIN_MEDIA_FORMAT.HALF_SBS;
    optSbs.textContent = ADMIN_UI_TEXT.MEDIA_FORMAT_HALF_SBS;
    formatSelect.append(opt2D, optSbs);
    formatSelect.value = isHalfSbsMediaType(item.mediaType)
      ? ADMIN_MEDIA_FORMAT.HALF_SBS
      : ADMIN_MEDIA_FORMAT.STANDARD_2D;

    const formatField = createLabeledField({
      id: `cv-media-edit-format-${item.id}`,
      labelText: ADMIN_UI_TEXT.MEDIA_FORMAT_LABEL,
      control: formatSelect,
    });

    const editActions = document.createElement("div");
    editActions.className = `${ADMIN_UI_CLASSES.MEDIA_ITEM_ACTIONS} ${ADMIN_UI_CLASSES.MEDIA_FORM_FULL}`;

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "cv-btn cv-btn--primary cv-admin-btn-inline";
    saveBtn.textContent = ADMIN_UI_TEXT.MEDIA_SAVE_BTN;
    saveBtn.setAttribute("data-action", "save-edit");
    saveBtn.addEventListener("click", () => {
      const cleanTitle = titleInput.value.trim();
      if (!cleanTitle) {
        this.store.setValidationError(ADMIN_UI_TEXT.MEDIA_MISSING_TITLE_ERROR);
        return;
      }
      const nextKind = resolveMediaKind(
        isVideoMediaType(item.mediaType),
        formatSelect.value === ADMIN_MEDIA_FORMAT.HALF_SBS,
      );
      this.editingItemId = null;
      void this.store.updateItemMetadata({
        id: item.id,
        title: cleanTitle,
        creatorName: creatorInput.value.trim(),
        description: descInput.value.trim(),
        mediaKind: nextKind,
      });
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = ADMIN_UI_TEXT.MEDIA_CANCEL_BTN;
    cancelBtn.setAttribute("data-action", "cancel-edit");
    cancelBtn.addEventListener("click", () => {
      this.editingItemId = null;
      this.renderStandList(this.store.getSelectedItems());
    });

    editActions.append(saveBtn, cancelBtn);

    form.append(
      titleField.wrapper,
      creatorField.wrapper,
      descField.wrapper,
      formatField,
      editActions,
    );

    if (isVideoMediaType(item.mediaType)) {
      const posterFilePicker = createModernFileInput({
        id: `cv-media-edit-poster-${item.id}`,
        accept: "image/jpeg,image/png,image/webp",
        dataAttrName: "data-edit-field",
        dataAttrValue: "posterFile",
      });
      const posterFileInput = posterFilePicker.input;

      const posterField = createLabeledField({
        id: `cv-media-edit-poster-${item.id}`,
        labelText: ADMIN_UI_TEXT.MEDIA_POSTER_CUSTOM_LABEL,
        control: posterFilePicker.wrapper,
        controlTargetForId: posterFileInput,
      });

      const replacePosterBtn = document.createElement("button");
      replacePosterBtn.type = "button";
      replacePosterBtn.textContent = ADMIN_UI_TEXT.MEDIA_CHANGE_POSTER_BTN;
      replacePosterBtn.setAttribute("data-action", "replace-poster");
      replacePosterBtn.addEventListener("click", () => {
        const posterFile = posterFileInput.files?.[0];
        if (!posterFile) {
          this.store.setValidationError(
            ADMIN_UI_TEXT.MEDIA_MISSING_POSTER_ERROR,
          );
          return;
        }
        this.editingItemId = null;
        void this.store.replaceVideoPoster(item.id, posterFile);
      });

      form.append(posterField, replacePosterBtn);
    }

    return form;
  }
}
