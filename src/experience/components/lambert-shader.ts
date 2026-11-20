import {
  createProceduralTexture,
  PROCEDURAL_TEXTURE_KIND,
  type ProceduralTextureKind,
  type ProceduralTextureLike,
} from "../procedural-textures";

interface LambertShaderData {
  color: string;
  fog: boolean;
  offset: { x: number; y: number };
  repeat: { x: number; y: number };
  src?: unknown;
  wireframe: boolean;
  wireframeLinewidth: number;
  toneMapped: boolean;
}

interface LambertThreeSubset {
  readonly Color: new () => { set: (value: string) => void };
  readonly MeshLambertMaterial: new (params: Record<string, unknown>) => Record<string, unknown>;
  readonly CanvasTexture?: new (canvas: HTMLCanvasElement) => ProceduralTextureLike;
  readonly RepeatWrapping?: number;
  readonly ClampToEdgeWrapping?: number;
}

interface AFrameShaderGlobal {
  readonly THREE?: LambertThreeSubset;
  readonly shaders?: Record<string, unknown>;
  readonly components?: Record<string, unknown>;
  readonly utils?: {
    material?: {
      updateMap?: (shaderInstance: unknown, data: unknown) => void;
    };
  };
  registerShader?: (name: string, def: unknown) => void;
  registerComponent?: (name: string, def: unknown) => void;
}

/**
 * Creates the A-Frame `lambert` shader wrapping THREE.MeshLambertMaterial.
 */
export function createLambertShaderDefinition(three?: LambertThreeSubset) {
  const resolveThree = (): LambertThreeSubset | undefined =>
    three ??
    (globalThis as unknown as { AFRAME?: AFrameShaderGlobal }).AFRAME?.THREE ??
    (globalThis as unknown as { THREE?: LambertThreeSubset }).THREE;

  const populateMaterialData = (
    data: Partial<LambertShaderData>,
    target: {
      color: { set: (val: string) => void };
      fog: boolean;
      wireframe: boolean;
      wireframeLinewidth: number;
      toneMapped: boolean;
    },
  ) => {
    target.color.set(data.color ?? "#ffffff");
    target.fog = data.fog !== false;
    target.wireframe = Boolean(data.wireframe);
    target.wireframeLinewidth =
      typeof data.wireframeLinewidth === "number" ? data.wireframeLinewidth : 2;
    target.toneMapped = data.toneMapped !== false;
    return target;
  };

  return {
    schema: {
      color: { type: "color", default: "#ffffff" },
      fog: { default: true },
      offset: { type: "vec2", default: { x: 0, y: 0 } },
      repeat: { type: "vec2", default: { x: 1, y: 1 } },
      src: { type: "map" },
      wireframe: { default: false },
      wireframeLinewidth: { default: 2 },
      toneMapped: { default: true },
    },

    init: function (
      this: {
        materialData: {
          color: { set: (val: string) => void };
          fog: boolean;
          wireframe: boolean;
          wireframeLinewidth: number;
          toneMapped: boolean;
        };
        material: Record<string, unknown>;
      },
      data: Partial<LambertShaderData>,
    ) {
      const t = resolveThree();
      if (!t) {
        return;
      }
      this.materialData = {
        color: new t.Color(),
        fog: true,
        wireframe: false,
        wireframeLinewidth: 2,
        toneMapped: true,
      };
      populateMaterialData(data, this.materialData);
      this.material = new t.MeshLambertMaterial(this.materialData);
    },

    update: function (
      this: {
        materialData: {
          color: { set: (val: string) => void };
          fog: boolean;
          wireframe: boolean;
          wireframeLinewidth: number;
          toneMapped: boolean;
        };
        material: Record<string, unknown>;
      },
      data: Partial<LambertShaderData>,
    ) {
      if (!this.material || !this.materialData) {
        return;
      }
      populateMaterialData(data, this.materialData);
      for (const [key, val] of Object.entries(this.materialData)) {
        this.material[key] = val;
      }
      const utilsMat = (
        globalThis as unknown as { AFRAME?: AFrameShaderGlobal }
      ).AFRAME?.utils?.material;
      utilsMat?.updateMap?.(this, data);
    },
  };
}

interface ProceduralSurfaceContext {
  data: {
    kind: string;
    accentColor: string;
    repeatCount: number;
  };
  el: {
    getObject3D?: (
      type: string,
    ) => { material?: { map?: unknown; needsUpdate?: boolean } } | null;
    addEventListener: (name: string, cb: () => void) => void;
    removeEventListener: (name: string, cb: () => void) => void;
  };
  textureRef?: ProceduralTextureLike | null;
  applyHandler?: () => void;
}

/**
 * Creates `cv-procedural-surface` which binds a CanvasTexture strictly after
 * A-Frame's `geometry` and `material` components finish creating `mesh.material`.
 */
export function createProceduralSurfaceComponentDefinition(
  three?: LambertThreeSubset,
) {
  const resolveThree = (): LambertThreeSubset | undefined =>
    three ??
    (globalThis as unknown as { AFRAME?: AFrameShaderGlobal }).AFRAME?.THREE ??
    (globalThis as unknown as { THREE?: LambertThreeSubset }).THREE;

  return {
    dependencies: ["geometry", "material"],
    schema: {
      kind: { type: "string", default: PROCEDURAL_TEXTURE_KIND.STONE_BASALT },
      accentColor: { type: "string", default: "#D99B26" },
      repeatCount: { type: "number", default: 2 },
    },

    init: function (this: ProceduralSurfaceContext) {
      const applyTexture = () => {
        const t = resolveThree();
        if (!t?.CanvasTexture) {
          return;
        }
        const mesh = this.el.getObject3D?.("mesh");
        if (!mesh?.material) {
          return;
        }
        if (!this.textureRef) {
          this.textureRef = createProceduralTexture(
            this.data.kind as ProceduralTextureKind,
            this.data.accentColor,
            {
              createTexture: (canvas) => new t.CanvasTexture!(canvas),
              repeatWrapping: t.RepeatWrapping,
              clampToEdgeWrapping: t.ClampToEdgeWrapping,
              repeatCount: this.data.repeatCount,
            },
          );
        }
        if (this.textureRef && mesh.material.map !== this.textureRef) {
          mesh.material.map = this.textureRef;
          mesh.material.needsUpdate = true;
        }
      };

      this.applyHandler = applyTexture;
      applyTexture();
      this.el.addEventListener("object3dset", applyTexture);
      this.el.addEventListener("materialtextureloaded", applyTexture);
    },

    update: function (this: ProceduralSurfaceContext) {
      this.applyHandler?.();
    },

    remove: function (this: ProceduralSurfaceContext) {
      if (this.applyHandler) {
        this.el.removeEventListener("object3dset", this.applyHandler);
        this.el.removeEventListener("materialtextureloaded", this.applyHandler);
      }
      this.textureRef?.dispose();
      this.textureRef = null;
    },
  };
}

export function registerLambertShaderAndSurface(): void {
  const aframe = (globalThis as unknown as { AFRAME?: AFrameShaderGlobal })
    .AFRAME;
  if (!aframe) {
    return;
  }
  if (typeof aframe.registerShader === "function" && !aframe.shaders?.lambert) {
    aframe.registerShader("lambert", createLambertShaderDefinition());
  }
  if (
    typeof aframe.registerComponent === "function" &&
    !aframe.components?.["cv-procedural-surface"]
  ) {
    aframe.registerComponent(
      "cv-procedural-surface",
      createProceduralSurfaceComponentDefinition(),
    );
  }
}

registerLambertShaderAndSurface();
