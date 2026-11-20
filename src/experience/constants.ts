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

export const PLAYER_RIG_TOKENS = {
  CAMERA_RIG_ID: "cv-camera-rig",
  STATURE_M: 1.7,
  EYE_HEIGHT_M: 1.65,
} as const;

export const ROOM_CENTER_COORDINATE: Vector3D = {
  x: 0,
  y: PLAYER_RIG_TOKENS.EYE_HEIGHT_M,
  z: 0,
} as const;

export const FOCAL_INSPECTION_OFFSET: Vector3D = {
  x: 0,
  y: -0.1,
  z: -1.2,
} as const;

export const FOCAL_INSPECTION_DISTANCE = 1.3;

export const INSPECTION_TARGET_TOKENS = {
  STAND_FOCAL_DISTANCE_M: 1.45,
  STAND_INSPECTION_Y_M: PLAYER_RIG_TOKENS.EYE_HEIGHT_M,
  MODEL_FOCAL_DISTANCE_M: 1.4,
  MODEL_INSPECTION_Y_M: 1.78,
  BILLBOARD_TILT_X_DEG: -12,
  MODEL_BILLBOARD_OFFSET_Y: -0.9,
  MODEL_BILLBOARD_OFFSET_Z: 0.08,
} as const;

export const METADATA_BILLBOARD_OFFSET: Vector3D = {
  x: 0,
  y: INSPECTION_TARGET_TOKENS.MODEL_BILLBOARD_OFFSET_Y,
  z: INSPECTION_TARGET_TOKENS.MODEL_BILLBOARD_OFFSET_Z,
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
  MODEL_ROTATION_MAX_STEP_MS: 50,
} as const;

export const EXHIBIT_DIMENSIONS = {
  PLANE_WIDTH: 1.6,
  PLANE_HEIGHT: 1.0,
  BILLBOARD_WIDTH: 1.6,
  BILLBOARD_HEIGHT: 0.62,
  BILLBOARD_TITLE_WIDTH: 1.25,
  BILLBOARD_TITLE_WRAP_COUNT: 24,
  CLOSE_BUTTON_RADIUS: 0.06,
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
  STAND_PLACEHOLDER_DESC:
    "Espacio reservado para colección cultural interactiva.",
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

export const SHARED_VIDEO_ELEMENT_ID = "cv-shared-stand-video";

export const MEDIA_CLIENT_CONSTANTS = {
  CATALOG_ENDPOINT: "/api/media",
  FETCH_TIMEOUT_MS: 3000,
} as const;

export const STAND_DIMENSIONS = {
  MAX_MEDIA_WIDTH_M: 1.5,
  MAX_MEDIA_HEIGHT_M: 0.95,
  FRAME_PADDING_M: 0.08,
  HEADER_HEIGHT_M: 0.28,
  CONTROL_BTN_SIZE_M: 0.16,
  CONTROL_BAR_OFFSET_Y: -0.71,
  BILLBOARD_OFFSET_Y: -1.15,
  BILLBOARD_HEIGHT_M: 0.6,
  VIDEO_BADGE_WIDTH_M: 0.34,
  VIDEO_BADGE_HEIGHT_M: 0.105,
  VIDEO_BADGE_MARGIN_M: 0.04,
  VIDEO_BADGE_Z_OFFSET_M: 0.025,
  RETICLE_WAKE_PAD_X_M: 0.16,
  RETICLE_WAKE_HEIGHT_M: 0.24,
  RETICLE_WAKE_Z_OFFSET_M: -0.02,
} as const;

export const STAND_DICTIONARY = {
  EMPTY_PLACEHOLDER: "Contenido próximamente",
  ITEM_COUNT_SINGULAR: "elemento",
  ITEM_COUNT_PLURAL: "elementos",
  PREV_ICON: "◀",
  NEXT_ICON: "▶",
  PLAY_ICON: "▶",
  PAUSE_ICON: "⏸",
  MUTE_ICON: "🔇",
  UNMUTE_ICON: "🔊",
  VIDEO_BADGE: "VIDEO",
  COUNTER_SEPARATOR: " / ",
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

export const CAMERA_CURTAIN_RADIUS_M = 0.5;

export const PORTAL_DIMENSIONS = {
  FRAME_WIDTH: 1.2,
  FRAME_HEIGHT: 2.0,
  APERTURE_HEIGHT_M: 2.46,
  APERTURE_CENTER_Y: -0.23,
  BORDER_THICKNESS: 0.05,
  LABEL_OFFSET_Y: 1.38,
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
      ROOM_LAYOUT_TOKENS.STAND_ELEVATION_M,
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
    environmentPresetId: entry.environmentPresetId,
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
  BUTTON_DEPTH_M: 0.024,
  LOBBY_BUTTON_WIDTH_M: 0.92,
  LOBBY_BUTTON_HEIGHT_M: 0.2,
  DISMISS_RADIUS_M: 0.075,
  DISMISS_SEGMENTS: 48,
  FAJA_HEIGHT_M: 0.042,
  SIDE_RAIL_WIDTH_M: 0.014,
  ELEVATION_DELTA_M: 0.05,
  TRIM_RADIAL_INSET_M: 0.01,
  TRIM_ARC_THETA_DEG: 46,
  SIDE_RAIL_ARC_THETA_DEG: 0.65,
} as const;

export const VR_HUD_COLORS = {
  SURFACE_OBSIDIAN: "#0B0F17",
  BUTTON_SURFACE: "#1e293b",
  SURFACE_OPACITY: 0.85,
  ACCENT_CEMPASUCHIL: "#D99B26",
  ACCENT_TURQUESA: "#008F85",
  ACCENT_COCHINILLA: "#B83A2C",
  TEXT_BONE: "#EDE8DF",
} as const;

export const VR_HUD_ELEMENT_IDS = {
  HUD_ROOT: "cv-vr-hologram-hud",
  PANEL_BACKDROP: "cv-vr-hud-panel",
  EYEBROW_LABEL: "cv-vr-hud-eyebrow",
  ROOM_CHIP: "cv-vr-hud-room-chip",
  SWITCH_2D_BTN: "cv-vr-hud-switch-2d",
  RETURN_LOBBY_BTN: "cv-vr-hud-return-lobby",
  EXIT_BTN: "cv-vr-hud-exit",
  DISMISS_BTN: "cv-vr-hud-dismiss",
  TAP_TRIGGER: "cv-vr-tap-trigger",
} as const;

export const VR_HUD_DICTIONARY = {
  MENU_EYEBROW_LABEL: "MENÚ DE SALA",
  SWITCH_TO_2D_LABEL: "Modo Tactil 2D",
  RETURN_LOBBY_LABEL: "Volver al Lobby",
  EXIT_TOUR_LABEL: "Salir del Recorrido",
  DISMISS_LABEL: "✕",
} as const;

export const CANVAS_TEXT_DEFAULTS = {
  FONT_FAMILY: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  BILLBOARD_CANVAS_WIDTH: 1024,
  BILLBOARD_CANVAS_HEIGHT: 420,
  HEADER_CANVAS_WIDTH: 1024,
  HEADER_CANVAS_HEIGHT: 128,
  BUTTON_CANVAS_SIZE: 128,
  DEFAULT_CANVAS_WIDTH: 1024,
  DEFAULT_CANVAS_HEIGHT: 192,
  DEFAULT_FONT_SIZE_PX: 44,
  DEFAULT_FONT_WEIGHT: "600",
  DEFAULT_PADDING_X_PX: 24,
  DEFAULT_PADDING_Y_PX: 16,
  ELLIPSIS: "…",
  BILLBOARD_TITLE_FONT_PX: 42,
  BILLBOARD_CREATOR_FONT_PX: 30,
  BILLBOARD_DESCRIPTION_FONT_PX: 28,
  BILLBOARD_LINE_GAP_PX: 8,
  BILLBOARD_SECTION_GAP_PX: 14,
} as const;

export const RENDERER_QUALITY_TOKENS = {
  MOBILE_MAX_PIXEL_RATIO: 1.75,
  DESKTOP_MAX_PIXEL_RATIO: 2,
  MIN_PIXEL_RATIO: 1,
  XR_MOBILE_MAX_FRAMEBUFFER_SCALE: 1.15,
  XR_DESKTOP_MAX_FRAMEBUFFER_SCALE: 1.25,
  MIN_XR_FRAMEBUFFER_SCALE: 1,
  DEFAULT_LINEAR_MIPMAP_LINEAR_FILTER: 1008,
  DEFAULT_LINEAR_FILTER: 1006,
  TEXTURE_ANISOTROPY: 4,
  CIRCLE_SEGMENTS: 48,
  SCENE_EXPOSURE: 1.05,
} as const;

export const RETICLE_TOKENS = {
  RENDER_ORDER: 9999,
  DEFAULT_ACCENT_COLOR: "#38bdf8",
  IDLE_DOT_COLOR: "#EDE8DF",
  IDLE_HALO_COLOR: "#0B0F17",
  IDLE_HALO_OPACITY: 0.72,
  IDLE_DOT_RADIUS: 0.0035,
  IDLE_HALO_RADIUS_INNER: 0.0085,
  IDLE_HALO_RADIUS_OUTER: 0.0115,
  PROGRESS_RING_RADIUS_INNER: 0.013,
  PROGRESS_RING_RADIUS_OUTER: 0.018,
  CONFIRM_RING_RADIUS_INNER: 0.019,
  CONFIRM_RING_RADIUS_OUTER: 0.0225,
  PROGRESS_THETA_START_DEG: 90,
  FULL_CIRCLE_DEG: 360,
  CONFIRM_PULSE_MS: 180,
  CONFIRM_PULSE_SCALE: "1.35 1.35 1.35",
  BASE_SCALE: "1 1 1",
  MIN_PROGRESS_EPSILON: 0.005,
  RING_Z_OFFSET: -0.95,
  SURFACE_BIAS_M: 0.02,
  MIN_DEPTH_M: 0.55,
  MAX_DEPTH_M: 4.5,
  REST_DEPTH_M: 2.8,
  REFERENCE_DEPTH_M: 1.0,
  CINEMA_HIDE_DELAY_MS: 300,
  GUIDE_OPACITY: 0.55,
  TOUCH_RAYCASTER_ID: "cv-touch-raycaster",
} as const;

export const INTERACTION_ANIMATION_TOKENS = {
  HOVER_SCALE: 1.08,
  HOVER_Z_LIFT_M: 0.02,
  HOVER_DURATION_MS: 180,
  HOVER_EASING: "easeOutCubic",
  PRESS_SCALE: 0.92,
  PRESS_DURATION_MS: 140,
  PRESS_EASING: "easeOutQuad",
} as const;

export const STAND_ANIMATION_TOKENS = {
  SLIDE_PULSE_MS: 180,
  SLIDE_PULSE_FROM_SCALE: "0.96 0.96 0.96",
  SLIDE_PULSE_TO_SCALE: "1 1 1",
  FRAME_DEPTH_M: 0.12,
  FRAME_BACKING_DEPTH_M: 0.04,
  FRAME_BACKING_Z_M: -0.055,
  RAIL_THICKNESS_M: 0.036,
  RAIL_CENTER_Z_M: -0.01,
  CORNER_ACCENT_SIZE_M: 0.14,
  CORNER_ACCENT_THICKNESS_M: 0.024,
  CORNER_ACCENT_Z_M: -0.01,
  MEDIA_RECESS_Z_M: -0.015,
  CONTROL_BTN_DEPTH_M: 0.024,
} as const;

export const PORTAL_ANIMATION_TOKENS = {
  AMBIENT_PULSE_MS: 2400,
  INNER_RING_OPACITY_MIN: 0.14,
  INNER_RING_OPACITY_MAX: 0.36,
} as const;

export const PROCEDURAL_TEXTURE_TOKENS = {
  MAX_DIMENSION_PX: 512,
  TILE_SIZE_PX: 256,
  CONTACT_SHADOW_SIZE_PX: 128,
  ANISOTROPY: 4,
  DEFAULT_FLOOR_REPEAT: 6,
  MIN_GROUT_LINE_WIDTH_PX: 3,
} as const;

export const ENVIRONMENT_BUDGET_TOKENS = {
  MAX_TRIANGLES: 12000,
  MAX_DRAW_CALLS: 30,
  MIN_PARTICLES: 40,
  MAX_PARTICLES: 60,
  SKY_DOME_RADIUS_M: 42,
  FLOOR_RADIUS_M: 5.4,
  OUTER_GROUND_RADIUS_M: 24,
  LANDSCAPE_INNER_RADIUS_M: 8.5,
  LANDSCAPE_OUTER_RADIUS_M: 22,
  COLUMN_RING_RADIUS_M: 5.2,
  DAIS_RADIUS_M: 1.75,
  DAIS_HEIGHT_M: 0.045,
  WALKWAY_COUNT: 6,
  LANTERN_RING_RADIUS_M: 4.3,
  PARTICLE_SIZE_M: 0.08,
  PARTICLE_RADIUS_M: 0.036,
  PARTICLE_MIN_RADIUS_M: 1.8,
  PARTICLE_MAX_RADIUS_M: 5.0,
  PARTICLE_MIN_HEIGHT_M: 0.65,
  PARTICLE_MAX_HEIGHT_M: 3.6,
  PARTICLE_INSPECTION_CONE_COS: 0.85,
  PARTICLE_INSPECTION_ATTENUATED_SCALE: 0.35,
  SKY_GRADIENT_SIZE_PX: 512,
  MIN_SKY_STAR_RADIUS_PX: 1.8,
} as const;

export const SHADOW_CONFIG_TOKENS = {
  SHADOW_TYPE: "pcf",
  AUTO_UPDATE: false,
  MAP_SIZE_PX: 1024,
  FRUSTUM_HALF_EXTENT_M: 8,
  CAMERA_NEAR_M: 0.5,
  CAMERA_FAR_M: 28,
  SHADOW_BIAS: -0.0005,
} as const;

export const STATION_ARCHITECTURE_TOKENS = {
  PLINTH_HEIGHT_M: 1.16,
  PLINTH_WIDTH_M: 0.92,
  PLINTH_DEPTH_M: 0.36,
  PLINTH_BASE_HEIGHT_M: 0.16,
  PLINTH_CAP_HEIGHT_M: 0.11,
  PEDESTAL_TOTAL_HEIGHT_M: 1.2,
  PEDESTAL_REST_Y: 0,
  PEDESTAL_BASE_OFFSET_Y: -1.2,
  PORTAL_THRESHOLD_HEIGHT_M: 0.14,
  PORTAL_PILLAR_GROUND_DROP_Y: -1.6,
  PORTAL_FLUTED_SEGMENTS: 12,
  CONTACT_SHADOW_CLEARANCE_M: 0.02,
} as const;
