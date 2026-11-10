import { CAMERA_STABILIZER_CONSTANTS } from "../constants";

export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export class CameraStabilizerMath {
  public static computeAlpha(
    deltaSeconds: number,
    lambda: number = CAMERA_STABILIZER_CONSTANTS.LAMBDA,
  ): number {
    if (deltaSeconds <= 0) {
      return 0;
    }
    return 1 - Math.exp(-lambda * deltaSeconds);
  }

  public static computeAngularDistance(
    q1: QuaternionLike,
    q2: QuaternionLike,
  ): number {
    const dot = Math.abs(
      q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w,
    );
    const clamped = Math.min(1.0, Math.max(0.0, dot));
    return 2 * Math.acos(clamped);
  }

  public static slerp(
    current: QuaternionLike,
    target: QuaternionLike,
    t: number,
  ): QuaternionLike {
    if (t <= 0) {
      return { ...current };
    }
    if (t >= 1) {
      return { ...target };
    }

    let dot =
      current.x * target.x +
      current.y * target.y +
      current.z * target.z +
      current.w * target.w;

    let targetX = target.x;
    let targetY = target.y;
    let targetZ = target.z;
    let targetW = target.w;

    // Flip sign to take the shortest path on the 4D hypersphere
    if (dot < 0) {
      dot = -dot;
      targetX = -targetX;
      targetY = -targetY;
      targetZ = -targetZ;
      targetW = -targetW;
    }

    const clampedDot = Math.min(1.0, Math.max(-1.0, dot));
    const EPSILON = 0.9995;

    // Linear fallback if quaternions are virtually identical
    if (clampedDot > EPSILON) {
      const x = current.x + t * (targetX - current.x);
      const y = current.y + t * (targetY - current.y);
      const z = current.z + t * (targetZ - current.z);
      const w = current.w + t * (targetW - current.w);
      const len = Math.hypot(x, y, z, w) || 1;
      return { x: x / len, y: y / len, z: z / len, w: w / len };
    }

    const theta0 = Math.acos(clampedDot);
    const theta = theta0 * t;
    const sinTheta0 = Math.sin(theta0);
    const sinTheta = Math.sin(theta);

    const s0 = Math.cos(theta) - (clampedDot * sinTheta) / sinTheta0;
    const s1 = sinTheta / sinTheta0;

    return {
      x: s0 * current.x + s1 * targetX,
      y: s0 * current.y + s1 * targetY,
      z: s0 * current.z + s1 * targetZ,
      w: s0 * current.w + s1 * targetW,
    };
  }

  public static filterOrientation(
    current: QuaternionLike,
    target: QuaternionLike,
    deltaSeconds: number,
    lambda: number = CAMERA_STABILIZER_CONSTANTS.LAMBDA,
    noiseThreshold: number = CAMERA_STABILIZER_CONSTANTS.NOISE_THRESHOLD_RAD,
    bypassThreshold: number = CAMERA_STABILIZER_CONSTANTS.BYPASS_THRESHOLD_RAD,
  ): QuaternionLike {
    const angularDist = this.computeAngularDistance(current, target);

    // If completely past bypass threshold (rapid deliberate head turn), bypass damping
    if (angularDist >= bypassThreshold) {
      return { ...target };
    }

    const baseAlpha = this.computeAlpha(deltaSeconds, lambda);

    // Within micro-noise band, apply pure stabilized exponential decay
    if (angularDist <= noiseThreshold) {
      return this.slerp(current, target, baseAlpha);
    }

    // Dynamic blend between stabilized alpha and full bypass (1.0)
    const factor =
      (angularDist - noiseThreshold) / (bypassThreshold - noiseThreshold);
    const effectiveAlpha = baseAlpha + factor * (1.0 - baseAlpha);

    return this.slerp(current, target, effectiveAlpha);
  }
}
