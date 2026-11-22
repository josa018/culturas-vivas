import { hexToRgb01 } from "./color-math";
import { valueNoise2D } from "./seeded-noise";
import type { IndexedBufferData } from "./types";

export interface RidgeParams {
  readonly radius: number;
  readonly segments: number;
  readonly baseY: number;
  readonly height: number;
  readonly amplitude: number;
  readonly colorHex: string;
  readonly seed: number;
}

/**
 * Generates an inward-facing cylindrical horizon ridge silhouette with seamless circular noise.
 */
export function buildRidgeGeometryData(params: RidgeParams): IndexedBufferData {
  const vertexCount = params.segments * 2;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(params.segments * 6);

  const noise = valueNoise2D(params.seed);
  const [cr, cg, cb] = hexToRgb01(params.colorHex);

  for (let seg = 0; seg < params.segments; seg++) {
    const t = seg / params.segments;
    const angle = t * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const x = cosA * params.radius;
    const z = sinA * params.radius;

    const ridgeSample =
      noise(cosA * 2.4 + 4.1, sinA * 2.4 - 1.3) * 0.65 +
      noise(cosA * 5.2 - 2.7, sinA * 5.2 + 3.5) * 0.35;
    const topY = params.baseY + params.height + (ridgeSample - 0.35) * params.amplitude;

    const botIdx = seg;
    const topIdx = params.segments + seg;

    positions[botIdx * 3] = x;
    positions[botIdx * 3 + 1] = params.baseY;
    positions[botIdx * 3 + 2] = z;

    positions[topIdx * 3] = x;
    positions[topIdx * 3 + 1] = topY;
    positions[topIdx * 3 + 2] = z;

    // Subtle vertical shading gradient on the silhouette itself
    colors[botIdx * 3] = cr * 0.85;
    colors[botIdx * 3 + 1] = cg * 0.85;
    colors[botIdx * 3 + 2] = cb * 0.85;

    colors[topIdx * 3] = cr;
    colors[topIdx * 3 + 1] = cg;
    colors[topIdx * 3 + 2] = cb;

    uvs[botIdx * 2] = t;
    uvs[botIdx * 2 + 1] = 0;
    uvs[topIdx * 2] = t;
    uvs[topIdx * 2 + 1] = 1;
  }

  let ptr = 0;
  for (let seg = 0; seg < params.segments; seg++) {
    const nextSeg = (seg + 1) % params.segments;
    const bot0 = seg;
    const bot1 = nextSeg;
    const top0 = params.segments + seg;
    const top1 = params.segments + nextSeg;

    indices[ptr++] = bot0;
    indices[ptr++] = bot1;
    indices[ptr++] = top0;

    indices[ptr++] = bot1;
    indices[ptr++] = top1;
    indices[ptr++] = top0;
  }

  return { positions, colors, uvs, indices };
}
