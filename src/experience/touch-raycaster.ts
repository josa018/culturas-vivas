import {
  VR_HUD_MAX_TAP_DRAG_PX,
  VR_HUD_TAP_DEBOUNCE_MS,
} from "./constants";

export interface NdcPoint {
  readonly x: number;
  readonly y: number;
}

export interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface TouchTapEvaluationInput {
  readonly downTarget: Element | null;
  readonly upTarget: Element | null;
  readonly dragDistancePx: number;
  readonly elapsedSinceLastTapMs: number;
  readonly maxDragPx?: number;
  readonly debounceMs?: number;
}

export type TouchTapEvaluationOutcome = "ACTIVATE" | "IGNORE";

/**
 * Converts client viewport pixel coordinates to Three.js Normalized Device Coordinates [-1, 1].
 */
export function computeNormalizedDeviceCoords(
  clientX: number,
  clientY: number,
  rect: ViewportRect,
): NdcPoint | null {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  return {
    x: x === 0 ? 0 : x,
    y: y === 0 ? 0 : y,
  };
}

/**
 * Evaluates whether a direct 2D touch/mouse release should activate a .clickable entity.
 */
export function evaluateTouchPointerTap(
  input: TouchTapEvaluationInput,
): TouchTapEvaluationOutcome {
  const maxDragPx = input.maxDragPx ?? VR_HUD_MAX_TAP_DRAG_PX;
  const debounceMs = input.debounceMs ?? VR_HUD_TAP_DEBOUNCE_MS;
  if (input.elapsedSinceLastTapMs < debounceMs) {
    return "IGNORE";
  }
  if (!Number.isFinite(input.dragDistancePx) || input.dragDistancePx > maxDragPx) {
    return "IGNORE";
  }
  if (!input.downTarget || !input.upTarget || input.downTarget !== input.upTarget) {
    return "IGNORE";
  }
  return "ACTIVATE";
}

/**
 * Checks whether an entity and all of its DOM/Object3D ancestors are visible.
 */
export function isSceneElementVisible(el: Element): boolean {
  let current: Element | null = el;
  while (current) {
    if (current.getAttribute("visible") === "false") {
      return false;
    }
    const obj = (current as unknown as { object3D?: { visible?: boolean } }).object3D;
    if (obj && obj.visible === false) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

/**
 * Walks an intersected Three.js Object3D upward to locate its owning .clickable element.
 */
export function findClickableElementFromThreeObject(
  threeObject: unknown,
): Element | null {
  let current = threeObject as { el?: Element; parent?: unknown } | null;
  while (current) {
    if (current.el) {
      const clickable = current.el.classList.contains("clickable")
        ? current.el
        : current.el.closest(".clickable");
      if (clickable && isSceneElementVisible(clickable)) {
        return clickable;
      }
      return null;
    }
    current = (current.parent as { el?: Element; parent?: unknown } | null) ?? null;
  }
  return null;
}
