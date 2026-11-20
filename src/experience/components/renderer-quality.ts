import { computeClampedPixelRatio, isMobileUserAgent } from "../renderer-quality";

export interface RendererQualityDependencies {
  readonly getDevicePixelRatio?: () => number;
  readonly isMobileDevice?: () => boolean;
}

export interface RendererQualitySceneElement extends HTMLElement {
  renderer?: {
    setPixelRatio?: (pixelRatio: number) => void;
  };
}

export interface RendererQualityComponentInstance {
  el: RendererQualitySceneElement;
  renderStartHandler: (() => void) | null;
  init: () => void;
  applyPixelRatio: () => void;
  remove: () => void;
}

/**
 * Composable A-Frame scene component that clamps WebGL pixel ratio on mobile VR.
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
      this.applyPixelRatio();
      this.el.addEventListener?.("renderstart", this.renderStartHandler);
    },

    applyPixelRatio: function (this: RendererQualityComponentInstance) {
      const targetDpr = computeClampedPixelRatio(resolveDpr(), resolveMobile());
      this.el.renderer?.setPixelRatio?.(targetDpr);
    },

    remove: function (this: RendererQualityComponentInstance) {
      if (this.renderStartHandler) {
        this.el.removeEventListener?.("renderstart", this.renderStartHandler);
        this.renderStartHandler = null;
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
