import type { Vector3D } from "./constants";

export interface ModelNormalizationTransform {
  readonly scale: number;
  readonly offset: Vector3D;
}

function normalizeZero(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Computes uniform scale and grounding translation offset so an arbitrary
 * 3D mesh bounding box fits within `maxExtentM` centered at (x=0, z=0) with minY at y=0.
 */
export function computeModelNormalizationTransform(
  boundsMin: Vector3D,
  boundsMax: Vector3D,
  maxExtentM: number,
): ModelNormalizationTransform {
  const sizeX = boundsMax.x - boundsMin.x;
  const sizeY = boundsMax.y - boundsMin.y;
  const sizeZ = boundsMax.z - boundsMin.z;
  const largestDimension = Math.max(sizeX, sizeY, sizeZ);

  if (
    !Number.isFinite(largestDimension) ||
    largestDimension <= 0 ||
    !Number.isFinite(maxExtentM) ||
    maxExtentM <= 0
  ) {
    return {
      scale: 1,
      offset: { x: 0, y: 0, z: 0 },
    };
  }

  const scale = maxExtentM / largestDimension;
  const centerX = (boundsMin.x + boundsMax.x) / 2;
  const centerZ = (boundsMin.z + boundsMax.z) / 2;

  return {
    scale: normalizeZero(scale),
    offset: {
      x: normalizeZero(-centerX * scale),
      y: normalizeZero(-boundsMin.y * scale),
      z: normalizeZero(-centerZ * scale),
    },
  };
}
