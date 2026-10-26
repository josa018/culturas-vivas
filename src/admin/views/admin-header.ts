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

    // Left brand group
    const brand = document.createElement("div");
    brand.className = ADMIN_UI_CLASSES.HEADER_BRAND;

    const titleGroup = document.createElement("div");
    titleGroup.className = ADMIN_UI_CLASSES.HEADER_TITLE_GROUP;

    const appTitle = document.createElement("h1");
    appTitle.className = ADMIN_UI_CLASSES.HEADER_APP_TITLE;
    appTitle.textContent = ADMIN_UI_TEXT.HEADER_TITLE;

    const appSubtitle = document.createElement("p");
    appSubtitle.className = ADMIN_UI_CLASSES.HEADER_APP_SUBTITLE;
    appSubtitle.textContent = ADMIN_UI_TEXT.HEADER_SUBTITLE;

    titleGroup.append(appTitle, appSubtitle);
    brand.appendChild(titleGroup);

    // Right actions group
    const actions = document.createElement("div");
    actions.className = ADMIN_UI_CLASSES.HEADER_ACTIONS;

    // User Avatar Chip (M3 style)
    const userChip = document.createElement("div");
    userChip.className = ADMIN_UI_CLASSES.HEADER_AVATAR_CHIP;

    const avatarCircle = document.createElement("span");
    avatarCircle.className = ADMIN_UI_CLASSES.HEADER_AVATAR_CIRCLE;
    avatarCircle.textContent = (this.options.username[0] || "A").toUpperCase();

    const userText = document.createElement("span");
    userText.className = ADMIN_UI_CLASSES.HEADER_USER_TEXT;
    userText.textContent = `${this.options.username} (${this.options.role})`;

    userChip.append(avatarCircle, userText);

    // Logout Button (M3 Outlined style)
    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = ADMIN_UI_CLASSES.BUTTON_LOGOUT;
    logoutBtn.textContent = ADMIN_UI_TEXT.HEADER_LOGOUT_BTN;
    logoutBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.options.onLogout();
    });

    actions.append(userChip, logoutBtn);
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
