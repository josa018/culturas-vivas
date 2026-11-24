import type { UploadProgressState } from "../admin-http-client";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

const SVG_NS = "http://www.w3.org/2000/svg";
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = 1_048_576;

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
