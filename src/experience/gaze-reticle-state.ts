import { RETICLE_TOKENS } from "./constants";

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
