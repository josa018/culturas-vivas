import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ROOM_LAYOUT_TOKENS } from "../../src/shared/room-catalog";
import { computeModelNormalizationTransform } from "../../src/experience/model-normalizer";
import {
  createGlbModelComponentDefinition,
  registerGlbModelComponent,
  type GlbModelComponentInstance,
} from "../../src/experience/components/glb-model";

describe("Model Normalizer & cv-glb-model Component", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    delete (globalThis as unknown as { THREE?: unknown }).THREE;
    document.body.innerHTML = "";
  });

  it("computes uniform scale and grounding offset for oversized photogrammetry bounds", () => {
    const res = computeModelNormalizationTransform(
      { x: -120, y: 0, z: -60 },
      { x: 120, y: 180, z: 60 },
      ROOM_LAYOUT_TOKENS.MODEL_MAX_EXTENT_M,
    );

    expect(res.scale).toBeCloseTo(0.003, 6);
    expect(res.offset).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("centers asymmetric non-origin bounds and grounds minY to y = 0", () => {
    const res = computeModelNormalizationTransform(
      { x: 10, y: 5, z: -20 },
      { x: 30, y: 45, z: 20 },
      0.8,
    );

    expect(res.scale).toBeCloseTo(0.02, 6);
    expect(res.offset).toEqual({ x: -0.4, y: -0.1, z: 0 });
  });

  it("returns identity transform safely for zero-extent degenerate bounds", () => {
    const res = computeModelNormalizationTransform(
      { x: 5, y: 5, z: 5 },
      { x: 5, y: 5, z: 5 },
      0.72,
    );

    expect(res).toEqual({ scale: 1, offset: { x: 0, y: 0, z: 0 } });
  });

  it("registers cv-glb-model, normalizes loaded mesh bounds, and mounts fallback geometry on model-error", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
    };

    const setScaleCalls: Array<[number, number, number]> = [];
    const setPosCalls: Array<[number, number, number]> = [];
    const mockModelRoot = {
      scale: {
        set: (x: number, y: number, z: number) => setScaleCalls.push([x, y, z]),
      },
      position: {
        set: (x: number, y: number, z: number) => setPosCalls.push([x, y, z]),
      },
    };

    class MockBox3 {
      public min = { x: -120, y: 0, z: -60 };
      public max = { x: 120, y: 180, z: 60 };
      public setFromObject(): this {
        return this;
      }
      public isEmpty(): boolean {
        return false;
      }
    }
    (globalThis as unknown as { THREE?: unknown }).THREE = { Box3: MockBox3 };

    registerGlbModelComponent();
    expect(registered["cv-glb-model"]).toBeDefined();

    const el = document.createElement("a-entity") as HTMLElement & {
      getObject3D?: (type: string) => unknown;
    };
    el.getObject3D = (type: string) => (type === "mesh" ? mockModelRoot : null);

    const def = createGlbModelComponentDefinition();
    const instance: GlbModelComponentInstance = Object.create(def);
    instance.el = el as GlbModelComponentInstance["el"];
    instance.data = {
      src: "/models/wixarika-artifact.glb",
      maxExtent: ROOM_LAYOUT_TOKENS.MODEL_MAX_EXTENT_M,
    };

    instance.init();
    const modelChild = el.querySelector("[gltf-model]");
    expect(modelChild?.getAttribute("gltf-model")).toBe(
      "/models/wixarika-artifact.glb",
    );

    modelChild?.dispatchEvent(new CustomEvent("model-loaded", { detail: { model: mockModelRoot } }));
    expect(setScaleCalls[0][0]).toBeCloseTo(0.003, 6);
    expect(setPosCalls[0]).toEqual([0, 0, 0]);

    // Trigger model-error on a fresh entity -> mounts fallback sculpture without throwing
    const errEl = document.createElement("a-entity");
    const errInst: GlbModelComponentInstance = Object.create(def);
    errInst.el = errEl as GlbModelComponentInstance["el"];
    errInst.data = {
      src: "/models/missing.glb",
      maxExtent: ROOM_LAYOUT_TOKENS.MODEL_MAX_EXTENT_M,
    };
    errInst.init();
    const errChild = errEl.querySelector("[gltf-model]");
    errChild?.dispatchEvent(new CustomEvent("model-error"));

    expect(errEl.querySelector(".cv-glb-fallback")).not.toBeNull();
    expect(errEl.querySelector(".cv-glb-fallback a-sphere")).not.toBeNull();

    instance.remove();
    errInst.remove();
  });
});
