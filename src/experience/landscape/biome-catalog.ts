import type { RoomLandscapeTheme } from "../room-environment-presets";
import type { LandscapeSpeciesKind } from "./types";

export interface BiomeSpeciesSpec {
  readonly kind: LandscapeSpeciesKind;
  readonly count: number;
  readonly innerRadiusM: number;
  readonly outerRadiusM: number;
  readonly minScale: number;
  readonly maxScale: number;
}

const BIOME_SPECIES_CATALOG: Record<
  RoomLandscapeTheme,
  readonly BiomeSpeciesSpec[]
> = {
  atrium: [
    { kind: "BROADLEAF", count: 18, innerRadiusM: 9.5, outerRadiusM: 18.5, minScale: 0.85, maxScale: 1.35 },
    { kind: "AGAVE", count: 14, innerRadiusM: 8.8, outerRadiusM: 15.5, minScale: 0.7, maxScale: 1.15 },
    { kind: "ROCK", count: 14, innerRadiusM: 9.0, outerRadiusM: 20.5, minScale: 0.7, maxScale: 1.4 },
    { kind: "SHRUB", count: 14, innerRadiusM: 8.8, outerRadiusM: 18.0, minScale: 0.75, maxScale: 1.25 },
    { kind: "GRASS_TUFT", count: 26, innerRadiusM: 8.7, outerRadiusM: 19.0, minScale: 0.8, maxScale: 1.35 },
    { kind: "WILDFLOWER", count: 16, innerRadiusM: 8.8, outerRadiusM: 16.5, minScale: 0.85, maxScale: 1.3 },
  ],
  sierra: [
    { kind: "PINE", count: 26, innerRadiusM: 10.2, outerRadiusM: 21.5, minScale: 0.9, maxScale: 1.5 },
    { kind: "AGAVE", count: 16, innerRadiusM: 8.8, outerRadiusM: 16.5, minScale: 0.75, maxScale: 1.2 },
    { kind: "NOPAL", count: 10, innerRadiusM: 9.2, outerRadiusM: 17.5, minScale: 0.8, maxScale: 1.25 },
    { kind: "ROCK", count: 18, innerRadiusM: 8.8, outerRadiusM: 21.0, minScale: 0.7, maxScale: 1.5 },
    { kind: "SHRUB", count: 16, innerRadiusM: 8.8, outerRadiusM: 19.0, minScale: 0.75, maxScale: 1.25 },
    { kind: "GRASS_TUFT", count: 28, innerRadiusM: 8.7, outerRadiusM: 20.0, minScale: 0.8, maxScale: 1.35 },
    { kind: "WILDFLOWER", count: 18, innerRadiusM: 8.8, outerRadiusM: 17.0, minScale: 0.85, maxScale: 1.35 },
  ],
  canyon: [
    { kind: "CANYON_MESA", count: 10, innerRadiusM: 14.0, outerRadiusM: 21.0, minScale: 1.0, maxScale: 1.65 },
    { kind: "BROADLEAF", count: 14, innerRadiusM: 9.0, outerRadiusM: 12.6, minScale: 0.75, maxScale: 1.15 },
    { kind: "AGAVE", count: 12, innerRadiusM: 9.0, outerRadiusM: 16.0, minScale: 0.75, maxScale: 1.2 },
    { kind: "ROCK", count: 18, innerRadiusM: 8.8, outerRadiusM: 20.5, minScale: 0.75, maxScale: 1.45 },
    { kind: "SHRUB", count: 12, innerRadiusM: 8.8, outerRadiusM: 17.5, minScale: 0.7, maxScale: 1.2 },
    { kind: "GRASS_TUFT", count: 22, innerRadiusM: 8.7, outerRadiusM: 18.0, minScale: 0.8, maxScale: 1.3 },
    { kind: "WILDFLOWER", count: 14, innerRadiusM: 8.8, outerRadiusM: 15.5, minScale: 0.85, maxScale: 1.3 },
  ],
  forest: [
    { kind: "BROADLEAF", count: 26, innerRadiusM: 9.5, outerRadiusM: 21.0, minScale: 0.9, maxScale: 1.5 },
    { kind: "PINE", count: 16, innerRadiusM: 11.5, outerRadiusM: 21.5, minScale: 0.95, maxScale: 1.5 },
    { kind: "ROCK", count: 16, innerRadiusM: 8.8, outerRadiusM: 19.5, minScale: 0.7, maxScale: 1.4 },
    { kind: "SHRUB", count: 18, innerRadiusM: 8.8, outerRadiusM: 19.5, minScale: 0.8, maxScale: 1.3 },
    { kind: "GRASS_TUFT", count: 30, innerRadiusM: 8.7, outerRadiusM: 20.0, minScale: 0.85, maxScale: 1.4 },
    { kind: "WILDFLOWER", count: 16, innerRadiusM: 8.8, outerRadiusM: 17.5, minScale: 0.85, maxScale: 1.3 },
  ],
  highland: [
    { kind: "PINE", count: 28, innerRadiusM: 10.0, outerRadiusM: 21.5, minScale: 0.9, maxScale: 1.5 },
    { kind: "NOPAL", count: 12, innerRadiusM: 8.8, outerRadiusM: 16.5, minScale: 0.8, maxScale: 1.25 },
    { kind: "ROCK", count: 18, innerRadiusM: 8.8, outerRadiusM: 20.5, minScale: 0.75, maxScale: 1.5 },
    { kind: "SHRUB", count: 14, innerRadiusM: 8.8, outerRadiusM: 18.5, minScale: 0.75, maxScale: 1.2 },
    { kind: "GRASS_TUFT", count: 24, innerRadiusM: 8.7, outerRadiusM: 19.5, minScale: 0.8, maxScale: 1.35 },
    { kind: "WILDFLOWER", count: 14, innerRadiusM: 8.8, outerRadiusM: 16.5, minScale: 0.85, maxScale: 1.3 },
  ],
} as const;

/**
 * Returns the biome flora and rock species composition for a cultural landscape theme.
 */
export function getBiomeSpeciesSpecs(
  theme: RoomLandscapeTheme,
): readonly BiomeSpeciesSpec[] {
  return BIOME_SPECIES_CATALOG[theme] ?? BIOME_SPECIES_CATALOG.atrium;
}
