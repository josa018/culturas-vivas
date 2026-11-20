import { SHADOW_CONFIG_TOKENS } from "./constants";
import { registerLambertShaderAndSurface } from "./components/lambert-shader";
import {
  createProceduralTexture,
  PROCEDURAL_TEXTURE_KIND,
  type ProceduralTextureDependencies,
} from "./procedural-textures";

registerLambertShaderAndSurface();

export interface ShadowMapTarget {
  enabled: boolean;
  type: number;
  autoUpdate: boolean;
  needsUpdate: boolean;
}

export interface BakeShadowDependencies {
  readonly pcfShadowMapType?: number;
}

export interface ContactShadowDecalOptions {
  readonly width?: number;
  readonly depth?: number;
  readonly yOffset?: number;
  readonly opacity?: number;
}

/**
 * Configures and triggers a single-shot PCF shadow map bake on room mount so
 * steady-state frames incur 0 ms shadow rendering cost.
 */
export function bakeRoomShadowMap(
  sceneEl: HTMLElement | null | undefined,
  deps: BakeShadowDependencies = {},
): boolean {
  if (!sceneEl) {
    return false;
  }
  const renderer = (
    sceneEl as unknown as {
      renderer?: { shadowMap?: ShadowMapTarget };
    }
  ).renderer;
  const shadowMap = renderer?.shadowMap;
  if (!shadowMap) {
    return false;
  }

  const threeGlobal = (
    globalThis as unknown as {
      AFRAME?: { THREE?: { PCFShadowMap?: number } };
      THREE?: { PCFShadowMap?: number };
    }
  );
  const pcfType =
    deps.pcfShadowMapType ??
    threeGlobal.AFRAME?.THREE?.PCFShadowMap ??
    threeGlobal.THREE?.PCFShadowMap;

  shadowMap.enabled = true;
  if (typeof pcfType === "number") {
    shadowMap.type = pcfType;
  }
  shadowMap.autoUpdate = SHADOW_CONFIG_TOKENS.AUTO_UPDATE;
  shadowMap.needsUpdate = true;
  return true;
}

/**
 * Builds a flat radial contact-shadow decal plane for movable stands and exhibits.
 */
export function createContactShadowDecal(
  options: ContactShadowDecalOptions = {},
  texDeps: ProceduralTextureDependencies = {},
): HTMLElement {
  const width = options.width ?? 1.25;
  const depth = options.depth ?? 0.72;
  const yOffset = options.yOffset ?? -1.58;
  const opacity = options.opacity ?? 0.68;

  const decal = document.createElement("a-plane");
  decal.setAttribute("class", "cv-contact-shadow");
  decal.setAttribute("data-shadow-kind", PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW);
  decal.setAttribute("width", String(width));
  decal.setAttribute("height", String(depth));
  decal.setAttribute("position", `0 ${yOffset} 0`);
  decal.setAttribute("rotation", "-90 0 0");
  decal.setAttribute(
    "material",
    `shader: flat; color: #ffffff; transparent: true; opacity: ${opacity}; depthWrite: false`,
  );
  decal.setAttribute(
    "cv-procedural-surface",
    `kind: ${PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW}; accentColor: #000000; repeatCount: 1`,
  );

  const resolvedTexDeps: ProceduralTextureDependencies = { ...texDeps };
  const threeGlobal = (
    globalThis as unknown as {
      AFRAME?: {
        THREE?: {
          CanvasTexture?: new (canvas: HTMLCanvasElement) => unknown;
          RepeatWrapping?: number;
          ClampToEdgeWrapping?: number;
        };
      };
      THREE?: {
        CanvasTexture?: new (canvas: HTMLCanvasElement) => unknown;
        RepeatWrapping?: number;
        ClampToEdgeWrapping?: number;
      };
    }
  );
  const three = threeGlobal.AFRAME?.THREE ?? threeGlobal.THREE;
  const createTexFn =
    resolvedTexDeps.createTexture ??
    (three?.CanvasTexture
      ? (canvas: HTMLCanvasElement) =>
          new three.CanvasTexture!(
            canvas,
          ) as ReturnType<NonNullable<ProceduralTextureDependencies["createTexture"]>>
      : undefined);

  const attachTexture = (): void => {
    const mesh = (
      decal as unknown as {
        getObject3D?: (type: string) => { material?: { map?: unknown; needsUpdate?: boolean } } | null;
      }
    ).getObject3D?.("mesh");
    if (!mesh?.material || mesh.material.map) {
      return;
    }
    const texture = createProceduralTexture(
      PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW,
      "#000000",
      {
        ...resolvedTexDeps,
        createTexture: createTexFn,
        repeatWrapping: resolvedTexDeps.repeatWrapping ?? three?.RepeatWrapping,
        clampToEdgeWrapping:
          resolvedTexDeps.clampToEdgeWrapping ?? three?.ClampToEdgeWrapping,
      },
    );
    if (texture) {
      mesh.material.map = texture;
      mesh.material.needsUpdate = true;
    }
  };

  attachTexture();
  decal.addEventListener("object3dset", attachTexture);
  decal.addEventListener("loaded", attachTexture);

  return decal;
}
