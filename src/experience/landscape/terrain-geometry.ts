import { hexToRgb01, mixHexColors } from "./color-math";
import { valueNoise2D } from "./seeded-noise";
import type { IndexedBufferData } from "./types";

export interface TerrainParams {
  readonly innerRadiusM: number;
  readonly outerRadiusM: number;
  readonly rings: number;
  readonly segments: number;
  readonly flatY: number;
  readonly maxHeightM: number;
  readonly groundLowColor: string;
  readonly groundHighColor: string;
  readonly groundTileM: number;
  readonly seed: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (span <= 0) {
    return x >= edge1 ? 1 : 0;
  }
  const t = Math.min(1, Math.max(0, (x - edge0) / span));
  return t * t * (3 - 2 * t);
}

/**
 * Samples deterministic valley elevation at world (x, z), keeping the inner
 * pavilion and water basin flat at `params.flatY` for r <= innerRadiusM.
 */
export function sampleTerrainHeight(
  params: TerrainParams,
  x: number,
  z: number,
): number {
  const r = Math.hypot(x, z);
  if (r <= params.innerRadiusM) {
    return params.flatY;
  }
  const slope = smoothstep(params.innerRadiusM, params.outerRadiusM, r);
  const sampleNoise = valueNoise2D(params.seed);
  const fbm =
    sampleNoise(x * 0.14 + 3.1, z * 0.14 - 1.7) * 0.7 +
    sampleNoise(x * 0.31 - 5.3, z * 0.31 + 2.9) * 0.3;
  return params.flatY + slope * params.maxHeightM * (0.45 + 0.55 * fbm);
}

/**
 * Generates radial indexed terrain buffers with elevation-based vertex colors and planar UVs.
 */
export function buildTerrainGeometryData(params: TerrainParams): IndexedBufferData {
  const ringVertices = params.rings + 1;
  const vertexCount = ringVertices * params.segments;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(params.rings * params.segments * 6);

  const colorNoise = valueNoise2D(params.seed + 71);
  const maxHeightSpan = Math.max(0.01, params.maxHeightM);

  for (let ring = 0; ring <= params.rings; ring++) {
    let radius = 0;
    if (ring === 1) {
      radius = params.innerRadiusM;
    } else if (ring > 1) {
      const t = (ring - 1) / Math.max(1, params.rings - 1);
      radius = params.innerRadiusM + (params.outerRadiusM - params.innerRadiusM) * t;
    }

    for (let seg = 0; seg < params.segments; seg++) {
      const angle = (seg / params.segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = sampleTerrainHeight(params, x, z);

      const vIdx = ring * params.segments + seg;
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      uvs[vIdx * 2] = x / params.groundTileM;
      uvs[vIdx * 2 + 1] = z / params.groundTileM;

      const elevNorm = Math.min(1, Math.max(0, (y - params.flatY) / maxHeightSpan));
      const jitter = (colorNoise(x * 0.28, z * 0.28) - 0.5) * 0.22;
      const colorMix = Math.min(1, Math.max(0, elevNorm + jitter));
      const hex = mixHexColors(params.groundLowColor, params.groundHighColor, colorMix);
      const [cr, cg, cb] = hexToRgb01(hex);
      colors[vIdx * 3] = cr;
      colors[vIdx * 3 + 1] = cg;
      colors[vIdx * 3 + 2] = cb;
    }
  }

  let ptr = 0;
  for (let ring = 0; ring < params.rings; ring++) {
    const rowA = ring * params.segments;
    const rowB = (ring + 1) * params.segments;
    for (let seg = 0; seg < params.segments; seg++) {
      const nextSeg = (seg + 1) % params.segments;
      const a = rowA + seg;
      const b = rowA + nextSeg;
      const c = rowB + seg;
      const d = rowB + nextSeg;

      indices[ptr++] = a;
      indices[ptr++] = b;
      indices[ptr++] = c;

      indices[ptr++] = b;
      indices[ptr++] = d;
      indices[ptr++] = c;
    }
  }

  return { positions, colors, uvs, indices };
}
