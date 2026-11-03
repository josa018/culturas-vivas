import fs from "node:fs";
import path from "node:path";
import { assert } from "../helpers/assert";
import { MockElement, setupMockDocument } from "../helpers/mock_dom";
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

function runScreensUnitTests(): void {
  console.log("--- [UNIT TEST] Screen Views & Interactions ---");

  setupMockDocument();
  const root = new MockElement("div") as unknown as HTMLElement;
  const dispatched: Array<{
    action: NavigationAction;
    payload?: DispatchPayload;
  }> = [];
  const dispatch = (action: NavigationAction, payload?: DispatchPayload) => {
    dispatched.push({ action, payload });
  };

  // Screen 1: Splash
  {
    const splash = new SplashScreenView(dispatch);
    assert.equal(splash.id, ScreenId.SPLASH);
    splash.mount(root);
    assert.ok(splash.getElement());
    splash.show();

    const splashEl = splash.getElement() as unknown as MockElement;
    const enterBtn = splashEl.querySelector(
      '[data-action="enter"]',
    ) as MockElement;
    assert.ok(enterBtn, "Enter button must be rendered in DOM");
    assert.equal(enterBtn.style.display, "none");

    splash.setReady();
    assert.equal(enterBtn.style.display, "inline-block");

    enterBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.FINISH_LOADING,
    );
    console.log(
      "✓ Screen 1 (Splash) mounted, set ready, and dispatched FINISH_LOADING via enter button",
    );
  }

  // Screen 2: Welcome
  {
    const welcome = new WelcomeScreenView(dispatch);
    assert.equal(welcome.id, ScreenId.WELCOME);
    welcome.mount(root);
    const el = welcome.getElement() as unknown as MockElement;

    const vrBtn = el.querySelector('[data-action="vr"]') as MockElement;
    assert.ok(vrBtn);
    vrBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.SELECT_VR,
    );

    const touchBtn = el.querySelector('[data-action="2d"]') as MockElement;
    assert.ok(touchBtn);
    touchBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.SELECT_2D,
    );
    console.log(
      "✓ Screen 2 (Welcome) mounted and dispatched SELECT_VR & SELECT_2D",
    );
  }

  // Screen 3: Tutorial
  {
    const tutorial = new TutorialScreenView(dispatch);
    assert.equal(tutorial.id, ScreenId.TUTORIAL);
    tutorial.mount(root);
    const el = tutorial.getElement() as unknown as MockElement;

    const startBtn = el.querySelector(
      '[data-action="confirm-insertion"]',
    ) as MockElement;
    assert.ok(startBtn);
    startBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.CONFIRM_INSERTION,
    );
    console.log(
      "✓ Screen 3 (Tutorial) mounted and dispatched CONFIRM_INSERTION",
    );
  }

  // Screen 4: Experience HUD & Viewport Synchronization
  {
    const mockScene = new MockElement("a-scene");
    let resizeInvoked = false;
    let enterVRCount = 0;
    let exitVRCount = 0;
    (
      mockScene as unknown as {
        resize: () => void;
        enterVR: () => Promise<void>;
        exitVR: () => Promise<void>;
        is: (state: string) => boolean;
      }
    ).resize = () => {
      resizeInvoked = true;
    };
    (
      mockScene as unknown as {
        resize: () => void;
        enterVR: () => Promise<void>;
        exitVR: () => Promise<void>;
        is: (state: string) => boolean;
      }
    ).enterVR = async () => {
      enterVRCount++;
    };
    (
      mockScene as unknown as {
        resize: () => void;
        enterVR: () => Promise<void>;
        exitVR: () => Promise<void>;
        is: (state: string) => boolean;
      }
    ).exitVR = async () => {
      exitVRCount++;
    };
    (
      mockScene as unknown as {
        resize: () => void;
        enterVR: () => Promise<void>;
        exitVR: () => Promise<void>;
        is: (state: string) => boolean;
      }
    ).is = (state: string) => state === "vr-mode";

    setupMockDocument(root as unknown as MockElement, mockScene);

    const experience = new ExperienceScreenView(dispatch, "vr");
    assert.equal(experience.id, ScreenId.EXPERIENCE_3D);
    experience.mount(root);
    experience.show();

    assert.equal(
      resizeInvoked,
      false,
      "Scene resize must NOT be invoked in VR mode to prevent WebGL framebuffer mismatch",
    );
    assert.equal(
      enterVRCount,
      1,
      "enterVR must be called when viewMode is vr on show",
    );
    assert.equal(
      mockScene.classList.contains(UI_CLASSES.SCENE_ACTIVE),
      true,
      "Scene must contain active class on show",
    );

    experience.hide();
    assert.equal(exitVRCount, 1, "exitVR must be called on hide");
    assert.equal(
      mockScene.classList.contains(UI_CLASSES.SCENE_ACTIVE),
      false,
      "Scene must not contain active class on hide",
    );

    // Test 2D mode
    experience.setViewMode("2d");
    experience.show();
    assert.equal(
      resizeInvoked,
      true,
      "Scene resize must be invoked when entering in 2d mode",
    );
    assert.equal(
      exitVRCount,
      2,
      "exitVR must be called when entering in 2d mode",
    );

    experience.hide();
    assert.equal(
      exitVRCount,
      3,
      "exitVR must be called when hiding in 2d mode",
    );

    experience.show();
    const el = experience.getElement() as unknown as MockElement;
    const exitHudBtn = el.querySelector(
      '[data-action="request-exit"]',
    ) as MockElement;
    assert.ok(exitHudBtn);
    exitHudBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.REQUEST_EXIT,
    );
    // Test native exit-vr event in VR mode
    experience.setViewMode("vr");
    experience.show();
    const initialDispatchedCount = dispatched.length;
    mockScene.dispatchEvent("exit-vr");
    assert.equal(
      dispatched.length,
      initialDispatchedCount + 1,
      "exit-vr event must dispatch REQUEST_EXIT",
    );
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.REQUEST_EXIT,
    );

    // Test retainBackground() decoupling
    const enterVRCountBeforeRetain = enterVRCount;
    experience.retainBackground();
    assert.equal(
      enterVRCount,
      enterVRCountBeforeRetain,
      "retainBackground must NEVER invoke enterVR",
    );
    assert.equal(
      mockScene.style.display,
      "block",
      "Scene canvas must remain display block during retainBackground",
    );
    const hudContainer = experience.getElement() as unknown as MockElement;
    assert.equal(
      hudContainer.classList.contains(UI_CLASSES.SCREEN_HIDDEN),
      true,
      "HUD must be hidden during retainBackground",
    );

    // Test 2D Touch Mode Camera Unlock & Viewport Sanitization after exiting VR
    const mockCamera = new MockElement("a-camera");
    let cameraMatrixUpdated = false;
    let lookControlsAddListenersCalled = false;
    (
      mockCamera as unknown as {
        object3D: {
          matrixAutoUpdate: boolean;
          updateMatrix: () => void;
        };
        components: Record<
          string,
          {
            touchStarted: boolean;
            mouseDown: boolean;
            data: { touchEnabled: boolean; enabled: boolean };
            addEventListeners: () => void;
          }
        >;
      }
    ).object3D = {
      matrixAutoUpdate: false,
      updateMatrix: () => {
        cameraMatrixUpdated = true;
      },
    };
    (
      mockCamera as unknown as {
        components: Record<
          string,
          {
            touchStarted: boolean;
            mouseDown: boolean;
            data: { touchEnabled: boolean; enabled: boolean };
            addEventListeners: () => void;
          }
        >;
      }
    ).components = {
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
    (
      mockScene as unknown as {
        removeState: (s: string) => void;
        renderer: { xr: { enabled: boolean } };
      }
    ).removeState = (s: string) => {
      removedStates.push(s);
    };
    (
      mockScene as unknown as {
        renderer: { xr: { enabled: boolean } };
      }
    ).renderer = {
      xr: { enabled: true },
    };

    // Transition back into 2D mode
    experience.setViewMode("2d");
    experience.show();

    const cameraObj3D = (
      mockCamera as unknown as {
        object3D: { matrixAutoUpdate: boolean };
      }
    ).object3D;
    assert.equal(
      cameraObj3D.matrixAutoUpdate,
      true,
      "Camera matrixAutoUpdate must be restored to true in 2D touch mode",
    );
    assert.equal(
      cameraMatrixUpdated,
      true,
      "Camera updateMatrix must be invoked during 2D viewport sanitization",
    );
    assert.equal(
      (
        mockScene as unknown as {
          renderer: { xr: { enabled: boolean } };
        }
      ).renderer.xr.enabled,
      false,
      "renderer.xr.enabled must be set to false in 2D touch mode",
    );
    const cameraControls = (
      mockCamera as unknown as {
        components: {
          "look-controls": {
            touchStarted: boolean;
            mouseDown: boolean;
            data: { touchEnabled: boolean; enabled: boolean };
          };
        };
      }
    ).components["look-controls"];
    assert.equal(
      cameraControls.touchStarted,
      false,
      "look-controls touchStarted must be reset to false in 2D mode",
    );
    assert.equal(
      cameraControls.mouseDown,
      false,
      "look-controls mouseDown must be reset to false in 2D mode",
    );
    assert.equal(
      cameraControls.data.touchEnabled,
      true,
      "look-controls touchEnabled must be true in 2D mode",
    );
    assert.equal(
      lookControlsAddListenersCalled,
      true,
      "look-controls addEventListeners must be called on 2D mode entry",
    );
    assert.ok(
      removedStates.includes("vr-mode"),
      "Scene vr-mode state must be stripped when sanitizing 2D viewport",
    );

    console.log(
      "✓ Screen 4 (Experience HUD) mounted, synchronized viewport, managed enterVR/exitVR, handled exit-vr event, retained background, unlocked touch camera, and dispatched REQUEST_EXIT",
    );
  }

  // Screen 5: Exit Modal
  {
    const modal = new ExitModalScreenView(dispatch);
    assert.equal(modal.id, ScreenId.EXIT_MODAL);
    modal.mount(root);
    const el = modal.getElement() as unknown as MockElement;

    const resumeBtn = el.querySelector(
      '[data-action="resume-tour"]',
    ) as MockElement;
    assert.ok(resumeBtn);
    resumeBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.RESUME_TOUR,
    );

    const switchTouchBtn = el.querySelector(
      '[data-action="switch-to-touch"]',
    ) as MockElement;
    assert.ok(switchTouchBtn);
    switchTouchBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.SWITCH_TO_TOUCH,
    );

    const exitBtn = el.querySelector(
      '[data-action="confirm-exit"]',
    ) as MockElement;
    assert.ok(exitBtn);
    exitBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.CONFIRM_EXIT,
    );
    console.log(
      "✓ Screen 5 (Exit Modal) mounted and dispatched RESUME_TOUR, SWITCH_TO_TOUCH & CONFIRM_EXIT",
    );
  }

  // Screen 6: Survey
  {
    const survey = new SurveyScreenView(dispatch);
    assert.equal(survey.id, ScreenId.SURVEY);
    survey.mount(root);
    const el = survey.getElement() as unknown as MockElement;

    const submitBtn = el.querySelector(
      '[data-action="submit-survey"]',
    ) as MockElement;
    assert.ok(submitBtn);
    submitBtn.dispatchEvent("click");
    const lastDispatch = dispatched[dispatched.length - 1];
    assert.equal(lastDispatch.action, NavigationAction.COMPLETE_SURVEY);
    assert.equal(lastDispatch.payload?.surveyAnswers?.rating, 5);

    const skipBtn = el.querySelector(
      '[data-action="skip-survey"]',
    ) as MockElement;
    assert.ok(skipBtn);
    skipBtn.dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.SKIP_SURVEY,
    );
    console.log(
      "✓ Screen 6 (Survey) mounted and dispatched COMPLETE_SURVEY & SKIP_SURVEY",
    );
  }

  // FOUC Prevention & Initial Scene Concealment Markup
  {
    const htmlPath = path.resolve(process.cwd(), "index.html");
    const indexHtml = fs.readFileSync(htmlPath, "utf8");

    assert.ok(
      indexHtml.includes('<link rel="stylesheet" href="/src/style.css"'),
      "index.html must include a render-blocking link to /src/style.css in <head>",
    );
    assert.ok(
      indexHtml.includes("background-color: #111318"),
      "index.html must declare critical initial dark background style",
    );
    assert.ok(
      indexHtml.includes("a-scene:not(.cv-scene--active)"),
      "index.html must conceal a-scene before cv-scene--active is added",
    );
    assert.ok(
      indexHtml.includes("opacity: 0 !important") &&
        indexHtml.includes("visibility: hidden !important"),
      "index.html must force opacity 0 and visibility hidden for inactive scene",
    );
    console.log(
      "✓ index.html document head verified for render-blocking stylesheet and FOUC suppression",
    );
  }

  console.log("All screen view tests passed.\n");
}

runScreensUnitTests();
