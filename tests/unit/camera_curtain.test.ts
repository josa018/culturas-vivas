import { describe, it, expect } from "vitest";
import {
  createCameraCurtainComponentDefinition,
  ensureCameraCurtain,
  CAMERA_CURTAIN_ID,
  type CameraCurtainComponentInstance,
  type CameraCurtainEntity,
} from "../../src/experience/components/camera-curtain";
import { TRANSITION_TIMINGS } from "../../src/experience/constants";

function createMockCurtainInstance(
  mockEl: CameraCurtainEntity,
): CameraCurtainComponentInstance {
  const def = createCameraCurtainComponentDefinition();
  const instance: CameraCurtainComponentInstance = {
    el: mockEl,
    data: {
      duration: TRANSITION_TIMINGS.FADE_DURATION_MS,
      easing: TRANSITION_TIMINGS.FADE_EASING,
    },
    opacity: 0,
    isAnimating: false,
    init: function (this: CameraCurtainComponentInstance) {
      def.init.call(this);
    },
    setOpacity: function (this: CameraCurtainComponentInstance, val: number) {
      def.setOpacity.call(this, val);
    },
    getOpacity: function (this: CameraCurtainComponentInstance) {
      return def.getOpacity.call(this);
    },
    fadeOut: function (
      this: CameraCurtainComponentInstance,
      onComplete?: () => void,
    ) {
      def.fadeOut.call(this, onComplete);
    },
    fadeIn: function (
      this: CameraCurtainComponentInstance,
      onComplete?: () => void,
    ) {
      def.fadeIn.call(this, onComplete);
    },
    remove: function (this: CameraCurtainComponentInstance) {
      def.remove.call(this);
    },
  };
  return instance;
}

describe("CameraCurtain Component", () => {
  it("ensureCameraCurtain creates and retrieves idempotent curtain element", () => {
    const cameraEl = document.createElement("a-camera");
    const curtain = ensureCameraCurtain(cameraEl);

    expect(curtain.getAttribute("id")).toBe(CAMERA_CURTAIN_ID);
    expect(curtain.getAttribute("position")).toBe("0 0 -0.1");
    expect(curtain.getAttribute("visible")).toBe("false");
    expect(curtain.getAttribute("material")).toMatch(/opacity:\s*0/);

    // Calling ensure again returns existing element without creating duplicate
    const existingCurtain = ensureCameraCurtain(cameraEl);
    expect(existingCurtain).toBe(curtain);
  });

  it("handles opacity bounds clamping cleanly", () => {
    const el = document.createElement("a-plane") as unknown as CameraCurtainEntity;
    el.setAttribute("material", "shader: flat; color: #000000; opacity: 0");

    const instance = createMockCurtainInstance(el);
    instance.init();

    expect(instance.getOpacity()).toBe(0);
    expect(el.getAttribute("visible")).toBe("false");

    instance.setOpacity(0.5);
    expect(instance.getOpacity()).toBe(0.5);
    expect(el.getAttribute("material")).toMatch(/opacity:\s*0.5/);

    instance.setOpacity(1.2); // Clamps to 1.0
    expect(instance.getOpacity()).toBe(1.0);

    instance.setOpacity(-0.3); // Clamps to 0.0
    expect(instance.getOpacity()).toBe(0.0);
  });

  it("executes bidirectional fade transitions with completion callbacks", () => {
    const el = document.createElement("a-plane") as unknown as CameraCurtainEntity;
    el.setAttribute("material", "shader: flat; opacity: 0");

    const instance = createMockCurtainInstance(el);
    instance.init();

    // Fade out (0 -> 1)
    let fadeOutCalled = false;
    instance.fadeOut(() => {
      fadeOutCalled = true;
    });
    expect(fadeOutCalled).toBe(true);
    expect(instance.getOpacity()).toBe(1);
    expect(el.getAttribute("visible")).toBe("true");

    // Fade in (1 -> 0)
    let fadeInCalled = false;
    instance.fadeIn(() => {
      fadeInCalled = true;
    });
    expect(fadeInCalled).toBe(true);
    expect(instance.getOpacity()).toBe(0);
    expect(el.getAttribute("visible")).toBe("false");
  });
});
