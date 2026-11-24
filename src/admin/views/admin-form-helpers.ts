import type { UploadProgressState } from "../admin-http-client";
import { ADMIN_UI_CLASSES } from "../constants";

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
  readonly hintText?: string;
  readonly fullWidth?: boolean;
  readonly help?: FieldHelpOptions;
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
  btn.setAttribute("aria-controls", options.popoverId);
  btn.setAttribute("aria-expanded", "false");

  const popover = document.createElement("div");
  popover.id = options.popoverId;
  popover.className = ADMIN_UI_CLASSES.FIELD_HELP_POPOVER;
  popover.setAttribute("role", "tooltip");
  popover.setAttribute("data-help-popover", options.toggleKey);
  popover.hidden = true;
  popover.textContent = options.bodyText;

  let isOpen = false;
  const syncState = (nextOpen: boolean) => {
    isOpen = nextOpen;
    popover.hidden = !nextOpen;
    btn.setAttribute("aria-expanded", String(nextOpen));
    wrapper.classList.toggle(ADMIN_UI_CLASSES.FIELD_HELP_OPEN, nextOpen);
  };

  btn.addEventListener("click", (event) => {
    event.preventDefault();
    syncState(!isOpen);
  });

  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) {
      syncState(false);
      btn.focus();
    }
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

  options.control.id = options.id;

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
