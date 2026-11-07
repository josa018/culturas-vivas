import { describe, it, expect } from "vitest";
import {
  createStereoMediaComponentDefinition,
  type StereoMediaComponentInstance,
  type StereoMediaEntity,
} from "../../src/experience/components/stereo-media";
import { StereoTextureMapper } from "../../src/experience/stereo-mapper";

interface MockObject3DWithLayers {
  layers: {
    currentLayer: number;
    set: (ch: number) => void;
  };
  visible: boolean;
}

function createMockStereoEntity(): HTMLElement & {
  object3D: MockObject3DWithLayers;
} {
  const el = document.createElement("a-plane") as unknown as HTMLElement & {
    object3D: MockObject3DWithLayers;
  };
  el.object3D = {
    layers: {
      currentLayer: 0,
      set: function (ch: number) {
        this.currentLayer = ch;
      },
    },
    visible: true,
  };
  return el;
}

describe("A-Frame Stereo Media Component", () => {
  it("assigns eye layers 1 and 2 to SBS pair in VR mode", () => {
    const def = createStereoMediaComponentDefinition();

    // Left Eye Entity
    const leftEl = createMockStereoEntity();
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = leftEl as unknown as StereoMediaEntity;
    leftInstance.data = {
      eye: "LEFT",
      isHalfSBS: true,
      viewMode: "vr",
    };
    leftInstance.init();

    expect(leftEl.object3D.layers.currentLayer).toBe(
      StereoTextureMapper.THREE_LAYER_LEFT,
    );
    expect(leftEl.object3D.visible).toBe(true);
    expect(leftEl.getAttribute("visible")).toBe("true");

    // Right Eye Entity
    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaEntity;
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "vr",
    };
    rightInstance.init();

    expect(rightEl.object3D.layers.currentLayer).toBe(
      StereoTextureMapper.THREE_LAYER_RIGHT,
    );
    expect(rightEl.object3D.visible).toBe(true);
    expect(rightEl.getAttribute("visible")).toBe("true");
  });

  it("renders on default layer for left eye and conceals right eye in 2D mode", () => {
    const def = createStereoMediaComponentDefinition();

    // Left Eye Entity in 2D Mode (renders on default layer 0)
    const leftEl = createMockStereoEntity();
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = leftEl as unknown as StereoMediaEntity;
    leftInstance.data = {
      eye: "LEFT",
      isHalfSBS: true,
      viewMode: "2d",
    };
    leftInstance.init();

    expect(leftEl.object3D.layers.currentLayer).toBe(
      StereoTextureMapper.THREE_LAYER_DEFAULT,
    );
    expect(leftEl.object3D.visible).toBe(true);

    // Right Eye Entity in 2D Mode (hidden to prevent split-screen duplication)
    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaEntity;
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "2d",
    };
    rightInstance.init();

    expect(rightEl.object3D.visible).toBe(false);
    expect(rightEl.getAttribute("visible")).toBe("false");
  });

  it("properly updates layers on dynamic viewMode transition", () => {
    const def = createStereoMediaComponentDefinition();
    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaEntity;
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "vr",
    };
    rightInstance.init();
    expect(rightEl.object3D.visible).toBe(true);

    // Switch to 2D
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "2d",
    };
    rightInstance.update({ viewMode: "vr" });
    expect(rightEl.object3D.visible).toBe(false);

    // Switch back to VR
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "vr",
    };
    rightInstance.update({ viewMode: "2d" });
    expect(rightEl.object3D.visible).toBe(true);
    expect(rightEl.object3D.layers.currentLayer).toBe(
      StereoTextureMapper.THREE_LAYER_RIGHT,
    );
  });
});
