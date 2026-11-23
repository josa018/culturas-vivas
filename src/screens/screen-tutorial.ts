import { ScreenId, NavigationAction } from "../navigation/index";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";
import {
  getSharedVideoController,
  type SharedVideoController,
} from "../experience/shared-video-controller";
import {
  AudioPreferencesStore,
  getSharedAudioPreferencesStore,
} from "../experience/audio/audio-preferences-store";
import {
  AudioEngine,
  getSharedAudioEngine,
} from "../experience/audio/audio-engine";

export interface TutorialScreenOptions {
  readonly audioPreferencesStore?: AudioPreferencesStore;
  readonly audioEngine?: Pick<AudioEngine, "unlockFromUserGesture">;
  readonly videoController?: Pick<
    SharedVideoController,
    "unlockFromUserGesture"
  >;
}

export class TutorialScreenView implements ScreenView {
  public readonly id = ScreenId.TUTORIAL;
  private container: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private readonly audioPreferencesStore: AudioPreferencesStore;
  private readonly audioEngine: Pick<AudioEngine, "unlockFromUserGesture">;
  private readonly videoController: Pick<
    SharedVideoController,
    "unlockFromUserGesture"
  >;
  private toggleSoundBtnEl: HTMLButtonElement | null = null;

  constructor(
    dispatch: NavigationDispatcher,
    options: TutorialScreenOptions = {},
  ) {
    this.dispatch = dispatch;
    this.audioPreferencesStore =
      options.audioPreferencesStore ?? getSharedAudioPreferencesStore();
    this.audioEngine = options.audioEngine ?? getSharedAudioEngine();
    this.videoController = options.videoController ?? getSharedVideoController();
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const element = document.createElement("section");
    element.className = `${UI_CLASSES.SCREEN_CONTAINER} cv-screen--tutorial`;
    element.setAttribute("data-screen-id", this.id);

    const card = document.createElement("div");
    card.className = "cv-tutorial-card";

    const title = document.createElement("h2");
    title.className = "cv-title";
    title.textContent = UI_TEXT.TUTORIAL_TITLE;

    const illustration = document.createElement("div");
    illustration.className = "cv-guide-illustration";
    illustration.setAttribute("aria-hidden", "true");

    const phone = document.createElement("div");
    phone.className = "cv-phone-silhouette";

    const notch = document.createElement("span");
    notch.className = "cv-center-notch";
    phone.appendChild(notch);
    illustration.appendChild(phone);

    const list = document.createElement("ol");
    list.className = "cv-instructions-list";

    const steps = [
      UI_TEXT.TUTORIAL_STEP_1,
      UI_TEXT.TUTORIAL_STEP_2,
      UI_TEXT.TUTORIAL_STEP_3,
      UI_TEXT.TUTORIAL_STEP_4,
    ];

    for (const stepText of steps) {
      const item = document.createElement("li");
      item.textContent = stepText;
      list.appendChild(item);
    }

    const soundCard = document.createElement("div");
    soundCard.className = UI_CLASSES.TUTORIAL_SOUND_CARD;

    const soundTitle = document.createElement("p");
    soundTitle.textContent = UI_TEXT.TUTORIAL_SOUND_TITLE;

    const soundActions = document.createElement("div");
    soundActions.className = UI_CLASSES.TUTORIAL_SOUND_ACTIONS;

    const toggleSoundBtn = document.createElement("button");
    toggleSoundBtn.type = "button";
    toggleSoundBtn.className = UI_CLASSES.BUTTON_SECONDARY;
    toggleSoundBtn.setAttribute("data-action", "toggle-sound");
    this.toggleSoundBtnEl = toggleSoundBtn;
    this.syncSoundToggle();

    toggleSoundBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = this.audioPreferencesStore.toggleMaster();
      if (next.masterEnabled) {
        void this.audioEngine.unlockFromUserGesture();
        void this.videoController.unlockFromUserGesture();
      }
      this.syncSoundToggle();
    });

    soundActions.append(toggleSoundBtn);
    soundCard.append(soundTitle, soundActions);

    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.className = UI_CLASSES.BUTTON_PRIMARY;
    startButton.setAttribute("data-action", "confirm-insertion");

    const btnLabel = document.createElement("span");
    btnLabel.textContent = UI_TEXT.TUTORIAL_BTN_START;
    startButton.appendChild(btnLabel);

    startButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.videoController.unlockFromUserGesture();
      this.dispatch(NavigationAction.CONFIRM_INSERTION);
    });

    card.append(title, illustration, list, soundCard, startButton);
    element.appendChild(card);

    parent.appendChild(element);
    this.container = element;
  }

  public unmount(): void {
    this.toggleSoundBtnEl = null;
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    this.syncSoundToggle();
    if (this.container) {
      this.container.classList.add(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.remove(UI_CLASSES.SCREEN_HIDDEN);
    }
  }

  private syncSoundToggle(): void {
    if (!this.toggleSoundBtnEl) {
      return;
    }
    const enabled = this.audioPreferencesStore.getPreferences().masterEnabled;
    this.toggleSoundBtnEl.textContent = enabled
      ? UI_TEXT.TUTORIAL_SOUND_DEACTIVATE
      : UI_TEXT.TUTORIAL_SOUND_ACTIVATE;
    this.toggleSoundBtnEl.setAttribute("aria-pressed", String(enabled));
  }

  public hide(): void {
    if (this.container) {
      this.container.classList.remove(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.add(UI_CLASSES.SCREEN_HIDDEN);
    }
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }
}
