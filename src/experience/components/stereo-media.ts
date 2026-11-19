import type { StereoEye } from "../stereo-mapper";
import { StereoEye as StereoEyeValues, StereoTextureMapper } from "../stereo-mapper";

export interface StereoMediaComponentData {
  eye: StereoEye;
  isHalfSBS: boolean;
  viewMode: string;
}

interface UVAttributeLike {
  array: Float32Array | number[];
  needsUpdate: boolean;
}

interface MeshGeometryLike {
  attributes?: {
    uv?: UVAttributeLike;
  };
}

interface Object3DNodeLike {
  geometry?: MeshGeometryLike;
}

export interface StereoMediaEntity extends HTMLElement {
  object3D: {
    layers: {
      mask: number;
      set: (channel: number) => void;
      enable: (channel: number) => void;
      disable: (channel: number) => void;
    };
    visible: boolean;
    traverse?: (callback: (node: unknown) => void) => void;
  };
}

export interface StereoMediaComponentInstance {
  el: StereoMediaEntity;
  data: StereoMediaComponentData;
  baseUvCache?: WeakMap<object, number[]>;
  onObject3DSet?: () => void;
  init: () => void;
  update: (oldData: Partial<StereoMediaComponentData>) => void;
  remove?: () => void;
  applyStereoLayers: () => void;
}

function getOrCacheBaseUVs(
  cache: WeakMap<object, number[]>,
  uvAttr: UVAttributeLike,
): number[] {
  const existing = cache.get(uvAttr);
  if (existing) {
    return existing;
  }
  const cloned = Array.from(uvAttr.array);
  cache.set(uvAttr, cloned);
  return cloned;
}

export function createStereoMediaComponentDefinition() {
  return {
    schema: {
      eye: { type: "string", default: "LEFT" },
      isHalfSBS: { type: "boolean", default: true },
      viewMode: { type: "string", default: "vr" },
    },

    init: function (this: StereoMediaComponentInstance) {
      this.baseUvCache = new WeakMap<object, number[]>();
      this.onObject3DSet = () => {
        this.applyStereoLayers();
      };
      this.el.addEventListener("object3dset", this.onObject3DSet);
      this.applyStereoLayers();
    },

    update: function (
      this: StereoMediaComponentInstance,
      oldData: Partial<StereoMediaComponentData>,
    ) {
      if (
        oldData.viewMode !== this.data.viewMode ||
        oldData.eye !== this.data.eye ||
        oldData.isHalfSBS !== this.data.isHalfSBS
      ) {
        this.applyStereoLayers();
      }
    },

    remove: function (this: StereoMediaComponentInstance) {
      if (this.onObject3DSet) {
        this.el.removeEventListener("object3dset", this.onObject3DSet);
      }
    },

    applyStereoLayers: function (this: StereoMediaComponentInstance) {
      if (!this.el.object3D) {
        return;
      }

      const isVR = this.data.viewMode.toLowerCase() === "vr";
      const isRightEye = this.data.eye.toUpperCase() === StereoEyeValues.RIGHT;

      if (isVR && this.data.isHalfSBS) {
        // VR Mode: assign hardware eye layer
        const layer = isRightEye
          ? StereoTextureMapper.THREE_LAYER_RIGHT
          : StereoTextureMapper.THREE_LAYER_LEFT;

        if (
          this.el.object3D.layers &&
          typeof this.el.object3D.layers.set === "function"
        ) {
          this.el.object3D.layers.set(layer);
        }
        this.el.object3D.visible = true;
        this.el.setAttribute("visible", "true");
      } else {
        // 2D Mode: Hide the duplicate right eye mesh, show left eye mesh on default layer 0
        if (isRightEye && this.data.isHalfSBS) {
          this.el.object3D.visible = false;
          this.el.setAttribute("visible", "false");
        } else {
          if (
            this.el.object3D.layers &&
            typeof this.el.object3D.layers.set === "function"
          ) {
            this.el.object3D.layers.set(
              StereoTextureMapper.THREE_LAYER_DEFAULT,
            );
          }
          this.el.object3D.visible = true;
          this.el.setAttribute("visible", "true");
        }
      }

      this.baseUvCache ??= new WeakMap<object, number[]>();
      const uvBounds = this.data.isHalfSBS
        ? StereoTextureMapper.getUVBounds(
            isRightEye ? StereoEyeValues.RIGHT : StereoEyeValues.LEFT,
            true,
          )
        : StereoTextureMapper.getUVBounds(StereoEyeValues.MONO, false);

      if (typeof this.el.object3D.traverse === "function") {
        const cache = this.baseUvCache;
        this.el.object3D.traverse((node: unknown) => {
          const uvAttr = (node as Object3DNodeLike | null)?.geometry?.attributes?.uv;
          if (!uvAttr || !uvAttr.array) {
            return;
          }
          const rawUvs = getOrCacheBaseUVs(cache, uvAttr);
          const remapped = StereoTextureMapper.remapUVCoordinates(rawUvs, uvBounds);
          for (let i = 0; i < remapped.length && i < uvAttr.array.length; i += 1) {
            uvAttr.array[i] = remapped[i];
          }
          uvAttr.needsUpdate = true;
        });
      }
    },
  };
}

export function registerStereoMediaComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-stereo-media",
      createStereoMediaComponentDefinition(),
    );
  }
}

// Auto-register if AFRAME is already loaded in the environment
if (typeof globalThis !== "undefined") {
  registerStereoMediaComponent();
}
