import type { ExhibitItemConfig, Vector3D } from "./constants";
import { RoomEnvironmentId, RoomId, StandId } from "../shared/room-catalog";

export { RoomEnvironmentId, RoomId, StandId };

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
  readonly accentColor?: string;
}

export interface RoomStandSlotConfig {
  readonly id: string;
  readonly roomId: RoomId;
  readonly standId: StandId;
  readonly label: string;
  readonly position: Vector3D;
  readonly rotation: Vector3D;
}

export interface RoomDefinition {
  readonly id: RoomId;
  readonly title: string;
  readonly environmentPresetId: RoomEnvironmentId;
  readonly accentColor: string;
  readonly exhibits: readonly ExhibitItemConfig[];
  readonly stands: readonly RoomStandSlotConfig[];
  readonly portals: readonly RoomPortalConfig[];
}

export type RoomTransitionListener = (
  state: RoomTransitionState,
  activeRoomId: RoomId,
  targetRoomId: RoomId | null,
) => void;
