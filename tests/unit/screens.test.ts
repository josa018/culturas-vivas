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
    ExhibitRoomBuilder.mountRoom(resetScene, RoomId.ARCHAEOLOGY);
    setSharedInspectionController(null);
    vi.restoreAllMocks();
    document.body.innerHTML = "";
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

  it("ExperienceScreenView enters VR on show() and exits VR on hide()", () => {
    const mockScene = createMockScene();
    document.body.appendChild(mockScene);

    const experience = new ExperienceScreenView(dispatch, "vr");
    experience.mount(root);
    experience.show();

    expect(root.querySelector(".cv-badge")?.textContent).toBe("Sala de Arqueologia");
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

  it("ExitModalScreenView dispatches RESUME_TOUR, SWITCH_TO_TOUCH, and CONFIRM_EXIT", () => {
    const modal = new ExitModalScreenView(dispatch);
    expect(modal.id).toBe(ScreenId.EXIT_MODAL);
    modal.mount(root);
    const el = modal.getElement()!;

    (el.querySelector('[data-action="resume-tour"]') as HTMLElement).click();
    (el.querySelector('[data-action="switch-to-touch"]') as HTMLElement).click();
    (el.querySelector('[data-action="confirm-exit"]') as HTMLElement).click();

    expect(dispatched.map((d) => d.action)).toEqual([
      NavigationAction.RESUME_TOUR,
      NavigationAction.SWITCH_TO_TOUCH,
      NavigationAction.CONFIRM_EXIT,
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

  it("index.html includes design stylesheet and hides inactive <a-scene> to prevent FOUC", () => {
    const htmlPath = path.resolve(process.cwd(), "index.html");
    const indexHtml = fs.readFileSync(htmlPath, "utf8");

    expect(indexHtml).toContain('<link rel="stylesheet" href="/src/style.css"');
    expect(indexHtml).toContain("a-scene:not(.cv-scene--active)");
    expect(indexHtml).toContain("opacity: 0 !important");
    expect(indexHtml).toContain("visibility: hidden !important");
  });
});
