import { assert } from "./assert";
import {
  NavigationAction,
  ScreenId,
  SessionStore,
  StorageAdapter,
  ViewMode,
} from "../src/navigation/index";
import { AppRouter } from "../src/app";

class MockClassList {
  private classes = new Set<string>();

  add(...tokens: string[]): void {
    tokens.forEach((t) =>
      t
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => this.classes.add(c)),
    );
  }
  remove(...tokens: string[]): void {
    tokens.forEach((t) =>
      t
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => this.classes.delete(c)),
    );
  }
  contains(token: string): boolean {
    return this.classes.has(token);
  }
}

class MockElement {
  public tagName: string;
  public className: string = "";
  public textContent: string = "";
  public classList = new MockClassList();
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public attributes = new Map<string, string>();
  public listeners = new Map<string, Array<(event: unknown) => void>>();
  public style: Record<string, string> = {};
  public id: string = "";
  public isPlaying: boolean = false;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "id") this.id = value;
  }

  getAttribute(name: string): string | null {
    if (name === "id") return this.id || null;
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...items: (MockElement | string)[]): void {
    for (const item of items) {
      if (typeof item === "string") {
        const textNode = new MockElement("span");
        textNode.textContent = item;
        this.appendChild(textNode);
      } else if (item instanceof MockElement) {
        this.appendChild(item);
      }
    }
  }

  remove(): void {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        this.parentElement.children.splice(idx, 1);
      }
      this.parentElement = null;
    }
  }

  addEventListener(event: string, handler: (e: unknown) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  dispatchEvent(event: string, payload?: unknown): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const h of handlers) {
      h(payload ?? { stopPropagation: () => {} });
    }
  }

  querySelector<T = MockElement>(selector: string): T | null {
    const match = (el: MockElement): MockElement | null => {
      if (selector.startsWith('[data-action="')) {
        const action = selector.slice(14, -2);
        if (el.getAttribute("data-action") === action) return el;
      }
      if (selector.startsWith('[data-screen-id="')) {
        const screenId = selector.slice(17, -2);
        if (el.getAttribute("data-screen-id") === screenId) return el;
      }
      if (selector === "a-scene" && el.tagName === "A-SCENE") {
        return el;
      }
      for (const child of el.children) {
        const res = match(child);
        if (res) return res;
      }
      return null;
    };
    return match(this) as T | null;
  }

  play(): void {
    this.isPlaying = true;
  }

  pause(): void {
    this.isPlaying = false;
  }
}

class MockStorage implements StorageAdapter {
  private readonly store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

// Global DOM setup
const rootElement = new MockElement("div");
rootElement.id = "app";
const mockScene = new MockElement("a-scene");

(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => new MockElement(tag),
  querySelector: (sel: string) => {
    if (sel === "a-scene") return mockScene;
    return rootElement.querySelector(sel);
  },
};

function runEndToEndVerification(): void {
  console.log("--- [E2E TEST] Complete Flow & Speed Benchmark (DoD < 15s) ---");

  const storage = new MockStorage();
  const sessionStore = new SessionStore(storage);
  const router = new AppRouter(rootElement as unknown as HTMLElement);

  const startTime = Date.now();

  // Screen 1: Splash Screen
  const splashEl = rootElement.querySelector(
    '[data-screen-id="SPLASH"]',
  ) as MockElement;
  assert.ok(splashEl);
  assert.ok(splashEl.classList.contains("cv-screen--active"));
  splashEl.dispatchEvent("click");

  // Screen 2: Welcome Screen
  const welcomeEl = rootElement.querySelector(
    '[data-screen-id="WELCOME"]',
  ) as MockElement;
  assert.ok(welcomeEl);
  assert.ok(welcomeEl.classList.contains("cv-screen--active"));
  const vrBtn = welcomeEl.querySelector('[data-action="vr"]') as MockElement;
  assert.ok(vrBtn);
  vrBtn.dispatchEvent("click");

  // Screen 3: Tutorial Screen
  const tutorialEl = rootElement.querySelector(
    '[data-screen-id="TUTORIAL"]',
  ) as MockElement;
  assert.ok(tutorialEl);
  assert.ok(tutorialEl.classList.contains("cv-screen--active"));
  const startBtn = tutorialEl.querySelector(
    '[data-action="confirm-insertion"]',
  ) as MockElement;
  assert.ok(startBtn);
  startBtn.dispatchEvent("click");

  // Screen 4: 3D Experience (WebXR Scene active)
  const experienceEl = rootElement.querySelector(
    '[data-screen-id="EXPERIENCE_3D"]',
  ) as MockElement;
  assert.ok(experienceEl);
  assert.ok(experienceEl.classList.contains("cv-screen--active"));
  assert.equal(mockScene.isPlaying, true);
  assert.equal(mockScene.style.display, "block");

  const exitHudBtn = experienceEl.querySelector(
    '[data-action="request-exit"]',
  ) as MockElement;
  assert.ok(exitHudBtn);
  exitHudBtn.dispatchEvent("click");

  // Screen 5: Exit Modal Overlay
  const exitModalEl = rootElement.querySelector(
    '[data-screen-id="EXIT_MODAL"]',
  ) as MockElement;
  assert.ok(exitModalEl);
  assert.ok(exitModalEl.classList.contains("cv-screen--active"));
  const finishBtn = exitModalEl.querySelector(
    '[data-action="confirm-exit"]',
  ) as MockElement;
  assert.ok(finishBtn);
  finishBtn.dispatchEvent("click");

  // Screen 6: Survey Screen
  const surveyEl = rootElement.querySelector(
    '[data-screen-id="SURVEY"]',
  ) as MockElement;
  assert.ok(surveyEl);
  assert.ok(surveyEl.classList.contains("cv-screen--active"));
  assert.equal(mockScene.style.display, "none");

  const submitSurveyBtn = surveyEl.querySelector(
    '[data-action="submit-survey"]',
  ) as MockElement;
  assert.ok(submitSurveyBtn);
  submitSurveyBtn.dispatchEvent("click");

  // Return to Welcome Screen
  assert.ok(welcomeEl.classList.contains("cv-screen--active"));

  const elapsedMs = Date.now() - startTime;
  console.log(
    `✓ Completed 1 -> 6 -> Welcome traversal in ${elapsedMs} ms (DoD threshold: 15,000 ms)`,
  );
  assert.ok(
    elapsedMs < 15000,
    `Execution exceeded 15 seconds limit: ${elapsedMs} ms`,
  );

  router.destroy();
  console.log("✓ Clean teardown of all screens completed.");
  console.log("\nAll E2E verification assertions passed successfully.");
}

runEndToEndVerification();
