import type { Vector3D } from "./constants";

export interface ModelNormalizationTransform {
  readonly scale: number;
  readonly offset: Vector3D;
}

export interface LocalObjectBounds {
  readonly min: Vector3D;
  readonly max: Vector3D;
}

export interface ThreeBox3Like {
  min: Vector3D;
  max: Vector3D;
  setFromObject: (obj: unknown) => ThreeBox3Like;
  isEmpty?: () => boolean;
}

export type Box3Constructor = new () => ThreeBox3Like;

interface MutableVec3Like {
  x: number;
  y: number;
  z: number;
  set?: (x: number, y: number, z: number) => void;
}

interface MutableQuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
  set?: (x: number, y: number, z: number, w: number) => void;
}

interface MeasurableObject3D {
  parent?: unknown;
  position?: MutableVec3Like;
  scale?: MutableVec3Like;
  rotation?: MutableVec3Like;
  quaternion?: MutableQuatLike;
  updateMatrixWorld?: (force?: boolean) => void;
}

const LOCAL_IDENTITY_TOKENS = {
  ZERO: 0,
  UNIT_SCALE: 1,
  QUAT_W: 1,
} as const;

function hasNumericVec3(target: MutableVec3Like | undefined): target is MutableVec3Like {
  return (
    Boolean(target) &&
    typeof target!.x === "number" &&
    typeof target!.y === "number" &&
    typeof target!.z === "number"
  );
}

function hasNumericQuat(target: MutableQuatLike | undefined): target is MutableQuatLike {
  return (
    Boolean(target) &&
    typeof target!.x === "number" &&
    typeof target!.y === "number" &&
    typeof target!.z === "number" &&
    typeof target!.w === "number"
  );
}

function setVec3(target: MutableVec3Like | undefined, x: number, y: number, z: number): void {
  if (!target) {
    return;
  }
  if (typeof target.set === "function") {
    target.set(x, y, z);
  } else {
    target.x = x;
    target.y = y;
    target.z = z;
  }
}

function setQuat(
  target: MutableQuatLike | undefined,
  x: number,
  y: number,
  z: number,
  w: number,
): void {
  if (!target) {
    return;
  }
  if (typeof target.set === "function") {
    target.set(x, y, z, w);
  } else {
    target.x = x;
    target.y = y;
    target.z = z;
    target.w = w;
  }
}

/**
 * Measures an Object3D subtree's axis-aligned bounding box strictly in its own
 * local coordinate space, isolated from ancestor world transforms and prior local transforms.
 */
export function measureLocalObjectBounds(
  rootObj: unknown,
  Box3Ctor: Box3Constructor | undefined,
): LocalObjectBounds | null {
  if (!Box3Ctor || !rootObj) {
    return null;
  }

  const obj = rootObj as MeasurableObject3D;
  const hasParentProp = "parent" in obj;
  const originalParent = obj.parent;
  const savedPos =
    hasNumericVec3(obj.position) &&
    (obj.position.x !== LOCAL_IDENTITY_TOKENS.ZERO ||
      obj.position.y !== LOCAL_IDENTITY_TOKENS.ZERO ||
      obj.position.z !== LOCAL_IDENTITY_TOKENS.ZERO)
      ? { x: obj.position.x, y: obj.position.y, z: obj.position.z }
      : null;
  const savedScale =
    hasNumericVec3(obj.scale) &&
    (obj.scale.x !== LOCAL_IDENTITY_TOKENS.UNIT_SCALE ||
      obj.scale.y !== LOCAL_IDENTITY_TOKENS.UNIT_SCALE ||
      obj.scale.z !== LOCAL_IDENTITY_TOKENS.UNIT_SCALE)
      ? { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
      : null;
  const savedQuat =
    hasNumericQuat(obj.quaternion) &&
    (obj.quaternion.x !== LOCAL_IDENTITY_TOKENS.ZERO ||
      obj.quaternion.y !== LOCAL_IDENTITY_TOKENS.ZERO ||
      obj.quaternion.z !== LOCAL_IDENTITY_TOKENS.ZERO ||
      obj.quaternion.w !== LOCAL_IDENTITY_TOKENS.QUAT_W)
      ? {
          x: obj.quaternion.x,
          y: obj.quaternion.y,
          z: obj.quaternion.z,
          w: obj.quaternion.w,
        }
      : null;
  const savedRot =
    !hasNumericQuat(obj.quaternion) &&
    hasNumericVec3(obj.rotation) &&
    (obj.rotation.x !== LOCAL_IDENTITY_TOKENS.ZERO ||
      obj.rotation.y !== LOCAL_IDENTITY_TOKENS.ZERO ||
      obj.rotation.z !== LOCAL_IDENTITY_TOKENS.ZERO)
      ? { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }
      : null;

  try {
    if (hasParentProp) {
      obj.parent = null;
    }
    if (savedPos) {
      setVec3(
        obj.position,
        LOCAL_IDENTITY_TOKENS.ZERO,
        LOCAL_IDENTITY_TOKENS.ZERO,
        LOCAL_IDENTITY_TOKENS.ZERO,
      );
    }
    if (savedScale) {
      setVec3(
        obj.scale,
        LOCAL_IDENTITY_TOKENS.UNIT_SCALE,
        LOCAL_IDENTITY_TOKENS.UNIT_SCALE,
        LOCAL_IDENTITY_TOKENS.UNIT_SCALE,
      );
    }
    if (savedQuat) {
      setQuat(
        obj.quaternion,
        LOCAL_IDENTITY_TOKENS.ZERO,
        LOCAL_IDENTITY_TOKENS.ZERO,
        LOCAL_IDENTITY_TOKENS.ZERO,
        LOCAL_IDENTITY_TOKENS.QUAT_W,
      );
    } else if (savedRot) {
      setVec3(
        obj.rotation,
        LOCAL_IDENTITY_TOKENS.ZERO,
        LOCAL_IDENTITY_TOKENS.ZERO,
        LOCAL_IDENTITY_TOKENS.ZERO,
      );
    }

    const box = new Box3Ctor().setFromObject(rootObj);
    if (typeof box.isEmpty === "function" && box.isEmpty()) {
      return null;
    }

    return {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    };
  } finally {
    if (hasParentProp) {
      obj.parent = originalParent;
    }
    if (savedPos) {
      setVec3(obj.position, savedPos.x, savedPos.y, savedPos.z);
    }
    if (savedScale) {
      setVec3(obj.scale, savedScale.x, savedScale.y, savedScale.z);
    }
    if (savedQuat) {
      setQuat(obj.quaternion, savedQuat.x, savedQuat.y, savedQuat.z, savedQuat.w);
    } else if (savedRot) {
      setVec3(obj.rotation, savedRot.x, savedRot.y, savedRot.z);
    }
    obj.updateMatrixWorld?.(true);
  }
}

function normalizeZero(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Computes uniform scale and grounding translation offset so an arbitrary
 * 3D mesh bounding box fits within `maxExtentM` centered at (x=0, z=0) with minY at y=0.
 */
export function computeModelNormalizationTransform(
  boundsMin: Vector3D,
  boundsMax: Vector3D,
  maxExtentM: number,
): ModelNormalizationTransform {
  const sizeX = boundsMax.x - boundsMin.x;
  const sizeY = boundsMax.y - boundsMin.y;
  const sizeZ = boundsMax.z - boundsMin.z;
  const largestDimension = Math.max(sizeX, sizeY, sizeZ);

  if (
    !Number.isFinite(largestDimension) ||
    largestDimension <= 0 ||
    !Number.isFinite(maxExtentM) ||
    maxExtentM <= 0
  ) {
    return {
      scale: 1,
      offset: { x: 0, y: 0, z: 0 },
    };
  }

  const scale = maxExtentM / largestDimension;
  const centerX = (boundsMin.x + boundsMax.x) / 2;
  const centerZ = (boundsMin.z + boundsMax.z) / 2;

  return {
    scale: normalizeZero(scale),
    offset: {
      x: normalizeZero(-centerX * scale),
      y: normalizeZero(-boundsMin.y * scale),
      z: normalizeZero(-centerZ * scale),
    },
  };
}
