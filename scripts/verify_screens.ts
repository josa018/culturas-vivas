import assert from "node:assert/strict";
import { NavigationAction, ScreenId } from "../src/navigation/index";
import type { DispatchPayload } from "../src/navigation/index";
import {
  SplashScreenView,
  WelcomeScreenView,
  TutorialScreenView,
  ExperienceScreenView,
  ExitModalScreenView,
  SurveyScreenView,
} from "../src/screens/index";

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
  public value: string = "";
  public rows: number = 2;
  public placeholder: string = "";
  public id: string = "";
  public type: string = "";

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
      if (selector.startsWith('[data-rating="')) {
        const rating = selector.slice(14, -2);
        if (el.getAttribute("data-rating") === rating) return el;
      }
      if (
        selector.startsWith("#") &&
        (el.id === selector.slice(1) ||
          el.getAttribute("id") === selector.slice(1))
      ) {
        return el;
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

  querySelectorAll<T = MockElement>(selector: string): T[] {
    const results: MockElement[] = [];
    const walk = (el: MockElement): void => {
      if (selector === "[data-rating]" && el.getAttribute("data-rating")) {
        results.push(el);
      }
      for (const child of el.children) {
        walk(child);
      }
    };
    walk(this);
    return results as T[];
  }
}

// Global mock document
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => new MockElement(tag),
  querySelector: () => null,
};

function runScreensVerification(): void {
  console.log("--- [TEST SUITE] Screen Views & Interactions Verification ---");

  const root = new MockElement("div") as unknown as HTMLElement;
  const dispatched: Array<{
    action: NavigationAction;
    payload?: DispatchPayload;
  }> = [];
  const dispatch = (action: NavigationAction, payload?: DispatchPayload) => {
    dispatched.push({ action, payload });
  };

  // Test Screen 1: Splash
  {
    const splash = new SplashScreenView(dispatch);
    assert.equal(splash.id, ScreenId.SPLASH);
    splash.mount(root);
    assert.ok(splash.getElement());
    splash.show();

    (splash.getElement() as unknown as MockElement).dispatchEvent("click");
    assert.equal(
      dispatched[dispatched.length - 1].action,
      NavigationAction.FINISH_LOADING,
    );
    console.log("✓ Screen 1 (Splash) mounted and dispatched FINISH_LOADING");
  }

  // Test Screen 2: Welcome
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

  // Test Screen 3: Tutorial
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

  // Test Screen 4: Experience HUD
  {
    const experience = new ExperienceScreenView(dispatch);
    assert.equal(experience.id, ScreenId.EXPERIENCE_3D);
    experience.mount(root);
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
      "✓ Screen 4 (Experience HUD) mounted and dispatched REQUEST_EXIT",
    );
  }

  // Test Screen 5: Exit Modal
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

  // Test Screen 6: Survey
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

  console.log("\nAll 6 screens verified successfully.");
}

runScreensVerification();
