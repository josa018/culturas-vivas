// @vitest-environment happy-dom
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SHADOW_CONFIG_TOKENS } from "../../src/experience/constants";
import {
  bakeRoomShadowMap,
  createContactShadowDecal,
} from "../../src/experience/shadow-baker";

function createCanvasMockFactory() {
  return (width: number, height: number): HTMLCanvasElement => {
    const grad = { addColorStop: vi.fn() };
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
      createLinearGradient: vi.fn(() => grad),
      createRadialGradient: vi.fn(() => grad),
    };
    return {
      width,
      height,
      getContext: vi.fn(() => ctx),
    } as unknown as HTMLCanvasElement;
  };
}

describe("Hybrid baked PCF shadow system & dynamic contact shadow decals", () => {
  it("configures renderer.shadowMap with PCF, autoUpdate = false, and single-shot needsUpdate = true", () => {
    const shadowMap = {
      enabled: false,
      type: 0,
      autoUpdate: true,
      needsUpdate: false,
    };
    const sceneEl = {
      renderer: { shadowMap },
    } as unknown as HTMLElement;

    const baked = bakeRoomShadowMap(sceneEl, { pcfShadowMapType: 2 });

    expect(baked).toBe(true);
    expect(shadowMap.enabled).toBe(true);
    expect(shadowMap.type).toBe(2);
    expect(shadowMap.autoUpdate).toBe(SHADOW_CONFIG_TOKENS.AUTO_UPDATE);
    expect(shadowMap.needsUpdate).toBe(true);
  });

  it("handles missing renderer gracefully without throwing", () => {
    const sceneEl = document.createElement("a-scene");
    expect(bakeRoomShadowMap(sceneEl)).toBe(false);
    expect(bakeRoomShadowMap(null)).toBe(false);
  });

  it("creates a flat transparent .cv-contact-shadow decal textured with CONTACT_SHADOW", () => {
    const mockTex = {
      wrapS: 0,
      wrapT: 0,
      anisotropy: 1,
      generateMipmaps: true,
      needsUpdate: false,
      colorSpace: "",
      repeat: { set: vi.fn() },
      dispose: vi.fn(),
    };
    const mat: Record<string, unknown> = {
      map: null,
      needsUpdate: false,
    };

    const decal = createContactShadowDecal(
      {
        width: 1.15,
        depth: 0.72,
        yOffset: -1.58,
      },
      {
        createCanvas: createCanvasMockFactory(),
        createTexture: vi.fn(() => mockTex),
        repeatWrapping: 1000,
        clampToEdgeWrapping: 1001,
      },
    );

    expect(decal.classList.contains("cv-contact-shadow")).toBe(true);
    expect(decal.getAttribute("data-shadow-kind")).toBe("CONTACT_SHADOW");
    const matAttr = decal.getAttribute("material");
    expect(matAttr).toContain("shader: flat");
    expect(matAttr).toContain("transparent: true");
    expect(decal.getAttribute("rotation")).toBe("-90 0 0");
    expect(decal.getAttribute("position")).toBe("0 -1.58 0");

    // Simulate A-Frame mesh creation triggering texture attachment
    (decal as unknown as { getObject3D?: (k: string) => unknown }).getObject3D = (
      kind: string,
    ) => (kind === "mesh" ? { material: mat } : null);
    decal.dispatchEvent(new Event("object3dset"));

    expect(mat.map).toBe(mockTex);
    expect(mat.needsUpdate).toBe(true);
  });

  it("enforces baked PCF shadow system configuration on <a-scene> in index.html", () => {
    const html = fs.readFileSync(
      path.resolve(process.cwd(), "index.html"),
      "utf-8",
    );
    expect(html).toContain('shadow="type: pcf; autoUpdate: false"');
  });
});
