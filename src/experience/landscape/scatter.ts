import {
  ENVIRONMENT_BUDGET_TOKENS,
  LANDSCAPE_TOKENS,
} from "../constants";
import type { BiomeSpeciesSpec } from "./biome-catalog";
import { createSeededRandom } from "./seeded-noise";

export interface ScatteredInstance {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly scale: number;
  readonly tintFactor: number;
}

export interface OccupiedFootprint {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

function clampOutsideWalkwayCorridors(
  angleRad: number,
  walkwayCount: number,
  halfCorridorRad: number,
  edgeSpreadRad: number,
): number {
  const step = (Math.PI * 2) / walkwayCount;
  for (let i = 0; i < walkwayCount; i++) {
    const axis = i * step;
    const diff = Math.atan2(Math.sin(angleRad - axis), Math.cos(angleRad - axis));
    if (Math.abs(diff) < halfCorridorRad) {
      const sign = diff >= 0 ? 1 : -1;
      return axis + sign * (halfCorridorRad + 0.02 + edgeSpreadRad);
    }
  }
  return angleRad;
}

function computeMinimumClearance(
  x: number,
  z: number,
  radius: number,
  occupied: readonly OccupiedFootprint[],
): number {
  let minClearance = Infinity;
  for (let i = 0; i < occupied.length; i++) {
    const other = occupied[i]!;
    const clearance = Math.hypot(x - other.x, z - other.z) - (radius + other.radius);
    if (clearance < minClearance) {
      minClearance = clearance;
    }
  }
  return minClearance;
}

/**
 * Generates deterministic flora placement transforms outside radial walkway sightline corridors
 * while rejecting overlaps against already-placed footprints.
 */
export function scatterSpecies(
  spec: BiomeSpeciesSpec,
  seed: number,
  heightSampler: (x: number, z: number) => number,
  walkwayCount: number = ENVIRONMENT_BUDGET_TOKENS.WALKWAY_COUNT,
  occupiedFootprints: OccupiedFootprint[] = [],
  footprintRadiusM: number = LANDSCAPE_TOKENS.SPECIES_FOOTPRINT_RADIUS_M[spec.kind],
): readonly ScatteredInstance[] {
  const rand = createSeededRandom(seed);
  const placements: ScatteredInstance[] = [];
  const halfCorridor = LANDSCAPE_TOKENS.WALKWAY_CORRIDOR_HALF_ANGLE_RAD;
  const spread = LANDSCAPE_TOKENS.FLORA_TINT_SPREAD;
  const maxAttempts = LANDSCAPE_TOKENS.SCATTER_MAX_ATTEMPTS;

  for (let i = 0; i < spec.count; i++) {
    const rotY = rand() * Math.PI * 2;
    const scale =
      spec.minScale + (spec.maxScale - spec.minScale) * rand();
    const tintFactor = 1 + (rand() * 2 - 1) * spread;
    const myRadius = footprintRadiusM * scale;

    let bestCandidate: ScatteredInstance | null = null;
    let bestClearance = -Infinity;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const systematic = attempt >= 48;
      const rawAngle = systematic
        ? ((attempt - 48) * 2.399963 + i * 0.75 + rand() * 0.15) % (Math.PI * 2)
        : attempt === 0
          ? ((i + rand() * 0.85) / spec.count) * Math.PI * 2
          : rand() * Math.PI * 2;
      const angle = clampOutsideWalkwayCorridors(
        rawAngle,
        walkwayCount,
        halfCorridor,
        rand() * 0.12,
      );
      const radialT = systematic ? ((attempt - 48 + 0.5) / (maxAttempts - 48)) : rand();
      const rMinSq = spec.innerRadiusM * spec.innerRadiusM;
      const rMaxSq = spec.outerRadiusM * spec.outerRadiusM;
      const r = Math.sqrt(rMinSq + (rMaxSq - rMinSq) * radialT);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const clearance = computeMinimumClearance(x, z, myRadius, occupiedFootprints);

      const candidate: ScatteredInstance = {
        x,
        y: heightSampler(x, z),
        z,
        rotY,
        scale,
        tintFactor,
      };

      if (clearance >= 0) {
        bestCandidate = candidate;
        break;
      }

      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestCandidate = candidate;
      }
    }

    const chosen = bestCandidate!;
    occupiedFootprints.push({
      x: chosen.x,
      z: chosen.z,
      radius: myRadius,
    });
    placements.push(chosen);
  }

  return placements;
}
