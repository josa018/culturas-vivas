import { INTERACTION_ANIMATION_TOKENS } from "../constants";

export interface InteractiveFeedbackData {
  hoverScale: number;
  hoverZLift: number;
  pressScale: number;
}

export interface InteractiveFeedbackComponentInstance {
  el: HTMLElement;
  data: InteractiveFeedbackData;
  basePosition: { x: number; y: number; z: number };
  baseScale: { x: number; y: number; z: number };
  isHovered: boolean;
  pressTimer: ReturnType<typeof setTimeout> | null;
  cleanupListeners: Array<() => void>;
  init: () => void;
  remove: () => void;
}

function isAFrameActive(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME)
  );
}

function parseVec3Attr(
  attr: unknown,
  fallback: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  if (typeof attr === "string") {
    const parts = attr.trim().split(/\s+/).map(Number);
    return {
      x: Number.isFinite(parts[0]) ? parts[0]! : fallback.x,
      y: Number.isFinite(parts[1]) ? parts[1]! : fallback.y,
      z: Number.isFinite(parts[2]) ? parts[2]! : fallback.z,
    };
  }
  if (attr && typeof attr === "object") {
    const vec = attr as Partial<{ x: number; y: number; z: number }>;
    return {
      x: typeof vec.x === "number" ? vec.x : fallback.x,
      y: typeof vec.y === "number" ? vec.y : fallback.y,
      z: typeof vec.z === "number" ? vec.z : fallback.z,
    };
  }
  return { ...fallback };
}

function formatVec3(x: number, y: number, z: number): string {
  return `${Number(x.toFixed(4))} ${Number(y.toFixed(4))} ${Number(z.toFixed(4))}`;
}

export function createInteractiveFeedbackComponentDefinition() {
  return {
    schema: {
      hoverScale: {
        type: "number",
        default: INTERACTION_ANIMATION_TOKENS.HOVER_SCALE,
      },
      hoverZLift: {
        type: "number",
        default: INTERACTION_ANIMATION_TOKENS.HOVER_Z_LIFT_M,
      },
      pressScale: {
        type: "number",
        default: INTERACTION_ANIMATION_TOKENS.PRESS_SCALE,
      },
    },

    init: function (this: InteractiveFeedbackComponentInstance) {
      this.basePosition = parseVec3Attr(this.el.getAttribute("position"), {
        x: 0,
        y: 0,
        z: 0,
      });
      this.baseScale = parseVec3Attr(this.el.getAttribute("scale"), {
        x: 1,
        y: 1,
        z: 1,
      });
      this.isHovered = false;
      this.pressTimer = null;
      this.cleanupListeners = [];

      const bind = (eventName: string, handler: EventListener) => {
        this.el.addEventListener(eventName, handler);
        this.cleanupListeners.push(() =>
          this.el.removeEventListener(eventName, handler),
        );
      };

      const clearPressTimer = () => {
        if (this.pressTimer !== null) {
          clearTimeout(this.pressTimer);
          this.pressTimer = null;
        }
      };

      const resolveHoverScaleStr = () => {
        const hs = this.data?.hoverScale || INTERACTION_ANIMATION_TOKENS.HOVER_SCALE;
        return formatVec3(
          this.baseScale.x * hs,
          this.baseScale.y * hs,
          this.baseScale.z * hs,
        );
      };

      const resolveBaseScaleStr = () =>
        formatVec3(this.baseScale.x, this.baseScale.y, this.baseScale.z);

      bind("mouseenter", () => {
        this.isHovered = true;
        if (!isAFrameActive()) {
          return;
        }
        const zLift =
          this.data?.hoverZLift ?? INTERACTION_ANIMATION_TOKENS.HOVER_Z_LIFT_M;
        const targetPos = formatVec3(
          this.basePosition.x,
          this.basePosition.y,
          this.basePosition.z + zLift,
        );
        this.el.setAttribute(
          "animation__fb_hover_scale",
          `property: scale; to: ${resolveHoverScaleStr()}; dur: ${INTERACTION_ANIMATION_TOKENS.HOVER_DURATION_MS}; easing: ${INTERACTION_ANIMATION_TOKENS.HOVER_EASING}`,
        );
        this.el.setAttribute(
          "animation__fb_hover_pos",
          `property: position; to: ${targetPos}; dur: ${INTERACTION_ANIMATION_TOKENS.HOVER_DURATION_MS}; easing: ${INTERACTION_ANIMATION_TOKENS.HOVER_EASING}`,
        );
      });

      bind("mouseleave", () => {
        this.isHovered = false;
        clearPressTimer();
        if (!isAFrameActive()) {
          return;
        }
        const basePos = formatVec3(
          this.basePosition.x,
          this.basePosition.y,
          this.basePosition.z,
        );
        this.el.setAttribute(
          "animation__fb_hover_scale",
          `property: scale; to: ${resolveBaseScaleStr()}; dur: ${INTERACTION_ANIMATION_TOKENS.HOVER_DURATION_MS}; easing: ${INTERACTION_ANIMATION_TOKENS.HOVER_EASING}`,
        );
        this.el.setAttribute(
          "animation__fb_hover_pos",
          `property: position; to: ${basePos}; dur: ${INTERACTION_ANIMATION_TOKENS.HOVER_DURATION_MS}; easing: ${INTERACTION_ANIMATION_TOKENS.HOVER_EASING}`,
        );
      });

      bind("click", () => {
        if (!isAFrameActive()) {
          return;
        }
        clearPressTimer();
        const ps = this.data?.pressScale || INTERACTION_ANIMATION_TOKENS.PRESS_SCALE;
        const pressScaleStr = formatVec3(
          this.baseScale.x * ps,
          this.baseScale.y * ps,
          this.baseScale.z * ps,
        );
        this.el.removeAttribute("animation__fb_press_release");
        this.el.setAttribute(
          "animation__fb_press",
          `property: scale; to: ${pressScaleStr}; dur: ${INTERACTION_ANIMATION_TOKENS.PRESS_DURATION_MS}; easing: ${INTERACTION_ANIMATION_TOKENS.PRESS_EASING}`,
        );

        this.pressTimer = setTimeout(() => {
          this.pressTimer = null;
          const releaseTarget = this.isHovered
            ? resolveHoverScaleStr()
            : resolveBaseScaleStr();
          this.el.setAttribute(
            "animation__fb_press_release",
            `property: scale; to: ${releaseTarget}; dur: ${INTERACTION_ANIMATION_TOKENS.PRESS_DURATION_MS}; easing: ${INTERACTION_ANIMATION_TOKENS.HOVER_EASING}`,
          );
        }, INTERACTION_ANIMATION_TOKENS.PRESS_DURATION_MS);
      });
    },

    remove: function (this: InteractiveFeedbackComponentInstance) {
      if (this.pressTimer !== null) {
        clearTimeout(this.pressTimer);
        this.pressTimer = null;
      }
      for (const cleanup of this.cleanupListeners) {
        cleanup();
      }
      this.cleanupListeners = [];
    },
  };
}

export function registerInteractiveFeedbackComponent(): void {
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
    !globalAFrame.components?.["cv-interactive-feedback"]
  ) {
    globalAFrame.registerComponent(
      "cv-interactive-feedback",
      createInteractiveFeedbackComponentDefinition(),
    );
  }
}

if (typeof globalThis !== "undefined") {
  registerInteractiveFeedbackComponent();
}
