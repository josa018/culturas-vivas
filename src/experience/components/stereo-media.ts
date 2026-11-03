import type { StereoEye } from "../stereo-mapper";
import { StereoTextureMapper } from "../stereo-mapper";

export interface StereoMediaComponentData {
  eye: StereoEye;
  isHalfSBS: boolean;
  viewMode: string;
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
  };
}

export interface StereoMediaComponentInstance {
  el: StereoMediaEntity;
  data: StereoMediaComponentData;
  init: () => void;
  update: (oldData: Partial<StereoMediaComponentData>) => void;
  applyStereoLayers: () => void;
}

export function createStereoMediaComponentDefinition() {
  return {
    schema: {
      eye: { type: "string", default: "LEFT" },
      isHalfSBS: { type: "boolean", default: true },
      viewMode: { type: "string", default: "vr" },
    },

    init: function (this: StereoMediaComponentInstance) {
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

    applyStereoLayers: function (this: StereoMediaComponentInstance) {
      if (!this.el.object3D) {
        return;
      }

      const isVR = this.data.viewMode.toLowerCase() === "vr";
      const isRightEye = this.data.eye.toUpperCase() === "RIGHT";

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
