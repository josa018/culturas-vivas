import { AdminAuthStore } from "../admin-auth-store";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

export interface AdminLoginModalOptions {
  readonly authStore: AdminAuthStore;
  readonly onLoginSuccess?: () => void;
  readonly onReturnToTour?: () => void;
}

export class AdminLoginModalView {
  private container: HTMLElement | null = null;
  private userInput: HTMLInputElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private passwordToggleBtn: HTMLButtonElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private errorElement: HTMLElement | null = null;
  private errorTextElement: HTMLElement | null = null;
  private isSubmitting = false;
  private readonly authStore: AdminAuthStore;
  private readonly onLoginSuccess?: () => void;
  private readonly onReturnToTour?: () => void;

  constructor(options: AdminLoginModalOptions) {
    this.authStore = options.authStore;
    this.onLoginSuccess = options.onLoginSuccess;
    this.onReturnToTour = options.onReturnToTour;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const backdrop = document.createElement("div");
    backdrop.className = ADMIN_UI_CLASSES.MODAL_BACKDROP;
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "cv-admin-login-title");

    const card = document.createElement("div");
    card.className = ADMIN_UI_CLASSES.MODAL_CARD;

    const header = document.createElement("header");
    header.className = ADMIN_UI_CLASSES.MODAL_HEADER;

    const title = document.createElement("h2");
    title.id = "cv-admin-login-title";
    title.className = ADMIN_UI_CLASSES.TITLE;
    title.textContent = ADMIN_UI_TEXT.LOGIN_TITLE;

    header.append(title);

    const form = document.createElement("form");
    form.className = ADMIN_UI_CLASSES.FORM;
    form.setAttribute("autocomplete", "on");

    // Error feedback element
    const errorContainer = document.createElement("div");
    errorContainer.className = `${ADMIN_UI_CLASSES.ERROR_CONTAINER} ${ADMIN_UI_CLASSES.ERROR_HIDDEN}`;
    errorContainer.setAttribute("role", "alert");
    errorContainer.setAttribute("aria-live", "polite");

    const errorText = document.createElement("span");
    errorText.className = ADMIN_UI_CLASSES.ERROR_TEXT;
    errorText.textContent = ADMIN_UI_TEXT.LOGIN_ERROR_MESSAGE;
    errorContainer.appendChild(errorText);
    this.errorElement = errorContainer;
    this.errorTextElement = errorText;

    // User field group
    const userGroup = document.createElement("div");
    userGroup.className = ADMIN_UI_CLASSES.FORM_GROUP;

    const userLabel = document.createElement("label");
    userLabel.className = ADMIN_UI_CLASSES.INPUT_LABEL;
    userLabel.htmlFor = "cv-admin-username";
    userLabel.textContent = ADMIN_UI_TEXT.LOGIN_USER_LABEL;

    const userInput = document.createElement("input");
    userInput.id = "cv-admin-username";
    userInput.type = "text";
    userInput.autocomplete = "username";
    userInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    userInput.setAttribute("required", "true");
    this.userInput = userInput;

    userGroup.append(userLabel, userInput);

    // Password field group
    const passGroup = document.createElement("div");
    passGroup.className = ADMIN_UI_CLASSES.FORM_GROUP;

    const passLabel = document.createElement("label");
    passLabel.className = ADMIN_UI_CLASSES.INPUT_LABEL;
    passLabel.htmlFor = "cv-admin-password";
    passLabel.textContent = ADMIN_UI_TEXT.LOGIN_PASSWORD_LABEL;

    const passwordWrapper = document.createElement("div");
    passwordWrapper.className = ADMIN_UI_CLASSES.PASSWORD_WRAPPER;

    const passwordInput = document.createElement("input");
    passwordInput.id = "cv-admin-password";
    passwordInput.type = "password";
    passwordInput.autocomplete = "current-password";
    passwordInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    passwordInput.setAttribute("required", "true");
    this.passwordInput = passwordInput;

    const togglePasswordBtn = document.createElement("button");
    togglePasswordBtn.type = "button";
    togglePasswordBtn.className = ADMIN_UI_CLASSES.PASSWORD_TOGGLE_BTN;
    togglePasswordBtn.setAttribute("data-action", "toggle-password");
    this.passwordToggleBtn = togglePasswordBtn;
    this.syncPasswordToggleState(false);
    togglePasswordBtn.addEventListener("click", () => {
      const shouldReveal = passwordInput.type === "password";
      passwordInput.type = shouldReveal ? "text" : "password";
      this.syncPasswordToggleState(shouldReveal);
    });

    passwordWrapper.append(passwordInput, togglePasswordBtn);
    passGroup.append(passLabel, passwordWrapper);

    // Submit button
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = ADMIN_UI_CLASSES.BUTTON_SUBMIT;
    submitBtn.textContent = ADMIN_UI_TEXT.LOGIN_SUBMIT_LABEL;
    this.submitButton = submitBtn;

    // Return to public tour link
    const returnBtn = document.createElement("button");
    returnBtn.type = "button";
    returnBtn.className = ADMIN_UI_CLASSES.BUTTON_RETURN_LINK;
    returnBtn.textContent = ADMIN_UI_TEXT.LOGIN_RETURN_LINK;
    returnBtn.addEventListener("click", (event) => {
      event.preventDefault();
      if (this.onReturnToTour) {
        this.onReturnToTour();
      } else if (typeof window !== "undefined") {
        window.location.assign("/");
      }
    });

    form.append(errorContainer, userGroup, passGroup, submitBtn, returnBtn);

    form.addEventListener("submit", (event: unknown) => {
      const domEvent = event as { preventDefault?: () => void };
      if (domEvent && typeof domEvent.preventDefault === "function") {
        domEvent.preventDefault();
      }
      void this.handleSubmit();
    });

    card.append(header, form);
    backdrop.appendChild(card);
    parent.appendChild(backdrop);
    this.container = backdrop;
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.userInput = null;
    this.passwordInput = null;
    this.passwordToggleBtn = null;
    this.submitButton = null;
    this.errorElement = null;
    this.errorTextElement = null;
    this.isSubmitting = false;
  }

  public show(): void {
    if (this.container) {
      this.container.style.display = "flex";
      this.clearError();
      if (this.userInput && typeof this.userInput.focus === "function") {
        this.userInput.focus();
      }
    }
  }

  public hide(): void {
    if (this.container) {
      this.container.style.display = "none";
      this.clearInputs();
      this.clearError();
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  public getInputs(): { user: string; pass: string } {
    return {
      user: this.userInput?.value ?? "",
      pass: this.passwordInput?.value ?? "",
    };
  }

  public setCredentials(user: string, pass: string): void {
    if (this.userInput) {
      this.userInput.value = user;
    }
    if (this.passwordInput) {
      this.passwordInput.value = pass;
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    const user = this.userInput?.value ?? "";
    const pass = this.passwordInput?.value ?? "";

    this.isSubmitting = true;
    if (this.submitButton) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = ADMIN_UI_TEXT.LOGIN_SUBMITTING_LABEL;
    }

    try {
      const success = await this.authStore.login({
        username: user,
        password: pass,
      });

      if (success) {
        this.clearError();
        this.clearInputs();
        if (this.onLoginSuccess) {
          this.onLoginSuccess();
        }
      } else {
        const message =
          this.authStore.getLastError() === "service_unavailable"
            ? ADMIN_UI_TEXT.LOGIN_SERVICE_ERROR_MESSAGE
            : ADMIN_UI_TEXT.LOGIN_ERROR_MESSAGE;
        this.showError(message);
        if (this.passwordInput) {
          this.passwordInput.value = "";
          if (typeof this.passwordInput.focus === "function") {
            this.passwordInput.focus();
          }
        }
      }
    } finally {
      this.isSubmitting = false;
      if (this.submitButton) {
        this.submitButton.disabled = false;
        this.submitButton.textContent = ADMIN_UI_TEXT.LOGIN_SUBMIT_LABEL;
      }
    }
  }

  private showError(message: string = ADMIN_UI_TEXT.LOGIN_ERROR_MESSAGE): void {
    if (this.errorTextElement) {
      this.errorTextElement.textContent = message;
    }
    if (this.errorElement) {
      this.errorElement.classList.remove(ADMIN_UI_CLASSES.ERROR_HIDDEN);
    }
  }

  private clearError(): void {
    if (this.errorElement) {
      this.errorElement.classList.add(ADMIN_UI_CLASSES.ERROR_HIDDEN);
    }
  }

  private clearInputs(): void {
    if (this.userInput) {
      this.userInput.value = "";
    }
    if (this.passwordInput) {
      this.passwordInput.value = "";
      this.passwordInput.type = "password";
    }
    if (this.passwordToggleBtn) {
      this.syncPasswordToggleState(false);
    }
  }

  private syncPasswordToggleState(revealed: boolean): void {
    if (!this.passwordToggleBtn) {
      return;
    }
    this.passwordToggleBtn.replaceChildren(createEyeIconSvg(revealed));
    this.passwordToggleBtn.setAttribute("aria-pressed", String(revealed));
    this.passwordToggleBtn.setAttribute(
      "aria-label",
      revealed
        ? ADMIN_UI_TEXT.LOGIN_HIDE_PASSWORD_ARIA
        : ADMIN_UI_TEXT.LOGIN_SHOW_PASSWORD_ARIA,
    );
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Builds an accessible Feather-style eye / eye-off SVG without innerHTML. */
function createEyeIconSvg(revealed: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
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

  if (revealed) {
    // Eye-off icon when password is visible (clicking hides it)
    addPath("M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94");
    addPath("M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19");
    addPath("M14.12 14.12a3 3 0 1 1-4.24-4.24");
    const slash = document.createElementNS(SVG_NS, "line");
    slash.setAttribute("x1", "1");
    slash.setAttribute("y1", "1");
    slash.setAttribute("x2", "23");
    slash.setAttribute("y2", "23");
    svg.appendChild(slash);
    return svg;
  }

  // Open eye icon when password is hidden (clicking reveals it)
  addPath("M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z");
  const pupil = document.createElementNS(SVG_NS, "circle");
  pupil.setAttribute("cx", "12");
  pupil.setAttribute("cy", "12");
  pupil.setAttribute("r", "3");
  svg.appendChild(pupil);
  return svg;
}
