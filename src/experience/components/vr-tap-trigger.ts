import {
  VR_HUD_ELEMENT_IDS,
  VR_HUD_MAX_TAP_DRAG_PX,
  VR_HUD_TAP_DEBOUNCE_MS,
} from "../constants";

export const VR_TAP_HUD_TOGGLE_EVENT = "cv-vr-tap-hud-toggle";

export interface PointerPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface TapEvaluationInput {
  readonly downEl: Element | null;
  readonly upEl: Element | null;
  readonly dragDistancePx: number;
  readonly elapsedSinceLastTapMs: number;
  readonly hudToggleEnabled: boolean;
  readonly isTransitionIdle: boolean;
}

export type TapEvaluationOutcome =
  | "ACTIVATE_ENTITY"
  | "TOGGLE_HUD"
  | "IGNORE";

interface AFrameCursorComponent {
  fuseTimeout?: ReturnType<typeof setTimeout>;
  intersectedEl?: Element | null;
  data?: {
    fuse?: boolean;
    rayOrigin?: string;
  };
}

export interface AFrameCursorElement extends HTMLElement {
  components?: {
    cursor?: AFrameCursorComponent;
  };
  removeState?: (state: string) => void;
}

export interface VrTapTriggerEntity extends HTMLElement {
  sceneEl?: HTMLElement;
}

export interface VrTapTriggerComponentInstance {
  el: VrTapTriggerEntity;
  data?: {
    hudToggleEnabled?: boolean;
  };
  hudToggleEnabled: boolean;
  isTransitionIdle: boolean;
  downEl: Element | null;
  downPoint: PointerPoint2D | null;
  lastActivationTimestampMs: number;
  cursorEl: AFrameCursorElement | null;
  cursorDownHandler: ((evt: Event) => void) | null;
  cursorUpHandler: ((evt: Event) => void) | null;
  cursorClickHandler: (() => void) | null;
  init: () => void;
  setHudToggleEnabled: (enabled: boolean) => void;
  setTransitionIdle: (isIdle: boolean) => void;
  handleCursorDown: (evt: Event) => void;
  handleCursorUp: (evt: Event, nowMs?: number) => TapEvaluationOutcome;
  attachCursorListeners: (cursorEl: AFrameCursorElement | null) => void;
  detachCursorListeners: () => void;
  remove: () => void;
}

/**
 * Computes Euclidean drag distance in pixels between pointer down and up points.
 * Returns 0 when either coordinate is absent (e.g. WebXR select events).
 */
export function computeDragDistancePx(
  start: PointerPoint2D | null,
  end: PointerPoint2D | null,
): number {
  if (!start || !end) {
    return 0;
  }
  return Math.hypot(end.x - start.x, end.y - start.y);
}

/**
 * Pure decision function determining whether a cursor release should activate
 * a .clickable target, toggle the 3D HUD on empty space, or be ignored.
 */
export function evaluateCursorTap(
  input: TapEvaluationInput,
): TapEvaluationOutcome {
  if (input.elapsedSinceLastTapMs < VR_HUD_TAP_DEBOUNCE_MS) {
    return "IGNORE";
  }
  if (input.dragDistancePx > VR_HUD_MAX_TAP_DRAG_PX) {
    return "IGNORE";
  }
  if (input.upEl !== null && input.downEl === input.upEl) {
    return "ACTIVATE_ENTITY";
  }
  if (
    input.downEl === null &&
    input.upEl === null &&
    input.hudToggleEnabled &&
    input.isTransitionIdle
  ) {
    return "TOGGLE_HUD";
  }
  return "IGNORE";
}

function extractPointFromCursorEvent(evt: Event): PointerPoint2D | null {
  const detail = (
    evt as CustomEvent<{
      mouseEvent?: { clientX?: number; clientY?: number };
      touchEvent?: {
        touches?: ArrayLike<{ clientX: number; clientY: number }>;
        changedTouches?: ArrayLike<{ clientX: number; clientY: number }>;
      };
    }>
  ).detail;

  const touch =
    detail?.touchEvent?.changedTouches?.[0] ?? detail?.touchEvent?.touches?.[0];
  if (
    touch &&
    typeof touch.clientX === "number" &&
    typeof touch.clientY === "number"
  ) {
    return { x: touch.clientX, y: touch.clientY };
  }

  const mouse = detail?.mouseEvent;
  if (
    mouse &&
    typeof mouse.clientX === "number" &&
    typeof mouse.clientY === "number"
  ) {
    return { x: mouse.clientX, y: mouse.clientY };
  }

  return null;
}

function extractIntersectedEl(
  evt: Event,
  cursorEl: AFrameCursorElement | null,
): Element | null {
  const detail = (evt as CustomEvent<{ intersectedEl?: Element | null }>)
    .detail;
  if (detail && "intersectedEl" in detail) {
    return detail.intersectedEl ?? null;
  }
  return cursorEl?.components?.cursor?.intersectedEl ?? null;
}

export function createVrTapTriggerComponentDefinition() {
  return {
    schema: {
      hudToggleEnabled: { type: "boolean", default: true },
    },

    init: function (this: VrTapTriggerComponentInstance) {
      this.hudToggleEnabled = this.data?.hudToggleEnabled ?? true;
      this.isTransitionIdle = true;
      this.downEl = null;
      this.downPoint = null;
      this.lastActivationTimestampMs = -Infinity;
      this.cursorEl = null;
      this.cursorDownHandler = null;
      this.cursorUpHandler = null;
      this.cursorClickHandler = null;

      const sceneEl =
        this.el.sceneEl ??
        (typeof document !== "undefined"
          ? document.querySelector<HTMLElement>("a-scene")
          : null);
      const cursorEl =
        sceneEl?.querySelector<AFrameCursorElement>("a-cursor") ??
        sceneEl?.querySelector<AFrameCursorElement>("[cursor]") ??
        null;

      this.attachCursorListeners(cursorEl);
    },

    setHudToggleEnabled: function (
      this: VrTapTriggerComponentInstance,
      enabled: boolean,
    ) {
      this.hudToggleEnabled = enabled;
    },

    setTransitionIdle: function (
      this: VrTapTriggerComponentInstance,
      isIdle: boolean,
    ) {
      this.isTransitionIdle = isIdle;
    },

    attachCursorListeners: function (
      this: VrTapTriggerComponentInstance,
      cursorEl: AFrameCursorElement | null,
    ) {
      this.detachCursorListeners();
      if (!cursorEl || typeof cursorEl.addEventListener !== "function") {
        return;
      }
      this.cursorEl = cursorEl;
      this.cursorDownHandler = (evt: Event) => this.handleCursorDown(evt);
      this.cursorUpHandler = (evt: Event) => {
        this.handleCursorUp(evt);
      };
      this.cursorClickHandler = () => {
        this.lastActivationTimestampMs = Date.now();
      };
      cursorEl.addEventListener("mousedown", this.cursorDownHandler);
      cursorEl.addEventListener("mouseup", this.cursorUpHandler);
      cursorEl.addEventListener("click", this.cursorClickHandler);
    },

    detachCursorListeners: function (this: VrTapTriggerComponentInstance) {
      if (
        this.cursorEl &&
        typeof this.cursorEl.removeEventListener === "function"
      ) {
        if (this.cursorDownHandler) {
          this.cursorEl.removeEventListener(
            "mousedown",
            this.cursorDownHandler,
          );
        }
        if (this.cursorUpHandler) {
          this.cursorEl.removeEventListener("mouseup", this.cursorUpHandler);
        }
        if (this.cursorClickHandler) {
          this.cursorEl.removeEventListener("click", this.cursorClickHandler);
        }
      }
      this.cursorEl = null;
      this.cursorDownHandler = null;
      this.cursorUpHandler = null;
      this.cursorClickHandler = null;
    },

    handleCursorDown: function (
      this: VrTapTriggerComponentInstance,
      evt: Event,
    ) {
      this.downEl = extractIntersectedEl(evt, this.cursorEl);
      this.downPoint = extractPointFromCursorEvent(evt);
    },

    handleCursorUp: function (
      this: VrTapTriggerComponentInstance,
      evt: Event,
      nowMs: number = Date.now(),
    ): TapEvaluationOutcome {
      const upEl = extractIntersectedEl(evt, this.cursorEl);
      const upPoint = extractPointFromCursorEvent(evt);
      const dragDistancePx = computeDragDistancePx(this.downPoint, upPoint);
      const elapsedSinceLastTapMs = nowMs - this.lastActivationTimestampMs;

      const outcome = evaluateCursorTap({
        downEl: this.downEl,
        upEl,
        dragDistancePx,
        elapsedSinceLastTapMs,
        hudToggleEnabled: this.hudToggleEnabled,
        isTransitionIdle: this.isTransitionIdle,
      });

      this.downEl = null;
      this.downPoint = null;

      if (outcome === "IGNORE") {
        return outcome;
      }

      this.lastActivationTimestampMs = nowMs;

      if (outcome === "ACTIVATE_ENTITY" && upEl) {
        const cursorComp = this.cursorEl?.components?.cursor;
        if (cursorComp?.fuseTimeout !== undefined) {
          clearTimeout(cursorComp.fuseTimeout);
          cursorComp.fuseTimeout = undefined;
        }
        this.cursorEl?.removeState?.("cursor-fusing");

        // Only emit click when A-Frame cursor suppressed it due to fuse="true"
        const cursorHandlesClickNatively = Boolean(
          cursorComp?.data &&
            (!cursorComp.data.fuse ||
              cursorComp.data.rayOrigin === "mouse" ||
              cursorComp.data.rayOrigin === "xrselect"),
        );

        if (!cursorHandlesClickNatively) {
          const clickEvent =
            typeof MouseEvent !== "undefined"
              ? new MouseEvent("click", { bubbles: true, cancelable: true })
              : new CustomEvent("click", { bubbles: true, cancelable: true });
          upEl.dispatchEvent(clickEvent);
        }
      } else if (outcome === "TOGGLE_HUD") {
        this.el.dispatchEvent?.(
          new CustomEvent(VR_TAP_HUD_TOGGLE_EVENT, { bubbles: true }),
        );
      }

      return outcome;
    },

    remove: function (this: VrTapTriggerComponentInstance) {
      this.detachCursorListeners();
      this.downEl = null;
      this.downPoint = null;
    },
  };
}

export function registerVrTapTriggerComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-vr-tap-trigger",
      createVrTapTriggerComponentDefinition(),
    );
  }
}

export function ensureVrTapTrigger(sceneEl: HTMLElement): HTMLElement {
  let triggerEl = sceneEl.querySelector(
    `#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`,
  ) as HTMLElement | null;
  if (triggerEl) {
    return triggerEl;
  }

  triggerEl = document.createElement("a-entity");
  triggerEl.setAttribute("id", VR_HUD_ELEMENT_IDS.TAP_TRIGGER);
  triggerEl.setAttribute("cv-vr-tap-trigger", "");
  sceneEl.appendChild(triggerEl);
  return triggerEl;
}

if (typeof globalThis !== "undefined") {
  registerVrTapTriggerComponent();
}
