import { RoomId } from "../shared/room-catalog";
import {
  ENVIRONMENT_BUDGET_TOKENS,
  PROCEDURAL_TEXTURE_TOKENS,
  SHADOW_CONFIG_TOKENS,
} from "./constants";
import {
  createProceduralTexture,
  createRoomTextureSet,
  PROCEDURAL_TEXTURE_KIND,
  type ProceduralTextureDependencies,
  type ProceduralTextureLike,
} from "./procedural-textures";
import {
  getRoomEnvironmentPreset,
  type RoomEnvironmentPreset,
} from "./room-environment-presets";
import { disposeObject3DResources } from "./three-disposal";

export interface RoomEnvironmentBudgetReport {
  readonly triangleCount: number;
  readonly drawCalls: number;
  readonly particleCount: number;
  readonly withinBudget: boolean;
}

export interface RoomEnvironmentThreeLike {
  readonly BackSide: number;
  readonly RepeatWrapping: number;
  readonly ClampToEdgeWrapping: number;
  readonly Group: new () => ThreeObject3DLike;
  readonly SphereGeometry: new (
    radius: number,
    widthSegments: number,
    heightSegments: number,
  ) => ThreeGeometryLike;
  readonly CylinderGeometry: new (
    radiusTop: number,
    radiusBottom: number,
    height: number,
    radialSegments: number,
  ) => ThreeGeometryLike;
  readonly RingGeometry: new (
    innerRadius: number,
    outerRadius: number,
    thetaSegments: number,
  ) => ThreeGeometryLike;
  readonly ConeGeometry: new (
    radius: number,
    height: number,
    radialSegments: number,
  ) => ThreeGeometryLike;
  readonly BoxGeometry: new (
    width: number,
    height: number,
    depth: number,
  ) => ThreeGeometryLike;
  readonly OctahedronGeometry: new (radius: number, detail?: number) => ThreeGeometryLike;
  readonly TorusGeometry: new (
    radius: number,
    tube: number,
    radialSegments: number,
    tubularSegments: number,
  ) => ThreeGeometryLike;
  readonly BufferGeometry: new () => ThreeBufferGeometryLike;
  readonly BufferAttribute: new (
    array: Float32Array,
    itemSize: number,
  ) => ThreeBufferAttributeLike;
  readonly MeshBasicMaterial: new (params: Record<string, unknown>) => unknown;
  readonly MeshLambertMaterial: new (params: Record<string, unknown>) => unknown;
  readonly PointsMaterial: new (params: Record<string, unknown>) => unknown;
  readonly Mesh: new (geometry: ThreeGeometryLike, material: unknown) => ThreeObject3DLike;
  readonly InstancedMesh: new (
    geometry: ThreeGeometryLike,
    material: unknown,
    count: number,
  ) => ThreeInstancedMeshLike;
  readonly Points: new (geometry: ThreeBufferGeometryLike, material: unknown) => ThreePointsLike;
  readonly DirectionalLight: new (color: string, intensity: number) => ThreeDirectionalLightLike;
  readonly HemisphereLight: new (
    skyColor: string,
    groundColor: string,
    intensity: number,
  ) => ThreeObject3DLike;
  readonly Fog: new (color: string, near: number, far: number) => unknown;
  readonly CanvasTexture: new (canvas: HTMLCanvasElement) => ProceduralTextureLike;
  readonly Matrix4: new () => ThreeMatrix4Like;
  readonly Vector3: new (x?: number, y?: number, z?: number) => ThreeVector3Like;
  readonly Quaternion: new () => ThreeQuaternionLike;
  readonly Euler: new (x?: number, y?: number, z?: number) => unknown;
}

interface ThreeGeometryLike {
  dispose?: () => void;
  index?: { count: number } | null;
  attributes?: { position?: { count: number } };
}

interface ThreeBufferAttributeLike {
  array: Float32Array;
  itemSize: number;
  count: number;
  needsUpdate: boolean;
}

interface ThreeBufferGeometryLike extends ThreeGeometryLike {
  setAttribute(name: string, attribute: ThreeBufferAttributeLike): void;
}

interface ThreeVector3Like {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
}

interface ThreeQuaternionLike {
  setFromEuler(euler: unknown): unknown;
}

interface ThreeMatrix4Like {
  compose(pos: ThreeVector3Like, quat: ThreeQuaternionLike, scale: ThreeVector3Like): unknown;
}

export interface ThreeObject3DLike {
  name: string;
  children: ThreeObject3DLike[];
  position: ThreeVector3Like;
  rotation: { set(x: number, y: number, z: number): void };
  castShadow?: boolean;
  receiveShadow?: boolean;
  add(...objects: ThreeObject3DLike[]): void;
  remove(object: ThreeObject3DLike): void;
  traverse(callback: (node: unknown) => void): void;
}

interface ThreeInstancedMeshLike extends ThreeObject3DLike {
  isInstancedMesh?: boolean;
  count: number;
  instanceMatrix: { needsUpdate: boolean };
  setMatrixAt(index: number, matrix: ThreeMatrix4Like): void;
  dispose?: () => void;
}

interface ThreePointsLike extends ThreeObject3DLike {
  isPoints?: boolean;
  geometry: ThreeBufferGeometryLike;
}

interface ThreeDirectionalLightLike extends ThreeObject3DLike {
  shadow: {
    bias: number;
    mapSize: { set(w: number, h: number): void };
    camera: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      near: number;
      far: number;
      updateProjectionMatrix?: () => void;
    };
  };
}

export interface RoomEnvironmentBuildDependencies {
  readonly three?: RoomEnvironmentThreeLike;
  readonly createCanvas?: (width: number, height: number) => HTMLCanvasElement | null;
}

export interface BuiltRoomEnvironment {
  readonly roomId: RoomId;
  readonly root: ThreeObject3DLike;
  readonly fog: unknown;
  readonly stats: RoomEnvironmentBudgetReport;
  readonly updateParticles: (elapsedSeconds: number) => void;
  readonly dispose: () => void;
}

function getDefaultCanvasFactory(): (
  width: number,
  height: number,
) => HTMLCanvasElement | null {
  return (width, height) => {
    if (typeof document === "undefined") {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
}

function createSkyGradientTexture(
  preset: RoomEnvironmentPreset,
  three: RoomEnvironmentThreeLike,
  createCanvas: (width: number, height: number) => HTMLCanvasElement | null,
): ProceduralTextureLike | null {
  const size = ENVIRONMENT_BUDGET_TOKENS.SKY_GRADIENT_SIZE_PX;
  const canvas = createCanvas(size, size);
  if (!canvas) {
    return null;
  }
  const ctx = canvas.getContext("2d") as
    | (CanvasRenderingContext2D & {
        createLinearGradient: (
          x0: number,
          y0: number,
          x1: number,
          y1: number,
        ) => { addColorStop: (offset: number, color: string) => void };
      })
    | null;
  if (!ctx) {
    return null;
  }

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, preset.skyGradient.topColor);
  grad.addColorStop(0.55, preset.skyGradient.horizonColor);
  grad.addColorStop(1, preset.skyGradient.bottomColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  if (preset.roomId === RoomId.MEXICANERO) {
    ctx.fillStyle = "rgba(255, 250, 235, 0.42)";
    for (let i = 0; i < 36; i++) {
      const sx = ((i * 89 + 31) % (size - 16)) + 8;
      const sy = ((i * 47 + 19) % Math.floor(size * 0.34)) + 8;
      ctx.beginPath();
      ctx.arc(
        sx,
        sy,
        ENVIRONMENT_BUDGET_TOKENS.MIN_SKY_STAR_RADIUS_PX,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  const texture = new three.CanvasTexture(canvas);
  texture.wrapS = three.ClampToEdgeWrapping;
  texture.wrapT = three.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function getGeometryTriangleCount(geometry: ThreeGeometryLike | undefined): number {
  if (!geometry) {
    return 0;
  }
  if (geometry.index && typeof geometry.index.count === "number") {
    return Math.floor(geometry.index.count / 3);
  }
  const posCount = geometry.attributes?.position?.count ?? 0;
  return Math.floor(posCount / 3);
}

/**
 * Computes mobile VR geometry/draw-call/particle totals for a built 3D room subtree.
 */
export function measureRoomEnvironmentBudget(
  root: ThreeObject3DLike | null | undefined,
): RoomEnvironmentBudgetReport {
  if (!root) {
    return {
      triangleCount: 0,
      drawCalls: 0,
      particleCount: 0,
      withinBudget: false,
    };
  }

  let triangleCount = 0;
  let drawCalls = 0;
  let particleCount = 0;

  root.traverse((rawNode) => {
    if (!rawNode || typeof rawNode !== "object") {
      return;
    }
    const node = rawNode as {
      isMesh?: boolean;
      isInstancedMesh?: boolean;
      isPoints?: boolean;
      count?: number;
      geometry?: ThreeGeometryLike;
    };

    if (node.isPoints) {
      drawCalls += 1;
      particleCount += node.geometry?.attributes?.position?.count ?? 0;
      return;
    }

    if (node.isInstancedMesh) {
      drawCalls += 1;
      const instances = typeof node.count === "number" ? node.count : 0;
      triangleCount += getGeometryTriangleCount(node.geometry) * instances;
      return;
    }

    if (node.isMesh) {
      drawCalls += 1;
      triangleCount += getGeometryTriangleCount(node.geometry);
    }
  });

  const withinBudget =
    triangleCount <= ENVIRONMENT_BUDGET_TOKENS.MAX_TRIANGLES &&
    drawCalls <= ENVIRONMENT_BUDGET_TOKENS.MAX_DRAW_CALLS &&
    particleCount >= ENVIRONMENT_BUDGET_TOKENS.MIN_PARTICLES &&
    particleCount <= ENVIRONMENT_BUDGET_TOKENS.MAX_PARTICLES;

  return {
    triangleCount,
    drawCalls,
    particleCount,
    withinBudget,
  };
}

function scatterRingInstances(
  mesh: ThreeInstancedMeshLike,
  three: RoomEnvironmentThreeLike,
  count: number,
  options: {
    innerRadius: number;
    outerRadius: number;
    baseY: number;
    minScale: number;
    maxScale: number;
    heightScaleFactor?: number;
    phaseOffset?: number;
  },
): void {
  const matrix = new three.Matrix4();
  const pos = new three.Vector3();
  const quat = new three.Quaternion();
  const euler = new three.Euler();
  const scale = new three.Vector3();
  const phase = options.phaseOffset ?? 0;
  const hFactor = options.heightScaleFactor ?? 1;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2 + phase + Math.sin(i * 1.7) * 0.14;
    const radiusWave = (Math.sin(i * 2.3 + phase) + 1) * 0.5;
    const radius =
      options.innerRadius +
      (options.outerRadius - options.innerRadius) * radiusWave;
    const uniformScale =
      options.minScale +
      (options.maxScale - options.minScale) * ((Math.cos(i * 1.9) + 1) * 0.5);

    const sy = uniformScale * hFactor;
    pos.set(
      Math.cos(angle) * radius,
      Math.max(0.15, options.baseY * sy - 0.25),
      Math.sin(angle) * radius,
    );
    (euler as { y: number }).y = angle * 1.3;
    quat.setFromEuler(euler);
    scale.set(uniformScale, sy, uniformScale);
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Builds the procedural cultural 3D room, exterior landscape, lighting rig,
 * sky gradient dome, fog, and floating ambient particles for a given room.
 */
export function buildRoomEnvironment(
  roomId: RoomId,
  deps: RoomEnvironmentBuildDependencies = {},
): BuiltRoomEnvironment {
  const three =
    deps.three ??
    ((globalThis as unknown as { THREE?: RoomEnvironmentThreeLike }).THREE ?? null);
  if (!three) {
    throw new Error("THREE is required to build room environment");
  }

  const createCanvas = deps.createCanvas ?? getDefaultCanvasFactory();
  const preset = getRoomEnvironmentPreset(roomId);
  const root = new three.Group();
  root.name = `cv-env-${roomId.toLowerCase()}`;

  const texDeps: ProceduralTextureDependencies = {
    createCanvas,
    createTexture: (canvas) => new three.CanvasTexture(canvas),
    repeatWrapping: three.RepeatWrapping,
    clampToEdgeWrapping: three.ClampToEdgeWrapping,
    anisotropy: PROCEDURAL_TEXTURE_TOKENS.ANISOTROPY,
  };
  const textureSet = createRoomTextureSet(preset, texDeps);
  const skyTexture = createSkyGradientTexture(preset, three, createCanvas);
  const canyonWaterTex =
    roomId === RoomId.NAAYERI
      ? createProceduralTexture(
          PROCEDURAL_TEXTURE_KIND.WATER_SHIMMER,
          preset.accentColor,
          texDeps,
        )
      : null;

  // 1. Gradient sky dome (1 draw call)
  const skyGeo = new three.SphereGeometry(
    ENVIRONMENT_BUDGET_TOKENS.SKY_DOME_RADIUS_M,
    24,
    16,
  );
  const skyMat = new three.MeshBasicMaterial({
    map: skyTexture,
    side: three.BackSide,
    fog: false,
  });
  const skyMesh = new three.Mesh(skyGeo, skyMat);
  skyMesh.name = "cv-env-sky-dome";
  root.add(skyMesh);

  // 2. Atmospheric lighting rig (1 shadow-casting directional + 1 hemisphere fill)
  const dirLight = new three.DirectionalLight(
    preset.lighting.directionalColor,
    preset.lighting.directionalIntensity,
  );
  dirLight.name = "cv-env-key-light";
  const [lx, ly, lz] = preset.lighting.directionalPosition;
  dirLight.position.set(lx, ly, lz);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(
    SHADOW_CONFIG_TOKENS.MAP_SIZE_PX,
    SHADOW_CONFIG_TOKENS.MAP_SIZE_PX,
  );
  const extent = SHADOW_CONFIG_TOKENS.FRUSTUM_HALF_EXTENT_M;
  dirLight.shadow.camera.left = -extent;
  dirLight.shadow.camera.right = extent;
  dirLight.shadow.camera.top = extent;
  dirLight.shadow.camera.bottom = -extent;
  dirLight.shadow.camera.near = SHADOW_CONFIG_TOKENS.CAMERA_NEAR_M;
  dirLight.shadow.camera.far = SHADOW_CONFIG_TOKENS.CAMERA_FAR_M;
  dirLight.shadow.bias = SHADOW_CONFIG_TOKENS.SHADOW_BIAS;
  dirLight.shadow.camera.updateProjectionMatrix?.();
  root.add(dirLight);

  const hemiLight = new three.HemisphereLight(
    preset.lighting.hemisphereSkyColor,
    preset.lighting.hemisphereGroundColor,
    preset.lighting.hemisphereIntensity,
  );
  hemiLight.name = "cv-env-hemi-light";
  root.add(hemiLight);

  // 3. Inner ceremonial floor (1 draw call) + outer terrain plane (1 draw call)
  const floorGeo = new three.CylinderGeometry(
    ENVIRONMENT_BUDGET_TOKENS.FLOOR_RADIUS_M,
    ENVIRONMENT_BUDGET_TOKENS.FLOOR_RADIUS_M + 0.2,
    0.22,
    32,
  );
  const floorMat = new three.MeshLambertMaterial({
    color: textureSet.floor ? "#e6eaf2" : preset.floorColor,
    map: textureSet.floor,
  });
  const floorMesh = new three.Mesh(floorGeo, floorMat);
  floorMesh.name = "cv-env-floor";
  floorMesh.position.set(0, -0.11, 0);
  floorMesh.receiveShadow = true;
  root.add(floorMesh);

  const outerGeo = new three.CylinderGeometry(
    ENVIRONMENT_BUDGET_TOKENS.OUTER_GROUND_RADIUS_M,
    ENVIRONMENT_BUDGET_TOKENS.OUTER_GROUND_RADIUS_M,
    0.2,
    24,
  );
  const outerMat = new three.MeshLambertMaterial({
    color: preset.outerGroundColor,
  });
  const outerMesh = new three.Mesh(outerGeo, outerMat);
  outerMesh.name = "cv-env-outer-ground";
  outerMesh.position.set(0, -0.25, 0);
  outerMesh.receiveShadow = true;
  root.add(outerMesh);

  // 4. Cultural floor medallion or canyon water ring (1 draw call)
  const isCanyon = roomId === RoomId.NAAYERI;
  const ringGeo = new three.RingGeometry(
    isCanyon ? 5.5 : 2.35,
    isCanyon ? 8.3 : 2.9,
    32,
  );
  const ringMat = new three.MeshLambertMaterial({
    color: isCanyon ? preset.accentColor : "#f8fafc",
    map: isCanyon ? canyonWaterTex : textureSet.trim,
  });
  const ringMesh = new three.Mesh(ringGeo, ringMat);
  ringMesh.name = isCanyon ? "cv-env-canyon-water" : "cv-env-floor-inlay";
  ringMesh.rotation.set(-Math.PI / 2, 0, 0);
  ringMesh.position.set(0, isCanyon ? -0.1 : 0.006, 0);
  ringMesh.receiveShadow = true;
  root.add(ringMesh);

  // 5. Pavilion colonnade (InstancedMesh, 1 draw call) + pergola cornice ring (1 draw call)
  const colGeo = new three.CylinderGeometry(0.21, 0.26, 4.2, 8);
  const colMat = new three.MeshLambertMaterial({
    color: textureSet.column ? "#e2e8f0" : preset.columnColor,
    map: textureSet.column,
  });
  const colCount = 8;
  const columnsInstanced = new three.InstancedMesh(colGeo, colMat, colCount);
  columnsInstanced.name = "cv-env-pavilion-columns";
  columnsInstanced.castShadow = true;
  columnsInstanced.receiveShadow = true;
  const colMatrix = new three.Matrix4();
  const colPos = new three.Vector3();
  const colQuat = new three.Quaternion();
  const colEuler = new three.Euler();
  const colScale = new three.Vector3(1, 1, 1);
  for (let i = 0; i < colCount; i++) {
    // Offset by 22.5 deg so columns frame avenues without blocking front/portal axes
    const angle = (i * Math.PI * 2) / colCount + Math.PI / 8;
    colPos.set(
      Math.cos(angle) * ENVIRONMENT_BUDGET_TOKENS.COLUMN_RING_RADIUS_M,
      2.1,
      Math.sin(angle) * ENVIRONMENT_BUDGET_TOKENS.COLUMN_RING_RADIUS_M,
    );
    (colEuler as { y: number }).y = -angle;
    colQuat.setFromEuler(colEuler);
    colMatrix.compose(colPos, colQuat, colScale);
    columnsInstanced.setMatrixAt(i, colMatrix);
  }
  columnsInstanced.instanceMatrix.needsUpdate = true;
  root.add(columnsInstanced);

  const pergolaGeo = new three.TorusGeometry(
    ENVIRONMENT_BUDGET_TOKENS.COLUMN_RING_RADIUS_M,
    0.15,
    6,
    24,
  );
  const pergolaMat = new three.MeshLambertMaterial({
    color: textureSet.trim ? "#f1f5f9" : preset.propSecondaryColor,
    map: textureSet.trim,
  });
  const pergolaMesh = new three.Mesh(pergolaGeo, pergolaMat);
  pergolaMesh.name = "cv-env-pergola-ring";
  pergolaMesh.rotation.set(Math.PI / 2, 0, 0);
  pergolaMesh.position.set(0, 4.2, 0);
  pergolaMesh.castShadow = true;
  root.add(pergolaMesh);

  // 6. Exterior Instanced Landscape (2 InstancedMesh draw calls tuned by biome)
  const primaryLandscapeGeo =
    preset.landscapeTheme === "canyon" || preset.landscapeTheme === "sierra"
      ? new three.BoxGeometry(1.4, 3.2, 1.4)
      : preset.landscapeTheme === "forest" || preset.landscapeTheme === "highland"
        ? new three.ConeGeometry(1.1, 3.6, 6)
        : new three.CylinderGeometry(0.42, 0.68, 2.8, 6);
  const primaryCount = preset.landscapeTheme === "forest" ? 20 : 14;
  const primaryMat = new three.MeshLambertMaterial({
    color: preset.propPrimaryColor,
  });
  const primaryProps = new three.InstancedMesh(
    primaryLandscapeGeo,
    primaryMat,
    primaryCount,
  );
  primaryProps.name = "cv-env-landscape-primary";
  scatterRingInstances(primaryProps, three, primaryCount, {
    innerRadius: ENVIRONMENT_BUDGET_TOKENS.LANDSCAPE_INNER_RADIUS_M + 2.2,
    outerRadius: ENVIRONMENT_BUDGET_TOKENS.LANDSCAPE_OUTER_RADIUS_M,
    baseY: 1.25,
    minScale: 0.85,
    maxScale: 1.55,
    heightScaleFactor: preset.landscapeTheme === "canyon" ? 1.5 : 1.1,
    phaseOffset: 0.2,
  });
  root.add(primaryProps);

  const secondaryGeo =
    preset.landscapeTheme === "sierra" || preset.landscapeTheme === "canyon"
      ? new three.CylinderGeometry(0.18, 0.26, 2.2, 6)
      : new three.ConeGeometry(0.75, 2.1, 5);
  const secondaryCount = 14;
  const secondaryMat = new three.MeshLambertMaterial({
    color: preset.propSecondaryColor,
  });
  const secondaryProps = new three.InstancedMesh(
    secondaryGeo,
    secondaryMat,
    secondaryCount,
  );
  secondaryProps.name = "cv-env-landscape-secondary";
  scatterRingInstances(secondaryProps, three, secondaryCount, {
    innerRadius: ENVIRONMENT_BUDGET_TOKENS.LANDSCAPE_INNER_RADIUS_M,
    outerRadius: ENVIRONMENT_BUDGET_TOKENS.LANDSCAPE_OUTER_RADIUS_M - 3.5,
    baseY: 0.95,
    minScale: 0.65,
    maxScale: 1.35,
    phaseOffset: 1.15,
  });
  root.add(secondaryProps);

  // 7. Ambient Cultural Particles (48..56 Points, 1 draw call)
  const particleCount = preset.particleCount;
  const basePositions = new Float32Array(particleCount * 3);
  const livePositions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 * 3.1;
    const radius = 2.2 + ((i * 7) % 10) * 0.44;
    const y = 0.6 + ((i * 11) % 13) * 0.25;
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;
    basePositions[i * 3] = px;
    basePositions[i * 3 + 1] = y;
    basePositions[i * 3 + 2] = pz;
    livePositions[i * 3] = px;
    livePositions[i * 3 + 1] = y;
    livePositions[i * 3 + 2] = pz;
  }

  const particleGeo = new three.BufferGeometry();
  const posAttr = new three.BufferAttribute(livePositions, 3);
  particleGeo.setAttribute("position", posAttr);
  const particleMat = new three.PointsMaterial({
    color: preset.particleColor,
    size: ENVIRONMENT_BUDGET_TOKENS.PARTICLE_SIZE_M,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const particles = new three.Points(particleGeo, particleMat);
  particles.name = "cv-env-ambient-particles";
  root.add(particles);

  const fog = new three.Fog(preset.fog.color, preset.fog.near, preset.fog.far);
  const stats = measureRoomEnvironmentBudget(root);

  const updateParticles = (elapsedSeconds: number): void => {
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const baseY = basePositions[idx + 1];
      livePositions[idx] = basePositions[idx] + Math.sin(elapsedSeconds * 0.6 + i) * 0.08;
      livePositions[idx + 1] = baseY + Math.sin(elapsedSeconds * 0.9 + i * 0.5) * 0.12;
      livePositions[idx + 2] = basePositions[idx + 2] + Math.cos(elapsedSeconds * 0.5 + i) * 0.08;
    }
    posAttr.needsUpdate = true;
  };

  let disposed = false;
  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    disposeObject3DResources(root);
    textureSet.contactShadow?.dispose();
  };

  return {
    roomId,
    root,
    fog,
    stats,
    updateParticles,
    dispose,
  };
}
