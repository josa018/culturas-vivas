import { RENDERER_QUALITY_TOKENS } from "./constants";

const MOBILE_USER_AGENT_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

/**
 * Clamps device pixel ratio to protect mobile stereo WebXR fill rate
 * when hardware MSAA is enabled.
 */
export function computeClampedPixelRatio(
  devicePixelRatio: number,
  isMobile: boolean,
): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    return RENDERER_QUALITY_TOKENS.MIN_PIXEL_RATIO;
  }
  const maxDpr = isMobile
    ? RENDERER_QUALITY_TOKENS.MOBILE_MAX_PIXEL_RATIO
    : RENDERER_QUALITY_TOKENS.DESKTOP_MAX_PIXEL_RATIO;
  return Math.max(
    RENDERER_QUALITY_TOKENS.MIN_PIXEL_RATIO,
    Math.min(devicePixelRatio, maxDpr),
  );
}

/**
 * Detects mobile browsers from a user-agent string.
 */
export function isMobileUserAgent(userAgent?: string): boolean {
  const ua =
    userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return MOBILE_USER_AGENT_PATTERN.test(ua);
}
