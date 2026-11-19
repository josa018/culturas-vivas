import { STAND_DIMENSIONS } from "./constants";

/**
 * Width and height in meters inside the 3D stand viewport.
 */
export interface ContainDimensions {
  readonly width: number;
  readonly height: number;
}

const DIMENSION_DECIMAL_PRECISION = 1000;

function roundToMillimeters(value: number): number {
  return Math.round(value * DIMENSION_DECIMAL_PRECISION) / DIMENSION_DECIMAL_PRECISION;
}

/**
 * Scales natural asset dimensions proportionally inside max bounds using CSS "contain" math.
 */
export function computeContainDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number = STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
  maxHeight: number = STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
): ContainDimensions {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return {
      width: roundToMillimeters(maxWidth),
      height: roundToMillimeters(maxHeight),
    };
  }

  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
  return {
    width: roundToMillimeters(naturalWidth * scale),
    height: roundToMillimeters(naturalHeight * scale),
  };
}
