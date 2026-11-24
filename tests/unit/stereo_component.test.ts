import { describe, it, expect, vi } from "vitest";
import {
  createStereoMediaComponentDefinition,
  type StereoMediaComponentInstance,
  type StereoMediaEntity,
} from "../../src/experience/components/stereo-media";

interface MockUVAttribute {
  array: Float32Array;
  needsUpdate: boolean;
}

interface MockObject3DWithLayers {
  layers: {
    currentLayer: number;
    set: (ch: number) => void;
  };
  visible: boolean;
  traverse?: (cb: (node: unknown) => void) => void;
}

function createMockStereoEntity(withMeshUVs = false): HTMLElement & {
  object3D: MockObject3DWithLayers;
  uvAttr?: MockUVAttribute;
  textureOffset?: { x: number; y: number };
} {
  const el = document.createElement("a-plane") as unknown as HTMLElement & {
    object3D: MockObject3DWithLayers;
    uvAttr?: MockUVAttribute;
    textureOffset?: { x: number; y: number };
  };
  const uvAttr: MockUVAttribute = {
    array: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    needsUpdate: false,
  };
  const textureOffset = { x: 0, y: 0 };
  const meshNode = {
    geometry: {
      attributes: {
        uv: uvAttr,
      },
    },
    material: {
      map: {
        offset: textureOffset,
        repeat: { x: 1, y: 1 },
      },
    },
  };

  el.object3D = {
    layers: {
      currentLayer: 0,
      set: function (ch: number) {
        this.currentLayer = ch;
      },
    },
    visible: true,
    ...(withMeshUVs
      ? {
          traverse: (cb: (node: unknown) => void) => {
            cb(el.object3D);
            cb(meshNode);
          },
        }
      : {}),
  };
  if (withMeshUVs) {
    el.uvAttr = uvAttr;
    el.textureOffset = textureOffset;
  }
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

  it("remaps per-plane BufferGeometry UVs for Half-SBS VR without mutating shared texture.offset", () => {
    const def = createStereoMediaComponentDefinition();

    const leftEl = createMockStereoEntity(true);
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = leftEl as unknown as StereoMediaEntity;
    leftInstance.data = { eye: "LEFT", isHalfSBS: true, viewMode: "vr" };
    leftInstance.init();

    expect(Array.from(leftEl.uvAttr!.array)).toEqual([0, 0, 0.5, 0, 0, 1, 0.5, 1]);
    expect(leftEl.uvAttr!.needsUpdate).toBe(true);
    expect(leftEl.textureOffset).toEqual({ x: 0, y: 0 });
    expect(leftEl.object3D.layers.currentLayer).toBe(1);

    const rightEl = createMockStereoEntity(true);
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaEntity;
    rightInstance.data = { eye: "RIGHT", isHalfSBS: true, viewMode: "vr" };
    rightInstance.init();

    expect(Array.from(rightEl.uvAttr!.array)).toEqual([0.5, 0, 1, 0, 0.5, 1, 1, 1]);
    expect(rightEl.uvAttr!.needsUpdate).toBe(true);
    expect(rightEl.textureOffset).toEqual({ x: 0, y: 0 });
    expect(rightEl.object3D.layers.currentLayer).toBe(2);
  });

  it("maps monoscopic left crop UVs in 2D mode and restores full UVs when toggling isHalfSBS false", () => {
    const def = createStereoMediaComponentDefinition();

    const leftEl = createMockStereoEntity(true);
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = leftEl as unknown as StereoMediaEntity;
    leftInstance.data = { eye: "LEFT", isHalfSBS: true, viewMode: "2d" };
    leftInstance.init();

    expect(leftEl.object3D.layers.currentLayer).toBe(0);
    expect(Array.from(leftEl.uvAttr!.array)).toEqual([0, 0, 0.5, 0, 0, 1, 0.5, 1]);

    // Switch live back to non-stereo 2D asset in VR mode
    leftInstance.data = { eye: "LEFT", isHalfSBS: false, viewMode: "vr" };
    leftInstance.update({ eye: "LEFT", isHalfSBS: true, viewMode: "2d" });

    expect(leftEl.object3D.layers.currentLayer).toBe(0);
    expect(Array.from(leftEl.uvAttr!.array)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
    expect(leftEl.uvAttr!.needsUpdate).toBe(true);
  });

  it("propagates eye layers to descendant Mesh nodes, re-syncs on geometry componentchanged, and cleans up on remove", () => {
    const def = createStereoMediaComponentDefinition();

    const createGroupWithChildMesh = () => {
      const el = document.createElement("a-plane") as unknown as StereoMediaEntity;
      const meshLayers = {
        currentLayer: 0,
        set(ch: number) {
          this.currentLayer = ch;
        },
      };
      const uvAttr: MockUVAttribute = {
        array: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        needsUpdate: false,
      };
      const meshNode = {
        layers: meshLayers,
        geometry: {
          attributes: {
            uv: uvAttr,
          },
        },
      };
      const groupLayers = {
        currentLayer: 0,
        set(ch: number) {
          this.currentLayer = ch;
        },
      };
      el.object3D = {
        layers: groupLayers as unknown as StereoMediaEntity["object3D"]["layers"],
        visible: true,
        traverse(cb: (node: unknown) => void) {
          cb(el.object3D);
          cb(meshNode);
        },
      };
      return { el, groupLayers, meshLayers, meshNode };
    };

    const left = createGroupWithChildMesh();
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = left.el;
    leftInstance.data = { eye: "LEFT", isHalfSBS: true, viewMode: "vr" };
    leftInstance.init();

    const right = createGroupWithChildMesh();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = right.el;
    rightInstance.data = { eye: "RIGHT", isHalfSBS: true, viewMode: "vr" };
    rightInstance.init();

    // (a) VR Half-SBS isolates layers on both root Group and descendant Mesh
    expect(left.groupLayers.currentLayer).toBe(1);
    expect(left.meshLayers.currentLayer).toBe(1);
    expect(right.groupLayers.currentLayer).toBe(2);
    expect(right.meshLayers.currentLayer).toBe(2);

    // (b) Simulated A-Frame geometry swap resets mesh UVs & layer -> componentchanged("geometry") re-syncs
    const freshRightUv: MockUVAttribute = {
      array: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      needsUpdate: false,
    };
    right.meshNode.geometry = { attributes: { uv: freshRightUv } };
    right.meshLayers.currentLayer = 0;

    right.el.dispatchEvent(
      new CustomEvent("componentchanged", { detail: { name: "geometry" } }),
    );
    expect(right.meshLayers.currentLayer).toBe(2);
    expect(Array.from(freshRightUv.array)).toEqual([0.5, 0, 1, 0, 0.5, 1, 1, 1]);
    expect(freshRightUv.needsUpdate).toBe(true);

    // (c) remove() unregisters componentchanged listener
    rightInstance.remove?.();
    const postRemoveUv: MockUVAttribute = {
      array: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      needsUpdate: false,
    };
    right.meshNode.geometry = { attributes: { uv: postRemoveUv } };
    right.el.dispatchEvent(
      new CustomEvent("componentchanged", { detail: { name: "geometry" } }),
    );
    expect(Array.from(postRemoveUv.array)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
  });
});
