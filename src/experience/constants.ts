import {
  DEFAULT_ROOM_ID,
  ROOM_CATALOG,
  ROOM_LAYOUT_TOKENS,
  ROOM_PORTAL_ACCENTS,
  ROOM_TITLES,
  RoomId,
  STAND_LABELS,
  StandId,
  computeRingTransform,
  type RoomCatalogEntry,
} from "../shared/room-catalog";
import type { RoomDefinition } from "./types";

export {
  DEFAULT_ROOM_ID,
  ROOM_CATALOG,
  ROOM_LAYOUT_TOKENS,
  ROOM_PORTAL_ACCENTS,
  ROOM_TITLES,
  STAND_LABELS,
  StandId,
};

export const ExhibitMediaType = {
  IMAGE_2D: "IMAGE_2D",
  IMAGE_STEREO_SBS: "IMAGE_STEREO_SBS",
  VIDEO_2D: "VIDEO_2D",
  VIDEO_STEREO_SBS: "VIDEO_STEREO_SBS",
  MODEL_3D: "MODEL_3D",
} as const;
export type ExhibitMediaType =
  (typeof ExhibitMediaType)[keyof typeof ExhibitMediaType];

export const InspectionState = {
  IDLE: "IDLE",
  FOCUSING: "FOCUSING",
  INSPECTING: "INSPECTING",
  RETURNING: "RETURNING",
} as const;
export type InspectionState =
  (typeof InspectionState)[keyof typeof InspectionState];

export interface Vector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ExhibitItemConfig {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly creatorName?: string;
  readonly mediaType: ExhibitMediaType;
  readonly galleryPosition: Vector3D;
  readonly galleryRotation: Vector3D;
  readonly autoRotate: boolean;
  readonly rotationSpeed: number;
  readonly mediaUrl?: string;
  readonly posterUrl?: string;
  readonly modelUrl?: string;
}

export const ROOM_CENTER_COORDINATE: Vector3D = {
  x: 0,
  y: 1.6,
  z: 0,
} as const;

export const FOCAL_INSPECTION_OFFSET: Vector3D = {
  x: 0,
  y: -0.1,
  z: -1.2,
} as const;

export const FOCAL_INSPECTION_DISTANCE = 1.3;

export const METADATA_BILLBOARD_OFFSET: Vector3D = {
  x: 0,
  y: -0.925,
  z: 0,
} as const;

export const INSPECTION_TIMINGS = {
  LERP_DURATION_MS: 600,
  ANIMATION_DURATION_MS: 600,
  ANIMATION_EASING: "easeInOutCubic",
  PANEL_ANIMATION_DURATION_MS: 300,
  PANEL_ANIMATION_EASING: "easeOutCubic",
  PANEL_ENTRANCE_DELAY_MS: 150,
  PANEL_EXIT_DURATION_MS: 250,
  PANEL_EXIT_TIMEOUT_BUFFER_MS: 10,
  PANEL_EXIT_EASING: "easeInCubic",
  PANEL_HIDDEN_SCALE: "0.001 0.001 0.001",
  PANEL_VISIBLE_SCALE: "1 1 1",
  FUSE_TIMEOUT_MS: 1500,
  DEFAULT_ROTATION_SPEED: ROOM_LAYOUT_TOKENS.DEFAULT_MODEL_ROTATION_SPEED,
} as const;

export const EXHIBIT_DIMENSIONS = {
  PLANE_WIDTH: 1.6,
  PLANE_HEIGHT: 1.0,
  BILLBOARD_WIDTH: 1.6,
  BILLBOARD_HEIGHT: 0.62,
  BILLBOARD_TITLE_WIDTH: 1.25,
  BILLBOARD_TITLE_WRAP_COUNT: 24,
  CLOSE_BUTTON_RADIUS: 0.065,
  PEDESTAL_RADIUS: 0.4,
  PEDESTAL_HEIGHT: ROOM_LAYOUT_TOKENS.MODEL_PEDESTAL_HEIGHT_M,
} as const;

export const EXHIBIT_ASSET_IDS = {
  PAINTING_2D: "asset-painting-2d",
  PHOTO_STEREO: "asset-photo-stereo",
  VIDEO_2D: "asset-video-2d",
  VIDEO_STEREO_SBS: "asset-video-stereo-sbs",
} as const;

export const EXHIBIT_DICTIONARY = {
  RETURN_BUTTON_LABEL: "Volver",
  INSPECT_BUTTON_LABEL: "Inspeccionar",
  CLOSE_ICON: "✕",
  CREATOR_PREFIX: "Crédito: ",
  STAND_PLACEHOLDER_DESC: "Espacio reservado para colección cultural interactiva.",
  MODEL_3D_TITLE: "Modelo 3D Interactivo",
  MODEL_3D_DESC:
    "Objeto tridimensional con soporte para rotacion axial automatica o manual. Ideal para esculturas, vasijas e instrumentos.",
  IMAGE_2D_TITLE: "Imagen / Fotografia 2D",
  IMAGE_2D_DESC:
    "Formato plano monocanal estandar. Optimizado para cuadros, pinturas, ilustraciones y fotografias historicas de alta resolucion.",
  IMAGE_STEREO_TITLE: "Fotografia Estereoscopica Half-SBS",
  IMAGE_STEREO_DESC:
    "Imagen con doble canal (ojo izquierdo y derecho) que genera percepcion de relieve y profundidad real en visores VR.",
  VIDEO_2D_TITLE: "Video 2D Estandar",
  VIDEO_2D_DESC:
    "Contenido audiovisual plano monocanal. Permanece pausado en reposo y activa su reproduccion al enfocarlo e inspeccionarlo.",
  VIDEO_STEREO_TITLE: "Video Estereoscopico Half-SBS",
  VIDEO_STEREO_DESC:
    "Secuencia de video con doble flujo Side-By-Side. Ofrece sensacion inmersiva de presencia en VR y recorte monoscopico en 2D.",
} as const;

export const GLB_FALLBACK_COLORS = {
  PEDESTAL: "#334155",
  PRIMARY: "#D99B26",
  SECONDARY: "#B83A2C",
  RING: "#fbbf24",
} as const;

export const DISPOSABLE_TEXTURE_SLOTS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "aoMap",
  "bumpMap",
  "alphaMap",
] as const;

export const PROTOTYPE_EXHIBITS: readonly ExhibitItemConfig[] = [
  {
    id: "exhibit-statue-3d",
    title: EXHIBIT_DICTIONARY.MODEL_3D_TITLE,
    description: EXHIBIT_DICTIONARY.MODEL_3D_DESC,
    mediaType: ExhibitMediaType.MODEL_3D,
    galleryPosition: { x: 0, y: 1.4, z: -2.8 },
    galleryRotation: { x: 0, y: 0, z: 0 },
    autoRotate: true,
    rotationSpeed: INSPECTION_TIMINGS.DEFAULT_ROTATION_SPEED,
  },
  {
    id: "exhibit-painting-2d",
    title: EXHIBIT_DICTIONARY.IMAGE_2D_TITLE,
    description: EXHIBIT_DICTIONARY.IMAGE_2D_DESC,
    mediaType: ExhibitMediaType.IMAGE_2D,
    galleryPosition: { x: 2.0, y: 1.6, z: -2.0 },
    galleryRotation: { x: 0, y: -45, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
  {
    id: "exhibit-photo-stereo",
    title: EXHIBIT_DICTIONARY.IMAGE_STEREO_TITLE,
    description: EXHIBIT_DICTIONARY.IMAGE_STEREO_DESC,
    mediaType: ExhibitMediaType.IMAGE_STEREO_SBS,
    galleryPosition: { x: 2.0, y: 1.6, z: 2.0 },
    galleryRotation: { x: 0, y: -135, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
  {
    id: "exhibit-video-2d",
    title: EXHIBIT_DICTIONARY.VIDEO_2D_TITLE,
    description: EXHIBIT_DICTIONARY.VIDEO_2D_DESC,
    mediaType: ExhibitMediaType.VIDEO_2D,
    galleryPosition: { x: -2.0, y: 1.6, z: 2.0 },
    galleryRotation: { x: 0, y: 135, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
  {
    id: "exhibit-video-stereo",
    title: EXHIBIT_DICTIONARY.VIDEO_STEREO_TITLE,
    description: EXHIBIT_DICTIONARY.VIDEO_STEREO_DESC,
    mediaType: ExhibitMediaType.VIDEO_STEREO_SBS,
    galleryPosition: { x: -2.0, y: 1.6, z: -2.0 },
    galleryRotation: { x: 0, y: 45, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
] as const;

export const TRANSITION_TIMINGS = {
  FADE_DURATION_MS: 400,
  CURTAIN_FALLBACK_BUFFER_MS: 50,
  FADE_EASING: "easeInOutQuad",
  PORTAL_FUSE_TIMEOUT_MS: 1500,
} as const;

export const CURTAIN_RENDER_ORDER = 99999;

export const PORTAL_DIMENSIONS = {
  FRAME_WIDTH: 1.2,
  FRAME_HEIGHT: 2.0,
  BORDER_THICKNESS: 0.05,
  LABEL_OFFSET_Y: 1.15,
  LABEL_WIDTH: 1.8,
  FUSE_RING_RADIUS: 0.1,
} as const;

export const PORTAL_COLORS = {
  FRAME: "#38bdf8",
  HOVER_GLOW: "#0284c7",
  PORTAL_BG: "#090d16",
  PORTAL_INNER: "#1e293b",
  TEXT: "#f8fafc",
} as const;

function buildRoomDefinition(entry: RoomCatalogEntry): RoomDefinition {
  const exhibits: ExhibitItemConfig[] = [];

  if (entry.model3d) {
    const transform = computeRingTransform(
      entry.model3d.angleDeg,
      ROOM_LAYOUT_TOKENS.RING_RADIUS_M,
      ROOM_LAYOUT_TOKENS.PEDESTAL_ELEVATION_M,
    );
    exhibits.push({
      id: entry.model3d.id,
      title: entry.model3d.title,
      description: entry.model3d.description,
      creatorName: entry.model3d.creatorName,
      mediaType: ExhibitMediaType.MODEL_3D,
      galleryPosition: transform.position,
      galleryRotation: transform.rotation,
      autoRotate: entry.model3d.autoRotate,
      rotationSpeed: entry.model3d.rotationSpeed,
      modelUrl: entry.model3d.modelUrl,
    });
  }

  const stands = entry.stands.map((slot) => {
    const transform = computeRingTransform(
      slot.angleDeg,
      ROOM_LAYOUT_TOKENS.RING_RADIUS_M,
      ROOM_LAYOUT_TOKENS.EYE_HEIGHT_M,
    );
    return {
      id: `stand-${entry.id.toLowerCase()}-${slot.standId}`,
      roomId: entry.id,
      standId: slot.standId,
      label: slot.label,
      position: transform.position,
      rotation: transform.rotation,
    };
  });

  const portals = entry.portals.map((portal) => {
    const transform = computeRingTransform(
      portal.angleDeg,
      ROOM_LAYOUT_TOKENS.RING_RADIUS_M,
      ROOM_LAYOUT_TOKENS.EYE_HEIGHT_M,
    );
    return {
      id: portal.id,
      targetRoomId: portal.targetRoomId,
      title: portal.title,
      position: transform.position,
      rotation: transform.rotation,
      accentColor: portal.accentColor,
    };
  });

  return {
    id: entry.id,
    title: entry.title,
    skyboxAssetId: entry.skyboxAssetId,
    skyboxUrl: entry.skyboxUrl,
    accentColor: entry.accentColor,
    exhibits,
    stands,
    portals,
  };
}

export const ROOM_DEFINITIONS: Record<RoomId, RoomDefinition> = {
  [RoomId.LOBBY]: buildRoomDefinition(ROOM_CATALOG[RoomId.LOBBY]),
  [RoomId.WIXARIKA]: buildRoomDefinition(ROOM_CATALOG[RoomId.WIXARIKA]),
  [RoomId.NAAYERI]: buildRoomDefinition(ROOM_CATALOG[RoomId.NAAYERI]),
  [RoomId.ODAM]: buildRoomDefinition(ROOM_CATALOG[RoomId.ODAM]),
  [RoomId.MEXICANERO]: buildRoomDefinition(ROOM_CATALOG[RoomId.MEXICANERO]),
};

export const VR_HUD_FOCAL_DISTANCE_M = 1.5;
export const VR_HUD_FOCAL_ELEVATION_OFFSET_M = -0.15;
export const VR_HUD_ANIMATION_DURATION_MS = 250;
export const VR_HUD_DISMISS_BUFFER_MS = 30;
export const VR_HUD_HIDDEN_SCALE = "0.001 0.001 0.001";
export const VR_HUD_VISIBLE_SCALE = "1 1 1";
export const VR_HUD_TAP_DEBOUNCE_MS = 350;
export const VR_HUD_MAX_TAP_DRAG_PX = 12;

export const VR_HUD_GEOMETRY = {
  CURVED_RADIUS_M: 1.8,
  THETA_LENGTH_DEG: 50,
  PANEL_HEIGHT_M: 0.92,
  PANEL_WIDTH_M: 1.45,
  BUTTON_WIDTH_M: 0.56,
  BUTTON_HEIGHT_M: 0.22,
  LOBBY_BUTTON_WIDTH_M: 0.92,
  LOBBY_BUTTON_HEIGHT_M: 0.2,
  DISMISS_RADIUS_M: 0.075,
} as const;

export const VR_HUD_COLORS = {
  SURFACE_OBSIDIAN: "#0B0F17",
  SURFACE_OPACITY: 0.85,
  ACCENT_CEMPASUCHIL: "#D99B26",
  ACCENT_TURQUESA: "#008F85",
  ACCENT_COCHINILLA: "#B83A2C",
  TEXT_BONE: "#EDE8DF",
} as const;

export const VR_HUD_ELEMENT_IDS = {
  HUD_ROOT: "cv-vr-hologram-hud",
  PANEL_BACKDROP: "cv-vr-hud-panel",
  ROOM_CHIP: "cv-vr-hud-room-chip",
  SWITCH_2D_BTN: "cv-vr-hud-switch-2d",
  RETURN_LOBBY_BTN: "cv-vr-hud-return-lobby",
  EXIT_BTN: "cv-vr-hud-exit",
  DISMISS_BTN: "cv-vr-hud-dismiss",
  TAP_TRIGGER: "cv-vr-tap-trigger",
} as const;

export const VR_HUD_DICTIONARY = {
  SWITCH_TO_2D_LABEL: "Modo Tactil 2D",
  RETURN_LOBBY_LABEL: "Volver al Lobby",
  EXIT_TOUR_LABEL: "Salir del Recorrido",
  DISMISS_LABEL: "✕",
} as const;
