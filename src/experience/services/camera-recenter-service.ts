import { CAMERA_RECENTER_EVENT } from "../constants";

export interface RecenterOptions {
  readonly targetAzimuthRad?: number;
  readonly durationMs?: number;
  readonly onComplete?: () => void;
}

export class CameraRecenterService {
  private static instance: CameraRecenterService | null = null;
  private currentYawOffsetRad: number = 0;

  public static getInstance(): CameraRecenterService {
    if (!CameraRecenterService.instance) {
      CameraRecenterService.instance = new CameraRecenterService();
    }
    return CameraRecenterService.instance;
  }

  public static resetInstance(): void {
    CameraRecenterService.instance = null;
  }

  public getYawOffsetRad(): number {
    return this.currentYawOffsetRad;
  }

  public setYawOffsetRad(yawRad: number): void {
    this.currentYawOffsetRad = this.normalizeAngle(yawRad);
  }

  public normalizeAngle(rad: number): number {
    let angle = rad % (2 * Math.PI);
    if (angle > Math.PI) {
      angle -= 2 * Math.PI;
    } else if (angle < -Math.PI) {
      angle += 2 * Math.PI;
    }
    return angle;
  }

  /**
   * Calculates the delta yaw required to align currentCameraYaw with targetAzimuth.
   * Target defaults to 0 radians (forward along -Z axis).
   */
  public calculateDeltaYaw(
    currentCameraYawRad: number,
    targetAzimuthRad: number = 0,
  ): number {
    return this.normalizeAngle(targetAzimuthRad - currentCameraYawRad);
  }

  /**
   * Triggers camera recentering on an A-Frame camera rig or dispatching a global event.
   */
  public recenter(
    cameraEl?: HTMLElement | null,
    rigEl?: HTMLElement | null,
    options?: RecenterOptions,
  ): number {
    const target = options?.targetAzimuthRad ?? 0;

    let currentYaw = 0;
    if (cameraEl) {
      const aframeCamera = cameraEl as unknown as {
        object3D?: {
          rotation?: { y: number };
          getWorldDirection?: (v: { x: number; y: number; z: number }) => void;
        };
      };
      if (aframeCamera.object3D?.rotation) {
        currentYaw = aframeCamera.object3D.rotation.y;
      }
    }

    const deltaYaw = this.calculateDeltaYaw(currentYaw, target);
    this.currentYawOffsetRad = this.normalizeAngle(this.currentYawOffsetRad + deltaYaw);

    if (rigEl) {
      const aframeRig = rigEl as unknown as {
        object3D?: {
          rotation?: { y: number };
        };
      };
      if (aframeRig.object3D?.rotation) {
        aframeRig.object3D.rotation.y = this.currentYawOffsetRad;
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(CAMERA_RECENTER_EVENT, {
          detail: {
            yawOffsetRad: this.currentYawOffsetRad,
            deltaYawRad: deltaYaw,
            targetAzimuthRad: target,
          },
        }),
      );
    }

    if (options?.onComplete) {
      options.onComplete();
    }

    return this.currentYawOffsetRad;
  }
}
