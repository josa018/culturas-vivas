import { RoomId, type RoomDefinition } from "./types";

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
  readonly mediaType: ExhibitMediaType;
  readonly galleryPosition: Vector3D;
  readonly galleryRotation: Vector3D;
  readonly autoRotate: boolean;
  readonly rotationSpeed: number;
  readonly mediaUrl?: string;
  readonly posterUrl?: string;
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
  FUSE_TIMEOUT_MS: 1500,
  DEFAULT_ROTATION_SPEED: 0.015,
} as const;

export const EXHIBIT_DIMENSIONS = {
  PLANE_WIDTH: 1.6,
  PLANE_HEIGHT: 1.0,
  BILLBOARD_WIDTH: 1.6,
  BILLBOARD_HEIGHT: 0.55,
  BILLBOARD_TITLE_WIDTH: 1.25,
  BILLBOARD_TITLE_WRAP_COUNT: 24,
  CLOSE_BUTTON_RADIUS: 0.065,
  PEDESTAL_RADIUS: 0.4,
  PEDESTAL_HEIGHT: 0.8,
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

export const DEFAULT_ROOM_ID = RoomId.ARCHAEOLOGY;

export const TEXTILES_EXHIBITS: readonly ExhibitItemConfig[] = [
  {
    id: "exhibit-textile-weaving",
    title: "Telar Andino Tradicional",
    description:
      "Estructura de tejido ancestral con patrones geometricos y pigmentacion organica natural.",
    mediaType: ExhibitMediaType.MODEL_3D,
    galleryPosition: { x: 0, y: 1.4, z: -2.8 },
    galleryRotation: { x: 0, y: 0, z: 0 },
    autoRotate: true,
    rotationSpeed: INSPECTION_TIMINGS.DEFAULT_ROTATION_SPEED,
  },
  {
    id: "exhibit-mantle-painting",
    title: "Manto Ceremonial Paracas",
    description:
      "Detalle textil policromo con iconografia mitologica zoomorfa bordada en fibra de alpaca.",
    mediaType: ExhibitMediaType.IMAGE_2D,
    galleryPosition: { x: 2.0, y: 1.6, z: -2.0 },
    galleryRotation: { x: 0, y: -45, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
  {
    id: "exhibit-loom-technique",
    title: "Demostracion Tecnica del Hilado",
    description:
      "Registro audiovisual del proceso de hilado tradicional y seleccion de tintes naturales.",
    mediaType: ExhibitMediaType.VIDEO_2D,
    galleryPosition: { x: -2.0, y: 1.6, z: 2.0 },
    galleryRotation: { x: 0, y: 135, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
] as const;

export const ROOM_DEFINITIONS: Record<RoomId, RoomDefinition> = {
  [RoomId.ARCHAEOLOGY]: {
    id: RoomId.ARCHAEOLOGY,
    title: "Sala de Arqueologia",
    skyboxAssetId: "sky-archaeology",
    skyboxUrl: "/scenes/scene1.webp",
    exhibits: PROTOTYPE_EXHIBITS,
    portals: [
      {
        id: "portal-archaeology-to-textiles",
        targetRoomId: RoomId.TEXTILES,
        title: "Ir a Sala de Textiles",
        position: { x: 0, y: 1.6, z: 2.8 },
        rotation: { x: 0, y: 180, z: 0 },
      },
    ],
  },
  [RoomId.TEXTILES]: {
    id: RoomId.TEXTILES,
    title: "Sala de Textiles",
    skyboxAssetId: "sky-textiles",
    skyboxUrl: "/scenes/scene2.webp",
    exhibits: TEXTILES_EXHIBITS,
    portals: [
      {
        id: "portal-textiles-to-archaeology",
        targetRoomId: RoomId.ARCHAEOLOGY,
        title: "Ir a Sala de Arqueologia",
        position: { x: 0, y: 1.6, z: 2.8 },
        rotation: { x: 0, y: 180, z: 0 },
      },
    ],
  },
};

export const VR_HUD_SUMMON_PITCH_THRESHOLD_DEG = -60;
export const VR_HUD_FOCAL_DISTANCE_M = 1.5;
export const VR_HUD_FOCAL_ELEVATION_OFFSET_M = -0.15;
export const VR_HUD_SUMMON_TIMEOUT_MS = 1000;
export const VR_HUD_ANIMATION_DURATION_MS = 250;

export const VR_HUD_GEOMETRY = {
  CURVED_RADIUS_M: 1.8,
  THETA_LENGTH_DEG: 50,
  PANEL_HEIGHT_M: 0.8,
  PANEL_WIDTH_M: 1.45,
  RUNE_RADIUS_M: 0.35,
  RUNE_INNER_RADIUS_M: 0.24,
  RUNE_FLOOR_Y_OFFSET_M: 0.02,
  BUTTON_WIDTH_M: 0.56,
  BUTTON_HEIGHT_M: 0.22,
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
  EXIT_BTN: "cv-vr-hud-exit",
  DISMISS_BTN: "cv-vr-hud-dismiss",
  NADIR_TRIGGER: "cv-nadir-trigger",
  NADIR_RUNE: "cv-nadir-rune",
  NADIR_PROGRESS_RING: "cv-nadir-progress-ring",
} as const;

export const VR_HUD_DICTIONARY = {
  SWITCH_TO_2D_LABEL: "Modo Tactil 2D",
  EXIT_TOUR_LABEL: "Salir del Recorrido",
  DISMISS_LABEL: "✕",
  SUMMON_HINT_LABEL: "MENU VR",
} as const;
