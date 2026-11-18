import { describe, it, expect, vi } from "vitest";
import {
  createStereoMediaComponentDefinition,
  type StereoMediaComponentInstance,
  type StereoMediaEntity,
} from "../../src/experience/components/stereo-media";

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

    const leftEl = createMockStereoEntity();
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = leftEl as unknown as StereoMediaEntity;
    leftInstance.data = { eye: "LEFT", isHalfSBS: true, viewMode: "vr" };
    leftInstance.init();

    expect(leftEl.object3D.layers.currentLayer).toBe(1);
    expect(leftEl.object3D.visible).toBe(true);
    expect(leftEl.getAttribute("visible")).toBe("true");

    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaEntity;
    rightInstance.data = { eye: "RIGHT", isHalfSBS: true, viewMode: "vr" };
    rightInstance.init();

    expect(rightEl.object3D.layers.currentLayer).toBe(2);
    expect(rightEl.object3D.visible).toBe(true);
    expect(rightEl.getAttribute("visible")).toBe("true");
  });

  it("renders on default layer 0 for left eye and hides right eye in 2D mode", () => {
    const def = createStereoMediaComponentDefinition();

    const leftEl = createMockStereoEntity();
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = leftEl as unknown as StereoMediaEntity;
    leftInstance.data = { eye: "LEFT", isHalfSBS: true, viewMode: "2d" };
    leftInstance.init();

    expect(leftEl.object3D.layers.currentLayer).toBe(0);
    expect(leftEl.object3D.visible).toBe(true);

    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaEntity;
    rightInstance.data = { eye: "RIGHT", isHalfSBS: true, viewMode: "2d" };
    rightInstance.init();

    expect(rightEl.object3D.visible).toBe(false);
    expect(rightEl.getAttribute("visible")).toBe("false");
  });

  it("renders right eye on default layer 0 when isHalfSBS is false", () => {
    const def = createStereoMediaComponentDefinition();
    const el = createMockStereoEntity();
    const instance: StereoMediaComponentInstance = Object.create(def);
    instance.el = el as unknown as StereoMediaEntity;
    instance.data = { eye: "RIGHT", isHalfSBS: false, viewMode: "vr" };
    instance.init();

    expect(el.object3D.layers.currentLayer).toBe(0);
    expect(el.object3D.visible).toBe(true);
  });

  it("updates layers on viewMode change and ignores update() when data is unchanged", () => {
    const def = createStereoMediaComponentDefinition();
    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaEntity;
    rightInstance.data = { eye: "RIGHT", isHalfSBS: true, viewMode: "vr" };
    rightInstance.init();

    const applySpy = vi.spyOn(rightInstance, "applyStereoLayers");
    rightInstance.update({ eye: "RIGHT", isHalfSBS: true, viewMode: "vr" });
    expect(applySpy).not.toHaveBeenCalled();

    rightInstance.data = { eye: "RIGHT", isHalfSBS: true, viewMode: "2d" };
    rightInstance.update({ viewMode: "vr" });
    expect(rightEl.object3D.visible).toBe(false);

    rightInstance.data = { eye: "RIGHT", isHalfSBS: true, viewMode: "vr" };
    rightInstance.update({ viewMode: "2d" });
    expect(rightEl.object3D.visible).toBe(true);
    expect(rightEl.object3D.layers.currentLayer).toBe(2);
  });

  it("handles missing object3D without throwing", () => {
    const def = createStereoMediaComponentDefinition();
    const el = document.createElement("a-plane") as unknown as StereoMediaEntity;
    const instance: StereoMediaComponentInstance = Object.create(def);
    instance.el = el;
    instance.data = { eye: "LEFT", isHalfSBS: true, viewMode: "vr" };

    expect(() => instance.init()).not.toThrow();
  });
});
