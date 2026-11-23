import { describe, expect, it } from "vitest";
import { computeRigTargetYawRad } from "../../src/experience/camera-orientation";
import { RoomId } from "../../src/experience/types";
import { ViewMode } from "../../src/navigation/types";

describe("computeRigTargetYawRad pure domain seam", () => {
  it("orients #cv-camera-rig to 180 deg (Math.PI rad) and resets local yaw on first Lobby arrival", () => {
    const vrEntry = computeRigTargetYawRad({
      targetRoomId: RoomId.LOBBY,
      sourceRoomId: null,
      hasVisitedLobby: false,
      viewMode: ViewMode.VR,
      currentCameraLocalYawRad: 0.42,
    });
    expect(vrEntry.rigYawRad).toBeCloseTo(Math.PI, 6);
    expect(vrEntry.resetLocalLookControls).toBe(true);

    const touchEntry = computeRigTargetYawRad({
      targetRoomId: RoomId.LOBBY,
      sourceRoomId: null,
      hasVisitedLobby: false,
      viewMode: ViewMode.TOUCH_2D,
      currentCameraLocalYawRad: -0.3,
    });
    expect(touchEntry.rigYawRad).toBeCloseTo(Math.PI, 6);
    expect(touchEntry.resetLocalLookControls).toBe(true);
  });

  it("compensates local HMD yaw when returning to Lobby in VR so world gaze faces portals (0 rad)", () => {
    const result = computeRigTargetYawRad({
      targetRoomId: RoomId.LOBBY,
      sourceRoomId: RoomId.WIXARIKA,
      hasVisitedLobby: true,
      viewMode: ViewMode.VR,
      currentCameraLocalYawRad: Math.PI / 4,
    });
    expect(result.rigYawRad).toBeCloseTo(-Math.PI / 4, 6);
    expect(result.resetLocalLookControls).toBe(false);
  });

  it("zeroes rig and look-controls yaw when returning to Lobby in 2D touch mode", () => {
    const result = computeRigTargetYawRad({
      targetRoomId: RoomId.LOBBY,
      sourceRoomId: RoomId.NAAYERI,
      hasVisitedLobby: true,
      viewMode: ViewMode.TOUCH_2D,
      currentCameraLocalYawRad: 1.15,
    });
    expect(result.rigYawRad).toBe(0);
    expect(result.resetLocalLookControls).toBe(true);
  });

  it("leaves rig orientation untouched when navigating into cultural rooms", () => {
    const result = computeRigTargetYawRad({
      targetRoomId: RoomId.WIXARIKA,
      sourceRoomId: RoomId.LOBBY,
      hasVisitedLobby: true,
      viewMode: ViewMode.VR,
      currentCameraLocalYawRad: 0.6,
    });
    expect(result.rigYawRad).toBeNull();
    expect(result.resetLocalLookControls).toBe(false);
  });
});
