import { describe, expect, it, vi } from "vitest";
import { RoomId } from "../../src/shared/room-catalog";
import { LANDSCAPE_TOKENS } from "../../src/experience/constants";
import { mixHexColors } from "../../src/experience/landscape/color-math";
import { buildRidgeGeometryData } from "../../src/experience/landscape/ridge-geometry";
import { getRoomEnvironmentPreset } from "../../src/experience/room-environment-presets";
import {
  buildRoomEnvironment,
  type RoomEnvironmentBuildDependencies,
} from "../../src/experience/room-environment-builder";

function createRidgeSkyMocks() {
  const colorStops: Array<{ offset: number; color: string }> = [];
  const arcCalls: Array<{ x: number; y: number; radius: number }> = [];

  const createCanvas = (width: number, height: number): HTMLCanvasElement => {
    const gradientMock = {
      addColorStop: vi.fn((offset: number, color: string) => {
        if (width === 512 && height === 512) {
          colorStops.push({ offset, color });
        }
      }),
    };
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
      arc: vi.fn((x: number, y: number, radius: number) => {
        if (width === 512 && height === 512) {
          arcCalls.push({ x, y, radius });
        }
      }),
      createLinearGradient: vi.fn(() => gradientMock),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    };
    return {
      width,
      height,
      getContext: vi.fn(() => ctx),
    } as unknown as HTMLCanvasElement;
  };

  class MockGeometry {
    dispose = vi.fn();
    index: { count: number } | null;
    attributes: { position: { count: number } };
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

  class MockObject3D {
    name = "";
    children: MockObject3D[] = [];
    position = { x: 0, y: 0, z: 0, set: vi.fn() };
    rotation = { x: 0, y: 0, z: 0, set: vi.fn() };
    scale = { x: 1, y: 1, z: 1, set: vi.fn() };
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

  class MockMaterial {
    dispose = vi.fn();
    fog: boolean;
    color?: unknown;
    map?: unknown;
    constructor(opts: Record<string, unknown> = {}) {
      this.fog = opts.fog !== false;
      this.color = opts.color;
      this.map = opts.map;
    }
  }

  const three = {
    BackSide: 1,
    RepeatWrapping: 1000,
    ClampToEdgeWrapping: 1001,
    Group: class extends MockObject3D {},
    SphereGeometry: class extends MockGeometry {},
    CylinderGeometry: class extends MockGeometry {},
    RingGeometry: class extends MockGeometry {},
    ConeGeometry: class extends MockGeometry {},
    BoxGeometry: class extends MockGeometry {},
    OctahedronGeometry: class extends MockGeometry {},
    TorusGeometry: class extends MockGeometry {},
    BufferGeometry: class extends MockGeometry {
      constructor() {
        super(0, 0);
      }
    },
    BufferAttribute: class {
      count: number;
      needsUpdate = false;
      constructor(public array: Float32Array, public itemSize: number) {
        this.count = Math.floor(array.length / itemSize);
      }
    },
    MeshBasicMaterial: MockMaterial,
    MeshLambertMaterial: MockMaterial,
    PointsMaterial: MockMaterial,
    Mesh: class extends MockObject3D {
      isMesh = true;
      constructor(public geometry: MockGeometry, public material: MockMaterial) {
        super();
      }
    },
    InstancedMesh: class extends MockObject3D {
      isMesh = true;
      isInstancedMesh = true;
      instanceMatrix = { needsUpdate: false };
      instanceColor: { needsUpdate: boolean } | null = null;
      dispose = vi.fn();
      constructor(
        public geometry: MockGeometry,
        public material: MockMaterial,
        public count: number,
      ) {
        super();
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
      constructor(public geometry: MockGeometry, public material: MockMaterial) {
        super();
      }
    },
    DirectionalLight: class extends MockObject3D {
      shadow = {
        bias: 0,
        mapSize: { set: vi.fn() },
        camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0, updateProjectionMatrix: vi.fn() },
      };
    },
    HemisphereLight: class extends MockObject3D {},
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
      set = vi.fn(() => this);
      setRGB = vi.fn(() => this);
      multiplyScalar = vi.fn(() => this);
    },
    Matrix4: class {
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

  return {
    deps: {
      three: three as unknown as RoomEnvironmentBuildDependencies["three"],
      createCanvas,
    },
    colorStops,
    arcCalls,
  };
}

describe("Parallax horizon ridges and fog-matched sky dome", () => {
  it("builds open cylindrical ridge geometry with 128 triangles (384 indices)", () => {
    const data = buildRidgeGeometryData({
      radius: LANDSCAPE_TOKENS.RIDGE_RADII_M[0],
      segments: LANDSCAPE_TOKENS.RIDGE_SEGMENTS,
      baseY: LANDSCAPE_TOKENS.RIDGE_BASE_Y_M,
      height: LANDSCAPE_TOKENS.RIDGE_HEIGHTS_M[0],
      amplitude: LANDSCAPE_TOKENS.RIDGE_AMPLITUDES_M[0],
      colorHex: "#6e331f",
      seed: 202,
    });

    expect(data.indices).toHaveLength(LANDSCAPE_TOKENS.RIDGE_SEGMENTS * 6);
    expect(data.indices).toHaveLength(384);
    expect(data.positions).toHaveLength(LANDSCAPE_TOKENS.RIDGE_SEGMENTS * 2 * 3);
  });

  it("mounts 3 atmospheric ridge rings with fog=false and blends sky into fog + celestial disc", () => {
    const wixarikaMocks = createRidgeSkyMocks();
    const wixarikaBuilt = buildRoomEnvironment(RoomId.WIXARIKA, wixarikaMocks.deps);
    const wixarikaPreset = getRoomEnvironmentPreset(RoomId.WIXARIKA);

    const byName = new Map<string, Record<string, unknown>>();
    (wixarikaBuilt.root as unknown as { traverse: (cb: (n: unknown) => void) => void }).traverse(
      (node) => {
        const rec = node as Record<string, unknown>;
        if (typeof rec.name === "string" && rec.name.length > 0) {
          byName.set(rec.name, rec);
        }
      },
    );

    const near = byName.get("cv-env-ridge-near") as { material?: { fog?: boolean; color?: string } } | undefined;
    const mid = byName.get("cv-env-ridge-mid") as { material?: { fog?: boolean; color?: string } } | undefined;
    const far = byName.get("cv-env-ridge-far") as { material?: { fog?: boolean; color?: string } } | undefined;

    expect(near).toBeDefined();
    expect(mid).toBeDefined();
    expect(far).toBeDefined();
    expect(near?.material?.fog).toBe(false);
    expect(mid?.material?.fog).toBe(false);
    expect(far?.material?.fog).toBe(false);
    expect(far?.material?.color).toBe(
      mixHexColors(
        wixarikaPreset.landscape.ridgeColor,
        wixarikaPreset.fog.color,
        LANDSCAPE_TOKENS.RIDGE_FOG_BLEND_WEIGHTS[2],
      ),
    );

    expect(wixarikaMocks.colorStops).toContainEqual({
      offset: LANDSCAPE_TOKENS.SKY_HORIZON_BAND_STOP,
      color: wixarikaPreset.fog.color,
    });
    expect(
      wixarikaMocks.arcCalls.some(
        (c) => c.radius === wixarikaPreset.landscape.celestial.radiusPx,
      ),
    ).toBe(true);
    wixarikaBuilt.dispose();

    const odamMocks = createRidgeSkyMocks();
    const odamBuilt = buildRoomEnvironment(RoomId.ODAM, odamMocks.deps);
    const odamPreset = getRoomEnvironmentPreset(RoomId.ODAM);
    expect(odamMocks.colorStops).toContainEqual({
      offset: LANDSCAPE_TOKENS.SKY_HORIZON_BAND_STOP,
      color: odamPreset.fog.color,
    });
    expect(odamMocks.arcCalls).toHaveLength(0);
    odamBuilt.dispose();
  });
});
