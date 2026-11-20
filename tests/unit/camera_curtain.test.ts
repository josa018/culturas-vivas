import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createCameraCurtainComponentDefinition,
  ensureCameraCurtain,
  CAMERA_CURTAIN_ID,
  type CameraCurtainComponentInstance,
  type CameraCurtainEntity,
} from "../../src/experience/components/camera-curtain";
import {
  CAMERA_CURTAIN_RADIUS_M,
  CURTAIN_RENDER_ORDER,
  TRANSITION_TIMINGS,
} from "../../src/experience/constants";

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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
  });

  it("ensureCameraCurtain creates and retrieves idempotent curtain element", () => {
    const cameraEl = document.createElement("a-camera");
    const curtain = ensureCameraCurtain(cameraEl);

    expect(CAMERA_CURTAIN_RADIUS_M).toBe(0.5);
    expect(curtain.tagName.toLowerCase()).toBe("a-sphere");
    expect(curtain.getAttribute("id")).toBe(CAMERA_CURTAIN_ID);
    expect(curtain.getAttribute("position")).toBe("0 0 0");
    expect(curtain.getAttribute("radius")).toBe("0.5");
    expect(curtain.getAttribute("visible")).toBe("false");
    expect(curtain.getAttribute("material")).toContain("side: back");
    expect(curtain.getAttribute("material")).toContain("depthTest: false");
    expect(curtain.getAttribute("material")).toMatch(/opacity:\s*0/);

    expect(ensureCameraCurtain(cameraEl)).toBe(curtain);

    // Pre-existing curtain node with stale radius is also resized to CAMERA_CURTAIN_RADIUS_M
    curtain.setAttribute("radius", "0.2");
    expect(ensureCameraCurtain(cameraEl).getAttribute("radius")).toBe("0.5");
  });

  it("clamps opacity within [0, 1] and updates material string", () => {
    const el = document.createElement(
      "a-sphere",
    ) as unknown as CameraCurtainEntity;
    el.setAttribute(
      "material",
      "shader: flat; color: #000000; side: back; opacity: 0",
    );

    const instance = createMockCurtainInstance(el);
    instance.init();

    expect(instance.getOpacity()).toBe(0);
    expect(el.getAttribute("visible")).toBe("false");

    instance.setOpacity(0.5);
    expect(instance.getOpacity()).toBe(0.5);
    expect(el.getAttribute("material")).toMatch(/opacity:\s*0.5/);

    instance.setOpacity(1.2);
    expect(instance.getOpacity()).toBe(1.0);

    instance.setOpacity(-0.3);
    expect(instance.getOpacity()).toBe(0.0);
  });

  it("executes synchronous fadeOut/fadeIn transitions with callbacks in headless mode", () => {
    const el = document.createElement(
      "a-sphere",
    ) as unknown as CameraCurtainEntity;
    el.setAttribute("material", "shader: flat; side: back; opacity: 0");

    const instance = createMockCurtainInstance(el);
    instance.init();

    let fadeOutCalled = false;
    instance.fadeOut(() => {
      fadeOutCalled = true;
    });
    expect(fadeOutCalled).toBe(true);
    expect(instance.getOpacity()).toBe(1);
    expect(el.getAttribute("visible")).toBe("true");

    let fadeInCalled = false;
    instance.fadeIn(() => {
      fadeInCalled = true;
    });
    expect(fadeInCalled).toBe(true);
    expect(instance.getOpacity()).toBe(0);
    expect(el.getAttribute("visible")).toBe("false");
  });

  it("executes A-Frame animated fadeOut/fadeIn lifecycle via animationcomplete and fallback timer", () => {
    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};

    const el = document.createElement(
      "a-sphere",
    ) as unknown as CameraCurtainEntity;
    el.setAttribute("material", "shader: flat; side: back; opacity: 0");

    const instance = createMockCurtainInstance(el);
    instance.init();

    let fadeOutCount = 0;
    instance.fadeOut(() => {
      fadeOutCount++;
    });
    expect(instance.isAnimating).toBe(true);
    expect(el.getAttribute("animation__curtain_out")).toContain("to: 1.0");

    el.dispatchEvent(new Event("animationcomplete__curtain_out"));
    expect(fadeOutCount).toBe(1);
    expect(instance.isAnimating).toBe(false);
    expect(instance.getOpacity()).toBe(1);

    let fadeInCount = 0;
    instance.fadeIn(() => {
      fadeInCount++;
    });
    expect(el.getAttribute("animation__curtain_in")).toContain("to: 0.0");

    vi.advanceTimersByTime(TRANSITION_TIMINGS.FADE_DURATION_MS + 50);
    expect(fadeInCount).toBe(1);
    expect(instance.isAnimating).toBe(false);
    expect(instance.getOpacity()).toBe(0);
    expect(el.getAttribute("visible")).toBe("false");
  });

  it("enforces CURTAIN_RENDER_ORDER on object3D and child nodes across lifecycle and object3dset", () => {
    const childMesh = { renderOrder: 0 };
    const mockObject3D = {
      visible: false,
      renderOrder: 0,
      traverse: (cb: (node: unknown) => void) => {
        cb(mockObject3D);
        cb(childMesh);
      },
    };

    const el = document.createElement(
      "a-sphere",
    ) as unknown as CameraCurtainEntity;
    el.object3D = mockObject3D;

    const instance = createMockCurtainInstance(el);
    instance.init();

    expect(mockObject3D.renderOrder).toBe(CURTAIN_RENDER_ORDER);
    expect(childMesh.renderOrder).toBe(CURTAIN_RENDER_ORDER);

    const newChildMesh = { renderOrder: 0 };
    mockObject3D.traverse = (cb: (node: unknown) => void) => {
      cb(mockObject3D);
      cb(newChildMesh);
    };

    el.dispatchEvent(new Event("object3dset"));
    expect(newChildMesh.renderOrder).toBe(CURTAIN_RENDER_ORDER);

    instance.fadeOut();
    expect(mockObject3D.renderOrder).toBe(CURTAIN_RENDER_ORDER);
  });

  it("cancels fallback timeout when animationcomplete resolves first so onComplete fires once per phase and cleans up on remove()", () => {
    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};

    const el = document.createElement(
      "a-sphere",
    ) as unknown as CameraCurtainEntity;
    el.setAttribute("material", "shader: flat; side: back; opacity: 0");

    const instance = createMockCurtainInstance(el);
    instance.init();

    let fadeOutCount = 0;
    instance.fadeOut(() => {
      fadeOutCount++;
    });
    el.dispatchEvent(new Event("animationcomplete__curtain_out"));
    vi.advanceTimersByTime(TRANSITION_TIMINGS.FADE_DURATION_MS + 100);
    expect(fadeOutCount).toBe(1);

    let fadeInCount = 0;
    instance.fadeIn(() => {
      fadeInCount++;
    });
    el.dispatchEvent(new Event("animationcomplete__curtain_in"));
    vi.advanceTimersByTime(TRANSITION_TIMINGS.FADE_DURATION_MS + 100);
    expect(fadeInCount).toBe(1);

    // Calling remove() while animating clears pending fallback timer
    instance.fadeOut();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    instance.remove();
    expect(vi.getTimerCount()).toBe(0);
  });
});
