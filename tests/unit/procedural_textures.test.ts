import { describe, it, expect, vi } from "vitest";
import {
  DISPOSABLE_TEXTURE_SLOTS,
  PROCEDURAL_TEXTURE_TOKENS,
} from "../../src/experience/constants";
import {
  PROCEDURAL_TEXTURE_KIND,
  createProceduralTexture,
  createRoomTextureSet,
  type ProceduralCanvasContext2DLike,
  type ProceduralTextureLike,
} from "../../src/experience/procedural-textures";
import {
  ROOM_ENVIRONMENT_PRESETS,
  getRoomEnvironmentPreset,
} from "../../src/experience/room-environment-presets";
import { disposeObject3DResources } from "../../src/experience/three-disposal";
import { RoomId } from "../../src/shared/room-catalog";

function createMockTextureDeps() {
  const createdCanvases: Array<{ width: number; height: number }> = [];
  const createdTextures: Array<
    ProceduralTextureLike & { dispose: ReturnType<typeof vi.fn> }
  > = [];

  const mockCtx: ProceduralCanvasContext2DLike = {
    fillStyle: "#000000",
    strokeStyle: "#ffffff",
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
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
  };

  const deps = {
    createCanvas: (width: number, height: number) => {
      createdCanvases.push({ width, height });
      return {
        width,
        height,
        getContext: () => mockCtx,
      } as unknown as HTMLCanvasElement;
    },
    createTexture: (canvas: HTMLCanvasElement): ProceduralTextureLike => {
      const tex: ProceduralTextureLike & { dispose: ReturnType<typeof vi.fn> } = {
        image: { width: canvas.width, height: canvas.height },
        wrapS: 0,
        wrapT: 0,
        repeat: { set: vi.fn() },
        anisotropy: 1,
        generateMipmaps: false,
        needsUpdate: false,
        colorSpace: "",
        dispose: vi.fn(),
      };
      createdTextures.push(tex);
      return tex;
    },
    repeatWrapping: 1000,
    clampToEdgeWrapping: 1001,
    srgbColorSpace: "srgb",
  };

  return { deps, createdCanvases, createdTextures, mockCtx };
}

describe("Procedural Canvas Textures & Room Environment Presets", () => {
  it("generates all 8 procedural texture kinds within <= 512px bounds, anisotropy 4, proper wrapping, and clean disposal", () => {
    const { deps, createdCanvases, createdTextures, mockCtx } =
      createMockTextureDeps();

    const kinds = [
      PROCEDURAL_TEXTURE_KIND.STONE_BASALT,
      PROCEDURAL_TEXTURE_KIND.TERRACOTTA_FLAGSTONE,
      PROCEDURAL_TEXTURE_KIND.ADOBE_PLASTER,
      PROCEDURAL_TEXTURE_KIND.PINE_TIMBER,
      PROCEDURAL_TEXTURE_KIND.WATER_SHIMMER,
      PROCEDURAL_TEXTURE_KIND.WOVEN_FAJA,
      PROCEDURAL_TEXTURE_KIND.PETATE_REED,
      PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW,
    ];

    for (const kind of kinds) {
      const texture = createProceduralTexture(kind, "#D99B26", deps);
      expect(texture).not.toBeNull();
      expect(texture!.anisotropy).toBe(PROCEDURAL_TEXTURE_TOKENS.ANISOTROPY);
      expect(texture!.anisotropy).toBe(4);
      expect(texture!.generateMipmaps).toBe(true);
      expect(texture!.needsUpdate).toBe(true);
      if (kind === PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW) {
        expect(texture!.wrapS).toBe(deps.clampToEdgeWrapping);
        expect(texture!.wrapT).toBe(deps.clampToEdgeWrapping);
      } else {
        expect(texture!.wrapS).toBe(deps.repeatWrapping);
        expect(texture!.wrapT).toBe(deps.repeatWrapping);
      }
    }

    expect(createdCanvases).toHaveLength(8);
    for (const canvas of createdCanvases) {
      expect(canvas.width).toBeLessThanOrEqual(
        PROCEDURAL_TEXTURE_TOKENS.MAX_DIMENSION_PX,
      );
      expect(canvas.height).toBeLessThanOrEqual(
        PROCEDURAL_TEXTURE_TOKENS.MAX_DIMENSION_PX,
      );
    }
    expect(mockCtx.createRadialGradient).toHaveBeenCalled();

    // Verify clean disposal through disposeObject3DResources
    const mockNode = {
      material: {
        [DISPOSABLE_TEXTURE_SLOTS[0]]: createdTextures[0],
        dispose: vi.fn(),
      },
      traverse: (cb: (n: unknown) => void) => cb(mockNode),
    };
    const stats = disposeObject3DResources(mockNode);
    expect(stats.texturesDisposed).toBe(1);
    expect(createdTextures[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it("defines distinct declarative cultural environment presets for all 5 rooms and builds room texture sets", () => {
    const { deps, createdTextures } = createMockTextureDeps();
    const skyTops = new Set<string>();
    const fogColors = new Set<string>();

    for (const roomId of Object.values(RoomId)) {
      const preset = getRoomEnvironmentPreset(roomId);
      expect(preset).toBe(ROOM_ENVIRONMENT_PRESETS[roomId]);
      expect(preset.roomId).toBe(roomId);
      expect(preset.particleCount).toBeGreaterThanOrEqual(40);
      expect(preset.particleCount).toBeLessThanOrEqual(60);
      skyTops.add(preset.skyGradient.horizonColor);
      fogColors.add(preset.fog.color);

      const textures = createRoomTextureSet(preset, deps);
      expect(textures.floor).not.toBeNull();
      expect(textures.column).not.toBeNull();
      expect(textures.trim).not.toBeNull();
      expect(textures.contactShadow).not.toBeNull();
    }

    expect(skyTops.size).toBe(5);
    expect(fogColors.size).toBe(5);
    expect(createdTextures.length).toBe(20);
  });
});
