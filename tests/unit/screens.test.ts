import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
    dispatched = [];
    root = document.createElement("div");
    root.id = "app";
    document.body.innerHTML = "";
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts Splash screen, updates readiness and dispatches FINISH_LOADING on enter", () => {
    const splash = new SplashScreenView(dispatch);
    expect(splash.id).toBe(ScreenId.SPLASH);
    splash.mount(root);
    expect(splash.getElement()).toBeTruthy();
    splash.show();

    const splashEl = splash.getElement()!;
    const enterBtn = splashEl.querySelector(
      '[data-action="enter"]',
    ) as HTMLElement;
    expect(enterBtn).toBeTruthy();
    expect(enterBtn.style.display).toBe("none");

    splash.setReady();
    expect(enterBtn.style.display).toBe("inline-block");

    enterBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.FINISH_LOADING,
    );
  });

  it("mounts Welcome screen and dispatches SELECT_VR & SELECT_2D", () => {
    const welcome = new WelcomeScreenView(dispatch);
    expect(welcome.id).toBe(ScreenId.WELCOME);
    welcome.mount(root);
    const el = welcome.getElement()!;

    const vrBtn = el.querySelector('[data-action="vr"]') as HTMLElement;
    expect(vrBtn).toBeTruthy();
    vrBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.SELECT_VR,
    );

    const touchBtn = el.querySelector('[data-action="2d"]') as HTMLElement;
    expect(touchBtn).toBeTruthy();
    touchBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.SELECT_2D,
    );
  });

  it("mounts Tutorial screen and dispatches CONFIRM_INSERTION", () => {
    const tutorial = new TutorialScreenView(dispatch);
    expect(tutorial.id).toBe(ScreenId.TUTORIAL);
    tutorial.mount(root);
    const el = tutorial.getElement()!;

    const startBtn = el.querySelector(
      '[data-action="confirm-insertion"]',
    ) as HTMLElement;
    expect(startBtn).toBeTruthy();
    startBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.CONFIRM_INSERTION,
    );
  });

  it("manages Experience HUD, viewport synchronization, enterVR/exitVR, and 2D touch unlock", async () => {
    const mockScene = document.createElement("a-scene") as HTMLElement & {
      resize?: () => void;
      enterVR?: () => Promise<void>;
      exitVR?: () => Promise<void>;
      is?: (state: string) => boolean;
      removeState?: (state: string) => void;
      renderer?: { xr: { enabled: boolean } };
    };

    let resizeInvoked = false;
    let enterVRCount = 0;
    let exitVRCount = 0;

    mockScene.resize = () => {
      resizeInvoked = true;
    };
    mockScene.enterVR = async () => {
      enterVRCount++;
    };
    mockScene.exitVR = async () => {
      exitVRCount++;
    };
    mockScene.is = (state: string) => state === "vr-mode";

    document.body.appendChild(mockScene);

    const experience = new ExperienceScreenView(dispatch, "vr");
    expect(experience.id).toBe(ScreenId.EXPERIENCE_3D);
    experience.mount(root);
    experience.show();

    expect(root.querySelector(".cv-badge")?.textContent).toBe(
      "Sala de Arqueologia",
    );
    expect(resizeInvoked).toBe(false);
    expect(enterVRCount).toBe(1);
    expect(mockScene.classList.contains(UI_CLASSES.SCENE_ACTIVE)).toBe(true);

    experience.hide();
    expect(exitVRCount).toBe(1);
    expect(mockScene.classList.contains(UI_CLASSES.SCENE_ACTIVE)).toBe(false);

    // Test 2D mode
    experience.setViewMode("2d");
    experience.show();
    await new Promise((r) => setTimeout(r, 10));
    expect(resizeInvoked).toBe(true);
    expect(exitVRCount).toBe(2);

    experience.hide();
    expect(exitVRCount).toBe(3);

    experience.show();
    const el = experience.getElement()!;
    const exitHudBtn = el.querySelector(
      '[data-action="request-exit"]',
    ) as HTMLElement;
    expect(exitHudBtn).toBeTruthy();
    exitHudBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.REQUEST_EXIT,
    );

    // Test native exit-vr event in VR mode
    experience.setViewMode("vr");
    experience.show();
    const initialDispatchedCount = dispatched.length;
    mockScene.dispatchEvent(new CustomEvent("exit-vr"));
    expect(dispatched.length).toBe(initialDispatchedCount + 1);
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.REQUEST_EXIT,
    );

    // Test retainBackground() decoupling
    const enterVRCountBeforeRetain = enterVRCount;
    experience.retainBackground();
    expect(enterVRCount).toBe(enterVRCountBeforeRetain);
    expect(mockScene.style.display).toBe("block");
    const hudContainer = experience.getElement()!;
    expect(hudContainer.classList.contains(UI_CLASSES.SCREEN_HIDDEN)).toBe(
      true,
    );

    // Test 2D Touch Mode Camera Unlock & Viewport Sanitization after exiting VR
    const mockCamera = document.createElement("a-camera") as HTMLElement & {
      object3D?: {
        matrixAutoUpdate: boolean;
        updateMatrix: () => void;
      };
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

    let cameraMatrixUpdated = false;
    let lookControlsAddListenersCalled = false;

    mockCamera.object3D = {
      matrixAutoUpdate: false,
      updateMatrix: () => {
        cameraMatrixUpdated = true;
      },
    };
    mockCamera.components = {
      "look-controls": {
        touchStarted: true,
        mouseDown: true,
        data: { touchEnabled: false, enabled: false },
        addEventListeners: () => {
          lookControlsAddListenersCalled = true;
        },
      },
    };
    mockScene.appendChild(mockCamera);

    const removedStates: string[] = [];
    mockScene.removeState = (s: string) => {
      removedStates.push(s);
    };
    mockScene.renderer = {
      xr: { enabled: true },
    };

    // Transition back into 2D mode
    experience.setViewMode("2d");
    experience.show();

    const cameraObj3D = mockCamera.object3D!;
    expect(cameraObj3D.matrixAutoUpdate).toBe(true);
    expect(cameraMatrixUpdated).toBe(true);
    expect(mockScene.renderer.xr.enabled).toBe(false);

    const cameraControls = mockCamera.components!["look-controls"];
    expect(cameraControls.touchStarted).toBe(false);
    expect(cameraControls.mouseDown).toBe(false);
    expect(cameraControls.data.touchEnabled).toBe(true);
    expect(lookControlsAddListenersCalled).toBe(true);
    expect(removedStates).toContain("vr-mode");
  });

  it("mounts Exit Modal and dispatches RESUME_TOUR, SWITCH_TO_TOUCH, and CONFIRM_EXIT", () => {
    const modal = new ExitModalScreenView(dispatch);
    expect(modal.id).toBe(ScreenId.EXIT_MODAL);
    modal.mount(root);
    const el = modal.getElement()!;

    const resumeBtn = el.querySelector(
      '[data-action="resume-tour"]',
    ) as HTMLElement;
    expect(resumeBtn).toBeTruthy();
    resumeBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.RESUME_TOUR,
    );

    const switchTouchBtn = el.querySelector(
      '[data-action="switch-to-touch"]',
    ) as HTMLElement;
    expect(switchTouchBtn).toBeTruthy();
    switchTouchBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.SWITCH_TO_TOUCH,
    );

    const exitBtn = el.querySelector(
      '[data-action="confirm-exit"]',
    ) as HTMLElement;
    expect(exitBtn).toBeTruthy();
    exitBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.CONFIRM_EXIT,
    );
  });

  it("mounts Survey screen and dispatches COMPLETE_SURVEY and SKIP_SURVEY", () => {
    const survey = new SurveyScreenView(dispatch);
    expect(survey.id).toBe(ScreenId.SURVEY);
    survey.mount(root);
    const el = survey.getElement()!;

    const submitBtn = el.querySelector(
      '[data-action="submit-survey"]',
    ) as HTMLElement;
    expect(submitBtn).toBeTruthy();
    submitBtn.click();
    const lastDispatch = dispatched[dispatched.length - 1];
    expect(lastDispatch.action).toBe(NavigationAction.COMPLETE_SURVEY);
    expect(lastDispatch.payload?.surveyAnswers?.rating).toBe(5);

    const skipBtn = el.querySelector(
      '[data-action="skip-survey"]',
    ) as HTMLElement;
    expect(skipBtn).toBeTruthy();
    skipBtn.click();
    expect(dispatched[dispatched.length - 1].action).toBe(
      NavigationAction.SKIP_SURVEY,
    );
  });

  it("verifies index.html markup for stylesheet and FOUC prevention", () => {
    const htmlPath = path.resolve(process.cwd(), "index.html");
    const indexHtml = fs.readFileSync(htmlPath, "utf8");

    expect(indexHtml).toContain('<link rel="stylesheet" href="/src/style.css"');
    expect(indexHtml).toContain("background-color: #111318");
    expect(indexHtml).toContain("a-scene:not(.cv-scene--active)");
    expect(indexHtml).toContain("opacity: 0 !important");
    expect(indexHtml).toContain("visibility: hidden !important");
  });
});
