import { ViewMode } from "../navigation/types";

export const StereoEye = {
  LEFT: "LEFT",
  RIGHT: "RIGHT",
  MONO: "MONO",
} as const;
export type StereoEye = (typeof StereoEye)[keyof typeof StereoEye];

export interface UVBounds {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
  readonly uOffset: number;
  readonly uRepeat: number;
  readonly vOffset: number;
  readonly vRepeat: number;
}

export class StereoTextureMapper {
  /**
   * Three.js standard camera layer indices:
   * 0 = default (visible to both eyes or 2D camera)
   * 1 = left eye in WebXR
   * 2 = right eye in WebXR
   */
  public static readonly THREE_LAYER_DEFAULT = 0;
  public static readonly THREE_LAYER_LEFT = 1;
  public static readonly THREE_LAYER_RIGHT = 2;

  public static getUVBounds(eye: StereoEye, isHalfSBS: boolean): UVBounds {
    if (!isHalfSBS) {
      return {
        uMin: 0.0,
        uMax: 1.0,
        vMin: 0.0,
        vMax: 1.0,
        uOffset: 0.0,
        uRepeat: 1.0,
        vOffset: 0.0,
        vRepeat: 1.0,
      };
    }

    if (eye === StereoEye.RIGHT) {
      return {
        uMin: 0.5,
        uMax: 1.0,
        vMin: 0.0,
        vMax: 1.0,
        uOffset: 0.5,
        uRepeat: 0.5,
        vOffset: 0.0,
        vRepeat: 1.0,
      };
    }

    // Default left eye or monoscopic 2D fallback for SBS media
    return {
      uMin: 0.0,
      uMax: 0.5,
      vMin: 0.0,
      vMax: 1.0,
      uOffset: 0.0,
      uRepeat: 0.5,
      vOffset: 0.0,
      vRepeat: 1.0,
    };
  }

  public static getEyeLayer(eye: StereoEye): number {
    switch (eye) {
      case StereoEye.LEFT:
        return this.THREE_LAYER_LEFT;
      case StereoEye.RIGHT:
        return this.THREE_LAYER_RIGHT;
      case StereoEye.MONO:
      default:
        return this.THREE_LAYER_DEFAULT;
    }
  }

  public static resolveEffectiveEye(
    viewMode: ViewMode | null | undefined,
    eye: StereoEye,
  ): StereoEye {
    if (viewMode === ViewMode.VR) {
      return eye;
    }
    // In Touch 2D mode or unassigned session, SBS media always collapses to monoscopic LEFT crop
    return StereoEye.MONO;
  }

  /**
   * Transforms raw 2D UV coordinate buffer according to UV bounds without external Three.js dependencies.
   */
  public static remapUVCoordinates(
    rawUVs: readonly number[],
    bounds: UVBounds,
  ): number[] {
    const remapped: number[] = new Array(rawUVs.length);
    for (let i = 0; i < rawUVs.length; i += 2) {
      const u = rawUVs[i];
      const v = rawUVs[i + 1];
      remapped[i] = bounds.uOffset + u * bounds.uRepeat;
      remapped[i + 1] = bounds.vOffset + v * bounds.vRepeat;
    }
    return remapped;
  }
}
