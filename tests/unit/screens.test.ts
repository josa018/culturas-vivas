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

    assert.equal(resizeInvoked, true, "Scene resize must be invoked on show");
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
    console.log(
      "✓ Screen 4 (Experience HUD) mounted, synchronized viewport, managed enterVR/exitVR, and dispatched REQUEST_EXIT",
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
      "✓ Screen 5 (Exit Modal) mounted and dispatched RESUME_TOUR & CONFIRM_EXIT",
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

  console.log("All screen view tests passed.\n");
}

runScreensUnitTests();
