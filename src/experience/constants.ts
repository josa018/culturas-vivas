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

export const HOTSPOT_STYLING = {
  COLOR_PRIMARY: "#f4729b",
  COLOR_SECONDARY: "#f59e0b",
  COLOR_RING_IDLE: "#ffffff",
  COLOR_FOCUSED: "#38bdf8",
  HOTSPOT_RADIUS: 0.12,
  HOTSPOT_RING_INNER: 0.14,
  HOTSPOT_RING_OUTER: 0.18,
  PULSE_SCALE_PEAK: "1.25 1.25 1.25",
  PULSE_DURATION_MS: 1200,
} as const;

export const EXHIBIT_DICTIONARY = {
  RETURN_BUTTON_LABEL: "Volver",
  INSPECT_BUTTON_LABEL: "Inspeccionar",
  CLOSE_ICON: "✕",

  TSIKURI_TITLE: "Tsikuri: Ojo de Dios",
  TSIKURI_DESC:
    "Cruz tejida con hilos concentricos. Simboliza los cinco rumbos del cosmos Wixarika y brinda proteccion espiritual y salud a la infancia.",

  KAUYUMARI_TITLE: "Kauyumari: El Venado Sagrado",
  KAUYUMARI_DESC:
    "Guia espiritual tallado en madera con chaquira. Intermediario sagrado entre el pueblo y las deidades tutelares de la sierra.",

  XUKURIKATE_TITLE: "Xukurikate: Jicara Sagrada",
  XUKURIKATE_DESC:
    "Cuenco ceremonial con iconografia de maiz, agua y peyote para depositar ofrendas y peticiones de abundancia y equilibrio.",

  BORRADOS_TITLE: "Los Borrados de la Judea",
  BORRADOS_DESC:
    "Ritual de Semana Santa Cora. Cuerpos pintados con tizon y ceniza que representan fuerzas cosmicas en la lucha primordial entre luz y sombra.",

  MITOTE_TITLE: "El Mitote y Arco Musical",
  MITOTE_DESC:
    "Ceremonia comunitaria agraria guiada por el ritmo del arco sobre jicara de resonancia, celebrando la fertilidad y la renovacion comunal.",
} as const;

export const PROTOTYPE_EXHIBITS: readonly ExhibitItemConfig[] = [
  {
    id: "exhibit-kauyumari-3d",
    title: EXHIBIT_DICTIONARY.KAUYUMARI_TITLE,
    description: EXHIBIT_DICTIONARY.KAUYUMARI_DESC,
    mediaType: ExhibitMediaType.MODEL_3D,
    galleryPosition: { x: 0, y: 1.4, z: -2.8 },
    galleryRotation: { x: 0, y: 0, z: 0 },
    autoRotate: true,
    rotationSpeed: INSPECTION_TIMINGS.DEFAULT_ROTATION_SPEED,
  },
  {
    id: "exhibit-tsikuri-2d",
    title: EXHIBIT_DICTIONARY.TSIKURI_TITLE,
    description: EXHIBIT_DICTIONARY.TSIKURI_DESC,
    mediaType: ExhibitMediaType.IMAGE_2D,
    galleryPosition: { x: 2.0, y: 1.6, z: -2.0 },
    galleryRotation: { x: 0, y: -45, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
  {
    id: "exhibit-xukurikate-stereo",
    title: EXHIBIT_DICTIONARY.XUKURIKATE_TITLE,
    description: EXHIBIT_DICTIONARY.XUKURIKATE_DESC,
    mediaType: ExhibitMediaType.IMAGE_STEREO_SBS,
    galleryPosition: { x: 2.0, y: 1.6, z: 2.0 },
    galleryRotation: { x: 0, y: -135, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
  {
    id: "exhibit-borrados-2d",
    title: EXHIBIT_DICTIONARY.BORRADOS_TITLE,
    description: EXHIBIT_DICTIONARY.BORRADOS_DESC,
    mediaType: ExhibitMediaType.IMAGE_2D,
    galleryPosition: { x: -2.0, y: 1.6, z: 2.0 },
    galleryRotation: { x: 0, y: 135, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
  {
    id: "exhibit-mitote-video",
    title: EXHIBIT_DICTIONARY.MITOTE_TITLE,
    description: EXHIBIT_DICTIONARY.MITOTE_DESC,
    mediaType: ExhibitMediaType.VIDEO_2D,
    galleryPosition: { x: -2.0, y: 1.6, z: -2.0 },
    galleryRotation: { x: 0, y: 45, z: 0 },
    autoRotate: false,
    rotationSpeed: 0,
  },
] as const;