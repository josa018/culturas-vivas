import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import { ROOM_LAYOUT_TOKENS } from "../../src/shared/room-catalog";
import {
  computeModelNormalizationTransform,
  measureLocalObjectBounds,
} from "../../src/experience/model-normalizer";
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

  it("measures loaded object bounds strictly in local space when attached to a translated and rotated parent", () => {
    const parentGroup = new THREE.Group();
    parentGroup.position.set(0, 1.2, -3.2);
    parentGroup.rotation.y = Math.PI / 2;

    const loadedRoot = new THREE.Group();
    const geom = new THREE.BoxGeometry(2, 4, 1);
    geom.translate(0, 4, 0); // local x: [-1, 1], y: [2, 6], z: [-0.5, 0.5]
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
    loadedRoot.add(mesh);
    parentGroup.add(loadedRoot);
    parentGroup.updateMatrixWorld(true);

    const bounds = measureLocalObjectBounds(loadedRoot, THREE.Box3);
    expect(bounds).not.toBeNull();
    expect(bounds!.min.x).toBeCloseTo(-1, 6);
    expect(bounds!.min.y).toBeCloseTo(2, 6);
    expect(bounds!.min.z).toBeCloseTo(-0.5, 6);
    expect(bounds!.max.x).toBeCloseTo(1, 6);
    expect(bounds!.max.y).toBeCloseTo(6, 6);
    expect(bounds!.max.z).toBeCloseTo(0.5, 6);
    expect(loadedRoot.parent).toBe(parentGroup);
  });

  it("is idempotent across prior non-identity local transforms and restores parent and matrixWorld", () => {
    const parentGroup = new THREE.Group();
    parentGroup.position.set(3.2, 1.2, 0);
    parentGroup.rotation.y = Math.PI / 2;

    const loadedRoot = new THREE.Group();
    const geom = new THREE.BoxGeometry(2, 4, 1);
    geom.translate(0, 4, 0);
    loadedRoot.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial()));
    loadedRoot.position.set(-0.5, -0.4, 0.25);
    loadedRoot.rotation.set(0.2, 0.7, -0.1);
    loadedRoot.scale.set(0.2, 0.2, 0.2);
    parentGroup.add(loadedRoot);
    parentGroup.updateMatrixWorld(true);
    const expectedWorldElements = [...loadedRoot.matrixWorld.elements];

    const first = measureLocalObjectBounds(loadedRoot, THREE.Box3);
    const second = measureLocalObjectBounds(loadedRoot, THREE.Box3);

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first!.min.x).toBeCloseTo(-1, 6);
    expect(first!.min.y).toBeCloseTo(2, 6);
    expect(first!.min.z).toBeCloseTo(-0.5, 6);
    expect(first!.max.x).toBeCloseTo(1, 6);
    expect(first!.max.y).toBeCloseTo(6, 6);
    expect(first!.max.z).toBeCloseTo(0.5, 6);
    expect(loadedRoot.parent).toBe(parentGroup);
    expect(loadedRoot.position.toArray()).toEqual([-0.5, -0.4, 0.25]);
    expect(loadedRoot.scale.toArray()).toEqual([0.2, 0.2, 0.2]);
    loadedRoot.matrixWorld.elements.forEach((val, idx) => {
      expect(val).toBeCloseTo(expectedWorldElements[idx], 6);
    });
  });

  it("normalizes cv-glb-model loaded mesh strictly in local space when exhibit ancestor is translated at (0, 1.2, -3.2)", () => {
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      THREE: { Box3: THREE.Box3 },
    };

    const exhibitGroup = new THREE.Group();
    exhibitGroup.position.set(0, 1.2, -3.2);
    const modelWrapGroup = new THREE.Group();
    const modelElGroup = new THREE.Group();
    exhibitGroup.add(modelWrapGroup);
    modelWrapGroup.add(modelElGroup);

    const minX = -0.133075;
    const minY = 0.146074;
    const minZ = 0.05247;
    const maxX = 0.154521;
    const maxY = 0.270358;
    const maxZ = 0.445942;

    const geom = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    geom.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const loadedRoot = new THREE.Group();
    loadedRoot.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial()));
    modelElGroup.add(loadedRoot);
    exhibitGroup.updateMatrixWorld(true);

    const el = document.createElement("a-entity");
    const def = createGlbModelComponentDefinition();
    const instance: GlbModelComponentInstance = Object.create(def);
    instance.el = el as GlbModelComponentInstance["el"];
    instance.data = {
      src: "/models/wixarika-artifact.glb",
      maxExtent: ROOM_LAYOUT_TOKENS.MODEL_MAX_EXTENT_M,
    };

    instance.init();
    const modelChild = el.querySelector("[gltf-model]");
    modelChild?.dispatchEvent(
      new CustomEvent("model-loaded", { detail: { model: loadedRoot } }),
    );

    expect(loadedRoot.scale.x).toBeCloseTo(1.829861, 4);
    expect(loadedRoot.position.x).toBeCloseTo(-0.019621, 4);
    expect(loadedRoot.position.y).toBeCloseTo(-0.267295, 4);
    expect(loadedRoot.position.z).toBeCloseTo(-0.456006, 4);

    // Verify world-space bounding box sits centered atop pedestal (0, 1.2..1.427, -3.2)
    const worldBox = new THREE.Box3().setFromObject(loadedRoot);
    expect((worldBox.min.x + worldBox.max.x) / 2).toBeCloseTo(0, 4);
    expect(worldBox.min.y).toBeCloseTo(1.2, 4);
    expect(worldBox.max.y).toBeCloseTo(1.4274, 3);
    expect((worldBox.min.z + worldBox.max.z) / 2).toBeCloseTo(-3.2, 4);

    // Verify second model-loaded pass remains idempotent
    modelChild?.dispatchEvent(
      new CustomEvent("model-loaded", { detail: { model: loadedRoot } }),
    );
    expect(loadedRoot.scale.x).toBeCloseTo(1.829861, 4);
    expect(loadedRoot.position.y).toBeCloseTo(-0.267295, 4);
    expect(loadedRoot.position.z).toBeCloseTo(-0.456006, 4);

    instance.remove();
  });
});
