import {
  ENVIRONMENT_BUDGET_TOKENS,
  ENVIRONMENT_QUALITY_TOKENS,
  LANDSCAPE_TOKENS,
} from "../constants";
import type { ProceduralTextureLike } from "../procedural-textures";
import type { RoomEnvironmentPreset } from "../room-environment-presets";
import type {
  RoomEnvironmentThreeLike,
  ThreeBufferGeometryLike,
  ThreeObject3DLike,
} from "../room-environment-builder";
import { getBiomeSpeciesSpecs } from "./biome-catalog";
import { mixHexColors } from "./color-math";
import { buildSpeciesGeometryData } from "./low-poly-geometry";
import { buildRidgeGeometryData } from "./ridge-geometry";
import {
  scatterSpecies,
  type OccupiedFootprint,
} from "./scatter";
import { createSeededRandom } from "./seeded-noise";
import {
  buildTerrainGeometryData,
  sampleTerrainHeight,
  type TerrainParams,
} from "./terrain-geometry";
import type { IndexedBufferData, EnvironmentQualityTier } from "./types";

export interface LandscapeTextureBundle {
  readonly groundGrain?: ProceduralTextureLike | null;
  readonly rockStrata?: ProceduralTextureLike | null;
  readonly foliageGrain?: ProceduralTextureLike | null;
}

export interface BuiltLandscape {
  readonly objects: ThreeObject3DLike[];
  readonly update: (elapsedSeconds: number) => void;
}

export function toThreeBufferGeometry(
  data: IndexedBufferData,
  three: RoomEnvironmentThreeLike,
): ThreeBufferGeometryLike {
  const geo = new three.BufferGeometry();
  geo.setAttribute("position", new three.BufferAttribute(data.positions, 3));
  geo.setAttribute("color", new three.BufferAttribute(data.colors, 3));
  geo.setAttribute("uv", new three.BufferAttribute(data.uvs, 2));
  geo.setIndex(Array.from(data.indices));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the exterior low-poly biome landscape objects composed into a room environment.
 */
export function buildLandscape(
  preset: RoomEnvironmentPreset,
  three: RoomEnvironmentThreeLike,
  textures: LandscapeTextureBundle = {},
  qualityTier: EnvironmentQualityTier = ENVIRONMENT_QUALITY_TOKENS.DEFAULT_TIER,
): BuiltLandscape {
  const isEco = qualityTier === ENVIRONMENT_QUALITY_TOKENS.ECO_TIER;
  const objects: ThreeObject3DLike[] = [];

  const terrainParams: TerrainParams = {
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

  const terrainData = buildTerrainGeometryData(terrainParams);
  const terrainGeo = toThreeBufferGeometry(terrainData, three);
  const terrainMat = new three.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    ...(textures.groundGrain && !isEco
      ? {
          map: textures.groundGrain,
          bumpMap: textures.groundGrain,
          bumpScale: LANDSCAPE_TOKENS.BUMP_SCALE,
        }
      : {}),
  });
  const terrainMesh = new three.Mesh(terrainGeo, terrainMat);
  terrainMesh.name = "cv-env-terrain";
  terrainMesh.receiveShadow = true;
  objects.push(terrainMesh);

  const ridgeNames = [
    "cv-env-ridge-near",
    "cv-env-ridge-mid",
    "cv-env-ridge-far",
  ] as const;
  for (let layerIdx = 0; layerIdx < ridgeNames.length; layerIdx++) {
    const ridgeHex = mixHexColors(
      preset.landscape.ridgeColor,
      preset.fog.color,
      LANDSCAPE_TOKENS.RIDGE_FOG_BLEND_WEIGHTS[layerIdx]!,
    );
    const ridgeData = buildRidgeGeometryData({
      radius: LANDSCAPE_TOKENS.RIDGE_RADII_M[layerIdx]!,
      segments: LANDSCAPE_TOKENS.RIDGE_SEGMENTS,
      baseY: LANDSCAPE_TOKENS.RIDGE_BASE_Y_M,
      height: LANDSCAPE_TOKENS.RIDGE_HEIGHTS_M[layerIdx]!,
      amplitude: LANDSCAPE_TOKENS.RIDGE_AMPLITUDES_M[layerIdx]!,
      colorHex: ridgeHex,
      seed: preset.landscape.seed + (layerIdx + 1) * 37,
    });
    const ridgeGeo = toThreeBufferGeometry(ridgeData, three);
    const ridgeMat = new three.MeshBasicMaterial({
      color: ridgeHex,
      fog: false,
    });
    const ridgeMesh = new three.Mesh(ridgeGeo, ridgeMat);
    ridgeMesh.name = ridgeNames[layerIdx]!;
    objects.push(ridgeMesh);
  }

  const speciesSpecs = getBiomeSpeciesSpecs(preset.landscapeTheme, qualityTier);
  const matrix = new three.Matrix4();
  const pos = new three.Vector3();
  const quat = new three.Quaternion();
  const euler = new three.Euler();
  const scaleVec = new three.Vector3();
  const tintColor = new three.Color();
  const heightSampler = (x: number, z: number) =>
    sampleTerrainHeight(terrainParams, x, z);
  const occupiedLandFootprints: OccupiedFootprint[] = [];

  for (let specIdx = 0; specIdx < speciesSpecs.length; specIdx++) {
    const spec = speciesSpecs[specIdx]!;
    const speciesGeo = toThreeBufferGeometry(
      buildSpeciesGeometryData(spec.kind),
      three,
    );
    const reliefTex =
      spec.kind === "ROCK" || spec.kind === "CANYON_MESA"
        ? textures.rockStrata
        : textures.foliageGrain;
    const speciesMat = new three.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      ...(reliefTex && !isEco
        ? {
            map: reliefTex,
            bumpMap: reliefTex,
            bumpScale: LANDSCAPE_TOKENS.BUMP_SCALE,
          }
        : {}),
    });

    const effectiveCount = isEco
      ? Math.max(
          LANDSCAPE_TOKENS.ECO_MIN_INSTANCES,
          Math.round(spec.count * LANDSCAPE_TOKENS.ECO_INSTANCE_SCALE),
        )
      : spec.count;
    const placements = scatterSpecies(
      { ...spec, count: effectiveCount },
      preset.landscape.seed + (specIdx + 1) * 53,
      heightSampler,
      ENVIRONMENT_BUDGET_TOKENS.WALKWAY_COUNT,
      occupiedLandFootprints,
      LANDSCAPE_TOKENS.SPECIES_FOOTPRINT_RADIUS_M[spec.kind],
    );
    const instanced = new three.InstancedMesh(
      speciesGeo,
      speciesMat,
      placements.length,
    );
    instanced.name = `cv-env-flora-${spec.kind.toLowerCase().replace(/_/g, "-")}`;
    instanced.receiveShadow = true;

    const baseHex = preset.landscape.floraPalette[spec.kind];
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      pos.set(p.x, p.y, p.z);
      euler.y = p.rotY;
      quat.setFromEuler(euler);
      scaleVec.set(p.scale, p.scale, p.scale);
      matrix.compose(pos, quat, scaleVec);
      instanced.setMatrixAt(i, matrix);

      tintColor.set(baseHex).multiplyScalar(p.tintFactor);
      instanced.setColorAt(i, tintColor);
    }

    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) {
      instanced.instanceColor.needsUpdate = true;
    }
    objects.push(instanced);
  }

  if (isEco) {
    return {
      objects,
      update: () => {},
    };
  }

  const faunaIsBirds = preset.landscape.fauna === "birds";
  const faunaCount = faunaIsBirds
    ? LANDSCAPE_TOKENS.FAUNA_BIRD_COUNT
    : LANDSCAPE_TOKENS.FAUNA_FIREFLY_COUNT;
  const faunaGeo = faunaIsBirds
    ? toThreeBufferGeometry(
        {
          positions: new Float32Array([
            0, 0, -0.18,
            0, 0, 0.18,
            -0.34, 0.14, 0.04,
            0.34, 0.14, 0.04,
          ]),
          colors: new Float32Array([
            1, 1, 1,
            1, 1, 1,
            0.85, 0.85, 0.85,
            0.85, 0.85, 0.85,
          ]),
          uvs: new Float32Array([0, 0, 0, 1, 1, 0.5, 1, 0.5]),
          indices: new Uint16Array([0, 1, 2, 0, 3, 1]),
        },
        three,
      )
    : new three.OctahedronGeometry(0.045, 0);
  const faunaMat = faunaIsBirds
    ? new three.MeshBasicMaterial({
        color: "#1e293b",
      })
    : new three.MeshLambertMaterial({
        color: preset.particleColor,
        emissive: preset.particleColor,
        emissiveIntensity: 0.75,
      });
  const faunaMesh = new three.InstancedMesh(faunaGeo, faunaMat, faunaCount);
  faunaMesh.name = "cv-env-fauna";
  faunaMesh.userData = { ...(faunaMesh.userData ?? {}), isAmbientParticles: false };
  objects.push(faunaMesh);

  const faunaRand = createSeededRandom(preset.landscape.seed + 909);
  const faunaSeeds = Array.from({ length: faunaCount }, () => ({
    angle0: faunaRand() * Math.PI * 2,
    radius: faunaIsBirds
      ? LANDSCAPE_TOKENS.FAUNA_BIRD_RADIUS_MIN_M +
        (LANDSCAPE_TOKENS.FAUNA_BIRD_RADIUS_MAX_M -
          LANDSCAPE_TOKENS.FAUNA_BIRD_RADIUS_MIN_M) *
          faunaRand()
      : LANDSCAPE_TOKENS.FAUNA_FIREFLY_RADIUS_MIN_M +
        (LANDSCAPE_TOKENS.FAUNA_FIREFLY_RADIUS_MAX_M -
          LANDSCAPE_TOKENS.FAUNA_FIREFLY_RADIUS_MIN_M) *
          faunaRand(),
    height: faunaIsBirds
      ? LANDSCAPE_TOKENS.FAUNA_BIRD_HEIGHT_MIN_M +
        (LANDSCAPE_TOKENS.FAUNA_BIRD_HEIGHT_MAX_M -
          LANDSCAPE_TOKENS.FAUNA_BIRD_HEIGHT_MIN_M) *
          faunaRand()
      : LANDSCAPE_TOKENS.FAUNA_FIREFLY_HEIGHT_MIN_M +
        (LANDSCAPE_TOKENS.FAUNA_FIREFLY_HEIGHT_MAX_M -
          LANDSCAPE_TOKENS.FAUNA_FIREFLY_HEIGHT_MIN_M) *
          faunaRand(),
    speed: (faunaIsBirds ? 0.14 : 0.28) * (0.75 + faunaRand() * 0.5),
    phase: faunaRand() * Math.PI * 2,
  }));

  const faunaMatrix = new three.Matrix4();
  const faunaPos = new three.Vector3();
  const faunaQuat = new three.Quaternion();
  const faunaEuler = new three.Euler();
  const faunaScale = new three.Vector3(1, 1, 1);

  const updateFauna = (elapsedSeconds: number): void => {
    for (let i = 0; i < faunaCount; i++) {
      const f = faunaSeeds[i]!;
      if (faunaIsBirds) {
        const theta = f.angle0 + elapsedSeconds * f.speed;
        const x = Math.cos(theta) * f.radius;
        const z = Math.sin(theta) * f.radius;
        const y = f.height + Math.sin(elapsedSeconds * 1.1 + f.phase) * 0.35;
        const flap = 0.4 + 0.8 * Math.sin(elapsedSeconds * 7.2 + f.phase);
        faunaPos.set(x, y, z);
        faunaEuler.y = -theta;
        faunaQuat.setFromEuler(faunaEuler);
        faunaScale.set(1, flap, 1);
      } else {
        const theta = f.angle0 + Math.sin(elapsedSeconds * f.speed + f.phase) * 0.25;
        const r = f.radius + Math.cos(elapsedSeconds * 0.5 + f.phase) * 0.6;
        const y = f.height + Math.sin(elapsedSeconds * 1.4 + f.phase) * 0.32;
        const pulse = 0.65 + 0.45 * Math.sin(elapsedSeconds * 3.1 + f.phase);
        faunaPos.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
        faunaEuler.y = theta;
        faunaQuat.setFromEuler(faunaEuler);
        faunaScale.set(pulse, pulse, pulse);
      }
      faunaMatrix.compose(faunaPos, faunaQuat, faunaScale);
      faunaMesh.setMatrixAt(i, faunaMatrix);
    }
    faunaMesh.instanceMatrix.needsUpdate = true;
  };

  updateFauna(0);

  const cloudCount = LANDSCAPE_TOKENS.CLOUD_COUNT;
  const cloudGeo = toThreeBufferGeometry(
    buildSpeciesGeometryData("CLOUD"),
    three,
  );
  const cloudMat = new three.MeshLambertMaterial({
    color: preset.landscape.floraPalette.CLOUD,
    vertexColors: true,
    flatShading: true,
  });
  const cloudsMesh = new three.InstancedMesh(cloudGeo, cloudMat, cloudCount);
  cloudsMesh.name = "cv-env-clouds";
  objects.push(cloudsMesh);

  const cloudRand = createSeededRandom(preset.landscape.seed + 1212);
  const cloudSeeds = Array.from({ length: cloudCount }, (_, idx) => ({
    angle0: (idx / cloudCount) * Math.PI * 2 + cloudRand() * 0.35,
    radius:
      LANDSCAPE_TOKENS.CLOUD_RADIUS_MIN_M +
      (LANDSCAPE_TOKENS.CLOUD_RADIUS_MAX_M -
        LANDSCAPE_TOKENS.CLOUD_RADIUS_MIN_M) *
        cloudRand(),
    height:
      LANDSCAPE_TOKENS.CLOUD_HEIGHT_MIN_M +
      (LANDSCAPE_TOKENS.CLOUD_HEIGHT_MAX_M -
        LANDSCAPE_TOKENS.CLOUD_HEIGHT_MIN_M) *
        cloudRand(),
    scale: 0.85 + cloudRand() * 0.55,
  }));

  const updateClouds = (elapsedSeconds: number): void => {
    for (let i = 0; i < cloudCount; i++) {
      const c = cloudSeeds[i]!;
      const theta =
        c.angle0 + elapsedSeconds * LANDSCAPE_TOKENS.CLOUD_DRIFT_SPEED;
      faunaPos.set(
        Math.cos(theta) * c.radius,
        c.height,
        Math.sin(theta) * c.radius,
      );
      faunaEuler.y = -theta;
      faunaQuat.setFromEuler(faunaEuler);
      faunaScale.set(c.scale, c.scale * 0.85, c.scale);
      faunaMatrix.compose(faunaPos, faunaQuat, faunaScale);
      cloudsMesh.setMatrixAt(i, faunaMatrix);
    }
    cloudsMesh.instanceMatrix.needsUpdate = true;
  };

  updateClouds(0);

  return {
    objects,
    update: (elapsedSeconds: number) => {
      updateFauna(elapsedSeconds);
      updateClouds(elapsedSeconds);
    },
  };
}
