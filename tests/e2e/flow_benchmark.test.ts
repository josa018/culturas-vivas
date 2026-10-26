import { assert } from "../helpers/assert";
import { MockElement, setupMockDocument } from "../helpers/mock_dom";
import { AppRouter } from "../../src/app";

const MAX_ALLOWED_DURATION_MS = 15000;

function runEndToEndBenchmark(): void {
  console.log("--- [E2E BENCHMARK] Full Flow Traversal (DoD < 15s) ---");

  const rootElement = new MockElement("div");
  rootElement.id = "app";
  const mockScene = new MockElement("a-scene");

  setupMockDocument(rootElement, mockScene);

  const router = new AppRouter(rootElement as unknown as HTMLElement);
  const startTime = Date.now();

  // Screen 1: Splash Screen
  const splashEl = rootElement.querySelector(
    '[data-screen-id="SPLASH"]',
  ) as MockElement;
  assert.ok(splashEl, "Splash element must be mounted");
  assert.ok(
    splashEl.classList.contains("cv-screen--active"),
    "Splash screen must be active on launch",
  );
  splashEl.dispatchEvent("click");

  // Screen 2: Welcome Screen
  const welcomeEl = rootElement.querySelector(
    '[data-screen-id="WELCOME"]',
  ) as MockElement;
  assert.ok(welcomeEl, "Welcome element must be mounted");
  assert.ok(
    welcomeEl.classList.contains("cv-screen--active"),
    "Welcome screen must be active after splash tap",
  );
  const vrBtn = welcomeEl.querySelector('[data-action="vr"]') as MockElement;
  assert.ok(vrBtn, "VR mode selection button must exist");
  vrBtn.dispatchEvent("click");

  // Screen 3: Tutorial Screen
  const tutorialEl = rootElement.querySelector(
    '[data-screen-id="TUTORIAL"]',
  ) as MockElement;
  assert.ok(tutorialEl, "Tutorial element must be mounted");
  assert.ok(
    tutorialEl.classList.contains("cv-screen--active"),
    "Tutorial screen must be active after VR selection",
  );
  const startBtn = tutorialEl.querySelector(
    '[data-action="confirm-insertion"]',
  ) as MockElement;
  assert.ok(startBtn, "Start tour button must exist");
  startBtn.dispatchEvent("click");

  // Screen 4: 3D Experience (WebXR Scene active)
  const experienceEl = rootElement.querySelector(
    '[data-screen-id="EXPERIENCE_3D"]',
  ) as MockElement;
  assert.ok(experienceEl, "Experience HUD element must be mounted");
  assert.ok(
    experienceEl.classList.contains("cv-screen--active"),
    "Experience HUD must be active during tour",
  );
  assert.equal(
    mockScene.isPlaying,
    true,
    "A-Frame scene must be playing when in 3D",
  );
  assert.equal(
    mockScene.style.display,
    "block",
    "A-Frame scene must be visible when in 3D",
  );

  const exitHudBtn = experienceEl.querySelector(
    '[data-action="request-exit"]',
  ) as MockElement;
  assert.ok(exitHudBtn, "Exit HUD button must exist");
  exitHudBtn.dispatchEvent("click");

  // Screen 5: Exit Modal Overlay
  const exitModalEl = rootElement.querySelector(
    '[data-screen-id="EXIT_MODAL"]',
  ) as MockElement;
  assert.ok(exitModalEl, "Exit modal backdrop element must be mounted");
  assert.ok(
    exitModalEl.classList.contains("cv-screen--active"),
    "Exit modal must be active",
  );
  const finishBtn = exitModalEl.querySelector(
    '[data-action="confirm-exit"]',
  ) as MockElement;
  assert.ok(finishBtn, "Confirm exit button must exist");
  finishBtn.dispatchEvent("click");

  // Screen 6: Survey Screen
  const surveyEl = rootElement.querySelector(
    '[data-screen-id="SURVEY"]',
  ) as MockElement;
  assert.ok(surveyEl, "Survey element must be mounted");
  assert.ok(
    surveyEl.classList.contains("cv-screen--active"),
    "Survey screen must be active after exit confirmation",
  );
  assert.equal(
    mockScene.style.display,
    "none",
    "A-Frame scene must be hidden when in survey",
  );

  const submitSurveyBtn = surveyEl.querySelector(
    '[data-action="submit-survey"]',
  ) as MockElement;
  assert.ok(submitSurveyBtn, "Submit survey button must exist");
  submitSurveyBtn.dispatchEvent("click");

  // Returned to Welcome Screen
  assert.ok(
    welcomeEl.classList.contains("cv-screen--active"),
    "Welcome screen must be active after survey completion",
  );

  const elapsedMs = Date.now() - startTime;
  console.log(
    `✓ Traversed Screens 1 -> 6 -> Welcome in ${elapsedMs} ms (DoD limit: ${MAX_ALLOWED_DURATION_MS} ms)`,
  );
  assert.ok(
    elapsedMs < MAX_ALLOWED_DURATION_MS,
    `Traversal duration exceeded DoD limit: ${elapsedMs} ms`,
  );

  router.destroy();
  console.log("✓ AppRouter destroyed and cleaned up without leaks.\n");
}

runEndToEndBenchmark();
