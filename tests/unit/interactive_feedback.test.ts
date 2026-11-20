import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { INTERACTION_ANIMATION_TOKENS } from "../../src/experience/constants";
import {
  createInteractiveFeedbackComponentDefinition,
  registerInteractiveFeedbackComponent,
  type InteractiveFeedbackComponentInstance,
} from "../../src/experience/components/interactive-feedback";

describe("cv-interactive-feedback Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    document.body.innerHTML = "";
  });

  it("animates hover scale + Z lift on mouseenter, tactile press pulse on click, and restores on mouseleave", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
      components: {},
    };

    registerInteractiveFeedbackComponent();
    expect(registered["cv-interactive-feedback"]).toBeDefined();

    const btn = document.createElement("a-entity");
    btn.setAttribute("position", "0 0 0.02");
    btn.setAttribute("scale", "1 1 1");

    const def = createInteractiveFeedbackComponentDefinition();
    const instance = Object.create(def) as InteractiveFeedbackComponentInstance;
    instance.el = btn;
    instance.data = {
      hoverScale: INTERACTION_ANIMATION_TOKENS.HOVER_SCALE,
      hoverZLift: INTERACTION_ANIMATION_TOKENS.HOVER_Z_LIFT_M,
      pressScale: INTERACTION_ANIMATION_TOKENS.PRESS_SCALE,
    };

    instance.init();

    // Hover enters -> scale 1.08 + Z lift (0.02 + 0.02 = 0.04)
    btn.dispatchEvent(new Event("mouseenter"));
    expect(btn.getAttribute("animation__fb_hover_scale")).toContain(
      "to: 1.08 1.08 1.08",
    );
    expect(btn.getAttribute("animation__fb_hover_scale")).toContain(
      `dur: ${INTERACTION_ANIMATION_TOKENS.HOVER_DURATION_MS}`,
    );
    expect(btn.getAttribute("animation__fb_hover_pos")).toContain(
      "to: 0 0 0.04",
    );

    // Click -> tactile press pulse (0.92) then settles back after PRESS_DURATION_MS
    btn.dispatchEvent(new Event("click"));
    expect(btn.getAttribute("animation__fb_press")).toContain(
      "to: 0.92 0.92 0.92",
    );
    expect(btn.getAttribute("animation__fb_press")).toContain(
      `dur: ${INTERACTION_ANIMATION_TOKENS.PRESS_DURATION_MS}`,
    );

    vi.advanceTimersByTime(INTERACTION_ANIMATION_TOKENS.PRESS_DURATION_MS + 10);
    expect(btn.getAttribute("animation__fb_press_release")).toContain(
      "to: 1.08 1.08 1.08",
    );

    // Leave -> restores base scale and base position
    btn.dispatchEvent(new Event("mouseleave"));
    expect(btn.getAttribute("animation__fb_hover_scale")).toContain(
      "to: 1 1 1",
    );
    expect(btn.getAttribute("animation__fb_hover_pos")).toContain(
      "to: 0 0 0.02",
    );

    instance.remove();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles headless DOM environments safely when AFRAME is absent", () => {
    const btn = document.createElement("a-entity");
    btn.setAttribute("position", "0.1 0.2 0.03");
    const def = createInteractiveFeedbackComponentDefinition();
    const instance = Object.create(def) as InteractiveFeedbackComponentInstance;
    instance.el = btn;
    instance.data = {
      hoverScale: INTERACTION_ANIMATION_TOKENS.HOVER_SCALE,
      hoverZLift: INTERACTION_ANIMATION_TOKENS.HOVER_Z_LIFT_M,
      pressScale: INTERACTION_ANIMATION_TOKENS.PRESS_SCALE,
    };

    instance.init();
    btn.dispatchEvent(new Event("mouseenter"));
    btn.dispatchEvent(new Event("click"));
    btn.dispatchEvent(new Event("mouseleave"));
    expect(btn.getAttribute("position")).toBe("0.1 0.2 0.03");
    instance.remove();
  });
});
