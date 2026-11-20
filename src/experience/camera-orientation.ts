import { ViewMode } from "../navigation/types";
import { RoomId } from "./types";

export const LOBBY_ENTRY_YAW_RAD = Math.PI;

export interface CameraOrientationInput {
  readonly targetRoomId: RoomId;
  readonly sourceRoomId: RoomId | null;
  readonly hasVisitedLobby: boolean;
  readonly viewMode: ViewMode;
  readonly currentCameraLocalYawRad: number;
}

export interface CameraOrientationResult {
  readonly rigYawRad: number | null;
  readonly resetLocalLookControls: boolean;
}

/**
 * Pure domain seam resolving target #cv-camera-rig Y-rotation and local look-controls
 * reset policy across initial Lobby spawns and subsequent room returns.
 */
export function computeRigTargetYawRad(
  input: CameraOrientationInput,
): CameraOrientationResult {
  if (input.targetRoomId !== RoomId.LOBBY) {
    return { rigYawRad: null, resetLocalLookControls: false };
  }

  // First arrival faces +Z (180 deg) toward Bienvenida (-145 deg) and Nayarit (+145 deg) stands
  if (!input.hasVisitedLobby) {
    return { rigYawRad: LOBBY_ENTRY_YAW_RAD, resetLocalLookControls: true };
  }

  // Returning to Lobby from another room aligns gaze toward 0 deg (-Z) cultural portals
  if (input.viewMode === ViewMode.VR) {
    const yawCompensation = -input.currentCameraLocalYawRad;
    return {
      rigYawRad: yawCompensation === 0 ? 0 : yawCompensation,
      resetLocalLookControls: false,
    };
  }

  return { rigYawRad: 0, resetLocalLookControls: true };
}
