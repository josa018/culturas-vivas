import { RENDERER_QUALITY_TOKENS, VR_HUD_COLORS } from "./constants";

export type HudIconId = "touch" | "lobby" | "exit" | "sound_on" | "sound_off";

export interface FajaCanvasContextLike {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void;
}

export interface FajaPalette {
  readonly base: string;
  readonly gold: string;
  readonly crimson: string;
  readonly turquoise: string;
  readonly bone: string;
}

export const DEFAULT_FAJA_PALETTE: FajaPalette = {
  base: VR_HUD_COLORS.SURFACE_OBSIDIAN,
  gold: VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
  crimson: VR_HUD_COLORS.ACCENT_COCHINILLA,
  turquoise: VR_HUD_COLORS.ACCENT_TURQUESA,
  bone: VR_HUD_COLORS.TEXT_BONE,
} as const;

/**
 * Draws a repeating Nayarit geometric loom border pattern onto a 2D canvas context.
 */
export function renderFajaBorderPattern(
  ctx: FajaCanvasContextLike,
  width: number,
  height: number,
  palette: FajaPalette = DEFAULT_FAJA_PALETTE,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, width, height);

  const railHeight = Math.max(2, Math.round(height * 0.14));
  ctx.fillStyle = palette.gold;
  ctx.fillRect(0, 0, width, railHeight);
  ctx.fillRect(0, height - railHeight, width, railHeight);

  const cellSize = Math.max(16, Math.round(height * 0.85));
  const centerY = height / 2;
  const halfDiamond = Math.max(4, Math.round(height * 0.28));
  const motifColors = [palette.crimson, palette.turquoise, palette.gold];

  let index = 0;
  for (let x = cellSize / 2; x < width + cellSize; x += cellSize) {
    const fill = motifColors[index % motifColors.length]!;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x, centerY - halfDiamond);
    ctx.lineTo(x + halfDiamond, centerY);
    ctx.lineTo(x, centerY + halfDiamond);
    ctx.lineTo(x - halfDiamond, centerY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = palette.bone;
    const inner = Math.max(2, Math.round(halfDiamond * 0.35));
    ctx.beginPath();
    ctx.moveTo(x, centerY - inner);
    ctx.lineTo(x + inner, centerY);
    ctx.lineTo(x, centerY + inner);
    ctx.lineTo(x - inner, centerY);
    ctx.closePath();
    ctx.fill();
    index++;
  }
}

/**
 * Draws crisp vector-like action icon glyphs for the 3D VR HUD cards.
 */
export function renderHudIconGlyph(
  ctx: FajaCanvasContextLike,
  iconId: HudIconId,
  color: string,
  size: number,
): void {
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(3, Math.round(size * 0.08));

  const c = size / 2;
  const r = size * 0.32;

  if (iconId === "touch") {
    // Stylized touch screen / pointer frame
    const boxW = size * 0.44;
    const boxH = size * 0.56;
    const left = c - boxW / 2;
    const top = c - boxH / 2;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left + boxW, top);
    ctx.lineTo(left + boxW, top + boxH);
    ctx.lineTo(left, top + boxH);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c, c + size * 0.12, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (iconId === "lobby") {
    // Ceremonial archway / home silhouette
    ctx.beginPath();
    ctx.moveTo(c - r, c);
    ctx.lineTo(c, c - r);
    ctx.lineTo(c + r, c);
    ctx.lineTo(c + r * 0.72, c);
    ctx.lineTo(c + r * 0.72, c + r);
    ctx.lineTo(c - r * 0.72, c + r);
    ctx.lineTo(c - r * 0.72, c);
    ctx.closePath();
    ctx.stroke();
    return;
  }

  if (iconId === "sound_on" || iconId === "sound_off") {
    // Speaker cone
    ctx.beginPath();
    ctx.moveTo(c - r * 0.85, c - r * 0.35);
    ctx.lineTo(c - r * 0.4, c - r * 0.35);
    ctx.lineTo(c + r * 0.05, c - r * 0.78);
    ctx.lineTo(c + r * 0.05, c + r * 0.78);
    ctx.lineTo(c - r * 0.4, c + r * 0.35);
    ctx.lineTo(c - r * 0.85, c + r * 0.35);
    ctx.closePath();
    ctx.stroke();

    if (iconId === "sound_on") {
      ctx.beginPath();
      ctx.arc(c + r * 0.15, c, r * 0.45, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c + r * 0.15, c, r * 0.78, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(c + r * 0.3, c - r * 0.35);
      ctx.lineTo(c + r * 0.85, c + r * 0.35);
      ctx.moveTo(c + r * 0.85, c - r * 0.35);
      ctx.lineTo(c + r * 0.3, c + r * 0.35);
      ctx.stroke();
    }
    return;
  }

  // "exit": doorway + exit arrow
  ctx.beginPath();
  ctx.moveTo(c + r * 0.2, c - r);
  ctx.lineTo(c - r * 0.7, c - r);
  ctx.lineTo(c - r * 0.7, c + r);
  ctx.lineTo(c + r * 0.2, c + r);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(c - r * 0.15, c);
  ctx.lineTo(c + r * 0.85, c);
  ctx.moveTo(c + r * 0.45, c - r * 0.38);
  ctx.lineTo(c + r * 0.85, c);
  ctx.lineTo(c + r * 0.45, c + r * 0.38);
  ctx.stroke();
}

export interface ProceduralHudTexture {
  dispose: () => void;
  needsUpdate: boolean;
  anisotropy?: number;
  generateMipmaps?: boolean;
  minFilter?: number;
  magFilter?: number;
  colorSpace?: string;
}

export function createCanvasTextureFromDrawer(
  width: number,
  height: number,
  draw: (ctx: FajaCanvasContextLike) => void,
): ProceduralHudTexture | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d") as unknown as FajaCanvasContextLike | null;
  if (!ctx) {
    return null;
  }
  draw(ctx);

  const threeGlobal = (
    globalThis as unknown as {
      THREE?: {
        CanvasTexture?: new (c: HTMLCanvasElement) => ProceduralHudTexture;
        SRGBColorSpace?: string;
        LinearMipmapLinearFilter?: number;
        LinearFilter?: number;
      };
    }
  ).THREE;
  if (!threeGlobal?.CanvasTexture) {
    return null;
  }

  const texture = new threeGlobal.CanvasTexture(canvas);
  if (threeGlobal.SRGBColorSpace && "colorSpace" in texture) {
    texture.colorSpace = threeGlobal.SRGBColorSpace;
  }
  texture.anisotropy = RENDERER_QUALITY_TOKENS.TEXTURE_ANISOTROPY;
  texture.generateMipmaps = true;
  if (typeof threeGlobal.LinearMipmapLinearFilter === "number") {
    texture.minFilter = threeGlobal.LinearMipmapLinearFilter;
  }
  if (typeof threeGlobal.LinearFilter === "number") {
    texture.magFilter = threeGlobal.LinearFilter;
  }
  texture.needsUpdate = true;
  return texture;
}
