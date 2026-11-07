import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AppRouter } from "../../src/app";

const MAX_ALLOWED_DURATION_MS = 15000;

type MockSceneElement = HTMLElement & {
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  enterVR?: () => Promise<void>;
  exitVR?: () => Promise<void>;
  is?: (state: string) => boolean;
};

describe("Full Flow Traversal Benchmark (DoD < 15s)", () => {
  let rootElement: HTMLElement;
  let mockScene: MockSceneElement;

  beforeEach(() => {
    document.body.innerHTML = "";

    mockScene = document.createElement("a-scene") as MockSceneElement;
    mockScene.isPlaying = false;
    mockScene.play = () => {
      mockScene.isPlaying = true;
    };
    mockScene.pause = () => {
      mockScene.isPlaying = false;
    };
    mockScene.enterVR = async () => {};
    mockScene.exitVR = async () => {};
    mockScene.is = (state: string) => state === "vr-mode";

    rootElement = document.createElement("div");
    rootElement.id = "app";

    document.body.appendChild(mockScene);
    document.body.appendChild(rootElement);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("traverses all screens and paths within performance bounds", () => {
    const router = new AppRouter(rootElement);
    const startTime = Date.now();

    // Screen 1: Splash Screen
    const splashEl = rootElement.querySelector(
      '[data-screen-id="SPLASH"]'
    ) as HTMLElement;
    expect(splashEl).toBeTruthy();
    expect(splashEl.classList.contains("cv-screen--active")).toBe(true);

    const enterBtn = splashEl.querySelector(
      '[data-action="enter"]'
    ) as HTMLElement;
    expect(enterBtn).toBeTruthy();
    enterBtn.click();

    // Screen 2: Welcome Screen
    const welcomeEl = rootElement.querySelector(
      '[data-screen-id="WELCOME"]'
    ) as HTMLElement;
    expect(welcomeEl).toBeTruthy();
    expect(welcomeEl.classList.contains("cv-screen--active")).toBe(true);
    const vrBtn = welcomeEl.querySelector('[data-action="vr"]') as HTMLElement;
    expect(vrBtn).toBeTruthy();
    vrBtn.click();

    // Screen 3: Tutorial Screen
    const tutorialEl = rootElement.querySelector(
      '[data-screen-id="TUTORIAL"]'
    ) as HTMLElement;
    expect(tutorialEl).toBeTruthy();
    expect(tutorialEl.classList.contains("cv-screen--active")).toBe(true);
    const startBtn = tutorialEl.querySelector(
      '[data-action="confirm-insertion"]'
    ) as HTMLElement;
    expect(startBtn).toBeTruthy();
    startBtn.click();

    // Screen 4: 3D Experience (WebXR Scene active)
    const experienceEl = rootElement.querySelector(
      '[data-screen-id="EXPERIENCE_3D"]'
    ) as HTMLElement;
    expect(experienceEl).toBeTruthy();
    expect(experienceEl.classList.contains("cv-screen--active")).toBe(true);
    expect(mockScene.isPlaying).toBe(true);
    expect(mockScene.style.display).toBe("block");

    const roomGroupVR = mockScene.querySelector(
      "#cv-prototype-room-group"
    ) as HTMLElement;
    expect(roomGroupVR).toBeTruthy();
    const exhibitsVR = Array.from(roomGroupVR.children).filter((c) =>
      c.getAttribute("cv-inspectable")
    );
    expect(exhibitsVR.length).toBe(5);

    const exitHudBtn = experienceEl.querySelector(
      '[data-action="request-exit"]'
    ) as HTMLElement;
    expect(exitHudBtn).toBeTruthy();
    exitHudBtn.click();

    // Screen 5: Exit Modal Overlay
    const exitModalEl = rootElement.querySelector(
      '[data-screen-id="EXIT_MODAL"]'
    ) as HTMLElement;
    expect(exitModalEl).toBeTruthy();
    expect(exitModalEl.classList.contains("cv-screen--active")).toBe(true);
    const finishBtn = exitModalEl.querySelector(
      '[data-action="confirm-exit"]'
    ) as HTMLElement;
    expect(finishBtn).toBeTruthy();
    finishBtn.click();

    // Screen 6: Survey Screen
    const surveyEl = rootElement.querySelector(
      '[data-screen-id="SURVEY"]'
    ) as HTMLElement;
    expect(surveyEl).toBeTruthy();
    expect(surveyEl.classList.contains("cv-screen--active")).toBe(true);
    expect(mockScene.style.display).toBe("none");

    const submitSurveyBtn = surveyEl.querySelector(
      '[data-action="submit-survey"]'
    ) as HTMLElement;
    expect(submitSurveyBtn).toBeTruthy();
    submitSurveyBtn.click();

    // Returned to Welcome Screen
    expect(welcomeEl.classList.contains("cv-screen--active")).toBe(true);

    // Traversal 2: 2D Mode Path
    const touch2dBtn = welcomeEl.querySelector(
      '[data-action="2d"]'
    ) as HTMLElement;
    expect(touch2dBtn).toBeTruthy();
    touch2dBtn.click();
    expect(experienceEl.classList.contains("cv-screen--active")).toBe(true);
    expect(mockScene.style.display).toBe("block");
    const roomGroup2D = mockScene.querySelector(
      "#cv-prototype-room-group"
    ) as HTMLElement;
    expect(roomGroup2D).toBeTruthy();
    const exhibits2D = Array.from(roomGroup2D.children).filter((c) =>
      c.getAttribute("cv-inspectable")
    );
    expect(exhibits2D.length).toBe(5);

    // Exit 2D mode to welcome for next traversal
    const exitHudBtn2 = experienceEl.querySelector(
      '[data-action="request-exit"]'
    ) as HTMLElement;
    expect(exitHudBtn2).toBeTruthy();
    exitHudBtn2.click();
    const finishBtn2 = exitModalEl.querySelector(
      '[data-action="confirm-exit"]'
    ) as HTMLElement;
    expect(finishBtn2).toBeTruthy();
    finishBtn2.click();
    const skipSurveyBtn = surveyEl.querySelector(
      '[data-action="skip-survey"]'
    ) as HTMLElement;
    expect(skipSurveyBtn).toBeTruthy();
    skipSurveyBtn.click();
    expect(welcomeEl.classList.contains("cv-screen--active")).toBe(true);

    // Traversal 3: Cardboard VR native exit-vr -> Exit Modal -> Switch to Touch
    const vrBtn2 = welcomeEl.querySelector('[data-action="vr"]') as HTMLElement;
    expect(vrBtn2).toBeTruthy();
    vrBtn2.click();
    const startBtn2 = tutorialEl.querySelector(
      '[data-action="confirm-insertion"]'
    ) as HTMLElement;
    expect(startBtn2).toBeTruthy();
    startBtn2.click();
    expect(experienceEl.classList.contains("cv-screen--active")).toBe(true);

    // Native exit-vr fired (e.g. Cardboard viewer X)
    mockScene.dispatchEvent(new CustomEvent("exit-vr"));
    expect(exitModalEl.classList.contains("cv-screen--active")).toBe(true);
    expect(mockScene.style.display).toBe("block");

    // Switch to touch mode from Exit Modal
    const switchTouchBtn = exitModalEl.querySelector(
      '[data-action="switch-to-touch"]'
    ) as HTMLElement;
    expect(switchTouchBtn).toBeTruthy();
    switchTouchBtn.click();
    expect(experienceEl.classList.contains("cv-screen--active")).toBe(true);
    expect(router.getStateMachine().getSession().viewMode).toBe("2d");

    const elapsedMs = Date.now() - startTime;
    expect(elapsedMs).toBeLessThan(MAX_ALLOWED_DURATION_MS);

    router.destroy();
  });
});
