import { ADMIN_UI_CLASSES, ADMIN_UI_TEXT } from "../constants";

export interface AdminHeaderOptions {
  readonly username: string;
  readonly role: string;
  readonly onLogout: () => void;
}

export class AdminHeaderWidget {
  private container: HTMLElement | null = null;
  private readonly options: AdminHeaderOptions;

  constructor(options: AdminHeaderOptions) {
    this.options = options;
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const header = document.createElement("header");
    header.className = ADMIN_UI_CLASSES.HEADER;

    const brand = document.createElement("div");
    brand.className = ADMIN_UI_CLASSES.HEADER_BRAND;

    const title = document.createElement("h1");
    title.className = ADMIN_UI_CLASSES.TITLE;
    title.textContent = ADMIN_UI_TEXT.HEADER_TITLE;

    const badge = document.createElement("span");
    badge.className = ADMIN_UI_CLASSES.HEADER_BADGE;
    badge.textContent = `● ${ADMIN_UI_TEXT.HEADER_STATUS_ONLINE}`;

    brand.append(title, badge);

    const actions = document.createElement("div");
    actions.className = ADMIN_UI_CLASSES.HEADER_ACTIONS;

    const userInfo = document.createElement("span");
    userInfo.className = ADMIN_UI_CLASSES.HEADER_USER;
    userInfo.textContent = `${this.options.username} (${this.options.role})`;

    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = ADMIN_UI_CLASSES.BUTTON_LOGOUT;
    logoutBtn.textContent = ADMIN_UI_TEXT.HEADER_LOGOUT_BTN;
    logoutBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.options.onLogout();
    });

    actions.append(userInfo, logoutBtn);
    header.append(brand, actions);

    parent.appendChild(header);
    this.container = header;
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }
}
