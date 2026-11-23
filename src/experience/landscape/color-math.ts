function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function parseHexChannelTuple(hex: string): readonly [number, number, number] {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => `${ch}${ch}`)
          .join("")
      : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return [0, 0, 0];
  }
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ];
}

function formatHexChannelTuple(r: number, g: number, b: number): string {
  const toHex = (c: number): string => clampByte(c).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Linearly interpolates two CSS hex colors with clamped factor t in [0, 1].
 */
export function mixHexColors(hexA: string, hexB: string, t: number): string {
  const alpha = clampUnit(t);
  const [rA, gA, bA] = parseHexChannelTuple(hexA);
  const [rB, gB, bB] = parseHexChannelTuple(hexB);
  return formatHexChannelTuple(
    rA + (rB - rA) * alpha,
    gA + (gB - gA) * alpha,
    bA + (bB - bA) * alpha,
  );
}

/**
 * Scales the RGB brightness of a hex color by a non-negative multiplier.
 */
export function scaleHexBrightness(hex: string, factor: number): string {
  const mult = Math.max(0, factor);
  const [r, g, b] = parseHexChannelTuple(hex);
  return formatHexChannelTuple(r * mult, g * mult, b * mult);
}

/**
 * Converts a CSS hex color string into normalized [0, 1] RGB channels.
 */
export function hexToRgb01(hex: string): readonly [number, number, number] {
  const [r, g, b] = parseHexChannelTuple(hex);
  return [r / 255, g / 255, b / 255];
}
