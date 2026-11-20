import { ROOM_PORTAL_ACCENTS, RoomEnvironmentId, RoomId } from "../shared/room-catalog";
import type { ProceduralTextureKind } from "./procedural-textures";

export type RoomLandscapeTheme =
  | "atrium"
  | "sierra"
  | "canyon"
  | "forest"
  | "highland";

export interface RoomEnvironmentPreset {
  readonly id: RoomEnvironmentId;
  readonly roomId: RoomId;
  readonly accentColor: string;
  readonly landscapeTheme: RoomLandscapeTheme;
  readonly skyGradient: {
    readonly topColor: string;
    readonly horizonColor: string;
    readonly bottomColor: string;
  };
  readonly fog: {
    readonly color: string;
    readonly near: number;
    readonly far: number;
  };
  readonly lighting: {
    readonly directionalColor: string;
    readonly directionalIntensity: number;
    readonly directionalPosition: readonly [number, number, number];
    readonly hemisphereSkyColor: string;
    readonly hemisphereGroundColor: string;
    readonly hemisphereIntensity: number;
  };
  readonly floorColor: string;
  readonly floorTexture: ProceduralTextureKind;
  readonly columnColor: string;
  readonly columnTexture: ProceduralTextureKind;
  readonly outerGroundColor: string;
  readonly propPrimaryColor: string;
  readonly propSecondaryColor: string;
  readonly particleColor: string;
  readonly particleCount: number;
}

export const ROOM_ENVIRONMENT_PRESETS: Record<RoomId, RoomEnvironmentPreset> = {
  [RoomId.LOBBY]: {
    id: RoomEnvironmentId.LOBBY,
    roomId: RoomId.LOBBY,
    accentColor: ROOM_PORTAL_ACCENTS[RoomId.LOBBY],
    landscapeTheme: "atrium",
    skyGradient: {
      topColor: "#060913",
      horizonColor: "#1b294a",
      bottomColor: "#0f172a",
    },
    fog: {
      color: "#141d34",
      near: 12,
      far: 34,
    },
    lighting: {
      directionalColor: "#fef3c7",
      directionalIntensity: 1.35,
      directionalPosition: [4, 7, 5],
      hemisphereSkyColor: "#bae6fd",
      hemisphereGroundColor: "#334155",
      hemisphereIntensity: 0.48,
    },
    floorColor: "#64748b",
    floorTexture: "STONE_BASALT",
    columnColor: "#788596",
    columnTexture: "STONE_BASALT",
    outerGroundColor: "#222d3f",
    propPrimaryColor: "#3c4b64",
    propSecondaryColor: "#22685b",
    particleColor: "#D99B26",
    particleCount: 48,
  },
  [RoomId.WIXARIKA]: {
    id: RoomEnvironmentId.WIXARIKA,
    roomId: RoomId.WIXARIKA,
    accentColor: ROOM_PORTAL_ACCENTS[RoomId.WIXARIKA],
    landscapeTheme: "sierra",
    skyGradient: {
      topColor: "#1b1c3a",
      horizonColor: "#d97724",
      bottomColor: "#5c2b1e",
    },
    fog: {
      color: "#8f4a22",
      near: 13,
      far: 36,
    },
    lighting: {
      directionalColor: "#ffcf7d",
      directionalIntensity: 1.25,
      directionalPosition: [-6, 6.5, 4],
      hemisphereSkyColor: "#f59e0b",
      hemisphereGroundColor: "#451a03",
      hemisphereIntensity: 0.44,
    },
    floorColor: "#a85c3a",
    floorTexture: "TERRACOTTA_FLAGSTONE",
    columnColor: "#7c4f31",
    columnTexture: "PINE_TIMBER",
    outerGroundColor: "#4f2d1d",
    propPrimaryColor: "#6e412c",
    propSecondaryColor: "#2f6b47",
    particleColor: "#fbbf24",
    particleCount: 52,
  },
  [RoomId.NAAYERI]: {
    id: RoomEnvironmentId.NAAYERI,
    roomId: RoomId.NAAYERI,
    accentColor: ROOM_PORTAL_ACCENTS[RoomId.NAAYERI],
    landscapeTheme: "canyon",
    skyGradient: {
      topColor: "#0e3a53",
      horizonColor: "#54b8af",
      bottomColor: "#0f4e54",
    },
    fog: {
      color: "#226f73",
      near: 12,
      far: 34,
    },
    lighting: {
      directionalColor: "#fef3c7",
      directionalIntensity: 1.22,
      directionalPosition: [6, 7, -3],
      hemisphereSkyColor: "#67e8f9",
      hemisphereGroundColor: "#134e4a",
      hemisphereIntensity: 0.46,
    },
    floorColor: "#5b6c7a",
    floorTexture: "STONE_BASALT",
    columnColor: "#c29b75",
    columnTexture: "ADOBE_PLASTER",
    outerGroundColor: "#008F85",
    propPrimaryColor: "#8c4a32",
    propSecondaryColor: "#2e7d5e",
    particleColor: "#99f6e4",
    particleCount: 48,
  },
  [RoomId.ODAM]: {
    id: RoomEnvironmentId.ODAM,
    roomId: RoomId.ODAM,
    accentColor: ROOM_PORTAL_ACCENTS[RoomId.ODAM],
    landscapeTheme: "forest",
    skyGradient: {
      topColor: "#171324",
      horizonColor: "#9a342c",
      bottomColor: "#27181d",
    },
    fog: {
      color: "#3f2224",
      near: 11,
      far: 32,
    },
    lighting: {
      directionalColor: "#fdba74",
      directionalIntensity: 1.2,
      directionalPosition: [-5, 6, -5],
      hemisphereSkyColor: "#fca5a5",
      hemisphereGroundColor: "#291815",
      hemisphereIntensity: 0.42,
    },
    floorColor: "#9c6d49",
    floorTexture: "PETATE_REED",
    columnColor: "#6e472b",
    columnTexture: "PINE_TIMBER",
    outerGroundColor: "#2a221b",
    propPrimaryColor: "#1f4d36",
    propSecondaryColor: "#5c3b23",
    particleColor: "#f97316",
    particleCount: 56,
  },
  [RoomId.MEXICANERO]: {
    id: RoomEnvironmentId.MEXICANERO,
    roomId: RoomId.MEXICANERO,
    accentColor: ROOM_PORTAL_ACCENTS[RoomId.MEXICANERO],
    landscapeTheme: "highland",
    skyGradient: {
      topColor: "#050814",
      horizonColor: "#1e2e4f",
      bottomColor: "#0e1526",
    },
    fog: {
      color: "#151f36",
      near: 13,
      far: 36,
    },
    lighting: {
      directionalColor: "#e2e8f0",
      directionalIntensity: 1.18,
      directionalPosition: [5, 6.8, 4],
      hemisphereSkyColor: "#cbd5e1",
      hemisphereGroundColor: "#1e293b",
      hemisphereIntensity: 0.38,
    },
    floorColor: "#c29b75",
    floorTexture: "ADOBE_PLASTER",
    columnColor: "#785336",
    columnTexture: "PINE_TIMBER",
    outerGroundColor: "#1a202c",
    propPrimaryColor: "#334155",
    propSecondaryColor: "#1b4332",
    particleColor: "#EDE8DF",
    particleCount: 48,
  },
} as const;

export function getRoomEnvironmentPreset(roomId: RoomId): RoomEnvironmentPreset {
  return ROOM_ENVIRONMENT_PRESETS[roomId] ?? ROOM_ENVIRONMENT_PRESETS[RoomId.LOBBY];
}
