export const RoomId = {
  LOBBY: "LOBBY",
  WIXARIKA: "WIXARIKA",
  NAAYERI: "NAAYERI",
  ODAM: "ODAM",
  MEXICANERO: "MEXICANERO",
} as const;
export type RoomId = (typeof RoomId)[keyof typeof RoomId];

export const StandId = {
  BIENVENIDA: "bienvenida",
  NAYARIT: "nayarit",
  COSMOVISION: "cosmovision",
  ARTE: "arte",
  VESTIMENTA: "vestimenta",
  GASTRONOMIA: "gastronomia",
  VIVIENDA: "vivienda",
} as const;
export type StandId = (typeof StandId)[keyof typeof StandId];

export const DEFAULT_ROOM_ID: RoomId = RoomId.LOBBY;

export const CULTURE_ROOM_IDS: readonly RoomId[] = [
  RoomId.WIXARIKA,
  RoomId.NAAYERI,
  RoomId.ODAM,
  RoomId.MEXICANERO,
] as const;

export const LOBBY_STAND_IDS: readonly StandId[] = [
  StandId.BIENVENIDA,
  StandId.NAYARIT,
] as const;

export const CULTURAL_STAND_IDS: readonly StandId[] = [
  StandId.COSMOVISION,
  StandId.ARTE,
  StandId.VESTIMENTA,
  StandId.GASTRONOMIA,
  StandId.VIVIENDA,
] as const;

export const ROOM_TITLES: Record<RoomId, string> = {
  [RoomId.LOBBY]: "Vestíbulo Cultural",
  [RoomId.WIXARIKA]: "Cultura Wixárika",
  [RoomId.NAAYERI]: "Cultura Náayeri",
  [RoomId.ODAM]: "Cultura O'dam",
  [RoomId.MEXICANERO]: "Cultura Mexicanero",
} as const;

export const STAND_LABELS: Record<StandId, string> = {
  [StandId.BIENVENIDA]: "Bienvenida",
  [StandId.NAYARIT]: "Pueblos de Nayarit",
  [StandId.COSMOVISION]: "Cosmovisión y Tradición",
  [StandId.ARTE]: "Arte y Artesanías",
  [StandId.VESTIMENTA]: "Vestimenta",
  [StandId.GASTRONOMIA]: "Gastronomía",
  [StandId.VIVIENDA]: "Vivienda",
} as const;

export const ROOM_SKYBOX_URLS: Record<RoomId, string> = {
  [RoomId.LOBBY]: "/scenes/lobby.webp",
  [RoomId.WIXARIKA]: "/scenes/wixarika.webp",
  [RoomId.NAAYERI]: "/scenes/naayeri.webp",
  [RoomId.ODAM]: "/scenes/odam.webp",
  [RoomId.MEXICANERO]: "/scenes/mexicanero.webp",
} as const;

export const ROOM_PORTAL_ACCENTS: Record<RoomId, string> = {
  [RoomId.LOBBY]: "#38bdf8",
  [RoomId.WIXARIKA]: "#D99B26",
  [RoomId.NAAYERI]: "#008F85",
  [RoomId.ODAM]: "#B83A2C",
  [RoomId.MEXICANERO]: "#EDE8DF",
} as const;

export const ROOM_LAYOUT_TOKENS = {
  RING_RADIUS_M: 3.2,
  EYE_HEIGHT_M: 1.6,
  PEDESTAL_ELEVATION_M: 1.2,
  MODEL_MAX_EXTENT_M: 0.72,
  MODEL_PEDESTAL_HEIGHT_M: 0.8,
  DEFAULT_MODEL_ROTATION_SPEED: 0.015,
  PORTAL_RETURN_LABEL: "Volver al Lobby",
} as const;

export interface PolarVector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RingTransform {
  readonly position: PolarVector3D;
  readonly rotation: PolarVector3D;
}

export interface RoomPortalCatalogEntry {
  readonly id: string;
  readonly targetRoomId: RoomId;
  readonly title: string;
  readonly angleDeg: number;
  readonly accentColor: string;
}

export interface StandSlotCatalogEntry {
  readonly standId: StandId;
  readonly label: string;
  readonly angleDeg: number;
}

export interface Model3DExhibitConfig {
  readonly id: string;
  readonly roomId: RoomId;
  readonly title: string;
  readonly description: string;
  readonly creatorName: string;
  readonly modelUrl: string;
  readonly angleDeg: number;
  readonly autoRotate: boolean;
  readonly rotationSpeed: number;
}

export interface RoomCatalogEntry {
  readonly id: RoomId;
  readonly title: string;
  readonly skyboxAssetId: string;
  readonly skyboxUrl: string;
  readonly accentColor: string;
  readonly portals: readonly RoomPortalCatalogEntry[];
  readonly stands: readonly StandSlotCatalogEntry[];
  readonly model3d: Model3DExhibitConfig | null;
}

function normalizeZero(value: number): number {
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeRotationY(angleDeg: number): number {
  let rotY = normalizeZero(-angleDeg);
  if (rotY <= -180) {
    rotY += 360;
  } else if (rotY > 180) {
    rotY -= 360;
  }
  return normalizeZero(rotY);
}

/**
 * Computes inward-facing world position and Y-rotation on a horizontal ring.
 * Azimuth 0 deg faces -Z (straight ahead) with local +Z facing the center.
 */
export function computeRingTransform(
  angleDeg: number,
  radiusM: number = ROOM_LAYOUT_TOKENS.RING_RADIUS_M,
  elevationY: number = ROOM_LAYOUT_TOKENS.EYE_HEIGHT_M,
): RingTransform {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    position: {
      x: normalizeZero(radiusM * Math.sin(rad)),
      y: normalizeZero(elevationY),
      z: normalizeZero(-radiusM * Math.cos(rad)),
    },
    rotation: {
      x: 0,
      y: normalizeRotationY(angleDeg),
      z: 0,
    },
  };
}

export const STATIC_ROOM_MODELS: Partial<Record<RoomId, Model3DExhibitConfig>> =
  {
    [RoomId.WIXARIKA]: {
      id: "exhibit-wixarika-artifact",
      roomId: RoomId.WIXARIKA,
      title: "Pieza Ceremonial Wixárika",
      description:
        "Artefacto tradicional digitalizado en 3D perteneciente a la cultura Wixárika de Nayarit.",
      creatorName: "",
      modelUrl: "/models/wixarika-artifact.glb",
      angleDeg: 0,
      autoRotate: true,
      rotationSpeed: ROOM_LAYOUT_TOKENS.DEFAULT_MODEL_ROTATION_SPEED,
    },
  };

function buildCultureRoomEntry(
  roomId: RoomId,
  standAngles: Record<StandId, number>,
): RoomCatalogEntry {
  const stands: StandSlotCatalogEntry[] = CULTURAL_STAND_IDS.map(
    (standId) => ({
      standId,
      label: STAND_LABELS[standId],
      angleDeg: standAngles[standId],
    }),
  );

  return {
    id: roomId,
    title: ROOM_TITLES[roomId],
    skyboxAssetId: `sky-${roomId.toLowerCase()}`,
    skyboxUrl: ROOM_SKYBOX_URLS[roomId],
    accentColor: ROOM_PORTAL_ACCENTS[roomId],
    portals: [
      {
        id: `portal-${roomId.toLowerCase()}-to-lobby`,
        targetRoomId: RoomId.LOBBY,
        title: ROOM_LAYOUT_TOKENS.PORTAL_RETURN_LABEL,
        angleDeg: 180,
        accentColor: ROOM_PORTAL_ACCENTS[RoomId.LOBBY],
      },
    ],
    stands,
    model3d: STATIC_ROOM_MODELS[roomId] ?? null,
  };
}

const WIXARIKA_STAND_ANGLES = {
  [StandId.VESTIMENTA]: -45,
  [StandId.ARTE]: -90,
  [StandId.GASTRONOMIA]: -135,
  [StandId.COSMOVISION]: 60,
  [StandId.VIVIENDA]: 120,
} as Record<StandId, number>;

const STANDARD_CULTURE_STAND_ANGLES = {
  [StandId.COSMOVISION]: -120,
  [StandId.ARTE]: -60,
  [StandId.VESTIMENTA]: 0,
  [StandId.GASTRONOMIA]: 60,
  [StandId.VIVIENDA]: 120,
} as Record<StandId, number>;

export const ROOM_CATALOG: Record<RoomId, RoomCatalogEntry> = {
  [RoomId.LOBBY]: {
    id: RoomId.LOBBY,
    title: ROOM_TITLES[RoomId.LOBBY],
    skyboxAssetId: "sky-lobby",
    skyboxUrl: ROOM_SKYBOX_URLS[RoomId.LOBBY],
    accentColor: ROOM_PORTAL_ACCENTS[RoomId.LOBBY],
    portals: [
      {
        id: "portal-lobby-to-wixarika",
        targetRoomId: RoomId.WIXARIKA,
        title: ROOM_TITLES[RoomId.WIXARIKA],
        angleDeg: -54,
        accentColor: ROOM_PORTAL_ACCENTS[RoomId.WIXARIKA],
      },
      {
        id: "portal-lobby-to-naayeri",
        targetRoomId: RoomId.NAAYERI,
        title: ROOM_TITLES[RoomId.NAAYERI],
        angleDeg: -18,
        accentColor: ROOM_PORTAL_ACCENTS[RoomId.NAAYERI],
      },
      {
        id: "portal-lobby-to-odam",
        targetRoomId: RoomId.ODAM,
        title: ROOM_TITLES[RoomId.ODAM],
        angleDeg: 18,
        accentColor: ROOM_PORTAL_ACCENTS[RoomId.ODAM],
      },
      {
        id: "portal-lobby-to-mexicanero",
        targetRoomId: RoomId.MEXICANERO,
        title: ROOM_TITLES[RoomId.MEXICANERO],
        angleDeg: 54,
        accentColor: ROOM_PORTAL_ACCENTS[RoomId.MEXICANERO],
      },
    ],
    stands: [
      {
        standId: StandId.BIENVENIDA,
        label: STAND_LABELS[StandId.BIENVENIDA],
        angleDeg: -145,
      },
      {
        standId: StandId.NAYARIT,
        label: STAND_LABELS[StandId.NAYARIT],
        angleDeg: 145,
      },
    ],
    model3d: null,
  },
  [RoomId.WIXARIKA]: buildCultureRoomEntry(
    RoomId.WIXARIKA,
    WIXARIKA_STAND_ANGLES,
  ),
  [RoomId.NAAYERI]: buildCultureRoomEntry(
    RoomId.NAAYERI,
    STANDARD_CULTURE_STAND_ANGLES,
  ),
  [RoomId.ODAM]: buildCultureRoomEntry(
    RoomId.ODAM,
    STANDARD_CULTURE_STAND_ANGLES,
  ),
  [RoomId.MEXICANERO]: buildCultureRoomEntry(
    RoomId.MEXICANERO,
    STANDARD_CULTURE_STAND_ANGLES,
  ),
} as const;

export function isValidRoomId(value: string): value is RoomId {
  return Object.prototype.hasOwnProperty.call(ROOM_CATALOG, value);
}

export function isValidRoomStand(roomId: string, standId: string): boolean {
  if (!isValidRoomId(roomId)) {
    return false;
  }
  return ROOM_CATALOG[roomId].stands.some((slot) => slot.standId === standId);
}

export function getRoomCatalogEntry(roomId: RoomId): RoomCatalogEntry {
  return ROOM_CATALOG[roomId] ?? ROOM_CATALOG[DEFAULT_ROOM_ID];
}

export function getLobbyReturnTarget(): RoomId {
  return RoomId.LOBBY;
}

export function isCultureRoom(roomId: RoomId): boolean {
  return roomId !== RoomId.LOBBY;
}
