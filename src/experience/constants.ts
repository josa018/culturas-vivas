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
