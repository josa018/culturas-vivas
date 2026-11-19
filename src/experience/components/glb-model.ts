import { GLB_FALLBACK_COLORS, ROOM_LAYOUT_TOKENS } from "../constants";
import { computeModelNormalizationTransform } from "../model-normalizer";

export interface GlbModelComponentData {
  readonly src: string;
  readonly maxExtent: number;
}

interface ThreeLikeObject3D {
  scale?: { set?: (x: number, y: number, z: number) => void };
  position?: { set?: (x: number, y: number, z: number) => void };
}

interface ThreeLikeBox3 {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  setFromObject: (obj: unknown) => ThreeLikeBox3;
  isEmpty?: () => boolean;
}

export interface GlbModelEntity extends HTMLElement {
  getObject3D?: (type: string) => unknown;
}

export interface GlbModelComponentInstance {
  el: GlbModelEntity;
  data: GlbModelComponentData;
  modelChild: GlbModelEntity | null;
  fallbackGroup: HTMLElement | null;
  modelLoadedHandler: ((evt: Event) => void) | null;
  modelErrorHandler: (() => void) | null;
  init: () => void;
  mountFallback: () => void;
  remove: () => void;
}

function createFallbackSculpture(): HTMLElement {
  const group = document.createElement("a-entity");
  group.setAttribute("class", "cv-glb-fallback clickable");
  group.setAttribute("position", "0 0.1 0");

  const sphere = document.createElement("a-sphere");
  sphere.setAttribute("radius", "0.25");
  sphere.setAttribute("position", "0 0.25 0");
  sphere.setAttribute("color", GLB_FALLBACK_COLORS.PRIMARY);
  sphere.setAttribute("material", "shader: flat");

  const cone = document.createElement("a-cone");
  cone.setAttribute("radius-bottom", "0.28");
  cone.setAttribute("radius-top", "0.1");
  cone.setAttribute("height", "0.4");
  cone.setAttribute("position", "0 -0.05 0");
  cone.setAttribute("color", GLB_FALLBACK_COLORS.SECONDARY);
  cone.setAttribute("material", "shader: flat");

  const ring = document.createElement("a-ring");
  ring.setAttribute("radius-inner", "0.28");
  ring.setAttribute("radius-outer", "0.34");
  ring.setAttribute("position", "0 0.1 0");
  ring.setAttribute("rotation", "90 0 0");
  ring.setAttribute("color", GLB_FALLBACK_COLORS.RING);
  ring.setAttribute("material", "shader: flat");

  group.append(sphere, cone, ring);
  return group;
}

function normalizeLoadedMesh(
  rootObj: unknown,
  maxExtent: number,
): void {
  const threeGlobal = (
    globalThis as unknown as {
      THREE?: { Box3?: new () => ThreeLikeBox3 };
    }
  ).THREE;

  if (!threeGlobal?.Box3 || !rootObj) {
    return;
  }

  const box = new threeGlobal.Box3().setFromObject(rootObj);
  if (typeof box.isEmpty === "function" && box.isEmpty()) {
    return;
  }

  const transform = computeModelNormalizationTransform(
    box.min,
    box.max,
    maxExtent,
  );
  const obj3D = rootObj as ThreeLikeObject3D;
  obj3D.scale?.set?.(transform.scale, transform.scale, transform.scale);
  obj3D.position?.set?.(
    transform.offset.x,
    transform.offset.y,
    transform.offset.z,
  );
}

export function createGlbModelComponentDefinition() {
  return {
    schema: {
      src: { type: "string", default: "" },
      maxExtent: {
        type: "number",
        default: ROOM_LAYOUT_TOKENS.MODEL_MAX_EXTENT_M,
      },
    },

    init: function (this: GlbModelComponentInstance) {
      this.modelChild = null;
      this.fallbackGroup = null;
      this.modelLoadedHandler = null;
      this.modelErrorHandler = null;

      if (!this.data?.src) {
        this.mountFallback();
        return;
      }

      const modelEl = document.createElement("a-entity") as GlbModelEntity;
      modelEl.setAttribute("class", "clickable");
      modelEl.setAttribute("gltf-model", this.data.src);

      this.modelLoadedHandler = (evt: Event) => {
        const detail = (evt as CustomEvent<{ model?: unknown }>).detail;
        const targetObj =
          detail?.model ??
          modelEl.getObject3D?.("mesh") ??
          this.el.getObject3D?.("mesh");
        normalizeLoadedMesh(
          targetObj,
          this.data.maxExtent || ROOM_LAYOUT_TOKENS.MODEL_MAX_EXTENT_M,
        );
      };

      this.modelErrorHandler = () => {
        this.mountFallback();
      };

      modelEl.addEventListener?.("model-loaded", this.modelLoadedHandler);
      modelEl.addEventListener?.("model-error", this.modelErrorHandler);

      this.modelChild = modelEl;
      this.el.appendChild(modelEl);
    },

    mountFallback: function (this: GlbModelComponentInstance) {
      if (this.modelChild) {
        if (this.modelLoadedHandler) {
          this.modelChild.removeEventListener?.(
            "model-loaded",
            this.modelLoadedHandler,
          );
        }
        if (this.modelErrorHandler) {
          this.modelChild.removeEventListener?.(
            "model-error",
            this.modelErrorHandler,
          );
        }
        this.modelChild.remove();
        this.modelChild = null;
      }

      if (!this.fallbackGroup) {
        this.fallbackGroup = createFallbackSculpture();
        this.el.appendChild(this.fallbackGroup);
      }
    },

    remove: function (this: GlbModelComponentInstance) {
      if (this.modelChild) {
        if (this.modelLoadedHandler) {
          this.modelChild.removeEventListener?.(
            "model-loaded",
            this.modelLoadedHandler,
          );
        }
        if (this.modelErrorHandler) {
          this.modelChild.removeEventListener?.(
            "model-error",
            this.modelErrorHandler,
          );
        }
        this.modelChild.remove();
        this.modelChild = null;
      }
      if (this.fallbackGroup) {
        this.fallbackGroup.remove();
        this.fallbackGroup = null;
      }
      this.modelLoadedHandler = null;
      this.modelErrorHandler = null;
    },
  };
}

export function registerGlbModelComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-glb-model",
      createGlbModelComponentDefinition(),
    );
  }
}

if (typeof globalThis !== "undefined") {
  registerGlbModelComponent();
}
