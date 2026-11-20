import {
  computeClampedPixelRatio,
  computeXrFramebufferScaleFactor,
  isMobileUserAgent,
} from "../renderer-quality";

export interface RendererQualityDependencies {
  readonly getDevicePixelRatio?: () => number;
  readonly isMobileDevice?: () => boolean;
}

export interface RendererQualitySceneElement extends HTMLElement {
  renderer?: {
    setPixelRatio?: (pixelRatio: number) => void;
    xr?: {
      setFramebufferScaleFactor?: (scale: number) => void;
    };
  };
}

export interface RendererQualityComponentInstance {
  el: RendererQualitySceneElement;
  renderStartHandler: (() => void) | null;
  enterVrHandler: (() => void) | null;
  exitVrHandler: (() => void) | null;
  init: () => void;
  applyPixelRatio: () => void;
  applyXrFramebufferScale: () => void;
  remove: () => void;
}

/**
 * Composable A-Frame scene component that clamps WebGL pixel ratio and WebXR
 * framebuffer scale across 2D and VR lifecycles.
 */
export function createRendererQualityComponentDefinition(
  deps: RendererQualityDependencies = {},
) {
  const resolveDpr =
    deps.getDevicePixelRatio ??
    (() =>
      typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
        ? window.devicePixelRatio
        : 1);
  const resolveMobile =
    deps.isMobileDevice ?? (() => isMobileUserAgent());

  return {
    init: function (this: RendererQualityComponentInstance) {
      this.renderStartHandler = () => {
        this.applyPixelRatio();
      };
      this.enterVrHandler = () => {
        this.applyXrFramebufferScale();
      };
      this.exitVrHandler = () => {
        this.applyPixelRatio();
      };
      this.applyPixelRatio();
      this.el.addEventListener?.("renderstart", this.renderStartHandler);
      this.el.addEventListener?.("enter-vr", this.enterVrHandler);
      this.el.addEventListener?.("exit-vr", this.exitVrHandler);
    },

    applyPixelRatio: function (this: RendererQualityComponentInstance) {
      const targetDpr = computeClampedPixelRatio(resolveDpr(), resolveMobile());
      this.el.renderer?.setPixelRatio?.(targetDpr);
    },

    applyXrFramebufferScale: function (this: RendererQualityComponentInstance) {
      const targetScale = computeXrFramebufferScaleFactor(
        resolveDpr(),
        resolveMobile(),
      );
      this.el.renderer?.xr?.setFramebufferScaleFactor?.(targetScale);
    },

    remove: function (this: RendererQualityComponentInstance) {
      if (this.renderStartHandler) {
        this.el.removeEventListener?.("renderstart", this.renderStartHandler);
        this.renderStartHandler = null;
      }
      if (this.enterVrHandler) {
        this.el.removeEventListener?.("enter-vr", this.enterVrHandler);
        this.enterVrHandler = null;
      }
      if (this.exitVrHandler) {
        this.el.removeEventListener?.("exit-vr", this.exitVrHandler);
        this.exitVrHandler = null;
      }
    },
  };
}

export function registerRendererQualityComponent(
  deps?: RendererQualityDependencies,
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
    !globalAFrame.components?.["cv-renderer-quality"]
  ) {
    globalAFrame.registerComponent(
      "cv-renderer-quality",
      createRendererQualityComponentDefinition(deps),
    );
  }
}

if (typeof globalThis !== "undefined") {
  registerRendererQualityComponent();
}
