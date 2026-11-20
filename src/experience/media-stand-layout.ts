import { STAND_DIMENSIONS, type Vector3D } from "./constants";

/**
 * Computes top-right badge coordinates inset cleanly inside the active media plane bounds
 * with positive Z clearance ahead of stereoscopic planes to prevent coplanar Z-fighting.
 */
export function computeVideoBadgePosition(
  mediaWidth: number,
  mediaHeight: number,
): Vector3D {
  const safeW =
    Number.isFinite(mediaWidth) && mediaWidth > 0
      ? mediaWidth
      : STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M;
  const safeH =
    Number.isFinite(mediaHeight) && mediaHeight > 0
      ? mediaHeight
      : STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M;

  const rawX =
    safeW / 2 -
    STAND_DIMENSIONS.VIDEO_BADGE_WIDTH_M / 2 -
    STAND_DIMENSIONS.VIDEO_BADGE_MARGIN_M;
  const rawY =
    safeH / 2 -
    STAND_DIMENSIONS.VIDEO_BADGE_HEIGHT_M / 2 -
    STAND_DIMENSIONS.VIDEO_BADGE_MARGIN_M;

  return {
    x: Number(Math.max(0, rawX).toFixed(3)),
    y: Number(Math.max(0, rawY).toFixed(3)),
    z: STAND_DIMENSIONS.VIDEO_BADGE_Z_OFFSET_M,
  };
}
