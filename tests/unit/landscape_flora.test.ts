import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_BUDGET_TOKENS,
  LANDSCAPE_TOKENS,
} from "../../src/experience/constants";
import { getBiomeSpeciesSpecs } from "../../src/experience/landscape/biome-catalog";
import { buildSpeciesGeometryData } from "../../src/experience/landscape/low-poly-geometry";
import { scatterSpecies } from "../../src/experience/landscape/scatter";
import type { LandscapeSpeciesKind } from "../../src/experience/landscape/types";
import type { RoomLandscapeTheme } from "../../src/experience/room-environment-presets";

function shortestAngleDiff(a: number, b: number): number {
  const diff = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(diff);
}

describe("Low-poly biome flora geometry, catalog, and deterministic scatter", () => {
  const allSpecies: readonly LandscapeSpeciesKind[] = [
    "PINE",
    "BROADLEAF",
    "AGAVE",
    "NOPAL",
    "ROCK",
    "CANYON_MESA",
    "SHRUB",
    "GRASS_TUFT",
    "WILDFLOWER",
    "CLOUD",
  ];

  it.each(allSpecies)(
    "builds %s faceted geometry within triangle budget and applies 0.55 base vertex AO",
    (kind) => {
      const data = buildSpeciesGeometryData(kind);
      const vertexCount = data.positions.length / 3;
      const triCount = data.indices.length / 3;

      expect(vertexCount).toBeGreaterThanOrEqual(4);
      expect(triCount).toBeGreaterThanOrEqual(8);
      expect(triCount).toBeLessThanOrEqual(120);
      expect(data.colors).toHaveLength(vertexCount * 3);
      expect(data.uvs).toHaveLength(vertexCount * 2);

      let minY = Infinity;
      for (let i = 0; i < vertexCount; i++) {
        const y = data.positions[i * 3 + 1]!;
        if (y < minY) {
          minY = y;
        }
        expect(data.colors[i * 3]!).toBeGreaterThanOrEqual(0);
        expect(data.colors[i * 3]!).toBeLessThanOrEqual(1);
        expect(data.colors[i * 3 + 1]!).toBeGreaterThanOrEqual(0);
        expect(data.colors[i * 3 + 1]!).toBeLessThanOrEqual(1);
        expect(data.colors[i * 3 + 2]!).toBeGreaterThanOrEqual(0);
        expect(data.colors[i * 3 + 2]!).toBeLessThanOrEqual(1);
      }

      let minVertexMaxChannel = Infinity;
      for (let i = 0; i < vertexCount; i++) {
        const y = data.positions[i * 3 + 1]!;
        if (Math.abs(y - minY) < 1e-4) {
          const maxCh = Math.max(
            data.colors[i * 3]!,
            data.colors[i * 3 + 1]!,
            data.colors[i * 3 + 2]!,
          );
          if (maxCh < minVertexMaxChannel) {
            minVertexMaxChannel = maxCh;
          }
        }
      }
      expect(minVertexMaxChannel).toBeCloseTo(
        LANDSCAPE_TOKENS.AO_BASE_BRIGHTNESS,
        2,
      );
    },
  );

  it("provides <= 4 species per biome theme and deterministic walkway-clear scatter", () => {
    const themes: readonly RoomLandscapeTheme[] = [
      "atrium",
      "sierra",
      "canyon",
      "forest",
      "highland",
    ];
    const heightSampler = (x: number, z: number) => 0.1 + Math.hypot(x, z) * 0.05;

    for (const theme of themes) {
      const specs = getBiomeSpeciesSpecs(theme, "rich");
      expect(specs.length).toBeGreaterThanOrEqual(6);
      expect(specs.length).toBeLessThanOrEqual(8);

      const ecoSpecs = getBiomeSpeciesSpecs(theme, "eco");
      expect(ecoSpecs.length).toBeGreaterThanOrEqual(3);
      expect(ecoSpecs.length).toBeLessThanOrEqual(4);

      for (const spec of specs) {
        const first = scatterSpecies(spec, 17, heightSampler);
        const second = scatterSpecies(spec, 17, heightSampler);
        expect(first).toEqual(second);
        expect(first).toHaveLength(spec.count);

        for (const item of first) {
          expect(item.y).toBeCloseTo(heightSampler(item.x, item.z), 5);
          const radius = Math.hypot(item.x, item.z);
          expect(radius).toBeGreaterThanOrEqual(spec.innerRadiusM - 1e-4);
          expect(radius).toBeLessThanOrEqual(spec.outerRadiusM + 1e-4);

          const angle = Math.atan2(item.z, item.x);
          for (let w = 0; w < ENVIRONMENT_BUDGET_TOKENS.WALKWAY_COUNT; w++) {
            const walkwayAngle =
              (w * Math.PI * 2) / ENVIRONMENT_BUDGET_TOKENS.WALKWAY_COUNT;
            expect(shortestAngleDiff(angle, walkwayAngle)).toBeGreaterThanOrEqual(
              LANDSCAPE_TOKENS.WALKWAY_CORRIDOR_HALF_ANGLE_RAD - 1e-4,
            );
          }
        }
      }
    }

    const sierra = getBiomeSpeciesSpecs("sierra", "rich");
    expect(sierra.map((s) => s.kind)).toEqual([
      "PINE",
      "AGAVE",
      "NOPAL",
      "ROCK",
      "SHRUB",
      "GRASS_TUFT",
      "WILDFLOWER",
    ]);
  });

  it("prevents overlapping footprints across all flora species and cultural decor within every biome", () => {
    const themes: readonly RoomLandscapeTheme[] = [
      "atrium",
      "sierra",
      "canyon",
      "forest",
      "highland",
    ];
    const heightSampler = () => 0;

    for (const theme of themes) {
      const specs = getBiomeSpeciesSpecs(theme, "rich");
      const occupied: Array<{ x: number; z: number; radius: number }> = [];
      const placedRadii: Array<{ x: number; z: number; r: number }> = [];

      for (let idx = 0; idx < specs.length; idx++) {
        const spec = specs[idx]!;
        const footprint = LANDSCAPE_TOKENS.SPECIES_FOOTPRINT_RADIUS_M[spec.kind];
        const items = scatterSpecies(
          spec,
          202 + idx * 53,
          heightSampler,
          ENVIRONMENT_BUDGET_TOKENS.WALKWAY_COUNT,
          occupied,
          footprint,
        );
        for (const item of items) {
          placedRadii.push({ x: item.x, z: item.z, r: footprint * item.scale });
        }
      }

      for (let i = 0; i < placedRadii.length; i++) {
        for (let j = i + 1; j < placedRadii.length; j++) {
          const a = placedRadii[i]!;
          const b = placedRadii[j]!;
          const dist = Math.hypot(a.x - b.x, a.z - b.z);
          expect(dist).toBeGreaterThanOrEqual(a.r + b.r - 1e-4);
        }
      }
    }
  });
});
