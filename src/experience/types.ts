import type { ExhibitItemConfig, Vector3D } from "./constants";

export const RoomId = {
  ARCHAEOLOGY: "ARCHAEOLOGY",
  TEXTILES: "TEXTILES",
} as const;
export type RoomId = (typeof RoomId)[keyof typeof RoomId];

export const RoomTransitionState = {
  IDLE: "IDLE",
  FADING_OUT: "FADING_OUT",
  SWAPPING_ROOM: "SWAPPING_ROOM",
  FADING_IN: "FADING_IN",
} as const;
export type RoomTransitionState =
  (typeof RoomTransitionState)[keyof typeof RoomTransitionState];

export interface RoomPortalConfig {
  readonly id: string;
  readonly targetRoomId: RoomId;
  readonly title: string;
  readonly position: Vector3D;
  readonly rotation: Vector3D;
}

export interface RoomDefinition {
  readonly id: RoomId;
  readonly title: string;
  readonly skyboxAssetId: string;
  readonly skyboxUrl: string;
  readonly exhibits: readonly ExhibitItemConfig[];
  readonly portals: readonly RoomPortalConfig[];
}

export type RoomTransitionListener = (
  state: RoomTransitionState,
  activeRoomId: RoomId,
  targetRoomId: RoomId | null,
) => void;
