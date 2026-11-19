import { CURTAIN_RENDER_ORDER, TRANSITION_TIMINGS } from "../constants";

export const CAMERA_CURTAIN_ID = "cv-camera-curtain";

export interface CameraCurtainComponentData {
  readonly duration: number;
  readonly easing: string;
}

export interface CameraCurtainEntity extends HTMLElement {
  object3D?: {
    visible: boolean;
    renderOrder?: number;
    traverse?: (cb: (node: unknown) => void) => void;
  };
}

export interface CameraCurtainComponentInstance {
  el: CameraCurtainEntity;
  data: CameraCurtainComponentData;
  opacity: number;
  isAnimating: boolean;
  transitionEpoch?: number;
  activeTimer?: ReturnType<typeof setTimeout> | null;
  activeCompleteEvent?: string | null;
  activeCompleteHandler?: (() => void) | null;
  init: () => void;
  fadeOut: (onComplete?: () => void) => void;
  fadeIn: (onComplete?: () => void) => void;
  setOpacity: (val: number) => void;
  getOpacity: () => number;
  remove: () => void;
}

function clearPendingCurtainTransition(
  instance: CameraCurtainComponentInstance,
): void {
  if (instance.activeTimer !== null && instance.activeTimer !== undefined) {
    clearTimeout(instance.activeTimer);
    instance.activeTimer = null;
  }
  if (instance.activeCompleteEvent && instance.activeCompleteHandler) {
    instance.el.removeEventListener?.(
      instance.activeCompleteEvent,
      instance.activeCompleteHandler,
    );
  }
  instance.activeCompleteEvent = null;
  instance.activeCompleteHandler = null;
}

function scheduleCurtainTransition(
  instance: CameraCurtainComponentInstance,
  options: {
    removeAttr: string;
    setAttr: string;
    completeEvent: string;
    targetOpacity: number;
    hideAfterComplete: boolean;
    onComplete?: () => void;
  },
): void {
  clearPendingCurtainTransition(instance);
  const epoch = (instance.transitionEpoch ?? 0) + 1;
  instance.transitionEpoch = epoch;
  instance.isAnimating = true;

  const applyFinalState = () => {
    if (typeof instance.setOpacity === "function") {
      instance.setOpacity(options.targetOpacity);
    } else {
      instance.opacity = options.targetOpacity;
    }
    if (options.hideAfterComplete) {
      instance.el.setAttribute("visible", "false");
      if (instance.el.object3D) {
        instance.el.object3D.visible = false;
      }
    }
    instance.isAnimating = false;
  };

  const hasAFrame =
    typeof globalThis !== "undefined" &&
    Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

  if (!hasAFrame) {
    applyFinalState();
    options.onComplete?.();
    return;
  }

  instance.el.removeAttribute(options.removeAttr);
  instance.el.setAttribute(
    options.setAttr,
    `property: material.opacity; from: ${instance.opacity}; to: ${options.targetOpacity.toFixed(1)}; dur: ${instance.data.duration}; easing: ${instance.data.easing}`,
  );

  const settle = () => {
    if (instance.transitionEpoch !== epoch) {
      return;
    }
    clearPendingCurtainTransition(instance);
    applyFinalState();
    options.onComplete?.();
  };

  if (typeof instance.el.addEventListener === "function") {
    instance.activeCompleteEvent = options.completeEvent;
    instance.activeCompleteHandler = settle;
    instance.el.addEventListener(options.completeEvent, settle, { once: true });
  }
  instance.activeTimer = setTimeout(
    settle,
    instance.data.duration + TRANSITION_TIMINGS.CURTAIN_FALLBACK_BUFFER_MS,
  );
}

export function createCameraCurtainComponentDefinition() {
  return {
    schema: {
      duration: {
        type: "number",
        default: TRANSITION_TIMINGS.FADE_DURATION_MS,
      },
      easing: {
        type: "string",
        default: TRANSITION_TIMINGS.FADE_EASING,
      },
    },

    init: function (this: CameraCurtainComponentInstance) {
      this.opacity = 0;
      this.isAnimating = false;
      this.transitionEpoch = 0;
      this.activeTimer = null;
      this.activeCompleteEvent = null;
      this.activeCompleteHandler = null;
      this.el.setAttribute("visible", "false");

      const applyRenderOrder = () => {
        if (this.el.object3D) {
          this.el.object3D.renderOrder = CURTAIN_RENDER_ORDER;
          if (typeof this.el.object3D.traverse === "function") {
            this.el.object3D.traverse((node: unknown) => {
              if (node && typeof node === "object") {
                (node as { renderOrder?: number }).renderOrder =
                  CURTAIN_RENDER_ORDER;
              }
            });
          }
        }
      };

      applyRenderOrder();
      if (typeof this.el.addEventListener === "function") {
        this.el.addEventListener("object3dset", applyRenderOrder);
      }

      if (this.el.object3D) {
        this.el.object3D.visible = false;
      }
      if (typeof this.setOpacity === "function") {
        this.setOpacity(0);
      }
    },

    setOpacity: function (this: CameraCurtainComponentInstance, val: number) {
      this.opacity = Math.max(0, Math.min(1, val));
      if (this.el.object3D) {
        this.el.object3D.renderOrder = CURTAIN_RENDER_ORDER;
      }
      const currentMaterial = this.el.getAttribute("material");
      if (typeof currentMaterial === "string") {
        if (/opacity:\s*[\d.]+/.test(currentMaterial)) {
          this.el.setAttribute(
            "material",
            currentMaterial.replace(
              /opacity:\s*[\d.]+/,
              `opacity: ${this.opacity}`,
            ),
          );
        } else {
          this.el.setAttribute(
            "material",
            `${currentMaterial}; opacity: ${this.opacity}`,
          );
        }
      } else {
        this.el.setAttribute("material", `opacity: ${this.opacity}`);
      }
    },

    getOpacity: function (this: CameraCurtainComponentInstance): number {
      return this.opacity;
    },

    fadeOut: function (
      this: CameraCurtainComponentInstance,
      onComplete?: () => void,
    ) {
      this.el.setAttribute("visible", "true");
      if (this.el.object3D) {
        this.el.object3D.visible = true;
        this.el.object3D.renderOrder = CURTAIN_RENDER_ORDER;
        if (typeof this.el.object3D.traverse === "function") {
          this.el.object3D.traverse((node: unknown) => {
            if (node && typeof node === "object") {
              (node as { renderOrder?: number }).renderOrder =
                CURTAIN_RENDER_ORDER;
            }
          });
        }
      }

      scheduleCurtainTransition(this, {
        removeAttr: "animation__curtain_in",
        setAttr: "animation__curtain_out",
        completeEvent: "animationcomplete__curtain_out",
        targetOpacity: 1.0,
        hideAfterComplete: false,
        onComplete,
      });
    },

    fadeIn: function (
      this: CameraCurtainComponentInstance,
      onComplete?: () => void,
    ) {
      scheduleCurtainTransition(this, {
        removeAttr: "animation__curtain_out",
        setAttr: "animation__curtain_in",
        completeEvent: "animationcomplete__curtain_in",
        targetOpacity: 0.0,
        hideAfterComplete: true,
        onComplete,
      });
    },

    remove: function (this: CameraCurtainComponentInstance) {
      this.transitionEpoch = (this.transitionEpoch ?? 0) + 1;
      clearPendingCurtainTransition(this);
      this.isAnimating = false;
    },
  };
}

export function registerCameraCurtainComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-camera-curtain",
      createCameraCurtainComponentDefinition(),
    );
  }
}

export function ensureCameraCurtain(cameraEl: HTMLElement): HTMLElement {
  let curtainEl = cameraEl.querySelector(
    `#${CAMERA_CURTAIN_ID}`,
  ) as HTMLElement;
  if (curtainEl) {
    return curtainEl;
  }

  curtainEl = document.createElement("a-sphere");
  curtainEl.setAttribute("id", CAMERA_CURTAIN_ID);
  curtainEl.setAttribute("position", "0 0 0");
  curtainEl.setAttribute("radius", "0.2");
  curtainEl.setAttribute(
    "material",
    "side: back; color: #000000; shader: flat; transparent: true; opacity: 0; depthTest: false",
  );
  curtainEl.setAttribute("visible", "false");
  curtainEl.setAttribute("cv-camera-curtain", "");

  cameraEl.appendChild(curtainEl);
  return curtainEl;
}

if (typeof globalThis !== "undefined") {
  registerCameraCurtainComponent();
}
