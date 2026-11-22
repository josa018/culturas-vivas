// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { RoomId } from "../../src/shared/room-catalog";
import {
  ENVIRONMENT_BUDGET_TOKENS,
  LANDSCAPE_TOKENS,
  SHADOW_CONFIG_TOKENS,
} from "../../src/experience/constants";
import { getRoomEnvironmentPreset } from "../../src/experience/room-environment-presets";
import {
  buildRoomEnvironment,
  measureRoomEnvironmentBudget,
  type RoomEnvironmentBuildDependencies,
} from "../../src/experience/room-environment-builder";
import { createRoomEnvironmentComponentDefinition } from "../../src/experience/components/room-environment";

function createCanvasMockFactory() {
  return (width: number, height: number): HTMLCanvasElement => {
    const gradientMock = { addColorStop: vi.fn() };
    const ctx = {
      fillStyle: "#000000",
      strokeStyle: "#000000",
      lineWidth: 1,
      globalAlpha: 1,
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      createLinearGradient: vi.fn(() => gradientMock),
      createRadialGradient: vi.fn(() => gradientMock),
    };
    return {
      width,
      height,
      getContext: vi.fn(() => ctx),
    } as unknown as HTMLCanvasElement;
  };
}

class MockGeometry {
  dispose = vi.fn();
  index: { count: number } | null;
  attributes: { position: { count: number } };
  private disposed = false;

  constructor(triCount = 24, vertexCount = triCount * 3) {
    this.index = { count: triCount * 3 };
    this.attributes = { position: { count: vertexCount } };
  }

  setAttribute(name: string, attr: { count: number }) {
    if (name === "position") {
      this.attributes.position = attr;
      this.index = null;
    }
  }

  setIndex(index: number[] | { count: number }) {
    this.index = Array.isArray(index) ? { count: index.length } : index;
  }

  computeVertexNormals = vi.fn();
}

class MockMaterial {
  dispose = vi.fn();
  map: { dispose: () => void } | null;
  bumpMap: { dispose: () => void } | null;
  bumpScale?: number;
  kind: string;
  fog: boolean;
  side?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  color?: unknown;

  constructor(kind: string, opts: Record<string, unknown> = {}) {
    this.kind = kind;
    this.map = (opts.map as { dispose: () => void } | null) ?? null;
    this.bumpMap = (opts.bumpMap as { dispose: () => void } | null) ?? null;
    this.bumpScale = opts.bumpScale as number | undefined;
    this.fog = opts.fog !== false;
    this.side = opts.side as number | undefined;
    this.transparent = opts.transparent as boolean | undefined;
    this.opacity = opts.opacity as number | undefined;
    this.depthWrite = opts.depthWrite as boolean | undefined;
    this.color = opts.color;
  }
}

class MockObject3D {
  name = "";
  children: MockObject3D[] = [];
  position = {
    x: 0,
    y: 0,
    z: 0,
    set: (x: number, y: number, z: number) => {
      this.position.x = x;
      this.position.y = y;
      this.position.z = z;
    },
  };
  rotation = {
    x: 0,
    y: 0,
    z: 0,
    set: (x: number, y: number, z: number) => {
      this.rotation.x = x;
      this.rotation.y = y;
      this.rotation.z = z;
    },
  };
  scale = {
    x: 1,
    y: 1,
    z: 1,
    set: (x: number, y: number, z: number) => {
      this.scale.x = x;
      this.scale.y = y;
      this.scale.z = z;
    },
  };
  castShadow = false;
  receiveShadow = false;
  userData: Record<string, unknown> = {};

  add(...objs: MockObject3D[]) {
    this.children.push(...objs);
  }

  remove(obj: MockObject3D) {
    this.children = this.children.filter((c) => c !== obj);
  }

  traverse(cb: (node: unknown) => void) {
    cb(this);
    for (const child of this.children) {
      child.traverse(cb);
    }
  }
}

function createMockThree(): Record<string, unknown> {
  return {
    BackSide: 1,
    RepeatWrapping: 1000,
    ClampToEdgeWrapping: 1001,
    Group: class extends MockObject3D {},
    Object3D: MockObject3D,
    SphereGeometry: class extends MockGeometry {
      constructor(_r = 1, w = 24, h = 16) {
        super(w * h * 2);
      }
    },
    CylinderGeometry: class extends MockGeometry {
      radiusTop: number;
      radiusBottom: number;
      constructor(rt = 1, rb = 1, _h = 1, seg = 16) {
        super(seg * 4);
        this.radiusTop = rt;
        this.radiusBottom = rb;
      }
    },
    RingGeometry: class extends MockGeometry {
      constructor(_ri = 1, _ro = 2, seg = 24) {
        super(seg * 2);
      }
    },
    ConeGeometry: class extends MockGeometry {
      constructor(_r = 1, _h = 1, seg = 6) {
        super(seg * 2);
      }
    },
    BoxGeometry: class extends MockGeometry {
      constructor() {
        super(12);
      }
    },
    OctahedronGeometry: class extends MockGeometry {
      constructor() {
        super(8);
      }
    },
    TorusGeometry: class extends MockGeometry {
      constructor(_r = 1, _tube = 0.1, radSeg = 6, tubSeg = 24) {
        super(radSeg * tubSeg * 2);
      }
    },
    BufferGeometry: class extends MockGeometry {
      constructor() {
        super(0, 0);
      }
    },
    BufferAttribute: class {
      array: Float32Array;
      itemSize: number;
      count: number;
      needsUpdate = false;
      constructor(array: Float32Array, itemSize: number) {
        this.array = array;
        this.itemSize = itemSize;
        this.count = Math.floor(array.length / itemSize);
      }
    },
    MeshBasicMaterial: class extends MockMaterial {
      constructor(opts: Record<string, unknown> = {}) {
        super("MeshBasicMaterial", opts);
      }
    },
    MeshLambertMaterial: class extends MockMaterial {
      constructor(opts: Record<string, unknown> = {}) {
        super("MeshLambertMaterial", opts);
      }
    },
    PointsMaterial: class extends MockMaterial {
      constructor(opts: Record<string, unknown> = {}) {
        super("PointsMaterial", opts);
      }
    },
    Mesh: class extends MockObject3D {
      isMesh = true;
      geometry: MockGeometry;
      material: MockMaterial;
      constructor(geometry: MockGeometry, material: MockMaterial) {
        super();
        this.geometry = geometry;
        this.material = material;
      }
    },
    InstancedMesh: class extends MockObject3D {
      isMesh = true;
      isInstancedMesh = true;
      geometry: MockGeometry;
      material: MockMaterial;
      count: number;
      instanceMatrix = { needsUpdate: false };
      instanceColor: { needsUpdate: boolean } | null = null;
      dispose = vi.fn();
      constructor(geometry: MockGeometry, material: MockMaterial, count: number) {
        super();
        this.geometry = geometry;
        this.material = material;
        this.count = count;
      }
      setMatrixAt = vi.fn();
      setColorAt = vi.fn(() => {
        if (!this.instanceColor) {
          this.instanceColor = { needsUpdate: false };
        }
      });
    },
    Points: class extends MockObject3D {
      isPoints = true;
      geometry: MockGeometry;
      material: MockMaterial;
      constructor(geometry: MockGeometry, material: MockMaterial) {
        super();
        this.geometry = geometry;
        this.material = material;
      }
    },
    DirectionalLight: class extends MockObject3D {
      isLight = true;
      color: string;
      intensity: number;
      shadow = {
        bias: 0,
        mapSize: { width: 512, height: 512, set: (w: number, h: number) => {
          this.shadow.mapSize.width = w;
          this.shadow.mapSize.height = h;
        }},
        camera: {
          left: -5,
          right: 5,
          top: 5,
          bottom: -5,
          near: 0.5,
          far: 500,
          updateProjectionMatrix: vi.fn(),
        },
      };
      constructor(color: string, intensity: number) {
        super();
        this.color = color;
        this.intensity = intensity;
      }
    },
    HemisphereLight: class extends MockObject3D {
      isLight = true;
      constructor(public skyColor: string, public groundColor: string, public intensity: number) {
        super();
      }
    },
    Fog: class {
      constructor(public color: string, public near: number, public far: number) {}
    },
    CanvasTexture: class {
      wrapS = 0;
      wrapT = 0;
      anisotropy = 1;
      generateMipmaps = true;
      needsUpdate = false;
      colorSpace = "";
      repeat = { set: vi.fn() };
      offset = { x: 0, y: 0 };
      dispose = vi.fn();
      constructor(public image: HTMLCanvasElement) {}
    },
    Color: class {
      r = 1;
      g = 1;
      b = 1;
      constructor(hex?: string | number) {
        if (hex !== undefined) {
          this.set(hex);
        }
      }
      set(hex: string | number) {
        if (typeof hex === "string") {
          const clean = hex.replace(/^#/, "");
          if (clean.length === 6) {
            this.r = parseInt(clean.slice(0, 2), 16) / 255;
            this.g = parseInt(clean.slice(2, 4), 16) / 255;
            this.b = parseInt(clean.slice(4, 6), 16) / 255;
          }
        }
        return this;
      }
      setRGB(r: number, g: number, b: number) {
        this.r = r;
        this.g = g;
        this.b = b;
        return this;
      }
      multiplyScalar(s: number) {
        this.r *= s;
        this.g *= s;
        this.b *= s;
        return this;
      }
    },
    Matrix4: class {
      elements = new Array(16).fill(0);
      makeTranslation = vi.fn(() => this);
      makeRotationY = vi.fn(() => this);
      makeScale = vi.fn(() => this);
      multiply = vi.fn(() => this);
      compose = vi.fn(() => this);
    },
    Vector3: class {
      constructor(public x = 0, public y = 0, public z = 0) {}
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
      }
    },
    Quaternion: class {
      setFromEuler = vi.fn(() => this);
    },
    Euler: class {
      constructor(public x = 0, public y = 0, public z = 0) {}
    },
  };
}

describe("Procedural 3D room environment builder & budget", () => {
  const allRooms = [
    RoomId.LOBBY,
    RoomId.WIXARIKA,
    RoomId.NAAYERI,
    RoomId.ODAM,
    RoomId.MEXICANERO,
  ] as const;

  it.each(allRooms)(
    "builds %s within mobile VR triangle/draw-call/particle caps with shadows and Lambert materials",
    (roomId) => {
      const mockThree = createMockThree();
      const deps: RoomEnvironmentBuildDependencies = {
        three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
        createCanvas: createCanvasMockFactory(),
      };

      const built = buildRoomEnvironment(roomId, deps);
      const preset = getRoomEnvironmentPreset(roomId);
      const budget = measureRoomEnvironmentBudget(built.root, "rich");

      expect(built.fog).toBeTruthy();
      expect((built.fog as unknown as { color: string }).color).toBe(preset.fog.color);
      expect(budget.triangleCount).toBeLessThanOrEqual(LANDSCAPE_TOKENS.RICH_MAX_TRIANGLES);
      expect(budget.drawCalls).toBeLessThanOrEqual(LANDSCAPE_TOKENS.RICH_MAX_DRAW_CALLS);
      expect(budget.particleCount).toBeGreaterThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MIN_PARTICLES);
      expect(budget.particleCount).toBeLessThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MAX_PARTICLES);
      expect(budget.withinBudget).toBe(true);

      const ecoCheck = buildRoomEnvironment(roomId, { ...deps, qualityTier: "eco" });
      const ecoBudget = measureRoomEnvironmentBudget(ecoCheck.root, "eco");
      expect(ecoBudget.triangleCount).toBeLessThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MAX_TRIANGLES);
      expect(ecoBudget.drawCalls).toBeLessThanOrEqual(LANDSCAPE_TOKENS.TARGET_MAX_DRAW_CALLS);
      expect(ecoBudget.particleCount).toBeGreaterThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MIN_PARTICLES);
      expect(ecoBudget.particleCount).toBeLessThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MAX_PARTICLES);
      expect(ecoBudget.withinBudget).toBe(true);
      ecoCheck.dispose();

      const traversed: Array<Record<string, unknown>> = [];
      (built.root as unknown as MockObject3D).traverse((node) => {
        traversed.push(node as Record<string, unknown>);
      });

      const dirLight = traversed.find((n) => "shadow" in n) as
        | {
            castShadow: boolean;
            shadow: {
              bias: number;
              mapSize: { width: number; height: number };
              camera: { left: number; right: number; top: number; bottom: number };
            };
          }
        | undefined;
      expect(dirLight).toBeDefined();
      expect(dirLight?.castShadow).toBe(true);
      expect(dirLight?.shadow.mapSize.width).toBe(SHADOW_CONFIG_TOKENS.MAP_SIZE_PX);
      expect(dirLight?.shadow.camera.left).toBe(-SHADOW_CONFIG_TOKENS.FRUSTUM_HALF_EXTENT_M);
      expect(dirLight?.shadow.camera.right).toBe(SHADOW_CONFIG_TOKENS.FRUSTUM_HALF_EXTENT_M);
      expect(dirLight?.shadow.bias).toBe(SHADOW_CONFIG_TOKENS.SHADOW_BIAS);

      const instancedMeshes = traversed.filter((n) => n.isInstancedMesh === true);
      expect(instancedMeshes.length).toBeGreaterThanOrEqual(2);

      const lambertMeshes = traversed.filter(
        (n) => (n.material as { kind?: string } | undefined)?.kind === "MeshLambertMaterial",
      );
      expect(lambertMeshes.length).toBeGreaterThanOrEqual(3);

      built.dispose();
      for (const node of instancedMeshes) {
        expect(node.dispose).toHaveBeenCalledTimes(1);
      }
    },
  );

  it("mounts fog & root on cv-room-environment init and disposes cleanly on update/remove", () => {
    const mockThree = createMockThree();
    const def = createRoomEnvironmentComponentDefinition({
      three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas: createCanvasMockFactory(),
    });

    const sceneObj = new MockObject3D() as MockObject3D & { fog: unknown };
    sceneObj.fog = null;
    const hostObj = new MockObject3D();

    const instance: Record<string, unknown> = {
      data: { roomId: RoomId.WIXARIKA },
      el: {
        object3D: hostObj,
        sceneEl: { object3D: sceneObj },
      },
      ...def,
    };

    (instance.init as () => void).call(instance);
    expect(hostObj.children).toHaveLength(1);
    expect((sceneObj.fog as { color: string }).color).toBe(
      getRoomEnvironmentPreset(RoomId.WIXARIKA).fog.color,
    );

    const firstBuiltRoot = hostObj.children[0];
    instance.data = { roomId: RoomId.ODAM };
    (instance.update as (oldData?: { roomId?: string }) => void).call(instance, {
      roomId: RoomId.WIXARIKA,
    });
    expect(hostObj.children).toHaveLength(1);
    expect(hostObj.children[0]).not.toBe(firstBuiltRoot);
    expect((sceneObj.fog as { color: string }).color).toBe(
      getRoomEnvironmentPreset(RoomId.ODAM).fog.color,
    );

    (instance.remove as () => void).call(instance);
    expect(hostObj.children).toHaveLength(0);
    expect(sceneObj.fog).toBeNull();
  });

  it("renders anti-aliased sky stars in MEXICANERO with radius >= MIN_SKY_STAR_RADIUS_PX", () => {
    const mockThree = createMockThree();
    const arcRadii: number[] = [];
    const baseFactory = createCanvasMockFactory();
    const createCanvas = (width: number, height: number): HTMLCanvasElement => {
      const canvas = baseFactory(width, height);
      const ctx = canvas.getContext("2d") as unknown as { arc: ReturnType<typeof vi.fn> };
      ctx.arc = vi.fn((_x: number, _y: number, radius: number) => {
        arcRadii.push(radius);
      });
      return canvas;
    };

    const built = buildRoomEnvironment(RoomId.MEXICANERO, {
      three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas,
    });

    expect(arcRadii.length).toBeGreaterThan(0);
    for (const r of arcRadii) {
      expect(r).toBeGreaterThanOrEqual(
        ENVIRONMENT_BUDGET_TOKENS.MIN_SKY_STAR_RADIUS_PX,
      );
    }
    built.dispose();
  });

  it("renders ambient particles as lit 3D InstancedMesh octahedrons, updates 3-axis matrices, and attenuates scale in inspection cone", () => {
    const mockThree = createMockThree();
    const built = buildRoomEnvironment(RoomId.WIXARIKA, {
      three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas: createCanvasMockFactory(),
    });

    const traversed: Array<Record<string, unknown>> = [];
    (built.root as unknown as MockObject3D).traverse((node) => {
      traversed.push(node as Record<string, unknown>);
    });

    const particleNode = traversed.find(
      (n) => (n.userData as { isAmbientParticles?: boolean } | undefined)?.isAmbientParticles === true,
    ) as
      | {
          isInstancedMesh?: boolean;
          isPoints?: boolean;
          count: number;
          geometry?: { index?: { count: number } };
          material?: { kind?: string };
          instanceMatrix: { needsUpdate: boolean };
          setMatrixAt: ReturnType<typeof vi.fn>;
        }
      | undefined;

    expect(particleNode).toBeDefined();
    expect(particleNode?.isInstancedMesh).toBe(true);
    expect(particleNode?.isPoints).not.toBe(true);
    expect(particleNode?.material?.kind).toBe("MeshLambertMaterial");
    expect(particleNode?.count).toBeGreaterThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MIN_PARTICLES);
    expect(particleNode?.count).toBeLessThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MAX_PARTICLES);
    expect(built.stats.particleCount).toBe(particleNode?.count);

    // Check MockObject3D compose captures 3-axis Euler tumble and cone scale attenuation
    const composeScales: number[] = [];
    const composeEulerSums: number[] = [];
    const origCompose = (mockThree.Matrix4 as unknown as { prototype: { compose: unknown } }).prototype;
    expect(origCompose).toBeDefined();

    particleNode!.setMatrixAt.mockClear();
    built.updateParticles(1.5, { x: 0, y: 0, z: -1 });
    expect(particleNode!.setMatrixAt).toHaveBeenCalledTimes(particleNode!.count);
    expect(particleNode!.instanceMatrix.needsUpdate).toBe(true);

    // Track last scale arguments passed to Matrix4.compose during attenuated vs unattenuated ticks
    const mockMatrixProto = (mockThree.Matrix4 as unknown as {
      new (): { compose: ReturnType<typeof vi.fn> };
    });
    expect(mockMatrixProto).toBeDefined();

    // Verify scale & euler via a fresh build spying on Matrix4.compose args
    composeScales.length = 0;
    composeEulerSums.length = 0;
    const spyThree = createMockThree();
    const BaseEuler = spyThree.Euler as new () => { x: number; y: number; z: number };
    const createdEulers: Array<{ x: number; y: number; z: number }> = [];
    spyThree.Euler = class extends BaseEuler {
      constructor() {
        super();
        createdEulers.push(this);
      }
    };
    const BaseMatrix = spyThree.Matrix4 as new () => {
      compose: (pos: unknown, quat: unknown, scale: { x: number; y: number; z: number }) => unknown;
    };
    spyThree.Matrix4 = class extends BaseMatrix {
      override compose = vi.fn((_pos, _quat, scale: { x: number; y: number; z: number }) => {
        composeScales.push(scale.x);
        return this;
      });
    };

    const spiedBuilt = buildRoomEnvironment(RoomId.WIXARIKA, {
      three: spyThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas: createCanvasMockFactory(),
    });
    composeScales.length = 0;
    spiedBuilt.updateParticles(2.0, { x: 0, y: 0, z: -1 });
    expect(composeScales.some((s) => s < 0.5)).toBe(true);
    expect(composeScales.some((s) => s === 1)).toBe(true);
    const activeEuler = createdEulers[createdEulers.length - 1];
    expect(activeEuler).toBeDefined();
    expect(activeEuler.x).not.toBe(0);
    expect(activeEuler.y).not.toBe(0);
    expect(activeEuler.z).not.toBe(0);

    spiedBuilt.dispose();
    built.dispose();
  });

  it("mounts multi-radius interior parallax layers and thickens secondary exterior props within mobile VR budgets", () => {
    const mockThree = createMockThree();

    for (const roomId of Object.values(RoomId)) {
      const built = buildRoomEnvironment(roomId, {
        three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
        createCanvas: createCanvasMockFactory(),
      });

      const byName = new Map<string, Record<string, unknown>>();
      (built.root as unknown as MockObject3D).traverse((rawNode) => {
        const node = rawNode as Record<string, unknown>;
        if (typeof node.name === "string" && node.name.length > 0) {
          byName.set(node.name, node);
        }
      });

      const daisCurb = byName.get("cv-env-dais-curb") as
        | { material?: { map?: unknown } }
        | undefined;
      const pergolaRing = byName.get("cv-env-pergola-ring") as
        | { material?: { map?: unknown } }
        | undefined;
      expect(daisCurb).toBeDefined();
      expect(daisCurb?.material?.map).toBeTruthy();
      // Center dais uses the original shared trim (WOVEN_FAJA) texture across all rooms
      expect(daisCurb?.material?.map).toBe(pergolaRing?.material?.map);
      // Remove the concentric floor inlay ring around the center circle across all rooms
      expect(byName.get("cv-env-floor-inlay")).toBeUndefined();
      expect(byName.get("cv-env-outer-ground")).toBeUndefined();
      const terrainNode = byName.get("cv-env-terrain") as
        | { material?: { map?: unknown; bumpMap?: unknown; bumpScale?: number } }
        | undefined;
      expect(terrainNode).toBeDefined();
      expect(terrainNode?.material?.map).toBeTruthy();
      expect(terrainNode?.material?.bumpMap).toBe(terrainNode?.material?.map);
      expect(terrainNode?.material?.bumpScale).toBe(LANDSCAPE_TOKENS.BUMP_SCALE);
      if (roomId === RoomId.NAAYERI) {
        const canyonWater = byName.get("cv-env-canyon-water") as
          | { material?: { map?: unknown } }
          | undefined;
        expect(canyonWater).toBeDefined();
        expect(canyonWater?.material?.map).toBeTruthy();
      } else {
        expect(byName.get("cv-env-canyon-water")).toBeUndefined();
      }
      expect(byName.get("cv-env-radial-walkways")?.count).toBe(
        ENVIRONMENT_BUDGET_TOKENS.WALKWAY_COUNT,
      );
      expect(byName.get("cv-env-column-caps")?.count).toBe(16);
      expect(byName.get("cv-env-pergola-rafters")?.count).toBe(8);
      expect(byName.get("cv-env-hanging-lanterns")?.count).toBe(8);

      expect(byName.get("cv-env-landscape-primary")).toBeUndefined();
      expect(byName.get("cv-env-landscape-secondary")).toBeUndefined();
      for (const key of byName.keys()) {
        expect(key.startsWith("cv-env-decor-")).toBe(false);
      }

      if (roomId === RoomId.WIXARIKA) {
        const expectedWixarikaFlora = [
          ["cv-env-flora-pine", 26],
          ["cv-env-flora-agave", 16],
          ["cv-env-flora-nopal", 10],
          ["cv-env-flora-rock", 18],
          ["cv-env-flora-shrub", 16],
          ["cv-env-flora-grass-tuft", 28],
          ["cv-env-flora-wildflower", 18],
        ] as const;
        for (const [floraName, expectedCount] of expectedWixarikaFlora) {
          const floraNode = byName.get(floraName) as
            | {
                count: number;
                setColorAt: ReturnType<typeof vi.fn>;
                instanceColor: { needsUpdate: boolean } | null;
                material?: {
                  map?: unknown;
                  bumpMap?: unknown;
                  bumpScale?: number;
                  transparent?: boolean;
                };
              }
            | undefined;
          expect(floraNode).toBeDefined();
          expect(floraNode?.count).toBe(expectedCount);
          expect(floraNode?.setColorAt).toHaveBeenCalledTimes(expectedCount);
          expect(floraNode?.instanceColor?.needsUpdate).toBe(true);
          expect(floraNode?.material?.map).toBeTruthy();
          expect(floraNode?.material?.bumpMap).toBe(floraNode?.material?.map);
          expect(floraNode?.material?.bumpScale).toBe(LANDSCAPE_TOKENS.BUMP_SCALE);
          expect(floraNode?.material?.transparent).not.toBe(true);
        }

        const cloudsNode = byName.get("cv-env-clouds") as
          | {
              count: number;
              material?: { transparent?: boolean };
              setMatrixAt: ReturnType<typeof vi.fn>;
            }
          | undefined;
        expect(cloudsNode).toBeDefined();
        expect(cloudsNode?.count).toBe(LANDSCAPE_TOKENS.CLOUD_COUNT);
        expect(cloudsNode?.material?.transparent).not.toBe(true);
        cloudsNode!.setMatrixAt.mockClear();
        built.updateParticles(2.0);
        expect(cloudsNode!.setMatrixAt).toHaveBeenCalledTimes(
          LANDSCAPE_TOKENS.CLOUD_COUNT,
        );
      }

      expect(built.stats.triangleCount).toBeLessThanOrEqual(
        ENVIRONMENT_BUDGET_TOKENS.MAX_TRIANGLES,
      );
      expect(built.stats.drawCalls).toBeLessThanOrEqual(
        ENVIRONMENT_BUDGET_TOKENS.MAX_DRAW_CALLS,
      );
      expect(built.stats.withinBudget).toBe(true);
      built.dispose();
    }
  });

  it("mounts ambient biome fauna (birds/fireflies) and animates fauna + Naayéri canyon water via updateParticles", () => {
    const mockThree = createMockThree();

    const wixarika = buildRoomEnvironment(RoomId.WIXARIKA, {
      three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas: createCanvasMockFactory(),
    });
    const wixarikaByName = new Map<string, Record<string, unknown>>();
    (wixarika.root as unknown as MockObject3D).traverse((node) => {
      const rec = node as Record<string, unknown>;
      if (typeof rec.name === "string" && rec.name.length > 0) {
        wixarikaByName.set(rec.name, rec);
      }
    });
    const birdFauna = wixarikaByName.get("cv-env-fauna") as
      | {
          count: number;
          userData?: { isAmbientParticles?: boolean };
          setMatrixAt: ReturnType<typeof vi.fn>;
        }
      | undefined;
    expect(birdFauna).toBeDefined();
    expect(birdFauna?.count).toBe(LANDSCAPE_TOKENS.FAUNA_BIRD_COUNT);
    expect(birdFauna?.userData?.isAmbientParticles).not.toBe(true);
    birdFauna!.setMatrixAt.mockClear();
    wixarika.updateParticles(1.25);
    expect(birdFauna!.setMatrixAt).toHaveBeenCalledTimes(
      LANDSCAPE_TOKENS.FAUNA_BIRD_COUNT,
    );
    wixarika.dispose();

    const mexicanero = buildRoomEnvironment(RoomId.MEXICANERO, {
      three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas: createCanvasMockFactory(),
    });
    const mexByName = new Map<string, Record<string, unknown>>();
    (mexicanero.root as unknown as MockObject3D).traverse((node) => {
      const rec = node as Record<string, unknown>;
      if (typeof rec.name === "string" && rec.name.length > 0) {
        mexByName.set(rec.name, rec);
      }
    });
    const fireflyFauna = mexByName.get("cv-env-fauna") as
      | {
          count: number;
          userData?: { isAmbientParticles?: boolean };
          setMatrixAt: ReturnType<typeof vi.fn>;
        }
      | undefined;
    expect(fireflyFauna).toBeDefined();
    expect(fireflyFauna?.count).toBe(LANDSCAPE_TOKENS.FAUNA_FIREFLY_COUNT);
    expect(fireflyFauna?.userData?.isAmbientParticles).not.toBe(true);
    mexicanero.dispose();

    const naayeri = buildRoomEnvironment(RoomId.NAAYERI, {
      three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas: createCanvasMockFactory(),
    });
    const naaByName = new Map<string, Record<string, unknown>>();
    (naayeri.root as unknown as MockObject3D).traverse((node) => {
      const rec = node as Record<string, unknown>;
      if (typeof rec.name === "string" && rec.name.length > 0) {
        naaByName.set(rec.name, rec);
      }
    });
    const waterMesh = naaByName.get("cv-env-canyon-water") as
      | { material?: { map?: { offset?: { x: number; y: number } } } }
      | undefined;
    expect(waterMesh?.material?.map?.offset?.x).toBe(0);
    naayeri.updateParticles(1.25);
    expect(waterMesh?.material?.map?.offset?.x).toBeCloseTo(
      LANDSCAPE_TOKENS.WATER_SCROLL_SPEED * 1.25,
      5,
    );
    naayeri.dispose();
  });

  it("supports eco qualityTier by scaling flora instances, stripping bumpMap/clouds/fauna, and rebuilding cv-room-environment on tier change", () => {
    const mockThree = createMockThree();
    const ecoBuilt = buildRoomEnvironment(RoomId.WIXARIKA, {
      three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas: createCanvasMockFactory(),
      qualityTier: "eco",
    });

    const byName = new Map<string, Record<string, unknown>>();
    (ecoBuilt.root as unknown as MockObject3D).traverse((node) => {
      const rec = node as Record<string, unknown>;
      if (typeof rec.name === "string" && rec.name.length > 0) {
        byName.set(rec.name, rec);
      }
    });

    const expectedEcoPines = Math.max(
      LANDSCAPE_TOKENS.ECO_MIN_INSTANCES,
      Math.round(26 * LANDSCAPE_TOKENS.ECO_INSTANCE_SCALE),
    );
    const pineNode = byName.get("cv-env-flora-pine") as
      | { count: number; material?: { bumpMap?: unknown } }
      | undefined;
    expect(pineNode?.count).toBe(expectedEcoPines);
    expect(pineNode?.material?.bumpMap).toBeNull();
    expect(
      (byName.get("cv-env-terrain") as { material?: { bumpMap?: unknown } } | undefined)
        ?.material?.bumpMap,
    ).toBeNull();
    expect(byName.get("cv-env-clouds")).toBeUndefined();
    expect(byName.get("cv-env-fauna")).toBeUndefined();
    expect(byName.get("cv-env-flora-shrub")).toBeUndefined();
    for (const key of byName.keys()) {
      expect(key.startsWith("cv-env-decor-")).toBe(false);
    }

    const ecoBudget = measureRoomEnvironmentBudget(ecoBuilt.root, "eco");
    expect(ecoBudget.triangleCount).toBeLessThanOrEqual(
      ENVIRONMENT_BUDGET_TOKENS.MAX_TRIANGLES,
    );
    expect(ecoBudget.drawCalls).toBeLessThanOrEqual(
      LANDSCAPE_TOKENS.TARGET_MAX_DRAW_CALLS,
    );
    expect(ecoBudget.withinBudget).toBe(true);
    ecoBuilt.dispose();

    const def = createRoomEnvironmentComponentDefinition({
      three: mockThree as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas: createCanvasMockFactory(),
    });
    const sceneObj = new MockObject3D() as MockObject3D & { fog: unknown };
    const hostObj = new MockObject3D();
    const instance: Record<string, unknown> = {
      data: { roomId: RoomId.WIXARIKA, qualityTier: "rich" },
      el: { object3D: hostObj, sceneEl: { object3D: sceneObj } },
      ...def,
    };
    (instance.init as () => void).call(instance);
    const richRoot = hostObj.children[0];
    instance.data = { roomId: RoomId.WIXARIKA, qualityTier: "eco" };
    (
      instance.update as (oldData?: { roomId?: string; qualityTier?: string }) => void
    ).call(instance, { roomId: RoomId.WIXARIKA, qualityTier: "rich" });
    expect(hostObj.children[0]).not.toBe(richRoot);
    (instance.remove as () => void).call(instance);
  });
});
