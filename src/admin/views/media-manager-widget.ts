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
} from "../media-store";

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

function formatMegabytes(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MIB);
}

function createFieldWithCounter(
  input: HTMLInputElement,
  fieldName: string,
  maxLength: number,
): { wrapper: HTMLElement; syncCounter: () => void } {
  input.maxLength = maxLength;

  const wrapper = document.createElement("div");
  wrapper.className = "cv-admin-media-field";

  const counter = document.createElement("span");
  counter.className = ADMIN_UI_CLASSES.MEDIA_FIELD_COUNTER;
  counter.setAttribute("data-counter-for", fieldName);

  const syncCounter = () => {
    counter.textContent = `${input.value.length} / ${maxLength}`;
  };
  syncCounter();

  input.addEventListener("input", syncCounter);
  wrapper.append(input, counter);
  return { wrapper, syncCounter };
}

/**
 * Interactive /admin panel widget for uploading, editing, reordering, and deleting stand media.
 */
export class MediaManagerWidget {
  private readonly store: AdminMediaStore;
  private container: HTMLElement | null = null;
  private quotaLabelEl: HTMLElement | null = null;
  private quotaFillEl: HTMLElement | null = null;
  private roomSelectEl: HTMLSelectElement | null = null;
  private standSelectEl: HTMLSelectElement | null = null;
  private errorBannerEl: HTMLElement | null = null;
  private submitBtnEl: HTMLButtonElement | null = null;
  private listEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private editingItemId: string | null = null;
  private posterPreviewObjectUrl: string | null = null;

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

    const title = document.createElement("h2");
    title.className = ADMIN_UI_CLASSES.CARD_TITLE;
    title.textContent = ADMIN_UI_TEXT.MEDIA_SECTION_TITLE;

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

    // Filters
    const filtersRow = document.createElement("div");
    filtersRow.className = ADMIN_UI_CLASSES.MEDIA_FILTERS;

    const roomSelect = document.createElement("select");
    roomSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    roomSelect.setAttribute("data-media-filter", "room");
    roomSelect.setAttribute("aria-label", ADMIN_UI_TEXT.MEDIA_ROOM_LABEL);

    for (const roomEntry of Object.values(ROOM_CATALOG)) {
      const opt = document.createElement("option");
      opt.value = roomEntry.id;
      opt.textContent = roomEntry.title;
      roomSelect.appendChild(opt);
    }

    const standSelect = document.createElement("select");
    standSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    standSelect.setAttribute("data-media-filter", "stand");
    standSelect.setAttribute("aria-label", ADMIN_UI_TEXT.MEDIA_STAND_LABEL);

    roomSelect.addEventListener("change", () => {
      this.editingItemId = null;
      this.store.setSelection(roomSelect.value as RoomId);
    });

    standSelect.addEventListener("change", () => {
      this.editingItemId = null;
      this.store.setSelection(
        roomSelect.value as RoomId,
        standSelect.value as StandId,
      );
    });

    filtersRow.append(roomSelect, standSelect);

    // Upload Form
    const form = document.createElement("form");
    form.className = ADMIN_UI_CLASSES.MEDIA_FORM;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp,video/mp4";
    fileInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    fileInput.setAttribute("data-upload-field", "file");

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = ADMIN_UI_TEXT.MEDIA_TITLE_LABEL;
    titleInput.required = true;
    titleInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    titleInput.setAttribute("data-upload-field", "title");
    const titleField = createFieldWithCounter(
      titleInput,
      "title",
      ADMIN_MEDIA_LIMITS.MAX_TITLE_LENGTH,
    );

    const creatorInput = document.createElement("input");
    creatorInput.type = "text";
    creatorInput.placeholder = ADMIN_UI_TEXT.MEDIA_CREATOR_LABEL;
    creatorInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    creatorInput.setAttribute("data-upload-field", "creatorName");
    const creatorField = createFieldWithCounter(
      creatorInput,
      "creatorName",
      ADMIN_MEDIA_LIMITS.MAX_CREATOR_LENGTH,
    );

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.placeholder = ADMIN_UI_TEXT.MEDIA_DESC_LABEL;
    descInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    descInput.setAttribute("data-upload-field", "description");
    const descField = createFieldWithCounter(
      descInput,
      "description",
      ADMIN_MEDIA_LIMITS.MAX_DESCRIPTION_LENGTH,
    );

    const posterControls = document.createElement("div");
    posterControls.className = ADMIN_UI_CLASSES.MEDIA_POSTER_CONTROLS;
    posterControls.setAttribute("data-video-poster-controls", "true");
    posterControls.hidden = true;

    const seekInput = document.createElement("input");
    seekInput.type = "number";
    seekInput.min = "0";
    seekInput.step = "0.1";
    seekInput.value = String(ADMIN_MEDIA_LIMITS.POSTER_SEEK_SECONDS);
    seekInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    seekInput.setAttribute("data-upload-field", "posterSeekSeconds");
    seekInput.setAttribute("aria-label", ADMIN_UI_TEXT.MEDIA_POSTER_TIME_LABEL);

    const capturePreviewBtn = document.createElement("button");
    capturePreviewBtn.type = "button";
    capturePreviewBtn.textContent = ADMIN_UI_TEXT.MEDIA_POSTER_CAPTURE_BTN;
    capturePreviewBtn.setAttribute("data-action", "capture-poster-preview");

    const customPosterInput = document.createElement("input");
    customPosterInput.type = "file";
    customPosterInput.accept = "image/jpeg,image/png,image/webp";
    customPosterInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    customPosterInput.setAttribute("data-upload-field", "customPoster");
    customPosterInput.setAttribute(
      "aria-label",
      ADMIN_UI_TEXT.MEDIA_POSTER_CUSTOM_LABEL,
    );

    const posterPreviewImg = document.createElement("img");
    posterPreviewImg.className = ADMIN_UI_CLASSES.MEDIA_POSTER_PREVIEW;
    posterPreviewImg.setAttribute("data-poster-preview", "true");
    posterPreviewImg.alt = ADMIN_UI_TEXT.MEDIA_POSTER_CAPTURE_BTN;
    posterPreviewImg.hidden = true;

    const setPreviewBlob = (blob: Blob) => {
      if (this.posterPreviewObjectUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(this.posterPreviewObjectUrl);
      }
      if (typeof URL.createObjectURL === "function") {
        this.posterPreviewObjectUrl = URL.createObjectURL(blob);
        posterPreviewImg.src = this.posterPreviewObjectUrl;
        posterPreviewImg.hidden = false;
      }
    };

    const clearPreview = () => {
      if (this.posterPreviewObjectUrl && typeof URL.revokeObjectURL === "function") {
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
      seekInput,
      capturePreviewBtn,
      customPosterInput,
      posterPreviewImg,
    );

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = ADMIN_UI_CLASSES.BUTTON_SUBMIT;
    submitBtn.textContent = ADMIN_UI_TEXT.MEDIA_UPLOAD_BTN;

    form.append(
      fileInput,
      titleField.wrapper,
      creatorField.wrapper,
      descField.wrapper,
      posterControls,
      formatSelect,
      submitBtn,
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const selectedFile = fileInput.files?.[0];
      const cleanTitle = titleInput.value.trim();
      if (!selectedFile || !cleanTitle) {
        return;
      }

      const state = this.store.getState();
      const isVideo = selectedFile.type.startsWith("video/");
      const isHalfSbs = formatSelect.value === ADMIN_MEDIA_FORMAT.HALF_SBS;
      const parsedSeek = Number(seekInput.value);
      const posterSeekSeconds =
        Number.isFinite(parsedSeek) && parsedSeek >= 0
          ? parsedSeek
          : undefined;
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

    section.append(header, errorBanner, filtersRow, form, listEl);
    parent.appendChild(section);

    this.container = section;
    this.quotaLabelEl = quotaLabel;
    this.quotaFillEl = quotaFill;
    this.roomSelectEl = roomSelect;
    this.standSelectEl = standSelect;
    this.errorBannerEl = errorBanner;
    this.submitBtnEl = submitBtn;
    this.listEl = listEl;

    this.unsubscribe = this.store.subscribe((state) => {
      this.renderState(state);
    });
  }

  public unmount(): void {
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
    this.errorBannerEl = null;
    this.submitBtnEl = null;
    this.listEl = null;
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
      this.quotaLabelEl.textContent = `${usedMb} MB / ${maxMb} MB`;
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
        ? ADMIN_UI_TEXT.MEDIA_UPLOADING_BTN
        : ADMIN_UI_TEXT.MEDIA_UPLOAD_BTN;
    }

    this.renderStandList(this.store.getSelectedItems());
  }

  private renderStandList(items: readonly AdminMediaItemRecord[]): void {
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
    chipEl.textContent = item.mediaType;

    info.append(titleEl, chipEl);

    if (item.creatorName.trim().length > 0) {
      const creatorEl = document.createElement("span");
      creatorEl.textContent = `${ADMIN_UI_TEXT.MEDIA_CREATOR_PREFIX}${item.creatorName.trim()}`;
      info.appendChild(creatorEl);
    }

    const actions = document.createElement("div");
    actions.className = ADMIN_UI_CLASSES.MEDIA_ITEM_ACTIONS;

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = ADMIN_UI_TEXT.MEDIA_MOVE_UP;
    upBtn.disabled = isFirst;
    upBtn.setAttribute("data-action", "move-up");
    upBtn.addEventListener("click", () => {
      void this.store.moveItem(item.id, "up");
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = ADMIN_UI_TEXT.MEDIA_MOVE_DOWN;
    downBtn.disabled = isLast;
    downBtn.setAttribute("data-action", "move-down");
    downBtn.addEventListener("click", () => {
      void this.store.moveItem(item.id, "down");
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = ADMIN_UI_TEXT.MEDIA_EDIT_BTN;
    editBtn.setAttribute("data-action", "edit");
    editBtn.addEventListener("click", () => {
      this.editingItemId = this.editingItemId === item.id ? null : item.id;
      this.renderStandList(this.store.getSelectedItems());
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = ADMIN_UI_TEXT.MEDIA_DELETE_BTN;
    deleteBtn.setAttribute("data-action", "delete");
    deleteBtn.addEventListener("click", () => {
      void this.store.deleteItem(item.id);
    });

    actions.append(upBtn, downBtn, editBtn, deleteBtn);
    card.append(thumb, info, actions);

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
    titleInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    titleInput.setAttribute("data-edit-field", "title");
    const titleField = createFieldWithCounter(
      titleInput,
      "edit-title",
      ADMIN_MEDIA_LIMITS.MAX_TITLE_LENGTH,
    );

    const creatorInput = document.createElement("input");
    creatorInput.type = "text";
    creatorInput.value = item.creatorName;
    creatorInput.placeholder = ADMIN_UI_TEXT.MEDIA_CREATOR_LABEL;
    creatorInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    creatorInput.setAttribute("data-edit-field", "creatorName");
    const creatorField = createFieldWithCounter(
      creatorInput,
      "edit-creatorName",
      ADMIN_MEDIA_LIMITS.MAX_CREATOR_LENGTH,
    );

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.value = item.description;
    descInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    descInput.setAttribute("data-edit-field", "description");
    const descField = createFieldWithCounter(
      descInput,
      "edit-description",
      ADMIN_MEDIA_LIMITS.MAX_DESCRIPTION_LENGTH,
    );

    const formatSelect = document.createElement("select");
    formatSelect.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    formatSelect.setAttribute("data-edit-field", "format");
    const opt2D = document.createElement("option");
    opt2D.value = "2D";
    opt2D.textContent = ADMIN_UI_TEXT.MEDIA_FORMAT_2D;
    const optSbs = document.createElement("option");
    optSbs.value = "SBS";
    optSbs.textContent = ADMIN_UI_TEXT.MEDIA_FORMAT_HALF_SBS;
    formatSelect.append(opt2D, optSbs);
    formatSelect.value = isHalfSbsMediaType(item.mediaType) ? "SBS" : "2D";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = ADMIN_UI_TEXT.MEDIA_SAVE_BTN;
    saveBtn.setAttribute("data-action", "save-edit");
    saveBtn.addEventListener("click", () => {
      const nextKind = resolveMediaKind(
        isVideoMediaType(item.mediaType),
        formatSelect.value === "SBS",
      );
      this.editingItemId = null;
      void this.store.updateItemMetadata({
        id: item.id,
        title: titleInput.value.trim(),
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

    form.append(
      titleField.wrapper,
      creatorField.wrapper,
      descField.wrapper,
      formatSelect,
      saveBtn,
      cancelBtn,
    );

    if (isVideoMediaType(item.mediaType)) {
      const posterFileInput = document.createElement("input");
      posterFileInput.type = "file";
      posterFileInput.accept = "image/jpeg,image/png,image/webp";
      posterFileInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
      posterFileInput.setAttribute("data-edit-field", "posterFile");

      const replacePosterBtn = document.createElement("button");
      replacePosterBtn.type = "button";
      replacePosterBtn.textContent = ADMIN_UI_TEXT.MEDIA_CHANGE_POSTER_BTN;
      replacePosterBtn.setAttribute("data-action", "replace-poster");
      replacePosterBtn.addEventListener("click", () => {
        const posterFile = posterFileInput.files?.[0];
        if (!posterFile) {
          return;
        }
        this.editingItemId = null;
        void this.store.replaceVideoPoster(item.id, posterFile);
      });

      form.append(posterFileInput, replacePosterBtn);
    }

    return form;
  }
}
