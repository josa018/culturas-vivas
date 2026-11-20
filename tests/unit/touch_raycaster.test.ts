import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RETICLE_TOKENS,
  VR_HUD_MAX_TAP_DRAG_PX,
  VR_HUD_TAP_DEBOUNCE_MS,
} from "../../src/experience/constants";
import {
  computeNormalizedDeviceCoords,
  evaluateTouchPointerTap,
} from "../../src/experience/touch-raycaster";
import {
  createTouchRaycasterComponentDefinition,
  ensureTouchRaycaster,
  registerTouchRaycasterComponent,
  type TouchRaycasterComponentInstance,
  type TouchRaycasterEntity,
} from "../../src/experience/components/touch-raycaster";

function dispatchPointerEvent(
  target: EventTarget,
  type: string,
  init: {
    clientX: number;
    clientY: number;
    pointerType?: string;
    button?: number;
  },
): void {
  const evt = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX: number;
    clientY: number;
    pointerType: string;
    button: number;
  };
  evt.clientX = init.clientX;
  evt.clientY = init.clientY;
  evt.pointerType = init.pointerType ?? "touch";
  evt.button = init.button ?? 0;
  target.dispatchEvent(evt);
}

describe("2D Direct Touch & Mouse Raycaster (cv-touch-raycaster)", () => {
  afterEach(() => {
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    vi.restoreAllMocks();
  });

  it("computes Normalized Device Coordinates from viewport rect and rejects degenerate rects", () => {
    const rect = { left: 100, top: 50, width: 800, height: 400 };
    expect(computeNormalizedDeviceCoords(500, 250, rect)).toEqual({ x: 0, y: 0 });
    expect(computeNormalizedDeviceCoords(100, 50, rect)).toEqual({ x: -1, y: 1 });
    expect(computeNormalizedDeviceCoords(900, 450, rect)).toEqual({ x: 1, y: -1 });
    expect(computeNormalizedDeviceCoords(200, 150, { left: 0, top: 0, width: 0, height: 400 })).toBeNull();
  });

  it("evaluates touch pointer taps with 12px drag guard and debounce window", () => {
    const button = document.createElement("a-entity");
    expect(VR_HUD_MAX_TAP_DRAG_PX).toBe(12);

    expect(
      evaluateTouchPointerTap({
        downTarget: button,
        upTarget: button,
        dragDistancePx: 8,
        elapsedSinceLastTapMs: VR_HUD_TAP_DEBOUNCE_MS,
      }),
    ).toBe("ACTIVATE");

    expect(
      evaluateTouchPointerTap({
        downTarget: button,
        upTarget: button,
        dragDistancePx: 14,
        elapsedSinceLastTapMs: VR_HUD_TAP_DEBOUNCE_MS,
      }),
    ).toBe("IGNORE");

    expect(
      evaluateTouchPointerTap({
        downTarget: button,
        upTarget: button,
        dragDistancePx: 2,
        elapsedSinceLastTapMs: VR_HUD_TAP_DEBOUNCE_MS - 10,
      }),
    ).toBe("IGNORE");

    expect(
      evaluateTouchPointerTap({
        downTarget: null,
        upTarget: button,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: VR_HUD_TAP_DEBOUNCE_MS,
      }),
    ).toBe("IGNORE");
  });

  it("activates off-center .clickable targets on pointerup, ignores >12px drags, and avoids sticky touch hover", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
      components: {},
    };
    registerTouchRaycasterComponent();
    expect(registered["cv-touch-raycaster"]).toBeDefined();

    const sceneEl = document.createElement("a-scene") as unknown as HTMLElement & {
      canvas?: HTMLElement;
    };
    const canvas = document.createElement("canvas");
    sceneEl.canvas = canvas;
    sceneEl.appendChild(canvas);

    const clickableBtn = document.createElement("a-entity");
    clickableBtn.setAttribute("class", "clickable");
    sceneEl.appendChild(clickableBtn);

    const hostEl = ensureTouchRaycaster(sceneEl as never);
    expect(hostEl?.id).toBe(RETICLE_TOKENS.TOUCH_RAYCASTER_ID);

    let now = 1000;
    let targetAtPoint: Element | null = null;
    const def = createTouchRaycasterComponentDefinition({
      nowMs: () => now,
      pickClickableAtClientPoint: (clientX, clientY) =>
        clientX >= 600 && clientY <= 200 ? clickableBtn : targetAtPoint,
    });

    const instance = Object.create(def) as TouchRaycasterComponentInstance;
    instance.el = hostEl as unknown as TouchRaycasterEntity;
    (instance.el as TouchRaycasterEntity).sceneEl = sceneEl as never;
    instance.data = { enabled: true };
    instance.init();

    const onClick = vi.fn();
    const onMouseEnter = vi.fn();
    const onMouseLeave = vi.fn();
    clickableBtn.addEventListener("click", onClick);
    clickableBtn.addEventListener("mouseenter", onMouseEnter);
    clickableBtn.addEventListener("mouseleave", onMouseLeave);

    // 1. Touch move does NOT trigger sticky hover
    dispatchPointerEvent(canvas, "pointermove", {
      clientX: 650,
      clientY: 120,
      pointerType: "touch",
    });
    expect(onMouseEnter).not.toHaveBeenCalled();

    // 2. Mouse move enters and leaves cleanly
    dispatchPointerEvent(canvas, "pointermove", {
      clientX: 650,
      clientY: 120,
      pointerType: "mouse",
    });
    expect(onMouseEnter).toHaveBeenCalledTimes(1);

    targetAtPoint = null;
    dispatchPointerEvent(canvas, "pointermove", {
      clientX: 120,
      clientY: 320,
      pointerType: "mouse",
    });
    expect(onMouseLeave).toHaveBeenCalledTimes(1);

    // 3. Direct off-center tap (<= 12 px) activates .clickable on pointerup
    now = 1300;
    dispatchPointerEvent(canvas, "pointerdown", {
      clientX: 640,
      clientY: 140,
      pointerType: "touch",
    });
    dispatchPointerEvent(canvas, "pointerup", {
      clientX: 648,
      clientY: 144,
      pointerType: "touch",
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    // 4. Camera drag (> 12 px) does NOT activate .clickable even if pointerup lands back on it
    now = 1800;
    dispatchPointerEvent(canvas, "pointerdown", {
      clientX: 640,
      clientY: 140,
      pointerType: "touch",
    });
    dispatchPointerEvent(canvas, "pointerup", {
      clientX: 660,
      clientY: 140,
      pointerType: "touch",
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    // 5. Disabled raycaster suppresses clicks
    instance.setEnabled(false);
    now = 2300;
    dispatchPointerEvent(canvas, "pointerdown", {
      clientX: 640,
      clientY: 140,
      pointerType: "mouse",
    });
    dispatchPointerEvent(canvas, "pointerup", {
      clientX: 640,
      clientY: 140,
      pointerType: "mouse",
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    instance.remove();
  });
});
