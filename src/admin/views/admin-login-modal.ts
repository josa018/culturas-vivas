import { AdminAuthStore } from "../admin-auth-store";
import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

export interface AdminLoginModalOptions {
  readonly authStore: AdminAuthStore;
  readonly onLoginSuccess?: () => void;
}

export class AdminLoginModalView {
  private container: HTMLElement | null = null;
  private userInput: HTMLInputElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private errorElement: HTMLElement | null = null;
  private readonly authStore: AdminAuthStore;
  private readonly onLoginSuccess?: () => void;

  constructor(options: AdminLoginModalOptions) {
    this.authStore = options.authStore;
    this.onLoginSuccess = options.onLoginSuccess;
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

    header.appendChild(title);

    const form = document.createElement("form");
    form.className = ADMIN_UI_CLASSES.FORM;
    form.setAttribute("autocomplete", "off");

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

    const passwordInput = document.createElement("input");
    passwordInput.id = "cv-admin-password";
    passwordInput.type = "password";
    passwordInput.className = ADMIN_UI_CLASSES.INPUT_TEXT;
    passwordInput.setAttribute("required", "true");
    this.passwordInput = passwordInput;

    passGroup.append(passLabel, passwordInput);

    // Submit button
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = ADMIN_UI_CLASSES.BUTTON_SUBMIT;
    submitBtn.textContent = ADMIN_UI_TEXT.LOGIN_SUBMIT_LABEL;

    form.append(errorContainer, userGroup, passGroup, submitBtn);

    form.addEventListener("submit", (event: unknown) => {
      const domEvent = event as { preventDefault?: () => void };
      if (domEvent && typeof domEvent.preventDefault === "function") {
        domEvent.preventDefault();
      }
      this.handleSubmit();
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
    this.errorElement = null;
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

  private handleSubmit(): void {
    const user = this.userInput?.value ?? "";
    const pass = this.passwordInput?.value ?? "";

    const success = this.authStore.login({
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
      this.showError();
      if (this.passwordInput) {
        this.passwordInput.value = "";
        if (typeof this.passwordInput.focus === "function") {
          this.passwordInput.focus();
        }
      }
    }
  }

  private showError(): void {
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
    }
  }
}
