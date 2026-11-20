import { describe, it, expect, vi } from "vitest";
import {
  wrapCanvasTextLines,
  measureAndDrawBillboard,
  type CanvasContext2DLike,
} from "../../src/experience/canvas-text-renderer";
import {
  createCanvasTextComponentDefinition,
  createCanvasTextPlane,
  type DisposableCanvasTextureLike,
} from "../../src/experience/components/canvas-text";
import {
  EXHIBIT_DICTIONARY,
  RENDERER_QUALITY_TOKENS,
} from "../../src/experience/constants";

function createMockContext2D(): {
  ctx: CanvasContext2DLike;
  fillTextCalls: Array<{ text: string; x: number; y: number; font: string }>;
} {
  const fillTextCalls: Array<{
    text: string;
    x: number;
    y: number;
    font: string;
  }> = [];

  const ctx: CanvasContext2DLike = {
    font: "400 32px sans-serif",
    fillStyle: "#ffffff",
    textAlign: "left",
    textBaseline: "top",
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y, font: ctx.font });
    }),
    measureText: vi.fn((text: string) => ({
      // Deterministic ~14px glyph metric scaled slightly for bold headers
      width: text.length * (ctx.font.includes("700") ? 18 : 14),
    })),
  };

  return { ctx, fillTextCalls };
}

describe("Canvas Text Renderer & cv-canvas-text Component", () => {
  it("preserves Spanish diacritics and UI glyphs while wrapping without dropping characters", () => {
    const { ctx } = createMockContext2D();

    const unicodePhrases = [
      "Contenido próximamente",
      "Cosmovisión y Tradición",
      "Cultura Náayeri",
      "¿Cómo se elabora? ¡Único!",
      "◀ ▶ ⏸ 🔇 🔊 ✕",
    ];

    for (const phrase of unicodePhrases) {
      const result = wrapCanvasTextLines({
        ctx,
        text: phrase,
        maxWidthPx: 1000,
      });
      expect(result.lines.join(" ")).toBe(phrase);
      expect(result.truncated).toBe(false);
    }

    const wrapped = wrapCanvasTextLines({
      ctx,
      text: "Arte tradicional indígena con chaquira ceremonial de colores vibrantes",
      maxWidthPx: 260,
      maxLines: 2,
    });
    expect(wrapped.lines.length).toBe(2);
    expect(wrapped.truncated).toBe(true);
    expect(wrapped.lines[1]?.endsWith("…")).toBe(true);
  });

  it("measureAndDrawBillboard stacks 80 / 80 / 240 Spanish metadata vertically without overlap and truncates cleanly when capped", () => {
    const { ctx, fillTextCalls } = createMockContext2D();
    const longTitle =
      "Obra Ceremonial Wixárika de Cosmovisión Ancestral Nayarita Edición Conmemorativa";
    const longCreator =
      "Colectivo de Maestras y Maestros Artesanos de Santa Catarina Cuexcomatitlán NY";
    const longDescription =
      "Pieza representativa elaborada con chaquira de vidrio adherida mediante cera sobre jícara ceremonial, narrando el peregrinar sagrado hacia Wirikuta, la armonía del maíz, el venado azul y el abuelo fuego en la tradición viva.";

    expect(longTitle.length).toBeLessThanOrEqual(80);
    expect(longCreator.length).toBeLessThanOrEqual(80);
    expect(longDescription.length).toBeLessThanOrEqual(240);

    const layout = measureAndDrawBillboard({
      ctx,
      canvasWidth: 1024,
      canvasHeight: 420,
      title: longTitle,
      creatorName: longCreator,
      description: longDescription,
    });

    expect(layout.titleLines.length).toBeGreaterThanOrEqual(1);
    expect(layout.creatorLines.length).toBeGreaterThanOrEqual(1);
    expect(layout.descriptionLines.length).toBeGreaterThanOrEqual(2);
    expect(layout.creatorY).not.toBeNull();
    expect(layout.creatorY!).toBeGreaterThan(layout.titleY);
    expect(layout.descriptionY).toBeGreaterThan(layout.creatorY!);

    const renderedText = fillTextCalls.map((c) => c.text).join(" ");
    expect(renderedText).toContain("Wixárika");
    expect(renderedText).toContain("Santa Catarina");
    expect(renderedText).toContain(EXHIBIT_DICTIONARY.CREATOR_PREFIX);

    // Monotonic Y coordinates across every drawn fillText line (no vertical collision)
    for (let i = 1; i < fillTextCalls.length; i++) {
      expect(fillTextCalls[i]!.y).toBeGreaterThan(fillTextCalls[i - 1]!.y);
    }

    // Legacy over-limit text overflows gracefully with "…" instead of throwing
    const oversizedLayout = measureAndDrawBillboard({
      ctx,
      canvasWidth: 720,
      canvasHeight: 260,
      title: longTitle,
      creatorName: longCreator,
      description: `${longDescription} `.repeat(3),
    });
    expect(oversizedLayout.truncated).toBe(true);
    expect(
      oversizedLayout.descriptionLines[
        oversizedLayout.descriptionLines.length - 1
      ]?.endsWith("…"),
    ).toBe(true);
  });

  it("cv-canvas-text renders diacritics onto THREE.CanvasTexture and disposes textures on update and remove", () => {
    const { ctx, fillTextCalls } = createMockContext2D();
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
    } as unknown as HTMLCanvasElement;

    const createdTextures: Array<{
      needsUpdate: boolean;
      colorSpace?: string;
      anisotropy?: number;
      generateMipmaps?: boolean;
      minFilter?: number;
      magFilter?: number;
      dispose: ReturnType<typeof vi.fn>;
    }> = [];

    (globalThis as unknown as { THREE?: unknown }).THREE = {
      LinearMipmapLinearFilter: 1008,
      LinearFilter: 1006,
    };

    const createTexture = vi.fn((): DisposableCanvasTextureLike => {
      const texture = {
        needsUpdate: false,
        colorSpace: "",
        anisotropy: 1,
        generateMipmaps: false,
        minFilter: 0,
        magFilter: 0,
        dispose: vi.fn(),
      };
      createdTextures.push(texture);
      return texture;
    });

    const def = createCanvasTextComponentDefinition({
      createCanvas: () => mockCanvas,
      createTexture,
    });

    const mockMaterial = {
      map: null as unknown,
      transparent: false,
      needsUpdate: false,
    };

    const el = createCanvasTextPlane({
      width: 1.4,
      height: 0.25,
      value: "Contenido próximamente",
      color: "#EDE8DF",
      align: "center",
      fontSizePx: 42,
    }) as HTMLElement & {
      getObject3D?: (name: string) => unknown;
    };
    el.getObject3D = vi.fn((name: string) =>
      name === "mesh" ? { material: mockMaterial } : null,
    );

    const instance = Object.create(def);
    instance.el = el;
    instance.data = {
      value: "Contenido próximamente",
      color: "#EDE8DF",
      align: "center",
      baseline: "middle",
      fontSizePx: 42,
      fontWeight: "600",
      canvasWidth: 1024,
      canvasHeight: 192,
      maxLines: 2,
      backgroundColor: "",
      paddingX: 24,
      paddingY: 16,
      mode: "label",
      creatorName: "",
      description: "",
    };

    instance.init();
    expect(el.getAttribute("value")).toBe("Contenido próximamente");
    expect(fillTextCalls.map((c) => c.text)).toContain("Contenido próximamente");
    expect(createdTextures.length).toBe(1);
    expect(createdTextures[0]!.needsUpdate).toBe(true);
    expect(createdTextures[0]!.anisotropy).toBe(
      RENDERER_QUALITY_TOKENS.TEXTURE_ANISOTROPY,
    );
    expect(createdTextures[0]!.generateMipmaps).toBe(true);
    expect(createdTextures[0]!.minFilter).toBe(1008);
    expect(createdTextures[0]!.magFilter).toBe(1006);
    expect(mockMaterial.map).toBe(createdTextures[0]);
    expect(mockMaterial.transparent).toBe(true);
    delete (globalThis as unknown as { THREE?: unknown }).THREE;

    // Update with another diacritic string disposes first texture and binds replacement
    instance.data = {
      ...instance.data,
      value: "Cosmovisión y Tradición",
    };
    instance.update();
    expect(createdTextures[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(createdTextures.length).toBe(2);
    expect(mockMaterial.map).toBe(createdTextures[1]);
    expect(el.getAttribute("value")).toBe("Cosmovisión y Tradición");
    expect(fillTextCalls.map((c) => c.text)).toContain("Cosmovisión y Tradición");

    // Removal disposes current texture and clears mesh material map
    instance.remove();
    expect(createdTextures[1]!.dispose).toHaveBeenCalledTimes(1);
    expect(mockMaterial.map).toBeNull();
  });
});
