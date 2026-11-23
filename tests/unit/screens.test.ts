import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NavigationAction, ScreenId } from "../../src/navigation/index";
import type { DispatchPayload } from "../../src/navigation/index";
import {
  SplashScreenView,
  WelcomeScreenView,
  TutorialScreenView,
  ExperienceScreenView,
  ExitModalScreenView,
  SurveyScreenView,
  UI_CLASSES,
  UI_TEXT,
  PARTNER_LOGOS,
  SPLASH_DEVELOPERS,
  SPLASH_TIMING,
} from "../../src/screens/index";
import { SURVEY_CONSTANTS } from "../../src/survey/constants";
import { SurveySubmissionService } from "../../src/survey/survey-submission-service";
import { SESSION_CONSTANTS } from "../../src/session/constants";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import { RoomId } from "../../src/experience/types";
import { setSharedInspectionController } from "../../src/experience/components/inspectable";

type MockSceneElement = HTMLElement & {
  resize?: () => void;
  enterVR?: () => Promise<void>;
  exitVR?: () => Promise<void>;
  is?: (state: string) => boolean;
  removeState?: (state: string) => void;
  play?: () => void;
  pause?: () => void;
  renderer?: { xr: { enabled: boolean } };
};

function createMockScene(): MockSceneElement {
  const scene = document.createElement("a-scene") as MockSceneElement;
  scene.resize = vi.fn();
  scene.enterVR = vi.fn(async () => {});
  scene.exitVR = vi.fn(async () => {});
  scene.is = (state: string) => state === "vr-mode";
  scene.play = vi.fn();
  scene.pause = vi.fn();
  return scene;
}

describe("Screen Views & Interactions", () => {
  let root: HTMLElement;
  let dispatched: Array<{
    action: NavigationAction;
    payload?: DispatchPayload;
  }>;
  const dispatch = (action: NavigationAction, payload?: DispatchPayload) => {
    dispatched.push({ action, payload });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    dispatched = [];
    root = document.createElement("div");
    root.id = "app";
    document.body.innerHTML = "";
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    const resetScene = document.createElement("a-scene");
    ExhibitRoomBuilder.mountRoom(resetScene, RoomId.LOBBY);
    setSharedInspectionController(null);
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("PARTNER_LOGOS and SPLASH_DEVELOPERS expose optimized WebP assets and ordered credits without legacy logos", () => {
    expect(PARTNER_LOGOS).toHaveLength(3);
    expect(PARTNER_LOGOS.map((item) => ({ src: item.src, variant: item.variant }))).toEqual([
      {
        src: "/assets/partners/cecan-nayarit-horizontal-white.webp",
        variant: "wide",
      },
      {
        src: "/assets/partners/solon-arguello-horizontal-white.webp",
        variant: "horizontal",
      },
      {
        src: "/assets/partners/ittepic-emblem.webp",
        variant: "emblem",
      },
    ]);

    for (const partner of PARTNER_LOGOS) {
      expect(partner.alt.length).toBeGreaterThan(0);
      const diskPath = path.resolve(process.cwd(), "public", partner.src.replace(/^\//, ""));
      expect(fs.existsSync(diskPath)).toBe(true);
    }

    expect(fs.existsSync(path.resolve(process.cwd(), "public/assets/logos"))).toBe(false);
    expect(UI_TEXT.SPLASH_CREDITS_LABEL).toBe("Desarrolladores");
    expect(SPLASH_DEVELOPERS).toEqual([
      "José Alfredo Camarena Martínez",
      "Rodolfo Humberto Covarrubias García",
      "Saúl Miguel González Ayala",
      "Nelly Esmeralda González Nonato",
      "Josadet Pérez Guerra",
    ]);
    expect(SPLASH_TIMING.SCENE_LOADED_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SPLASH_TIMING.POST_LOAD_REVEAL_DELAY_MS).toBeGreaterThan(0);
  });

  it("SplashScreenView renders all 3 partner logos simultaneously and keeps 5 developer credits visible before and after setReady", () => {
    const splash = new SplashScreenView(dispatch);
    splash.mount(root);

    const splashEl = splash.getElement()!;
    expect(splashEl.querySelector(".cv-splash-brand-carousel")).toBeNull();

    const footer = splashEl.querySelector(`footer.${UI_CLASSES.SPLASH_FOOTER}`) as HTMLElement;
    expect(footer).toBeTruthy();

    const partnersEl = footer.querySelector(`.${UI_CLASSES.SPLASH_PARTNERS}`) as HTMLElement;
    expect(partnersEl).toBeTruthy();
    expect(partnersEl.getAttribute("aria-live")).toBeNull();

    const partnerImgs = Array.from(partnersEl.querySelectorAll("img"));
    expect(partnerImgs).toHaveLength(3);
    expect(partnerImgs.map((img) => img.getAttribute("src"))).toEqual(
      PARTNER_LOGOS.map((p) => p.src),
    );
    expect(partnerImgs[0].classList.contains(UI_CLASSES.SPLASH_PARTNER_EMBLEM)).toBe(false);
    expect(partnerImgs[1].classList.contains(UI_CLASSES.SPLASH_PARTNER_EMBLEM)).toBe(false);
    expect(partnerImgs[2].classList.contains(UI_CLASSES.SPLASH_PARTNER_EMBLEM)).toBe(true);

    const actionSlot = splashEl.querySelector(`.${UI_CLASSES.SPLASH_ACTION_SLOT}`) as HTMLElement;
    expect(actionSlot).toBeTruthy();
    expect(actionSlot.querySelector('[data-action="enter"]')).toBeTruthy();

    const creditsLabel = footer.querySelector(`.${UI_CLASSES.SPLASH_CREDITS_LABEL}`) as HTMLElement;
    expect(creditsLabel.textContent).toBe(UI_TEXT.SPLASH_CREDITS_LABEL);

    const creditItems = Array.from(
      footer.querySelectorAll(`.${UI_CLASSES.SPLASH_CREDITS_LIST} > .${UI_CLASSES.SPLASH_CREDITS_ITEM}`),
    ) as HTMLElement[];
    expect(creditItems.map((li) => li.textContent)).toEqual([...SPLASH_DEVELOPERS]);

    splash.setReady();

    expect(footer.style.display).not.toBe("none");
    for (const item of creditItems) {
      expect(item.style.display).not.toBe("none");
    }
    for (const img of partnerImgs) {
      expect(img.style.display).not.toBe("none");
    }

    splash.unmount();
  });

  it("SplashScreenView ignores clicks until ready, then dispatches FINISH_LOADING", () => {
    const splash = new SplashScreenView(dispatch);
    expect(splash.id).toBe(ScreenId.SPLASH);
    splash.mount(root);
    splash.show();

    const splashEl = splash.getElement()!;
    const enterBtn = splashEl.querySelector('[data-action="enter"]') as HTMLElement;
    expect(enterBtn.style.display).toBe("none");

    // Clicking splash before ready does not dispatch
    splashEl.click();
    expect(dispatched).toHaveLength(0);

    splash.setReady();
    expect(enterBtn.style.display).toBe("inline-block");

    // Clicking splash background, partner logos, or credits footer after ready must NOT navigate
    splashEl.click();
    (splashEl.querySelector(`.${UI_CLASSES.SPLASH_FOOTER}`) as HTMLElement).click();
    (splashEl.querySelector(`.${UI_CLASSES.SPLASH_PARTNERS} img`) as HTMLElement).click();
    expect(dispatched).toHaveLength(0);

    enterBtn.click();
    expect(dispatched).toEqual([{ action: NavigationAction.FINISH_LOADING, payload: undefined }]);

    splash.unmount();
    expect(splash.getElement()).toBeNull();
  });

  it("WelcomeScreenView dispatches SELECT_VR and SELECT_2D", () => {
    const welcome = new WelcomeScreenView(dispatch);
    expect(welcome.id).toBe(ScreenId.WELCOME);
    welcome.mount(root);
    const el = welcome.getElement()!;

    (el.querySelector('[data-action="vr"]') as HTMLElement).click();
    (el.querySelector('[data-action="2d"]') as HTMLElement).click();

    expect(dispatched.map((d) => d.action)).toEqual([
      NavigationAction.SELECT_VR,
      NavigationAction.SELECT_2D,
    ]);
  });

  it("TutorialScreenView dispatches CONFIRM_INSERTION", () => {
    const tutorial = new TutorialScreenView(dispatch);
    expect(tutorial.id).toBe(ScreenId.TUTORIAL);
    tutorial.mount(root);

    (tutorial.getElement()!.querySelector('[data-action="confirm-insertion"]') as HTMLElement).click();
    expect(dispatched.map((d) => d.action)).toEqual([
      NavigationAction.CONFIRM_INSERTION,
    ]);
  });

  it("TutorialScreenView renders emoji-free sound prompt, permission instructions, and single Activar/Desactivar toggle", async () => {
    const { AudioPreferencesStore } = await import("../../src/experience/audio/audio-preferences-store");
    const prefs = new AudioPreferencesStore({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    const unlockAudio = vi.fn(async () => true);
    const unlockVideo = vi.fn(async () => {});

    const tutorial = new TutorialScreenView(dispatch, {
      audioPreferencesStore: prefs,
      audioEngine: { unlockFromUserGesture: unlockAudio },
      videoController: { unlockFromUserGesture: unlockVideo },
    });
    tutorial.mount(root);
    const el = tutorial.getElement()!;

    const card = el.querySelector(`.${UI_CLASSES.TUTORIAL_SOUND_CARD}`) as HTMLElement;
    expect(card).toBeTruthy();
    expect(UI_TEXT.TUTORIAL_SOUND_TITLE).toBe(
      "Activa sonido si cuentas con audífonos",
    );
    expect(card.textContent).toContain(UI_TEXT.TUTORIAL_SOUND_TITLE);
    expect(el.textContent).toMatch(/permiso/i);

    const toggleBtn = el.querySelector(
      '[data-action="toggle-sound"]',
    ) as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    expect(el.querySelector('[data-action="activate-sound"]')).toBeNull();
    expect(el.querySelector('[data-action="skip-sound"]')).toBeNull();
    expect(toggleBtn.textContent).toBe(UI_TEXT.TUTORIAL_SOUND_ACTIVATE);
    expect(toggleBtn.classList.contains("cv-tutorial-sound-btn")).toBe(true);
    expect(toggleBtn.classList.contains("cv-tutorial-sound-btn--active")).toBe(
      false,
    );

    // First click activates Master + unlocks AudioEngine & SharedVideoController and changes label to Desactivar
    toggleBtn.click();
    expect(prefs.getPreferences().masterEnabled).toBe(true);
    expect(prefs.getPreferences().mediaMuted).toBe(false);
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(unlockVideo).toHaveBeenCalledTimes(1);
    expect(toggleBtn.textContent).toBe(UI_TEXT.TUTORIAL_SOUND_DEACTIVATE);
    expect(toggleBtn.classList.contains("cv-tutorial-sound-btn--active")).toBe(
      true,
    );
    expect(dispatched).toHaveLength(0);

    // Second click deactivates Master without calling unlock again and restores Activar
    toggleBtn.click();
    expect(prefs.getPreferences().masterEnabled).toBe(false);
    expect(prefs.getPreferences().mediaMuted).toBe(true);
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(unlockVideo).toHaveBeenCalledTimes(1);
    expect(toggleBtn.textContent).toBe(UI_TEXT.TUTORIAL_SOUND_ACTIVATE);
    expect(toggleBtn.classList.contains("cv-tutorial-sound-btn--active")).toBe(
      false,
    );

    // Third click enables again before confirming insertion
    toggleBtn.click();
    expect(prefs.getPreferences().masterEnabled).toBe(true);
    expect(unlockAudio).toHaveBeenCalledTimes(2);
    expect(unlockVideo).toHaveBeenCalledTimes(2);

    (el.querySelector('[data-action="confirm-insertion"]') as HTMLElement).click();
    expect(unlockAudio).toHaveBeenCalledTimes(3);
    expect(dispatched.map((d) => d.action)).toEqual([
      NavigationAction.CONFIRM_INSERTION,
    ]);
  });

  it("ExperienceScreenView enters VR on show() and exits VR on hide()", () => {
    const mockScene = createMockScene();
    document.body.appendChild(mockScene);

    const experience = new ExperienceScreenView(dispatch, "vr");
    experience.mount(root);
    experience.show();

    expect(root.querySelector(".cv-badge")?.textContent).toBe("Vestíbulo Cultural");
    expect(mockScene.enterVR).toHaveBeenCalledTimes(1);
    expect(mockScene.resize).not.toHaveBeenCalled();
    expect(mockScene.classList.contains(UI_CLASSES.SCENE_ACTIVE)).toBe(true);

    experience.hide();
    expect(mockScene.exitVR).toHaveBeenCalledTimes(1);
    expect(mockScene.classList.contains(UI_CLASSES.SCENE_ACTIVE)).toBe(false);
    experience.unmount();
  });

  it("ExperienceScreenView unlocks 2D touch look-controls and resizes viewport in 2D mode", () => {
    const mockScene = createMockScene();
    const removedStates: string[] = [];
    mockScene.removeState = (s) => removedStates.push(s);
    mockScene.renderer = { xr: { enabled: true } };

    const mockCamera = document.createElement("a-camera") as HTMLElement & {
      object3D?: { matrixAutoUpdate: boolean; updateMatrix: () => void };
      components?: Record<
        string,
        {
          touchStarted: boolean;
          mouseDown: boolean;
          data: { touchEnabled: boolean; enabled: boolean };
          addEventListeners: () => void;
        }
      >;
    };
    const updateMatrix = vi.fn();
    const addEventListeners = vi.fn();
    mockCamera.object3D = { matrixAutoUpdate: false, updateMatrix };
    mockCamera.components = {
      "look-controls": {
        touchStarted: true,
        mouseDown: true,
        data: { touchEnabled: false, enabled: false },
        addEventListeners,
      },
    };
    mockScene.appendChild(mockCamera);
    document.body.appendChild(mockScene);

    const experience = new ExperienceScreenView(dispatch, "2d");
    experience.mount(root);
    experience.show();

    // Flush exitVR microtask & requestAnimationFrame
    return vi.runAllTimersAsync().then(() => {
      expect(mockScene.exitVR).toHaveBeenCalledTimes(1);
      expect(mockScene.resize).toHaveBeenCalledTimes(1);
      expect(mockCamera.object3D?.matrixAutoUpdate).toBe(true);
      expect(updateMatrix).toHaveBeenCalled();
      expect(mockScene.renderer?.xr?.enabled).toBe(false);
      expect(mockCamera.components?.["look-controls"].touchStarted).toBe(false);
      expect(mockCamera.components?.["look-controls"].mouseDown).toBe(false);
      expect(mockCamera.components?.["look-controls"].data.touchEnabled).toBe(true);
      expect(addEventListeners).toHaveBeenCalled();
      expect(removedStates).toContain("vr-mode");
      experience.unmount();
    });
  });

  it("ExperienceScreenView dispatches REQUEST_EXIT on HUD click or native VR exit-vr, and suppresses exit-vr during programmatic exit", async () => {
    const mockScene = createMockScene();
    let resolveExitVR: () => void = () => {};
    mockScene.exitVR = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveExitVR = resolve;
        }),
    );
    document.body.appendChild(mockScene);

    const experience = new ExperienceScreenView(dispatch, "vr");
    experience.mount(root);
    experience.show();

    (experience.getElement()!.querySelector('[data-action="request-exit"]') as HTMLElement).click();
    expect(dispatched.map((d) => d.action)).toEqual([NavigationAction.REQUEST_EXIT]);

    mockScene.dispatchEvent(new CustomEvent("exit-vr"));
    expect(dispatched.map((d) => d.action)).toEqual([
      NavigationAction.REQUEST_EXIT,
      NavigationAction.REQUEST_EXIT,
    ]);

    // Programmatic exit via retainBackground() ignores exit-vr while in flight
    experience.retainBackground();
    expect(mockScene.style.display).toBe("block");
    expect(experience.getElement()!.classList.contains(UI_CLASSES.SCREEN_HIDDEN)).toBe(true);
    mockScene.dispatchEvent(new CustomEvent("exit-vr"));
    expect(dispatched).toHaveLength(2);

    resolveExitVR();
    await Promise.resolve();
    experience.unmount();
  });

  it("ExperienceScreenView handles enterVR/exitVR promise rejections without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockScene = createMockScene();
    mockScene.enterVR = vi.fn().mockRejectedValue(new Error("WebXR blocked"));
    mockScene.exitVR = vi.fn().mockRejectedValue(new Error("Exit failed"));
    document.body.appendChild(mockScene);

    const experience = new ExperienceScreenView(dispatch, "vr");
    experience.mount(root);
    experience.show();
    experience.hide();
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledTimes(2);
    experience.unmount();
  });

  it("ExitModalScreenView dispatches RESUME_TOUR, contextual SWITCH_TO_TOUCH / SWITCH_TO_VR, and CONFIRM_EXIT", () => {
    const modal = new ExitModalScreenView(dispatch);
    expect(modal.id).toBe(ScreenId.EXIT_MODAL);
    modal.mount(root);
    const el = modal.getElement()!;

    // Default VR mode shows switch-to-touch
    expect(
      el.querySelector('[data-action="switch-to-touch"]')?.textContent,
    ).toBe(UI_TEXT.EXIT_MODAL_BTN_SWITCH_TOUCH);

    (el.querySelector('[data-action="resume-tour"]') as HTMLElement).click();
    (el.querySelector('[data-action="switch-to-touch"]') as HTMLElement).click();
    (el.querySelector('[data-action="confirm-exit"]') as HTMLElement).click();

    // Switching to 2D Touch mode updates the button to switch-to-vr
    modal.setViewMode("2d");
    const vrBtn = el.querySelector('[data-action="switch-to-vr"]') as HTMLElement;
    expect(vrBtn).toBeTruthy();
    expect(vrBtn.textContent).toBe(UI_TEXT.EXIT_MODAL_BTN_SWITCH_VR);
    vrBtn.click();

    expect(dispatched.map((d) => d.action)).toEqual([
      NavigationAction.RESUME_TOUR,
      NavigationAction.SWITCH_TO_TOUCH,
      NavigationAction.CONFIRM_EXIT,
      NavigationAction.SWITCH_TO_VR,
    ]);
  });

  it("SurveyScreenView updates rating stars, submits via SurveySubmissionService, guards duplicate clicks, and supports skip", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    let resolvePost: (value: unknown) => void = () => {};

    const storage = {
      getItem: (key: string) =>
        key === SESSION_CONSTANTS.STORAGE_KEY
          ? "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d"
          : null,
      setItem: () => {},
      removeItem: () => {},
    };
    const fetcher = {
      post: async <T = unknown>(url: string, body?: unknown): Promise<T> => {
        calls.push({ url, body });
        return (await new Promise<unknown>((resolve) => {
          resolvePost = resolve;
        })) as T;
      },
    };

    const survey = new SurveyScreenView(
      dispatch,
      new SurveySubmissionService(storage, fetcher),
    );
    survey.mount(root);
    survey.show();

    const el = survey.getElement()!;
    const ratingButtons = el.querySelectorAll("[data-rating]");
    expect(ratingButtons).toHaveLength(
      SURVEY_CONSTANTS.RATING.MAX - SURVEY_CONSTANTS.RATING.MIN + 1,
    );

    const feedbackInput = el.querySelector("#cv-feedback-input") as HTMLTextAreaElement;
    expect(feedbackInput.maxLength).toBe(SURVEY_CONSTANTS.FEEDBACK.MAX_LENGTH);

    // Selecting rating 2 activates buttons 1-2 and deactivates 3-5
    (el.querySelector('[data-rating="2"]') as HTMLButtonElement).click();
    expect(ratingButtons[0].classList.contains(UI_CLASSES.RATING_ACTIVE)).toBe(true);
    expect(ratingButtons[1].classList.contains(UI_CLASSES.RATING_ACTIVE)).toBe(true);
    expect(ratingButtons[2].classList.contains(UI_CLASSES.RATING_ACTIVE)).toBe(false);

    feedbackInput.value = "  Muy buena experiencia  ";

    const submitBtn = el.querySelector('[data-action="submit-survey"]') as HTMLButtonElement;
    submitBtn.click();
    submitBtn.click();

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      action: NavigationAction.COMPLETE_SURVEY,
      payload: {
        surveyAnswers: { rating: 2, feedback: "Muy buena experiencia" },
      },
    });
    expect(submitBtn.disabled).toBe(true);
    expect(calls).toEqual([
      {
        url: SURVEY_CONSTANTS.ENDPOINTS.SUBMIT,
        body: {
          sessionId: "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
          rating: 2,
          feedback: "Muy buena experiencia",
        },
      },
    ]);

    resolvePost({ ok: true });
    await vi.waitFor(() => expect(submitBtn.disabled).toBe(false));

    (el.querySelector('[data-action="skip-survey"]') as HTMLElement).click();
    expect(dispatched[1].action).toBe(NavigationAction.SKIP_SURVEY);
  });

  it("src/style.css defines responsive splash layout classes, emblem contrast rule, and removes legacy brand carousel", () => {
    const cssPath = path.resolve(process.cwd(), "src/style.css");
    const styleCss = fs.readFileSync(cssPath, "utf8");

    expect(styleCss).toContain(".cv-splash-shell");
    expect(styleCss).toMatch(/\.cv-splash-shell\s*\{[^}]*min-height:\s*100%/);
    expect(styleCss).toMatch(/\.cv-splash-hero\s*\{[^}]*margin-block:\s*auto/);
    expect(styleCss).toMatch(/\.cv-splash-credits-list\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(styleCss).toContain(".cv-splash-action-slot");
    expect(styleCss).toContain(".cv-splash-partners");
    expect(styleCss).toContain(".cv-splash-partner-logo--emblem");
    expect(styleCss).toContain("@media (min-width: 640px)");
    expect(styleCss).toContain("@media (orientation: landscape) and (max-height: 520px)");
    expect(styleCss).not.toContain(".cv-splash-brand-carousel");
  });

  it("index.html includes design stylesheet and hides inactive <a-scene> to prevent FOUC", () => {
    const htmlPath = path.resolve(process.cwd(), "index.html");
    const indexHtml = fs.readFileSync(htmlPath, "utf8");

    expect(indexHtml).toContain('<link rel="stylesheet" href="/src/style.css"');
    expect(indexHtml).toContain("a-scene:not(.cv-scene--active)");
    expect(indexHtml).toContain("opacity: 0 !important");
    expect(indexHtml).toContain("visibility: hidden !important");
  });

  it("WelcomeScreenView and ExperienceScreenView omit any Eco Mode toggle while preserving primary navigation actions", () => {
    const welcome = new WelcomeScreenView(dispatch);
    welcome.mount(root);

    expect(root.querySelector('[data-action="toggle-eco"]')).toBeNull();
    expect(root.querySelector(".cv-eco-toggle-wrap")).toBeNull();
    expect(root.querySelector('[data-action="vr"]')).not.toBeNull();
    expect(root.querySelector('[data-action="2d"]')).not.toBeNull();
    welcome.unmount();

    const scene = createMockScene();
    document.body.appendChild(scene);

    const exp = new ExperienceScreenView(dispatch, "2d");
    exp.mount(root);

    expect(root.querySelector('[data-action="toggle-eco"]')).toBeNull();
    expect(root.querySelector('[data-action="request-exit"]')).not.toBeNull();
    exp.unmount();
  });
});
