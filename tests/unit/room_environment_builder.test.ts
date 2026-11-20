// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { RoomId } from "../../src/shared/room-catalog";
import { ENVIRONMENT_BUDGET_TOKENS, SHADOW_CONFIG_TOKENS } from "../../src/experience/constants";
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
}

class MockMaterial {
  dispose = vi.fn();
  map: { dispose: () => void } | null;
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
      constructor(_rt = 1, _rb = 1, _h = 1, seg = 16) {
        super(seg * 4);
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
      dispose = vi.fn();
      constructor(geometry: MockGeometry, material: MockMaterial, count: number) {
        super();
        this.geometry = geometry;
        this.material = material;
        this.count = count;
      }
      setMatrixAt = vi.fn();
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
      dispose = vi.fn();
      constructor(public image: HTMLCanvasElement) {}
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
      const budget = measureRoomEnvironmentBudget(built.root);

      expect(built.fog).toBeTruthy();
      expect((built.fog as unknown as { color: string }).color).toBe(preset.fog.color);
      expect(budget.triangleCount).toBeLessThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MAX_TRIANGLES);
      expect(budget.drawCalls).toBeLessThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MAX_DRAW_CALLS);
      expect(budget.particleCount).toBeGreaterThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MIN_PARTICLES);
      expect(budget.particleCount).toBeLessThanOrEqual(ENVIRONMENT_BUDGET_TOKENS.MAX_PARTICLES);
      expect(budget.withinBudget).toBe(true);

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
});
