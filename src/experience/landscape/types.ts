export type LandscapeSpeciesKind =
  | "PINE"
  | "BROADLEAF"
  | "AGAVE"
  | "NOPAL"
  | "ROCK"
  | "CANYON_MESA"
  | "SHRUB"
  | "GRASS_TUFT"
  | "WILDFLOWER"
  | "CLOUD";

export interface IndexedBufferData {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array;
}
