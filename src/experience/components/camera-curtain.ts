import { TRANSITION_TIMINGS } from "../constants";

export const CAMERA_CURTAIN_ID = "cv-camera-curtain";

export interface CameraCurtainComponentData {
  readonly duration: number;
  readonly easing: string;
}

export interface CameraCurtainEntity extends HTMLElement {
  object3D?: {
    visible: boolean;
  };
}

export interface CameraCurtainComponentInstance {
  el: CameraCurtainEntity;
  data: CameraCurtainComponentData;
  opacity: number;
  isAnimating: boolean;
  init: () => void;
  fadeOut: (onComplete?: () => void) => void;
  fadeIn: (onComplete?: () => void) => void;
  setOpacity: (val: number) => void;
  getOpacity: () => number;
  remove: () => void;
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
      this.el.setAttribute("visible", "false");
      if (this.el.object3D) {
        this.el.object3D.visible = false;
      }
      if (typeof this.setOpacity === "function") {
        this.setOpacity(0);
      }
    },

    setOpacity: function (this: CameraCurtainComponentInstance, val: number) {
      this.opacity = Math.max(0, Math.min(1, val));
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
      this.isAnimating = true;
      this.el.setAttribute("visible", "true");
      if (this.el.object3D) {
        this.el.object3D.visible = true;
      }

      const hasAFrame =
        typeof globalThis !== "undefined" &&
        Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

      if (!hasAFrame) {
        // Headless execution path for unit tests
        if (typeof this.setOpacity === "function") {
          this.setOpacity(1);
        } else {
          this.opacity = 1;
        }
        this.isAnimating = false;
        if (onComplete) {
          onComplete();
        }
        return;
      }

      this.el.removeAttribute("animation__curtain_in");
      this.el.setAttribute(
        "animation__curtain_out",
        `property: material.opacity; from: ${this.opacity}; to: 1.0; dur: ${this.data.duration}; easing: ${this.data.easing}`,
      );

      const completeHandler = () => {
        this.setOpacity(1);
        this.isAnimating = false;
        this.el.removeEventListener(
          "animationcomplete__curtain_out",
          completeHandler,
        );
        if (onComplete) {
          onComplete();
        }
      };

      if (typeof this.el.addEventListener === "function") {
        this.el.addEventListener(
          "animationcomplete__curtain_out",
          completeHandler,
          { once: true },
        );
      }
      setTimeout(completeHandler, this.data.duration + 50);
    },

    fadeIn: function (
      this: CameraCurtainComponentInstance,
      onComplete?: () => void,
    ) {
      this.isAnimating = true;

      const hasAFrame =
        typeof globalThis !== "undefined" &&
        Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

      if (!hasAFrame) {
        // Headless execution path for unit tests
        if (typeof this.setOpacity === "function") {
          this.setOpacity(0);
        } else {
          this.opacity = 0;
        }
        this.el.setAttribute("visible", "false");
        if (this.el.object3D) {
          this.el.object3D.visible = false;
        }
        this.isAnimating = false;
        if (onComplete) {
          onComplete();
        }
        return;
      }

      this.el.removeAttribute("animation__curtain_out");
      this.el.setAttribute(
        "animation__curtain_in",
        `property: material.opacity; from: ${this.opacity}; to: 0.0; dur: ${this.data.duration}; easing: ${this.data.easing}`,
      );

      const completeHandler = () => {
        this.setOpacity(0);
        this.el.setAttribute("visible", "false");
        if (this.el.object3D) {
          this.el.object3D.visible = false;
        }
        this.isAnimating = false;
        this.el.removeEventListener(
          "animationcomplete__curtain_in",
          completeHandler,
        );
        if (onComplete) {
          onComplete();
        }
      };

      if (typeof this.el.addEventListener === "function") {
        this.el.addEventListener(
          "animationcomplete__curtain_in",
          completeHandler,
          { once: true },
        );
      }
      setTimeout(completeHandler, this.data.duration + 50);
    },

    remove: function (this: CameraCurtainComponentInstance) {
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

  curtainEl = document.createElement("a-plane");
  curtainEl.setAttribute("id", CAMERA_CURTAIN_ID);
  curtainEl.setAttribute("position", "0 0 -0.1");
  curtainEl.setAttribute("scale", "0.3 0.3 0.3");
  curtainEl.setAttribute(
    "material",
    "color: #000000; shader: flat; transparent: true; opacity: 0; depthTest: false",
  );
  curtainEl.setAttribute("visible", "false");
  curtainEl.setAttribute("cv-camera-curtain", "");

  cameraEl.appendChild(curtainEl);
  return curtainEl;
}

if (typeof globalThis !== "undefined") {
  registerCameraCurtainComponent();
}
