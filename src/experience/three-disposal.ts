import { DISPOSABLE_TEXTURE_SLOTS } from "./constants";

export interface DisposalStats {
  readonly geometriesDisposed: number;
  readonly materialsDisposed: number;
  readonly texturesDisposed: number;
}

interface DisposableResource {
  dispose?: () => void;
}

type DisposableMaterial = DisposableResource &
  Record<string, unknown>;

interface TraversableNode {
  geometry?: DisposableResource | null;
  material?: DisposableMaterial | Array<DisposableMaterial | null> | null;
}

function disposeSingleMaterial(
  mat: DisposableMaterial | null | undefined,
  seenMaterials: Set<unknown>,
  seenTextures: Set<unknown>,
): { materials: number; textures: number } {
  if (!mat || typeof mat !== "object") {
    return { materials: 0, textures: 0 };
  }

  let textures = 0;
  for (const slot of DISPOSABLE_TEXTURE_SLOTS) {
    const tex = mat[slot] as DisposableResource | null | undefined;
    if (
      tex &&
      typeof tex === "object" &&
      !seenTextures.has(tex) &&
      typeof tex.dispose === "function"
    ) {
      seenTextures.add(tex);
      tex.dispose();
      textures++;
    }
  }

  let materials = 0;
  if (!seenMaterials.has(mat) && typeof mat.dispose === "function") {
    seenMaterials.add(mat);
    mat.dispose();
    materials++;
  }

  return { materials, textures };
}

/**
 * Traverses a Three.js Object3D hierarchy and disposes geometries,
 * materials, and all PBR texture channels exactly once per unique instance.
 */
export function disposeObject3DResources(root: unknown): DisposalStats {
  if (!root || typeof root !== "object") {
    return {
      geometriesDisposed: 0,
      materialsDisposed: 0,
      texturesDisposed: 0,
    };
  }

  const seenGeometries = new Set<unknown>();
  const seenMaterials = new Set<unknown>();
  const seenTextures = new Set<unknown>();
  const seenDisposableNodes = new Set<unknown>();
  let geometriesDisposed = 0;
  let materialsDisposed = 0;
  let texturesDisposed = 0;

  const inspectNode = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    const mesh = node as TraversableNode & { dispose?: () => void };

    // Release node-owned GPU buffers such as THREE.InstancedMesh instanceMatrix.
    if (!seenDisposableNodes.has(mesh) && typeof mesh.dispose === "function") {
      seenDisposableNodes.add(mesh);
      mesh.dispose();
    }

    if (
      mesh.geometry &&
      typeof mesh.geometry === "object" &&
      !seenGeometries.has(mesh.geometry) &&
      typeof mesh.geometry.dispose === "function"
    ) {
      seenGeometries.add(mesh.geometry);
      mesh.geometry.dispose();
      geometriesDisposed++;
    }

    if (Array.isArray(mesh.material)) {
      for (const mat of mesh.material) {
        const res = disposeSingleMaterial(mat, seenMaterials, seenTextures);
        materialsDisposed += res.materials;
        texturesDisposed += res.textures;
      }
    } else if (mesh.material) {
      const res = disposeSingleMaterial(
        mesh.material,
        seenMaterials,
        seenTextures,
      );
      materialsDisposed += res.materials;
      texturesDisposed += res.textures;
    }
  };

  const traversable = root as { traverse?: (cb: (node: unknown) => void) => void };
  if (typeof traversable.traverse === "function") {
    traversable.traverse(inspectNode);
  } else {
    inspectNode(root);
  }

  return {
    geometriesDisposed,
    materialsDisposed,
    texturesDisposed,
  };
}
