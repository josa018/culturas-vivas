import type { RoomLandscapeTheme } from "../room-environment-presets";
import type { EnvironmentQualityTier, LandscapeSpeciesKind } from "./types";

export interface BiomeSpeciesSpec {
  readonly kind: LandscapeSpeciesKind;
  readonly count: number;
  readonly innerRadiusM: number;
  readonly outerRadiusM: number;
  readonly minScale: number;
  readonly maxScale: number;
  readonly tierScope: "core" | "richOnly";
}

const BIOME_SPECIES_CATALOG: Record<
  RoomLandscapeTheme,
  readonly BiomeSpeciesSpec[]
> = {
  atrium: [
    { kind: "BROADLEAF", count: 18, innerRadiusM: 9.5, outerRadiusM: 18.5, minScale: 0.85, maxScale: 1.35, tierScope: "core" },
    { kind: "AGAVE", count: 14, innerRadiusM: 8.8, outerRadiusM: 15.5, minScale: 0.7, maxScale: 1.15, tierScope: "core" },
    { kind: "ROCK", count: 14, innerRadiusM: 9.0, outerRadiusM: 20.5, minScale: 0.7, maxScale: 1.4, tierScope: "core" },
    { kind: "SHRUB", count: 14, innerRadiusM: 8.8, outerRadiusM: 18.0, minScale: 0.75, maxScale: 1.25, tierScope: "richOnly" },
    { kind: "GRASS_TUFT", count: 26, innerRadiusM: 8.7, outerRadiusM: 19.0, minScale: 0.8, maxScale: 1.35, tierScope: "richOnly" },
    { kind: "WILDFLOWER", count: 16, innerRadiusM: 8.8, outerRadiusM: 16.5, minScale: 0.85, maxScale: 1.3, tierScope: "richOnly" },
  ],
  sierra: [
    { kind: "PINE", count: 26, innerRadiusM: 10.2, outerRadiusM: 21.5, minScale: 0.9, maxScale: 1.5, tierScope: "core" },
    { kind: "AGAVE", count: 16, innerRadiusM: 8.8, outerRadiusM: 16.5, minScale: 0.75, maxScale: 1.2, tierScope: "core" },
    { kind: "NOPAL", count: 10, innerRadiusM: 9.2, outerRadiusM: 17.5, minScale: 0.8, maxScale: 1.25, tierScope: "core" },
    { kind: "ROCK", count: 18, innerRadiusM: 8.8, outerRadiusM: 21.0, minScale: 0.7, maxScale: 1.5, tierScope: "core" },
    { kind: "SHRUB", count: 16, innerRadiusM: 8.8, outerRadiusM: 19.0, minScale: 0.75, maxScale: 1.25, tierScope: "richOnly" },
    { kind: "GRASS_TUFT", count: 28, innerRadiusM: 8.7, outerRadiusM: 20.0, minScale: 0.8, maxScale: 1.35, tierScope: "richOnly" },
    { kind: "WILDFLOWER", count: 18, innerRadiusM: 8.8, outerRadiusM: 17.0, minScale: 0.85, maxScale: 1.35, tierScope: "richOnly" },
  ],
  canyon: [
    { kind: "CANYON_MESA", count: 10, innerRadiusM: 14.0, outerRadiusM: 21.0, minScale: 1.0, maxScale: 1.65, tierScope: "core" },
    { kind: "BROADLEAF", count: 14, innerRadiusM: 9.0, outerRadiusM: 12.6, minScale: 0.75, maxScale: 1.15, tierScope: "core" },
    { kind: "AGAVE", count: 12, innerRadiusM: 9.0, outerRadiusM: 16.0, minScale: 0.75, maxScale: 1.2, tierScope: "core" },
    { kind: "ROCK", count: 18, innerRadiusM: 8.8, outerRadiusM: 20.5, minScale: 0.75, maxScale: 1.45, tierScope: "core" },
    { kind: "SHRUB", count: 12, innerRadiusM: 8.8, outerRadiusM: 17.5, minScale: 0.7, maxScale: 1.2, tierScope: "richOnly" },
    { kind: "GRASS_TUFT", count: 22, innerRadiusM: 8.7, outerRadiusM: 18.0, minScale: 0.8, maxScale: 1.3, tierScope: "richOnly" },
    { kind: "WILDFLOWER", count: 14, innerRadiusM: 8.8, outerRadiusM: 15.5, minScale: 0.85, maxScale: 1.3, tierScope: "richOnly" },
  ],
  forest: [
    { kind: "BROADLEAF", count: 26, innerRadiusM: 9.5, outerRadiusM: 21.0, minScale: 0.9, maxScale: 1.5, tierScope: "core" },
    { kind: "PINE", count: 16, innerRadiusM: 11.5, outerRadiusM: 21.5, minScale: 0.95, maxScale: 1.5, tierScope: "core" },
    { kind: "ROCK", count: 16, innerRadiusM: 8.8, outerRadiusM: 19.5, minScale: 0.7, maxScale: 1.4, tierScope: "core" },
    { kind: "SHRUB", count: 18, innerRadiusM: 8.8, outerRadiusM: 19.5, minScale: 0.8, maxScale: 1.3, tierScope: "richOnly" },
    { kind: "GRASS_TUFT", count: 30, innerRadiusM: 8.7, outerRadiusM: 20.0, minScale: 0.85, maxScale: 1.4, tierScope: "richOnly" },
    { kind: "WILDFLOWER", count: 16, innerRadiusM: 8.8, outerRadiusM: 17.5, minScale: 0.85, maxScale: 1.3, tierScope: "richOnly" },
  ],
  highland: [
    { kind: "PINE", count: 28, innerRadiusM: 10.0, outerRadiusM: 21.5, minScale: 0.9, maxScale: 1.5, tierScope: "core" },
    { kind: "NOPAL", count: 12, innerRadiusM: 8.8, outerRadiusM: 16.5, minScale: 0.8, maxScale: 1.25, tierScope: "core" },
    { kind: "ROCK", count: 18, innerRadiusM: 8.8, outerRadiusM: 20.5, minScale: 0.75, maxScale: 1.5, tierScope: "core" },
    { kind: "SHRUB", count: 14, innerRadiusM: 8.8, outerRadiusM: 18.5, minScale: 0.75, maxScale: 1.2, tierScope: "richOnly" },
    { kind: "GRASS_TUFT", count: 24, innerRadiusM: 8.7, outerRadiusM: 19.5, minScale: 0.8, maxScale: 1.35, tierScope: "richOnly" },
    { kind: "WILDFLOWER", count: 14, innerRadiusM: 8.8, outerRadiusM: 16.5, minScale: 0.85, maxScale: 1.3, tierScope: "richOnly" },
  ],
} as const;

/**
 * Returns the biome flora and rock species composition for a cultural landscape theme and quality tier.
 */
export function getBiomeSpeciesSpecs(
  theme: RoomLandscapeTheme,
  qualityTier: EnvironmentQualityTier = "rich",
): readonly BiomeSpeciesSpec[] {
  const specs = BIOME_SPECIES_CATALOG[theme] ?? BIOME_SPECIES_CATALOG.atrium;
  if (qualityTier === "eco") {
    return specs.filter((spec) => spec.tierScope === "core");
  }
  return specs;
}
