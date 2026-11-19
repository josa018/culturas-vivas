import type { RoomId, StandId } from "../shared/room-catalog";
import { ExhibitMediaType } from "./constants";

/**
 * Stand media modalities (excludes 3D models, which mount on dedicated pedestals).
 */
export type StandMediaType =
  | typeof ExhibitMediaType.IMAGE_2D
  | typeof ExhibitMediaType.IMAGE_STEREO_SBS
  | typeof ExhibitMediaType.VIDEO_2D
  | typeof ExhibitMediaType.VIDEO_STEREO_SBS;

/**
 * Immutable catalog record for one multimedia item assigned to a cultural stand.
 */
export interface StandMediaItem {
  readonly id: string;
  readonly roomId: RoomId;
  readonly standId: StandId;
  readonly mediaType: StandMediaType;
  readonly title: string;
  readonly creatorName: string;
  readonly description: string;
  readonly mediaUrl: string;
  readonly posterUrl?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sortOrder: number;
}

/**
 * Read-only seam providing ordered multimedia collections per (room, stand).
 */
export interface RoomMediaProvider {
  getStandItems(roomId: RoomId, standId: StandId): readonly StandMediaItem[];
}

/**
 * Default placeholder provider returning empty stand collections until backed by remote catalog.
 */
export class EmptyRoomMediaProvider implements RoomMediaProvider {
  public getStandItems(_roomId: RoomId, _standId: StandId): readonly StandMediaItem[] {
    return [];
  }
}

export const emptyRoomMediaProvider: RoomMediaProvider = new EmptyRoomMediaProvider();

export function isVideoMediaType(mediaType: ExhibitMediaType): boolean {
  return (
    mediaType === ExhibitMediaType.VIDEO_2D ||
    mediaType === ExhibitMediaType.VIDEO_STEREO_SBS
  );
}

export function isHalfSbsMediaType(mediaType: ExhibitMediaType): boolean {
  return (
    mediaType === ExhibitMediaType.IMAGE_STEREO_SBS ||
    mediaType === ExhibitMediaType.VIDEO_STEREO_SBS
  );
}
