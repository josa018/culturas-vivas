import {
  PROCEDURAL_TEXTURE_TOKENS,
  RENDERER_QUALITY_TOKENS,
} from "./constants";
import {
  renderFajaBorderPattern,
  type FajaCanvasContextLike,
} from "./faja-pattern-renderer";
import type { RoomEnvironmentPreset } from "./room-environment-presets";

export const PROCEDURAL_TEXTURE_KIND = {
  STONE_BASALT: "STONE_BASALT",
  TERRACOTTA_FLAGSTONE: "TERRACOTTA_FLAGSTONE",
  ADOBE_PLASTER: "ADOBE_PLASTER",
  PINE_TIMBER: "PINE_TIMBER",
  WATER_SHIMMER: "WATER_SHIMMER",
  WOVEN_FAJA: "WOVEN_FAJA",
  PETATE_REED: "PETATE_REED",
  CONTACT_SHADOW: "CONTACT_SHADOW",
} as const;
export type ProceduralTextureKind =
  (typeof PROCEDURAL_TEXTURE_KIND)[keyof typeof PROCEDURAL_TEXTURE_KIND];

export interface ProceduralGradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface ProceduralCanvasContext2DLike extends FajaCanvasContextLike {
  globalAlpha: number;
  strokeRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): ProceduralGradientLike;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): ProceduralGradientLike;
}

export interface ProceduralTextureLike {
  image?: { width: number; height: number };
  wrapS?: number;
  wrapT?: number;
  repeat?: { set?: (x: number, y: number) => void };
  anisotropy?: number;
  generateMipmaps?: boolean;
  minFilter?: number;
  magFilter?: number;
  needsUpdate: boolean;
  colorSpace?: string;
  dispose: () => void;
}

export interface ProceduralTextureDependencies {
  readonly createCanvas?: (
    width: number,
    height: number,
  ) => HTMLCanvasElement | null;
  readonly createTexture?: (
    canvas: HTMLCanvasElement,
  ) => ProceduralTextureLike | null;
  readonly repeatWrapping?: number;
  readonly clampToEdgeWrapping?: number;
  readonly linearMipmapLinearFilter?: number;
  readonly linearFilter?: number;
  readonly srgbColorSpace?: string;
  readonly repeatCount?: number;
}

export interface RoomTextureSet {
  readonly floor: ProceduralTextureLike | null;
  readonly column: ProceduralTextureLike | null;
  readonly trim: ProceduralTextureLike | null;
  readonly contactShadow: ProceduralTextureLike | null;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function defaultCreateCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function defaultCreateTexture(
  canvas: HTMLCanvasElement,
): ProceduralTextureLike | null {
  const threeGlobal = (
    globalThis as unknown as {
      THREE?: {
        CanvasTexture?: new (c: HTMLCanvasElement) => ProceduralTextureLike;
      };
    }
  ).THREE;
  if (!threeGlobal?.CanvasTexture) {
    return null;
  }
  return new threeGlobal.CanvasTexture(canvas);
}

function drawStoneBasalt(
  ctx: ProceduralCanvasContext2DLike,
  size: number,
): void {
  const rand = createSeededRandom(101);
  ctx.fillStyle = "#2b323d";
  ctx.fillRect(0, 0, size, size);

  const rows = 4;
  const cols = 4;
  const tileW = size / cols;
  const tileH = size / rows;

  for (let r = 0; r < rows; r++) {
    const offsetX = r % 2 === 1 ? tileW * 0.5 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * tileW + offsetX;
      const y = r * tileH;
      const shade = 44 + Math.floor(rand() * 18);
      ctx.fillStyle = `rgb(${shade}, ${shade + 6}, ${shade + 14})`;
      ctx.fillRect(x + 2, y + 2, tileW - 4, tileH - 4);
      ctx.strokeStyle = "#181d24";
      ctx.lineWidth = PROCEDURAL_TEXTURE_TOKENS.MIN_GROUT_LINE_WIDTH_PX;
      ctx.strokeRect(x + 1, y + 1, tileW - 2, tileH - 2);
    }
  }

  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = rand() > 0.5 ? "#475569" : "#111827";
    ctx.fillRect(
      Math.floor(rand() * size),
      Math.floor(rand() * size),
      2 + Math.floor(rand() * 3),
      2 + Math.floor(rand() * 3),
    );
  }
  ctx.globalAlpha = 1;
}

function drawTerracottaFlagstone(
  ctx: ProceduralCanvasContext2DLike,
  size: number,
): void {
  const rand = createSeededRandom(202);
  ctx.fillStyle = "#7c3f2c";
  ctx.fillRect(0, 0, size, size);

  const step = size / 4;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const shift = (r % 2) * (step * 0.5);
      const x = (c * step + shift) % size;
      const y = r * step;
      const red = 135 + Math.floor(rand() * 28);
      const green = 72 + Math.floor(rand() * 18);
      const blue = 48 + Math.floor(rand() * 14);
      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(x + 2, y + 2, step - 4, step - 4);
      ctx.strokeStyle = "#4b261b";
      ctx.lineWidth = PROCEDURAL_TEXTURE_TOKENS.MIN_GROUT_LINE_WIDTH_PX;
      ctx.strokeRect(x + 1, y + 1, step - 2, step - 2);
    }
  }

  for (let i = 0; i < 65; i++) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = rand() > 0.5 ? "#d99b26" : "#3a1d14";
    ctx.fillRect(
      Math.floor(rand() * size),
      Math.floor(rand() * size),
      3,
      3,
    );
  }
  ctx.globalAlpha = 1;
}

function drawAdobePlaster(
  ctx: ProceduralCanvasContext2DLike,
  size: number,
): void {
  const rand = createSeededRandom(303);
  ctx.fillStyle = "#c29b75";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 120; i++) {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = rand() > 0.45 ? "#d7b694" : "#9c7550";
    const w = 10 + Math.floor(rand() * 28);
    const h = 4 + Math.floor(rand() * 12);
    ctx.fillRect(
      Math.floor(rand() * size),
      Math.floor(rand() * size),
      w,
      h,
    );
  }
  ctx.globalAlpha = 1;
}

function drawPineTimber(
  ctx: ProceduralCanvasContext2DLike,
  size: number,
): void {
  const rand = createSeededRandom(404);
  ctx.fillStyle = "#6e472b";
  ctx.fillRect(0, 0, size, size);

  const plankCount = 4;
  const plankW = size / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const x0 = p * plankW;
    ctx.fillStyle = p % 2 === 0 ? "#7a5032" : "#643f26";
    ctx.fillRect(x0 + 1, 0, plankW - 2, size);
    ctx.strokeStyle = "#3f2615";
    ctx.lineWidth = PROCEDURAL_TEXTURE_TOKENS.MIN_GROUT_LINE_WIDTH_PX;
    ctx.strokeRect(x0, 0, plankW, size);

    for (let g = 0; g < 10; g++) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = g % 2 === 0 ? "#4c2e19" : "#946542";
      const gx = x0 + 4 + Math.floor(rand() * (plankW - 8));
      ctx.fillRect(gx, 0, 2, size);
    }
  }
  ctx.globalAlpha = 1;
}

function drawWaterShimmer(
  ctx: ProceduralCanvasContext2DLike,
  size: number,
): void {
  const rand = createSeededRandom(505);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#0b5c63");
  grad.addColorStop(0.5, "#008F85");
  grad.addColorStop(1, "#0e7490");
  ctx.fillStyle = grad as unknown as string;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 24; i++) {
    const y = Math.floor((i / 24) * size);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = i % 3 === 0 ? "#a5f3fc" : "#2dd4bf";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size * 0.5, y + (rand() - 0.5) * 8);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawPetateReed(
  ctx: ProceduralCanvasContext2DLike,
  size: number,
): void {
  ctx.fillStyle = "#b5915b";
  ctx.fillRect(0, 0, size, size);

  const cell = 16;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const horizontal = ((x + y) / cell) % 2 === 0;
      ctx.fillStyle = horizontal ? "#cca86e" : "#9c7946";
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.strokeStyle = "#7a5b32";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cell, cell);
    }
  }
}

function drawContactShadow(
  ctx: ProceduralCanvasContext2DLike,
  size: number,
): void {
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, size * 0.06, c, c, c);
  grad.addColorStop(0, "rgba(6, 9, 15, 0.58)");
  grad.addColorStop(0.55, "rgba(6, 9, 15, 0.26)");
  grad.addColorStop(1, "rgba(6, 9, 15, 0)");
  ctx.fillStyle = grad as unknown as string;
  ctx.fillRect(0, 0, size, size);
}

/**
 * Creates a bounded procedural CanvasTexture for cultural surfaces or decals.
 */
export function createProceduralTexture(
  kind: ProceduralTextureKind,
  accentColor: string,
  deps: ProceduralTextureDependencies = {},
): ProceduralTextureLike | null {
  const isContact = kind === PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW;
  const size = Math.min(
    PROCEDURAL_TEXTURE_TOKENS.MAX_DIMENSION_PX,
    isContact
      ? PROCEDURAL_TEXTURE_TOKENS.CONTACT_SHADOW_SIZE_PX
      : PROCEDURAL_TEXTURE_TOKENS.TILE_SIZE_PX,
  );
  const canvas = (deps.createCanvas ?? defaultCreateCanvas)(size, size);
  if (!canvas) {
    return null;
  }
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext(
    "2d",
  ) as unknown as ProceduralCanvasContext2DLike | null;
  if (!ctx) {
    return null;
  }

  switch (kind) {
    case PROCEDURAL_TEXTURE_KIND.STONE_BASALT:
      drawStoneBasalt(ctx, size);
      break;
    case PROCEDURAL_TEXTURE_KIND.TERRACOTTA_FLAGSTONE:
      drawTerracottaFlagstone(ctx, size);
      break;
    case PROCEDURAL_TEXTURE_KIND.ADOBE_PLASTER:
      drawAdobePlaster(ctx, size);
      break;
    case PROCEDURAL_TEXTURE_KIND.PINE_TIMBER:
      drawPineTimber(ctx, size);
      break;
    case PROCEDURAL_TEXTURE_KIND.WATER_SHIMMER:
      drawWaterShimmer(ctx, size);
      break;
    case PROCEDURAL_TEXTURE_KIND.WOVEN_FAJA:
      renderFajaBorderPattern(ctx, size, size, {
        base: "#0B0F17",
        gold: accentColor || "#D99B26",
        crimson: "#B83A2C",
        turquoise: "#008F85",
        bone: "#EDE8DF",
      });
      break;
    case PROCEDURAL_TEXTURE_KIND.PETATE_REED:
      drawPetateReed(ctx, size);
      break;
    case PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW:
      drawContactShadow(ctx, size);
      break;
  }

  const texture = (deps.createTexture ?? defaultCreateTexture)(canvas);
  if (!texture) {
    return null;
  }

  const threeGlobal = (
    globalThis as unknown as {
      THREE?: {
        RepeatWrapping?: number;
        ClampToEdgeWrapping?: number;
        LinearMipmapLinearFilter?: number;
        LinearFilter?: number;
        SRGBColorSpace?: string;
      };
    }
  ).THREE;

  const repeatWrapping = deps.repeatWrapping ?? threeGlobal?.RepeatWrapping ?? 1000;
  const clampWrapping =
    deps.clampToEdgeWrapping ?? threeGlobal?.ClampToEdgeWrapping ?? 1001;
  const minFilter =
    deps.linearMipmapLinearFilter ??
    threeGlobal?.LinearMipmapLinearFilter ??
    RENDERER_QUALITY_TOKENS.DEFAULT_LINEAR_MIPMAP_LINEAR_FILTER;
  const magFilter =
    deps.linearFilter ??
    threeGlobal?.LinearFilter ??
    RENDERER_QUALITY_TOKENS.DEFAULT_LINEAR_FILTER;
  const srgb = deps.srgbColorSpace ?? threeGlobal?.SRGBColorSpace;

  if (isContact) {
    texture.wrapS = clampWrapping;
    texture.wrapT = clampWrapping;
  } else {
    texture.wrapS = repeatWrapping;
    texture.wrapT = repeatWrapping;
    const rep = deps.repeatCount ?? PROCEDURAL_TEXTURE_TOKENS.DEFAULT_FLOOR_REPEAT;
    texture.repeat?.set?.(rep, rep);
  }

  texture.anisotropy = PROCEDURAL_TEXTURE_TOKENS.ANISOTROPY;
  texture.generateMipmaps = true;
  texture.minFilter = minFilter;
  texture.magFilter = magFilter;
  if (srgb && "colorSpace" in texture) {
    texture.colorSpace = srgb;
  }
  texture.needsUpdate = true;

  return texture;
}

/**
 * Generates the surface texture bundle for a room environment preset.
 */
export function createRoomTextureSet(
  preset: RoomEnvironmentPreset,
  deps: ProceduralTextureDependencies = {},
): RoomTextureSet {
  return {
    floor: createProceduralTexture(preset.floorTexture, preset.accentColor, deps),
    column: createProceduralTexture(
      preset.columnTexture,
      preset.accentColor,
      { ...deps, repeatCount: 2 },
    ),
    trim: createProceduralTexture(
      PROCEDURAL_TEXTURE_KIND.WOVEN_FAJA,
      preset.accentColor,
      { ...deps, repeatCount: 4 },
    ),
    contactShadow: createProceduralTexture(
      PROCEDURAL_TEXTURE_KIND.CONTACT_SHADOW,
      preset.accentColor,
      deps,
    ),
  };
}
