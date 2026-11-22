import { describe, expect, it } from "vitest";
import { RoomId } from "../../src/shared/room-catalog";
import {
  ENVIRONMENT_BUDGET_TOKENS,
  LANDSCAPE_TOKENS,
} from "../../src/experience/constants";
import { getRoomEnvironmentPreset } from "../../src/experience/room-environment-presets";
import {
  buildTerrainGeometryData,
  sampleTerrainHeight,
  type TerrainParams,
} from "../../src/experience/landscape/terrain-geometry";

function makeTerrainParams(roomId: RoomId): TerrainParams {
  const preset = getRoomEnvironmentPreset(roomId);
  return {
    innerRadiusM: ENVIRONMENT_BUDGET_TOKENS.LANDSCAPE_INNER_RADIUS_M,
    outerRadiusM: ENVIRONMENT_BUDGET_TOKENS.OUTER_GROUND_RADIUS_M,
    rings: LANDSCAPE_TOKENS.TERRAIN_RINGS,
    segments: LANDSCAPE_TOKENS.TERRAIN_SEGMENTS,
    flatY: LANDSCAPE_TOKENS.TERRAIN_FLAT_Y_M,
    maxHeightM: preset.landscape.terrainMaxHeightM,
    groundLowColor: preset.landscape.groundLowColor,
    groundHighColor: preset.landscape.groundHighColor,
    groundTileM: LANDSCAPE_TOKENS.GROUND_TILE_M,
    seed: preset.landscape.seed,
  };
}

describe("Low-poly biome terrain geometry and height sampler seams", () => {
  it("keeps pavilion basin flat at TERRAIN_FLAT_Y_M for r <= 8.5 and rises outward across all presets", () => {
    for (const roomId of Object.values(RoomId)) {
      const params = makeTerrainParams(roomId);
      expect(sampleTerrainHeight(params, 0, 0)).toBe(LANDSCAPE_TOKENS.TERRAIN_FLAT_Y_M);
      expect(
        sampleTerrainHeight(
          params,
          ENVIRONMENT_BUDGET_TOKENS.LANDSCAPE_INNER_RADIUS_M,
          0,
        ),
      ).toBe(LANDSCAPE_TOKENS.TERRAIN_FLAT_Y_M);
      expect(
        sampleTerrainHeight(
          params,
          0,
          -ENVIRONMENT_BUDGET_TOKENS.LANDSCAPE_INNER_RADIUS_M,
        ),
      ).toBe(LANDSCAPE_TOKENS.TERRAIN_FLAT_Y_M);
      expect(
        sampleTerrainHeight(
          params,
          ENVIRONMENT_BUDGET_TOKENS.OUTER_GROUND_RADIUS_M,
          0,
        ),
      ).toBeGreaterThan(LANDSCAPE_TOKENS.TERRAIN_FLAT_Y_M);
    }
  });

  it("emits 960 triangles (2880 indices), normalized RGB vertex colors, and planar UVs", () => {
    const params = makeTerrainParams(RoomId.WIXARIKA);
    const data = buildTerrainGeometryData(params);

    expect(data.indices).toHaveLength(
      LANDSCAPE_TOKENS.TERRAIN_RINGS * LANDSCAPE_TOKENS.TERRAIN_SEGMENTS * 6,
    );
    expect(data.indices).toHaveLength(2880);

    const expectedVertexCount =
      (LANDSCAPE_TOKENS.TERRAIN_RINGS + 1) * LANDSCAPE_TOKENS.TERRAIN_SEGMENTS;
    expect(data.positions).toHaveLength(expectedVertexCount * 3);
    expect(data.colors).toHaveLength(expectedVertexCount * 3);
    expect(data.uvs).toHaveLength(expectedVertexCount * 2);

    for (let i = 0; i < data.colors.length; i++) {
      expect(data.colors[i]).toBeGreaterThanOrEqual(0);
      expect(data.colors[i]).toBeLessThanOrEqual(1);
    }

    // Verify planar UV scaling at outermost vertex along +X (ring = TERRAIN_RINGS, seg = 0)
    const outerVertexStart =
      LANDSCAPE_TOKENS.TERRAIN_RINGS * LANDSCAPE_TOKENS.TERRAIN_SEGMENTS;
    const vx = data.positions[outerVertexStart * 3]!;
    const vz = data.positions[outerVertexStart * 3 + 2]!;
    const u = data.uvs[outerVertexStart * 2]!;
    const v = data.uvs[outerVertexStart * 2 + 1]!;
    expect(u).toBeCloseTo(vx / LANDSCAPE_TOKENS.GROUND_TILE_M, 4);
    expect(v).toBeCloseTo(vz / LANDSCAPE_TOKENS.GROUND_TILE_M, 4);
  });
});
