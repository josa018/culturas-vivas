import { RETICLE_TOKENS } from "../constants";
import {
  computeNormalizedDeviceCoords,
  evaluateTouchPointerTap,
  findClickableElementFromThreeObject,
  isSceneElementVisible,
} from "../touch-raycaster";
import { computeDragDistancePx, type PointerPoint2D } from "./vr-tap-trigger";

export interface TouchRaycasterDependencies {
  readonly nowMs?: () => number;
  readonly pickClickableAtClientPoint?: (
    clientX: number,
    clientY: number,
  ) => Element | null;
}

export interface TouchRaycasterEntity extends HTMLElement {
  sceneEl?: (HTMLElement & {
    canvas?: HTMLElement | null;
    camera?: unknown;
  }) | null;
  components?: Record<string, unknown>;
}

export interface TouchRaycasterComponentInstance {
  el: TouchRaycasterEntity;
  data?: {
    enabled?: boolean;
  };
  enabled: boolean;
  hoveredEl: Element | null;
  downEl: Element | null;
  downPoint: PointerPoint2D | null;
  lastActivationTimestampMs: number;
  boundCanvas: HTMLElement | null;
  cleanupListeners: Array<() => void>;
  cleanupRenderStartListener: (() => void) | null;
  init: () => void;
  update: () => void;
  setEnabled: (enabled: boolean) => void;
  attachCanvasListeners: () => void;
  detachCanvasListeners: () => void;
  clearHover: () => void;
  remove: () => void;
}

interface ThreeRaycasterModule {
  Raycaster?: new () => {
    setFromCamera: (coords: { x: number; y: number }, camera: unknown) => void;
    intersectObjects: (
      objects: unknown[],
      recursive?: boolean,
    ) => Array<{ object?: unknown }>;
  };
}

function dispatchElementEvent(target: Element, type: string): void {
  if (typeof MouseEvent === "function" && type === "click") {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return;
  }
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

function pickLiveClickableAtPoint(
  sceneEl: TouchRaycasterEntity["sceneEl"],
  canvas: HTMLElement,
  clientX: number,
  clientY: number,
): Element | null {
  if (!sceneEl?.camera) {
    return null;
  }
  const threeGlobal = (globalThis as unknown as { THREE?: ThreeRaycasterModule }).THREE;
  if (!threeGlobal?.Raycaster) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const ndc = computeNormalizedDeviceCoords(clientX, clientY, {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  });
  if (!ndc) {
    return null;
  }

  const clickableEls = Array.from(sceneEl.querySelectorAll(".clickable"));
  const raycastTargets: unknown[] = [];
  for (const clickableEl of clickableEls) {
    const obj3d = (clickableEl as unknown as { object3D?: unknown }).object3D;
    if (obj3d && isSceneElementVisible(clickableEl)) {
      raycastTargets.push(obj3d);
    }
  }
  if (raycastTargets.length === 0) {
    return null;
  }

  const raycaster = new threeGlobal.Raycaster();
  raycaster.setFromCamera(ndc, sceneEl.camera);
  const hits = raycaster.intersectObjects(raycastTargets, true);
  for (const hit of hits) {
    const owner = findClickableElementFromThreeObject(hit.object);
    if (owner) {
      return owner;
    }
  }
  return null;
}

/**
 * Direct off-center pointer raycaster for 2D touch and mouse mode without a center reticle.
 */
export function createTouchRaycasterComponentDefinition(
  deps: TouchRaycasterDependencies = {},
) {
  const resolveNowMs = deps.nowMs ?? (() => Date.now());

  return {
    schema: {
      enabled: { type: "boolean", default: true },
    },

    init: function (this: TouchRaycasterComponentInstance) {
      this.enabled = this.data?.enabled !== false;
      this.hoveredEl = null;
      this.downEl = null;
      this.downPoint = null;
      this.lastActivationTimestampMs = -Infinity;
      this.boundCanvas = null;
      this.cleanupListeners = [];
      this.cleanupRenderStartListener = null;

      this.attachCanvasListeners();

      const sceneEl = this.el.sceneEl ?? this.el;
      const onRenderStart = () => {
        this.attachCanvasListeners();
      };
      sceneEl.addEventListener("renderstart", onRenderStart);
      this.cleanupRenderStartListener = () => {
        sceneEl.removeEventListener("renderstart", onRenderStart);
      };
    },

    update: function (this: TouchRaycasterComponentInstance) {
      this.setEnabled(this.data?.enabled !== false);
    },

    clearHover: function (this: TouchRaycasterComponentInstance) {
      if (this.hoveredEl) {
        dispatchElementEvent(this.hoveredEl, "mouseleave");
        this.hoveredEl = null;
      }
      if (this.boundCanvas) {
        this.boundCanvas.style.cursor = "";
      }
    },

    setEnabled: function (
      this: TouchRaycasterComponentInstance,
      enabled: boolean,
    ) {
      this.enabled = enabled;
      if (!enabled) {
        this.downEl = null;
        this.downPoint = null;
        this.clearHover();
      }
    },

    attachCanvasListeners: function (this: TouchRaycasterComponentInstance) {
      const sceneEl = this.el.sceneEl ?? (this.el as TouchRaycasterEntity["sceneEl"]);
      const canvas = sceneEl?.canvas ?? null;
      if (!canvas || canvas === this.boundCanvas) {
        return;
      }
      this.detachCanvasListeners();
      this.boundCanvas = canvas;

      const pickTarget = (clientX: number, clientY: number): Element | null => {
        if (deps.pickClickableAtClientPoint) {
          return deps.pickClickableAtClientPoint(clientX, clientY);
        }
        return pickLiveClickableAtPoint(sceneEl, canvas, clientX, clientY);
      };

      const bindCanvas = (eventName: string, handler: (evt: Event) => void) => {
        canvas.addEventListener(eventName, handler);
        this.cleanupListeners.push(() => {
          canvas.removeEventListener(eventName, handler);
        });
      };

      bindCanvas("pointerdown", (rawEvt: Event) => {
        if (!this.enabled) {
          return;
        }
        const evt = rawEvt as PointerEvent;
        if (evt.pointerType === "mouse" && evt.button !== 0) {
          return;
        }
        this.downPoint = { x: evt.clientX, y: evt.clientY };
        this.downEl = pickTarget(evt.clientX, evt.clientY);
      });

      bindCanvas("pointermove", (rawEvt: Event) => {
        if (!this.enabled) {
          return;
        }
        const evt = rawEvt as PointerEvent;
        if (evt.pointerType !== "mouse") {
          return;
        }
        const target = pickTarget(evt.clientX, evt.clientY);
        if (target === this.hoveredEl) {
          return;
        }
        if (this.hoveredEl) {
          dispatchElementEvent(this.hoveredEl, "mouseleave");
        }
        this.hoveredEl = target;
        if (target) {
          dispatchElementEvent(target, "mouseenter");
        }
        canvas.style.cursor = target ? "pointer" : "";
      });

      bindCanvas("pointerup", (rawEvt: Event) => {
        if (!this.enabled) {
          this.downEl = null;
          this.downPoint = null;
          return;
        }
        const evt = rawEvt as PointerEvent;
        const now = resolveNowMs();
        const upPoint: PointerPoint2D = { x: evt.clientX, y: evt.clientY };
        const upEl = pickTarget(evt.clientX, evt.clientY);
        const dragDistancePx = computeDragDistancePx(this.downPoint, upPoint);

        const outcome = evaluateTouchPointerTap({
          downTarget: this.downEl,
          upTarget: upEl,
          dragDistancePx,
          elapsedSinceLastTapMs: now - this.lastActivationTimestampMs,
        });

        this.downEl = null;
        this.downPoint = null;

        if (outcome === "ACTIVATE" && upEl) {
          this.lastActivationTimestampMs = now;
          dispatchElementEvent(upEl, "click");
        }
      });

      bindCanvas("pointercancel", () => {
        this.downEl = null;
        this.downPoint = null;
        this.clearHover();
      });
    },

    detachCanvasListeners: function (this: TouchRaycasterComponentInstance) {
      for (const cleanup of this.cleanupListeners) {
        cleanup();
      }
      this.cleanupListeners = [];
      this.clearHover();
      this.boundCanvas = null;
    },

    remove: function (this: TouchRaycasterComponentInstance) {
      this.detachCanvasListeners();
      this.cleanupRenderStartListener?.();
      this.cleanupRenderStartListener = null;
      this.downEl = null;
      this.downPoint = null;
    },
  };
}

/**
 * Ensures the singleton 2D touch raycaster entity exists on the active scene.
 */
export function ensureTouchRaycaster(
  sceneEl: HTMLElement | null | undefined,
): TouchRaycasterEntity | null {
  if (!sceneEl) {
    return null;
  }
  const existing = sceneEl.querySelector(
    `#${RETICLE_TOKENS.TOUCH_RAYCASTER_ID}`,
  ) as TouchRaycasterEntity | null;
  if (existing) {
    return existing;
  }
  const el = document.createElement("a-entity") as unknown as TouchRaycasterEntity;
  el.setAttribute("id", RETICLE_TOKENS.TOUCH_RAYCASTER_ID);
  el.setAttribute("cv-touch-raycaster", "enabled: false");
  sceneEl.appendChild(el);
  return el;
}

export function registerTouchRaycasterComponent(
  deps?: TouchRaycasterDependencies,
): void {
  const globalAFrame = (
    globalThis as unknown as {
      AFRAME?: {
        components?: Record<string, unknown>;
        registerComponent: (name: string, def: unknown) => void;
      };
    }
  ).AFRAME;

  if (
    globalAFrame &&
    typeof globalAFrame.registerComponent === "function" &&
    !globalAFrame.components?.["cv-touch-raycaster"]
  ) {
    globalAFrame.registerComponent(
      "cv-touch-raycaster",
      createTouchRaycasterComponentDefinition(deps),
    );
  }
}

if (typeof globalThis !== "undefined") {
  registerTouchRaycasterComponent();
}
