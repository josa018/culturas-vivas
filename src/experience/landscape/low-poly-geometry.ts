import { LANDSCAPE_TOKENS } from "../constants";
import { createSeededRandom } from "./seeded-noise";
import type { IndexedBufferData, LandscapeSpeciesKind } from "./types";

export interface MutableGeometryBuffers {
  positions: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
}

export function createBufferAccumulator(): MutableGeometryBuffers {
  return {
    positions: [],
    colors: [],
    uvs: [],
    indices: [],
  };
}

export function pushVertex(
  acc: MutableGeometryBuffers,
  x: number,
  y: number,
  z: number,
  r: number,
  g: number,
  b: number,
  u: number,
  v: number,
): number {
  const index = acc.positions.length / 3;
  acc.positions.push(x, y, z);
  acc.colors.push(r, g, b);
  acc.uvs.push(u, v);
  return index;
}

export function appendCone(
  acc: MutableGeometryBuffers,
  options: {
    baseY: number;
    height: number;
    radius: number;
    segments: number;
    color: readonly [number, number, number];
  },
): void {
  const { baseY, height, radius, segments, color } = options;
  const [cr, cg, cb] = color;
  const ringStart = acc.positions.length / 3;
  for (let s = 0; s < segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    pushVertex(
      acc,
      Math.cos(angle) * radius,
      baseY,
      Math.sin(angle) * radius,
      cr,
      cg,
      cb,
      s / segments,
      0,
    );
  }
  const apexIdx = pushVertex(acc, 0, baseY + height, 0, cr, cg, cb, 0.5, 1);
  const bottomCenterIdx = pushVertex(acc, 0, baseY, 0, cr, cg, cb, 0.5, 0.5);

  for (let s = 0; s < segments; s++) {
    const next = (s + 1) % segments;
    const v0 = ringStart + s;
    const v1 = ringStart + next;
    acc.indices.push(v0, apexIdx, v1);
    acc.indices.push(bottomCenterIdx, v0, v1);
  }
}

export function appendCylinder(
  acc: MutableGeometryBuffers,
  options: {
    baseY: number;
    height: number;
    radiusBottom: number;
    radiusTop: number;
    segments: number;
    colorBottom: readonly [number, number, number];
    colorTop: readonly [number, number, number];
    offsetX?: number;
    offsetZ?: number;
  },
): void {
  const {
    baseY,
    height,
    radiusBottom,
    radiusTop,
    segments,
    colorBottom,
    colorTop,
    offsetX = 0,
    offsetZ = 0,
  } = options;
  const botStart = acc.positions.length / 3;
  for (let s = 0; s < segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    pushVertex(
      acc,
      offsetX + cosA * radiusBottom,
      baseY,
      offsetZ + sinA * radiusBottom,
      colorBottom[0],
      colorBottom[1],
      colorBottom[2],
      s / segments,
      0,
    );
  }
  const topStart = acc.positions.length / 3;
  for (let s = 0; s < segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    pushVertex(
      acc,
      offsetX + cosA * radiusTop,
      baseY + height,
      offsetZ + sinA * radiusTop,
      colorTop[0],
      colorTop[1],
      colorTop[2],
      s / segments,
      1,
    );
  }

  for (let s = 0; s < segments; s++) {
    const next = (s + 1) % segments;
    const b0 = botStart + s;
    const b1 = botStart + next;
    const t0 = topStart + s;
    const t1 = topStart + next;
    acc.indices.push(b0, t0, b1);
    acc.indices.push(t0, t1, b1);
  }
}

export function appendJitteredEllipsoid(
  acc: MutableGeometryBuffers,
  options: {
    centerX: number;
    centerY: number;
    centerZ: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    lonSegments: number;
    latSegments: number;
    jitter: number;
    seed: number;
    color: readonly [number, number, number];
    clampMinYZero?: boolean;
  },
): void {
  const {
    centerX,
    centerY,
    centerZ,
    scaleX,
    scaleY,
    scaleZ,
    lonSegments,
    latSegments,
    jitter,
    seed,
    color,
    clampMinYZero = false,
  } = options;
  const rand = createSeededRandom(seed);
  const [cr, cg, cb] = color;

  const bottomIdx = pushVertex(
    acc,
    centerX,
    clampMinYZero ? Math.max(0, centerY - scaleY) : centerY - scaleY,
    centerZ,
    cr,
    cg,
    cb,
    0.5,
    0,
  );

  const ringStarts: number[] = [];
  for (let lat = 1; lat < latSegments; lat++) {
    const phi = (lat / latSegments) * Math.PI;
    const sinP = Math.sin(phi);
    const cosP = -Math.cos(phi);
    const ringStart = acc.positions.length / 3;
    ringStarts.push(ringStart);

    for (let lon = 0; lon < lonSegments; lon++) {
      const theta = (lon / lonSegments) * Math.PI * 2;
      const radialJitter = 1 + (rand() - 0.5) * 2 * jitter;
      const vx = centerX + Math.cos(theta) * sinP * scaleX * radialJitter;
      let vy = centerY + cosP * scaleY * radialJitter;
      if (clampMinYZero) {
        vy = Math.max(0, vy);
      }
      const vz = centerZ + Math.sin(theta) * sinP * scaleZ * radialJitter;
      pushVertex(
        acc,
        vx,
        vy,
        vz,
        cr,
        cg,
        cb,
        lon / lonSegments,
        lat / latSegments,
      );
    }
  }

  const topIdx = pushVertex(
    acc,
    centerX,
    centerY + scaleY,
    centerZ,
    cr,
    cg,
    cb,
    0.5,
    1,
  );

  const firstRing = ringStarts[0]!;
  for (let lon = 0; lon < lonSegments; lon++) {
    const next = (lon + 1) % lonSegments;
    acc.indices.push(bottomIdx, firstRing + lon, firstRing + next);
  }

  for (let r = 0; r < ringStarts.length - 1; r++) {
    const r0 = ringStarts[r]!;
    const r1 = ringStarts[r + 1]!;
    for (let lon = 0; lon < lonSegments; lon++) {
      const next = (lon + 1) % lonSegments;
      acc.indices.push(r0 + lon, r1 + lon, r0 + next);
      acc.indices.push(r1 + lon, r1 + next, r0 + next);
    }
  }

  const lastRing = ringStarts[ringStarts.length - 1]!;
  for (let lon = 0; lon < lonSegments; lon++) {
    const next = (lon + 1) % lonSegments;
    acc.indices.push(lastRing + lon, topIdx, lastRing + next);
  }
}

function appendAgaveBlade(
  acc: MutableGeometryBuffers,
  angle: number,
  length: number,
  tiltRad: number,
  width: number,
): void {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const perpX = -sinA * width;
  const perpZ = cosA * width;
  const midDist = length * 0.48 * Math.cos(tiltRad);
  const midY = Math.max(0.05, length * 0.48 * Math.sin(tiltRad));
  const tipDist = length * Math.cos(tiltRad * 0.72);
  const tipY = length * Math.sin(tiltRad * 0.72);

  const bL = pushVertex(acc, perpX * 0.5, 0, perpZ * 0.5, 1, 1, 1, 0, 0);
  const bR = pushVertex(acc, -perpX * 0.5, 0, -perpZ * 0.5, 1, 1, 1, 1, 0);
  const mL = pushVertex(
    acc,
    cosA * midDist + perpX,
    midY,
    sinA * midDist + perpZ,
    1,
    1,
    1,
    0,
    0.5,
  );
  const mR = pushVertex(
    acc,
    cosA * midDist - perpX,
    midY,
    sinA * midDist - perpZ,
    1,
    1,
    1,
    1,
    0.5,
  );
  const tip = pushVertex(
    acc,
    cosA * tipDist,
    tipY,
    sinA * tipDist,
    1,
    1,
    1,
    0.5,
    1,
  );

  acc.indices.push(bL, mL, bR);
  acc.indices.push(mL, mR, bR);
  acc.indices.push(mL, tip, mR);
}

export function finalizeWithBaseAO(acc: MutableGeometryBuffers): IndexedBufferData {
  const vertexCount = acc.positions.length / 3;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const y = acc.positions[i * 3 + 1]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(0.001, maxY - minY);
  const baseAO = LANDSCAPE_TOKENS.AO_BASE_BRIGHTNESS;

  const colors = new Float32Array(acc.colors.length);
  for (let i = 0; i < vertexCount; i++) {
    const y = acc.positions[i * 3 + 1]!;
    const t = Math.min(1, Math.max(0, (y - minY) / spanY));
    const ao = baseAO + (1 - baseAO) * t;
    colors[i * 3] = acc.colors[i * 3]! * ao;
    colors[i * 3 + 1] = acc.colors[i * 3 + 1]! * ao;
    colors[i * 3 + 2] = acc.colors[i * 3 + 2]! * ao;
  }

  return {
    positions: new Float32Array(acc.positions),
    colors,
    uvs: new Float32Array(acc.uvs),
    indices: new Uint16Array(acc.indices),
  };
}

/**
 * Generates multi-part faceted low-poly geometry with planar/cylindrical UVs
 * and baked base vertical ambient occlusion for a biome flora/rock species.
 */
export function buildSpeciesGeometryData(
  kind: LandscapeSpeciesKind,
): IndexedBufferData {
  const acc = createBufferAccumulator();

  switch (kind) {
    case "PINE": {
      appendCylinder(acc, {
        baseY: 0,
        height: 0.9,
        radiusBottom: 0.16,
        radiusTop: 0.1,
        segments: 5,
        colorBottom: [1.0, 0.84, 0.68],
        colorTop: [1.0, 0.84, 0.68],
      });
      appendCone(acc, {
        baseY: 0.72,
        height: 1.15,
        radius: 0.92,
        segments: 7,
        color: [0.95, 1.0, 0.95],
      });
      appendCone(acc, {
        baseY: 1.45,
        height: 1.05,
        radius: 0.72,
        segments: 7,
        color: [0.95, 1.0, 0.95],
      });
      appendCone(acc, {
        baseY: 2.1,
        height: 0.95,
        radius: 0.48,
        segments: 7,
        color: [1.0, 1.0, 1.0],
      });
      break;
    }
    case "BROADLEAF": {
      appendCylinder(acc, {
        baseY: 0,
        height: 1.25,
        radiusBottom: 0.18,
        radiusTop: 0.11,
        segments: 5,
        colorBottom: [1.0, 0.84, 0.68],
        colorTop: [1.0, 0.84, 0.68],
      });
      appendJitteredEllipsoid(acc, {
        centerX: 0,
        centerY: 1.85,
        centerZ: 0,
        scaleX: 0.95,
        scaleY: 0.78,
        scaleZ: 0.92,
        lonSegments: 6,
        latSegments: 4,
        jitter: 0.16,
        seed: 31,
        color: [1, 1, 1],
      });
      break;
    }
    case "AGAVE": {
      const bladeCount = 8;
      for (let i = 0; i < bladeCount; i++) {
        const angle = (i / bladeCount) * Math.PI * 2;
        const inner = i % 2 === 0;
        appendAgaveBlade(
          acc,
          angle,
          inner ? 0.95 : 0.78,
          inner ? 0.85 : 0.55,
          0.14,
        );
      }
      break;
    }
    case "NOPAL": {
      appendJitteredEllipsoid(acc, {
        centerX: 0,
        centerY: 0.35,
        centerZ: 0,
        scaleX: 0.32,
        scaleY: 0.36,
        scaleZ: 0.14,
        lonSegments: 5,
        latSegments: 3,
        jitter: 0.08,
        seed: 51,
        color: [1, 1, 1],
        clampMinYZero: true,
      });
      appendJitteredEllipsoid(acc, {
        centerX: -0.22,
        centerY: 0.84,
        centerZ: 0.04,
        scaleX: 0.25,
        scaleY: 0.32,
        scaleZ: 0.11,
        lonSegments: 5,
        latSegments: 3,
        jitter: 0.08,
        seed: 52,
        color: [1, 1, 1],
      });
      appendJitteredEllipsoid(acc, {
        centerX: 0.2,
        centerY: 0.96,
        centerZ: -0.04,
        scaleX: 0.24,
        scaleY: 0.3,
        scaleZ: 0.11,
        lonSegments: 5,
        latSegments: 3,
        jitter: 0.08,
        seed: 53,
        color: [1, 1, 1],
      });
      break;
    }
    case "ROCK": {
      appendJitteredEllipsoid(acc, {
        centerX: 0,
        centerY: 0.35,
        centerZ: 0,
        scaleX: 0.72,
        scaleY: 0.45,
        scaleZ: 0.64,
        lonSegments: 6,
        latSegments: 4,
        jitter: 0.22,
        seed: 71,
        color: [1, 1, 1],
        clampMinYZero: true,
      });
      break;
    }
    case "CANYON_MESA": {
      appendCylinder(acc, {
        baseY: 0,
        height: 1.0,
        radiusBottom: 1.25,
        radiusTop: 1.05,
        segments: 8,
        colorBottom: [1.0, 0.86, 0.74],
        colorTop: [1.0, 0.9, 0.78],
      });
      appendCylinder(acc, {
        baseY: 0.95,
        height: 1.05,
        radiusBottom: 0.96,
        radiusTop: 0.76,
        segments: 8,
        colorBottom: [1.0, 0.92, 0.8],
        colorTop: [1.0, 0.95, 0.85],
        offsetX: 0.08,
        offsetZ: -0.06,
      });
      appendCylinder(acc, {
        baseY: 1.95,
        height: 0.95,
        radiusBottom: 0.68,
        radiusTop: 0.52,
        segments: 8,
        colorBottom: [1.0, 0.96, 0.88],
        colorTop: [1.0, 1.0, 0.94],
        offsetX: -0.05,
        offsetZ: 0.07,
      });
      break;
    }
    case "SHRUB": {
      appendJitteredEllipsoid(acc, {
        centerX: 0,
        centerY: 0.36,
        centerZ: 0,
        scaleX: 0.56,
        scaleY: 0.42,
        scaleZ: 0.52,
        lonSegments: 5,
        latSegments: 3,
        jitter: 0.16,
        seed: 81,
        color: [1, 1, 1],
        clampMinYZero: true,
      });
      appendJitteredEllipsoid(acc, {
        centerX: 0.32,
        centerY: 0.28,
        centerZ: 0.18,
        scaleX: 0.38,
        scaleY: 0.32,
        scaleZ: 0.36,
        lonSegments: 5,
        latSegments: 3,
        jitter: 0.14,
        seed: 82,
        color: [0.96, 1, 0.96],
        clampMinYZero: true,
      });
      appendJitteredEllipsoid(acc, {
        centerX: -0.28,
        centerY: 0.26,
        centerZ: -0.2,
        scaleX: 0.35,
        scaleY: 0.3,
        scaleZ: 0.34,
        lonSegments: 5,
        latSegments: 3,
        jitter: 0.14,
        seed: 83,
        color: [0.94, 1, 0.94],
        clampMinYZero: true,
      });
      break;
    }
    case "GRASS_TUFT": {
      const bladeCount = 6;
      for (let i = 0; i < bladeCount; i++) {
        const angle = (i / bladeCount) * Math.PI * 2 + 0.25;
        appendAgaveBlade(
          acc,
          angle,
          i % 2 === 0 ? 0.54 : 0.42,
          i % 2 === 0 ? 1.05 : 0.78,
          0.075,
        );
      }
      break;
    }
    case "WILDFLOWER": {
      const offsets = [
        [0, 0, 0.42, 0.14],
        [0.18, 0.12, 0.34, 0.12],
        [-0.16, -0.1, 0.37, 0.12],
      ] as const;
      for (let i = 0; i < offsets.length; i++) {
        const [ox, oz, stemH, headR] = offsets[i]!;
        appendCylinder(acc, {
          baseY: 0,
          height: stemH,
          radiusBottom: 0.035,
          radiusTop: 0.025,
          segments: 4,
          colorBottom: [0.84, 1.0, 0.76],
          colorTop: [0.84, 1.0, 0.76],
          offsetX: ox,
          offsetZ: oz,
        });
        appendJitteredEllipsoid(acc, {
          centerX: ox,
          centerY: stemH + headR * 0.55,
          centerZ: oz,
          scaleX: headR,
          scaleY: headR * 0.78,
          scaleZ: headR,
          lonSegments: 5,
          latSegments: 3,
          jitter: 0.12,
          seed: 91 + i,
          color: [1.0, 0.96, 0.82],
        });
      }
      break;
    }
    case "CLOUD": {
      appendJitteredEllipsoid(acc, {
        centerX: 0,
        centerY: 0.55,
        centerZ: 0,
        scaleX: 2.1,
        scaleY: 0.72,
        scaleZ: 1.25,
        lonSegments: 6,
        latSegments: 3,
        jitter: 0.1,
        seed: 111,
        color: [1, 1, 1],
        clampMinYZero: true,
      });
      appendJitteredEllipsoid(acc, {
        centerX: -1.35,
        centerY: 0.44,
        centerZ: 0.12,
        scaleX: 1.25,
        scaleY: 0.54,
        scaleZ: 0.95,
        lonSegments: 5,
        latSegments: 3,
        jitter: 0.1,
        seed: 112,
        color: [0.98, 0.98, 1],
        clampMinYZero: true,
      });
      appendJitteredEllipsoid(acc, {
        centerX: 1.4,
        centerY: 0.46,
        centerZ: -0.1,
        scaleX: 1.3,
        scaleY: 0.56,
        scaleZ: 0.96,
        lonSegments: 5,
        latSegments: 3,
        jitter: 0.1,
        seed: 113,
        color: [0.98, 0.98, 1],
        clampMinYZero: true,
      });
      break;
    }
  }

  return finalizeWithBaseAO(acc);
}
