import type { UploadProgressState } from "../admin-http-client";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

const SVG_NS = "http://www.w3.org/2000/svg";
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = 1_048_576;
const MENU_EDGE_MARGIN_PX = 12;
const MENU_OFFSET_PX = 6;
const DEFAULT_MENU_WIDTH_PX = 170;
const DEFAULT_MENU_HEIGHT_PX = 148;

export interface FieldHelpOptions {
  readonly toggleKey: string;
  readonly popoverId: string;
  readonly ariaLabel: string;
  readonly bodyText: string;
}

export interface LabeledFieldOptions {
  readonly id: string;
  readonly labelText: string;
  readonly control: HTMLElement;
  readonly controlTargetForId?: HTMLElement;
  readonly hintText?: string;
  readonly fullWidth?: boolean;
  readonly help?: FieldHelpOptions;
}

export interface ModernFileInputOptions {
  readonly id: string;
  readonly accept: string;
  readonly dataAttrName: string;
  readonly dataAttrValue: string;
  readonly form?: HTMLFormElement;
  readonly buttonLabel?: string;
  readonly emptyLabel?: string;
}

export interface ItemActionMenuOptions {
  readonly itemId: string;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isConfirmingDelete: boolean;
  readonly actionAttr: string;
  readonly idAttr?: string;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
  readonly onEdit: () => void;
  readonly onDownload: () => void;
  readonly deletePromptText: string;
  readonly onRequestDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
  readonly onCleanup?: (cleanup: () => void) => void;
}

export interface CounterFieldOptions {
  readonly id: string;
  readonly labelText: string;
  readonly input: HTMLInputElement;
  readonly counterAttrName: string;
  readonly counterAttrValue: string;
  readonly maxLength: number;
  readonly fullWidth?: boolean;
}

export interface InlineDeleteControlsOptions {
  readonly itemId: string;
  readonly isConfirming: boolean;
  readonly actionAttr: string;
  readonly idAttr?: string;
  readonly promptText: string;
  readonly deleteLabel: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onRequestConfirm: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function createFieldHelpPopover(
  options: FieldHelpOptions,
): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = ADMIN_UI_CLASSES.FIELD_HELP_WRAPPER;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = ADMIN_UI_CLASSES.FIELD_HELP_BTN;
  btn.textContent = "?";
  btn.setAttribute("data-help-toggle", options.toggleKey);
  btn.setAttribute("aria-label", options.ariaLabel);
  btn.setAttribute("aria-describedby", options.popoverId);

  const popover = document.createElement("div");
  popover.id = options.popoverId;
  popover.className = ADMIN_UI_CLASSES.FIELD_HELP_POPOVER;
  popover.setAttribute("role", "tooltip");
  popover.setAttribute("data-help-popover", options.toggleKey);
  popover.hidden = true;
  popover.textContent = options.bodyText;

  // Clicking the icon intentionally performs no action; visibility is hover-only.
  btn.addEventListener("click", (event) => {
    event.preventDefault();
  });

  wrapper.append(btn, popover);
  return wrapper;
}

export function createLabeledField(options: LabeledFieldOptions): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = options.fullWidth
    ? `cv-admin-media-field ${ADMIN_UI_CLASSES.MEDIA_FORM_FULL}`
    : "cv-admin-media-field";

  const label = document.createElement("label");
  label.className = ADMIN_UI_CLASSES.MEDIA_FIELD_LABEL;
  label.htmlFor = options.id;
  label.textContent = options.labelText;

  (options.controlTargetForId ?? options.control).id = options.id;

  if (options.help) {
    const labelRow = document.createElement("div");
    labelRow.className = ADMIN_UI_CLASSES.MEDIA_FIELD_LABEL_ROW;
    labelRow.append(label, createFieldHelpPopover(options.help));
    wrapper.append(labelRow, options.control);
  } else {
    wrapper.append(label, options.control);
  }

  if (options.hintText) {
    const hint = document.createElement("span");
    hint.className = ADMIN_UI_CLASSES.MEDIA_FIELD_HINT;
    hint.textContent = options.hintText;
    wrapper.appendChild(hint);
  }

  return wrapper;
}

export function createCounterField(options: CounterFieldOptions): {
  wrapper: HTMLElement;
  syncCounter: () => void;
} {
  options.input.maxLength = options.maxLength;

  const wrapper = createLabeledField({
    id: options.id,
    labelText: options.labelText,
    control: options.input,
    fullWidth: options.fullWidth,
  });

  const counter = document.createElement("span");
  counter.className = ADMIN_UI_CLASSES.MEDIA_FIELD_COUNTER;
  counter.setAttribute(options.counterAttrName, options.counterAttrValue);

  const syncCounter = () => {
    counter.textContent = `${options.input.value.length} / ${options.maxLength}`;
  };
  syncCounter();

  options.input.addEventListener("input", syncCounter);
  wrapper.appendChild(counter);
  return { wrapper, syncCounter };
}

export function createTechnicalHintDetails(
  summaryText: string,
  bodyText: string,
): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = `${ADMIN_UI_CLASSES.TECH_HINT_DETAILS} ${ADMIN_UI_CLASSES.MEDIA_FORM_FULL}`;

  const summary = document.createElement("summary");
  summary.className = ADMIN_UI_CLASSES.TECH_HINT_SUMMARY;
  summary.textContent = summaryText;

  const body = document.createElement("p");
  body.textContent = bodyText;

  details.append(summary, body);
  return details;
}

export function createInlineDeleteControls(
  options: InlineDeleteControlsOptions,
): HTMLElement {
  if (!options.isConfirming) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = ADMIN_UI_CLASSES.BUTTON_DANGER;
    deleteBtn.textContent = options.deleteLabel;
    deleteBtn.setAttribute(options.actionAttr, "delete");
    if (options.idAttr) {
      deleteBtn.setAttribute(options.idAttr, options.itemId);
    }
    deleteBtn.addEventListener("click", options.onRequestConfirm);
    return deleteBtn;
  }

  const confirmGroup = document.createElement("div");
  confirmGroup.className = ADMIN_UI_CLASSES.DELETE_CONFIRM_GROUP;

  const prompt = document.createElement("span");
  prompt.textContent = options.promptText;

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = ADMIN_UI_CLASSES.BUTTON_DANGER;
  confirmBtn.textContent = options.confirmLabel;
  confirmBtn.setAttribute(options.actionAttr, "confirm-delete");
  if (options.idAttr) {
    confirmBtn.setAttribute(options.idAttr, options.itemId);
  }
  confirmBtn.addEventListener("click", options.onConfirm);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = options.cancelLabel;
  cancelBtn.setAttribute(options.actionAttr, "cancel-delete");
  if (options.idAttr) {
    cancelBtn.setAttribute(options.idAttr, options.itemId);
  }
  cancelBtn.addEventListener("click", options.onCancel);

  confirmGroup.append(prompt, confirmBtn, cancelBtn);
  return confirmGroup;
}

export function createStatusBanners(): {
  errorBanner: HTMLElement;
  successBanner: HTMLElement;
  syncBanners: (error: string | null, successMessage: string | null) => void;
} {
  const errorBanner = document.createElement("p");
  errorBanner.className = `${ADMIN_UI_CLASSES.ERROR_CONTAINER} ${ADMIN_UI_CLASSES.ERROR_TEXT} ${ADMIN_UI_CLASSES.ERROR_HIDDEN}`;
  errorBanner.setAttribute("role", "alert");

  const successBanner = document.createElement("p");
  successBanner.className = `${ADMIN_UI_CLASSES.SUCCESS_CONTAINER} ${ADMIN_UI_CLASSES.SUCCESS_TEXT} ${ADMIN_UI_CLASSES.SUCCESS_HIDDEN}`;
  successBanner.setAttribute("role", "status");

  const syncBanners = (
    error: string | null,
    successMessage: string | null,
  ) => {
    if (error) {
      errorBanner.textContent = error;
      errorBanner.classList.remove(ADMIN_UI_CLASSES.ERROR_HIDDEN);
    } else {
      errorBanner.textContent = "";
      errorBanner.classList.add(ADMIN_UI_CLASSES.ERROR_HIDDEN);
    }

    if (successMessage && !error) {
      successBanner.textContent = successMessage;
      successBanner.classList.remove(ADMIN_UI_CLASSES.SUCCESS_HIDDEN);
    } else {
      successBanner.textContent = "";
      successBanner.classList.add(ADMIN_UI_CLASSES.SUCCESS_HIDDEN);
    }
  };

  return { errorBanner, successBanner, syncBanners };
}

export function createUploadProgressBar(kind: "media" | "audio"): {
  container: HTMLElement;
  syncProgress: (progress: UploadProgressState | null) => void;
} {
  const container = document.createElement("div");
  container.className = `${ADMIN_UI_CLASSES.UPLOAD_PROGRESS} ${ADMIN_UI_CLASSES.MEDIA_FORM_FULL}`;
  container.setAttribute("role", "progressbar");
  container.setAttribute("aria-valuemin", "0");
  container.setAttribute("aria-valuemax", "100");
  container.setAttribute("aria-valuenow", "0");
  container.setAttribute("data-upload-progress", kind);
  container.hidden = true;

  const header = document.createElement("div");
  header.className = ADMIN_UI_CLASSES.UPLOAD_PROGRESS_HEADER;
  const stageSpan = document.createElement("span");
  const percentSpan = document.createElement("span");
  header.append(stageSpan, percentSpan);

  const track = document.createElement("div");
  track.className = ADMIN_UI_CLASSES.UPLOAD_PROGRESS_TRACK;
  const fill = document.createElement("div");
  fill.className = ADMIN_UI_CLASSES.UPLOAD_PROGRESS_FILL;
  fill.style.width = "0%";
  track.appendChild(fill);

  container.append(header, track);

  const syncProgress = (progress: UploadProgressState | null) => {
    if (!progress) {
      container.hidden = true;
      container.setAttribute("aria-valuenow", "0");
      stageSpan.textContent = "";
      percentSpan.textContent = "";
      fill.style.width = "0%";
      return;
    }
    const clamped = Math.min(100, Math.max(0, Math.round(progress.percent)));
    container.hidden = false;
    container.setAttribute("aria-valuenow", String(clamped));
    stageSpan.textContent = progress.stageLabel;
    percentSpan.textContent = `${clamped}%`;
    fill.style.width = `${clamped}%`;
  };

  return { container, syncProgress };
}

function createUploadIconSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const addPath = (d: string) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  };
  addPath("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4");
  addPath("M17 8l-5-5-5 5");
  addPath("M12 3v12");
  return svg;
}

function formatFileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  if (bytes >= BYTES_PER_MIB) {
    return ` (${(bytes / BYTES_PER_MIB).toFixed(1)} MB)`;
  }
  return ` (${Math.max(1, Math.round(bytes / BYTES_PER_KIB))} KB)`;
}

export function createModernFileInput(options: ModernFileInputOptions): {
  wrapper: HTMLElement;
  input: HTMLInputElement;
  syncFileName: () => void;
} {
  const emptyText = options.emptyLabel ?? ADMIN_UI_TEXT.FILE_PICKER_EMPTY;
  const buttonText = options.buttonLabel ?? ADMIN_UI_TEXT.FILE_PICKER_SELECT_BTN;

  const wrapper = document.createElement("div");
  wrapper.className = ADMIN_UI_CLASSES.FILE_PICKER;

  const input = document.createElement("input");
  input.type = "file";
  input.id = options.id;
  input.accept = options.accept;
  input.className = ADMIN_UI_CLASSES.FILE_PICKER_INPUT;
  input.setAttribute(options.dataAttrName, options.dataAttrValue);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = ADMIN_UI_CLASSES.FILE_PICKER_BTN;
  const labelSpan = document.createElement("span");
  labelSpan.textContent = buttonText;
  btn.append(createUploadIconSvg(), labelSpan);

  const fileNameSpan = document.createElement("span");
  fileNameSpan.className = ADMIN_UI_CLASSES.FILE_PICKER_NAME;
  fileNameSpan.setAttribute("data-file-name", "true");
  fileNameSpan.textContent = emptyText;

  const syncFileName = () => {
    const selected = input.files?.[0];
    fileNameSpan.textContent = selected
      ? `${selected.name}${formatFileSizeLabel(selected.size)}`
      : emptyText;
  };

  btn.addEventListener("click", (event) => {
    event.preventDefault();
    input.click();
  });

  wrapper.addEventListener("click", (event) => {
    const target = event.target as Node | null;
    if (target === input || (target && btn.contains(target))) {
      return;
    }
    input.click();
  });

  input.addEventListener("change", syncFileName);

  wrapper.addEventListener("dragover", (event) => {
    event.preventDefault();
    wrapper.classList.add(ADMIN_UI_CLASSES.FILE_PICKER_DRAGOVER);
  });
  wrapper.addEventListener("dragleave", () => {
    wrapper.classList.remove(ADMIN_UI_CLASSES.FILE_PICKER_DRAGOVER);
  });
  wrapper.addEventListener("drop", (event) => {
    event.preventDefault();
    wrapper.classList.remove(ADMIN_UI_CLASSES.FILE_PICKER_DRAGOVER);
    const dropped = event.dataTransfer?.files;
    if (dropped && dropped.length > 0) {
      try {
        input.files = dropped;
      } catch {
        // Ignore read-only files property in non-browser DOM test shims
      }
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  options.form?.addEventListener("reset", () => {
    queueMicrotask(syncFileName);
  });

  wrapper.append(input, btn, fileNameSpan);
  return { wrapper, input, syncFileName };
}

type ActionSvgKind = "up" | "down" | "dots" | "edit" | "download" | "trash";

function createActionSvg(kind: ActionSvgKind): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const addPath = (d: string) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  };
  const addCircle = (cx: string, cy: string) => {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", cx);
    c.setAttribute("cy", cy);
    c.setAttribute("r", "1.5");
    c.setAttribute("fill", "currentColor");
    c.setAttribute("stroke", "none");
    svg.appendChild(c);
  };

  switch (kind) {
    case "up":
      addPath("M18 15l-6-6-6 6");
      break;
    case "down":
      addPath("M6 9l6 6 6-6");
      break;
    case "dots":
      addCircle("5", "12");
      addCircle("12", "12");
      addCircle("19", "12");
      break;
    case "edit":
      addPath("M12 20h9");
      addPath("M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z");
      break;
    case "download":
      addPath("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4");
      addPath("M7 10l5 5 5-5");
      addPath("M12 15V3");
      break;
    case "trash":
      addPath("M3 6h18");
      addPath("M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6");
      addPath("M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2");
      break;
  }
  return svg;
}

let activeItemMenuCloser: (() => void) | null = null;

function positionActionMenu(
  triggerBtn: HTMLElement,
  menuList: HTMLElement,
): void {
  menuList.classList.remove(
    ADMIN_UI_CLASSES.ACTION_MENU_LIST_UP,
    ADMIN_UI_CLASSES.ACTION_MENU_LIST_ALIGN_LEFT,
    ADMIN_UI_CLASSES.ACTION_MENU_LIST_ALIGN_RIGHT,
  );

  if (typeof window === "undefined") {
    return;
  }

  const viewportW =
    window.innerWidth || document.documentElement?.clientWidth || 1024;
  const viewportH =
    window.innerHeight || document.documentElement?.clientHeight || 768;
  const triggerRect = triggerBtn.getBoundingClientRect();
  const menuRect = menuList.getBoundingClientRect();
  const menuHeight =
    menuRect.height > 0 ? menuRect.height : DEFAULT_MENU_HEIGHT_PX;
  const menuWidth = menuRect.width > 0 ? menuRect.width : DEFAULT_MENU_WIDTH_PX;

  const spaceBelow = viewportH - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  if (
    spaceBelow < menuHeight + MENU_OFFSET_PX + MENU_EDGE_MARGIN_PX &&
    spaceAbove > spaceBelow
  ) {
    menuList.classList.add(ADMIN_UI_CLASSES.ACTION_MENU_LIST_UP);
  }

  if (
    menuRect.left < MENU_EDGE_MARGIN_PX &&
    triggerRect.left + menuWidth <= viewportW - MENU_EDGE_MARGIN_PX
  ) {
    menuList.classList.add(ADMIN_UI_CLASSES.ACTION_MENU_LIST_ALIGN_LEFT);
  } else if (
    menuRect.right > viewportW - MENU_EDGE_MARGIN_PX &&
    triggerRect.right - menuWidth >= MENU_EDGE_MARGIN_PX
  ) {
    menuList.classList.add(ADMIN_UI_CLASSES.ACTION_MENU_LIST_ALIGN_RIGHT);
  }
}

/**
 * Builds compact `↑`/`↓` reorder controls alongside a `⋯` overflow menu
 * containing Edit, Download, and Delete (which transitions to inline confirm/cancel).
 */
export function createItemActionMenu(
  options: ItemActionMenuOptions,
): HTMLElement {
  const container = document.createElement("div");
  container.className = ADMIN_UI_CLASSES.MEDIA_ITEM_ACTIONS;

  if (options.isConfirmingDelete) {
    const confirmControls = createInlineDeleteControls({
      itemId: options.itemId,
      isConfirming: true,
      actionAttr: options.actionAttr,
      idAttr: options.idAttr,
      promptText: options.deletePromptText,
      deleteLabel: ADMIN_UI_TEXT.MEDIA_DELETE_BTN,
      confirmLabel: ADMIN_UI_TEXT.MEDIA_DELETE_CONFIRM_BTN,
      cancelLabel: ADMIN_UI_TEXT.MEDIA_CANCEL_BTN,
      onRequestConfirm: options.onRequestDelete,
      onConfirm: options.onConfirmDelete,
      onCancel: options.onCancelDelete,
    });
    container.appendChild(confirmControls);
    return container;
  }

  const applyIdAttr = (el: HTMLElement, action: string) => {
    el.setAttribute(options.actionAttr, action);
    if (options.idAttr) {
      el.setAttribute(options.idAttr, options.itemId);
    }
  };

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = ADMIN_UI_CLASSES.REORDER_ICON_BTN;
  upBtn.disabled = options.isFirst;
  upBtn.title = ADMIN_UI_TEXT.MEDIA_MOVE_UP_ARIA;
  upBtn.setAttribute("aria-label", ADMIN_UI_TEXT.MEDIA_MOVE_UP_ARIA);
  applyIdAttr(upBtn, "move-up");
  upBtn.appendChild(createActionSvg("up"));
  upBtn.addEventListener("click", options.onMoveUp);

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = ADMIN_UI_CLASSES.REORDER_ICON_BTN;
  downBtn.disabled = options.isLast;
  downBtn.title = ADMIN_UI_TEXT.MEDIA_MOVE_DOWN_ARIA;
  downBtn.setAttribute("aria-label", ADMIN_UI_TEXT.MEDIA_MOVE_DOWN_ARIA);
  applyIdAttr(downBtn, "move-down");
  downBtn.appendChild(createActionSvg("down"));
  downBtn.addEventListener("click", options.onMoveDown);

  const menuWrapper = document.createElement("div");
  menuWrapper.className = ADMIN_UI_CLASSES.ACTION_MENU_WRAPPER;

  const triggerBtn = document.createElement("button");
  triggerBtn.type = "button";
  triggerBtn.className = ADMIN_UI_CLASSES.ACTION_MENU_TRIGGER;
  triggerBtn.title = ADMIN_UI_TEXT.MEDIA_MORE_ACTIONS_ARIA;
  triggerBtn.setAttribute("aria-label", ADMIN_UI_TEXT.MEDIA_MORE_ACTIONS_ARIA);
  triggerBtn.setAttribute("aria-haspopup", "menu");
  triggerBtn.setAttribute("aria-expanded", "false");
  applyIdAttr(triggerBtn, "more-actions");
  triggerBtn.appendChild(createActionSvg("dots"));

  const menuList = document.createElement("div");
  menuList.className = ADMIN_UI_CLASSES.ACTION_MENU_LIST;
  menuList.setAttribute("role", "menu");
  menuList.hidden = true;

  let isOpen = false;
  const closeMenu = () => {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    menuList.hidden = true;
    triggerBtn.setAttribute("aria-expanded", "false");
    if (activeItemMenuCloser === closeMenu) {
      activeItemMenuCloser = null;
    }
  };

  const openMenu = () => {
    if (activeItemMenuCloser && activeItemMenuCloser !== closeMenu) {
      activeItemMenuCloser();
    }
    isOpen = true;
    menuList.hidden = false;
    positionActionMenu(triggerBtn, menuList);
    triggerBtn.setAttribute("aria-expanded", "true");
    activeItemMenuCloser = closeMenu;
  };

  triggerBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  menuWrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) {
      closeMenu();
      triggerBtn.focus();
    }
  });

  const makeMenuItem = (
    labelText: string,
    iconKind: ActionSvgKind,
    action: string,
    handler: () => void,
    isDanger = false,
  ): HTMLButtonElement => {
    const itemBtn = document.createElement("button");
    itemBtn.type = "button";
    itemBtn.className = isDanger
      ? `${ADMIN_UI_CLASSES.ACTION_MENU_ITEM} ${ADMIN_UI_CLASSES.ACTION_MENU_ITEM_DANGER}`
      : ADMIN_UI_CLASSES.ACTION_MENU_ITEM;
    itemBtn.setAttribute("role", "menuitem");
    applyIdAttr(itemBtn, action);
    const span = document.createElement("span");
    span.textContent = labelText;
    itemBtn.append(createActionSvg(iconKind), span);
    itemBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeMenu();
      handler();
    });
    return itemBtn;
  };

  menuList.append(
    makeMenuItem(ADMIN_UI_TEXT.MEDIA_EDIT_BTN, "edit", "edit", options.onEdit),
    makeMenuItem(
      ADMIN_UI_TEXT.MEDIA_DOWNLOAD_BTN,
      "download",
      "download",
      options.onDownload,
    ),
    makeMenuItem(
      ADMIN_UI_TEXT.MEDIA_DELETE_BTN,
      "trash",
      "delete",
      options.onRequestDelete,
      true,
    ),
  );

  if (typeof document !== "undefined") {
    const onDocumentClick = (event: Event) => {
      if (!isOpen) {
        return;
      }
      const target = event.target as Node | null;
      if (target && menuWrapper.contains(target)) {
        return;
      }
      closeMenu();
    };
    document.addEventListener("click", onDocumentClick);
    options.onCleanup?.(() => {
      closeMenu();
      document.removeEventListener("click", onDocumentClick);
    });
  } else {
    options.onCleanup?.(closeMenu);
  }

  menuWrapper.append(triggerBtn, menuList);
  container.append(upBtn, downBtn, menuWrapper);
  return container;
}
