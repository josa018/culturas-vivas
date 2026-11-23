// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  createLambertShaderDefinition,
  createProceduralSurfaceComponentDefinition,
} from "../../src/experience/components/lambert-shader";
import { PROCEDURAL_TEXTURE_KIND } from "../../src/experience/procedural-textures";

describe("A-Frame lambert shader & cv-procedural-surface component", () => {
  it("initializes THREE.MeshLambertMaterial without throwing Unknown shader lambert", () => {
    class MockColor {
      value = "";
      set(val: string) {
        this.value = val;
      }
    }
    class MockLambertMaterial {
      color: MockColor;
      fog: boolean;
      wireframe: boolean;
      toneMapped: boolean;
      constructor(opts: Record<string, unknown>) {
        this.color = opts.color as MockColor;
        this.fog = opts.fog as boolean;
        this.wireframe = opts.wireframe as boolean;
        this.toneMapped = opts.toneMapped as boolean;
      }
    }

    const def = createLambertShaderDefinition({
      Color: MockColor,
      MeshLambertMaterial: MockLambertMaterial as never,
    });

    const ctx: {
      materialData?: Record<string, unknown>;
      material?: MockLambertMaterial;
    } = {};

    def.init.call(ctx as never, { color: "#D99B26", fog: true });
    expect(ctx.material).toBeInstanceOf(MockLambertMaterial);
    expect(ctx.material?.color.value).toBe("#D99B26");
    expect(ctx.material?.fog).toBe(true);

    def.update.call(ctx as never, { color: "#008F85", fog: false });
    expect(ctx.material?.color.value).toBe("#008F85");
    expect(ctx.material?.fog).toBe(false);
  });

  it("binds procedural CanvasTexture onto mesh.material strictly after material init", () => {
    const mockDispose = vi.fn();
    class MockCanvasTexture {
      wrapS = 0;
      wrapT = 0;
      anisotropy = 1;
      generateMipmaps = true;
      needsUpdate = false;
      repeat = { set: vi.fn() };
      dispose = mockDispose;
      constructor(public image: HTMLCanvasElement) {}
    }

    const def = createProceduralSurfaceComponentDefinition({
      Color: class {
        set() {}
      },
      MeshLambertMaterial: class {} as never,
      CanvasTexture: MockCanvasTexture as never,
      RepeatWrapping: 1000,
      ClampToEdgeWrapping: 1001,
    });

    expect(def.dependencies).toEqual(["geometry", "material"]);

    const mesh = { material: { map: null as unknown, needsUpdate: false } };
    const el = document.createElement("a-plane") as HTMLElement & {
      getObject3D?: (type: string) => unknown;
    };
    el.getObject3D = (type: string) => (type === "mesh" ? mesh : null);

    // Mock 2D canvas context so drawContactShadow executes in happy-dom
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const node = origCreate(tag);
      if (tag === "canvas") {
        (node as HTMLCanvasElement).getContext = (() => ({
          clearRect: vi.fn(),
          fillRect: vi.fn(),
          createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
          fillStyle: "",
        })) as never;
      }
      return node;
    });

    const ctx: Record<string, unknown> = {
      el,
      data: {
        kind: PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW,
        accentColor: "#000000",
        repeatCount: 1,
      },
    };

    def.init.call(ctx as never);
    expect(mesh.material.map).toBeInstanceOf(MockCanvasTexture);
    expect(mesh.material.needsUpdate).toBe(true);

    def.remove.call(ctx as never);
    expect(mockDispose).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
