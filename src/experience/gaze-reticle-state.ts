import { ViewMode } from "../navigation/types";
import { RETICLE_TOKENS } from "./constants";

export type ReticleVisibilityMode = "HIDDEN" | "ACTIVE" | "GUIDE" | "CINEMA_HIDDEN";

export interface ReticleDepthTransform {
  readonly depthM: number;
  readonly z: number;
  readonly scale: number;
}

export interface ReticleVisibilityInput {
  readonly viewMode: string | ViewMode | null | undefined;
  readonly isInspecting: boolean;
  readonly hasClickableHit: boolean;
  readonly hasWakeZoneHit: boolean;
  readonly isFusing: boolean;
  readonly nonInteractiveSinceMs: number | null;
  readonly nowMs: number;
}

export interface GazeReticleState {
  readonly isFusing: boolean;
  readonly fuseStartMs: number;
  readonly lastProgress: number;
}

/**
 * Computes normalized gaze-fuse progress in [0, 1].
 */
export function computeReticleProgress(
  elapsedMs: number,
  fuseTimeoutMs: number,
): number {
  if (!Number.isFinite(fuseTimeoutMs) || fuseTimeoutMs <= 0) {
    return 1;
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }
  return Math.min(1, elapsedMs / fuseTimeoutMs);
}

export function createInitialGazeReticleState(): GazeReticleState {
  return {
    isFusing: false,
    fuseStartMs: 0,
    lastProgress: 0,
  };
}

export function startGazeReticleFuse(nowMs: number): GazeReticleState {
  return {
    isFusing: true,
    fuseStartMs: nowMs,
    lastProgress: 0,
  };
}

export function resetGazeReticleFuse(): GazeReticleState {
  return {
    isFusing: false,
    fuseStartMs: 0,
    lastProgress: 0,
  };
}

export function computeThetaLengthDeg(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return Number((clamped * RETICLE_TOKENS.FULL_CIRCLE_DEG).toFixed(1));
}

/**
 * Computes surface-conforming reticle depth, negative camera-space Z offset,
 * and constant-angular-size scale factor for comfortable stereoscopic vergence.
 */
export function computeReticleDepthTransform(
  hitDistanceM: number | null,
): ReticleDepthTransform {
  const rawDepthM =
    hitDistanceM !== null && Number.isFinite(hitDistanceM) && hitDistanceM > 0
      ? hitDistanceM - RETICLE_TOKENS.SURFACE_BIAS_M
      : RETICLE_TOKENS.REST_DEPTH_M;
  const clampedDepthM = Math.min(
    RETICLE_TOKENS.MAX_DEPTH_M,
    Math.max(RETICLE_TOKENS.MIN_DEPTH_M, rawDepthM),
  );
  const depthM = Number(clampedDepthM.toFixed(4));
  const z = Number((-depthM).toFixed(4));
  const scale = Number((depthM / RETICLE_TOKENS.REFERENCE_DEPTH_M).toFixed(4));
  return { depthM, z, scale };
}

/**
 * Resolves reticle visibility according to active view mode and Cinema Mode rules.
 */
export function evaluateReticleVisibilityMode(
  input: ReticleVisibilityInput,
): ReticleVisibilityMode {
  if (input.viewMode !== ViewMode.VR) {
    return "HIDDEN";
  }
  if (!input.isInspecting || input.hasClickableHit || input.isFusing) {
    return "ACTIVE";
  }
  if (input.hasWakeZoneHit) {
    return "GUIDE";
  }
  if (
    input.nonInteractiveSinceMs !== null &&
    input.nowMs - input.nonInteractiveSinceMs >= RETICLE_TOKENS.CINEMA_HIDE_DELAY_MS
  ) {
    return "CINEMA_HIDDEN";
  }
  return "GUIDE";
}
