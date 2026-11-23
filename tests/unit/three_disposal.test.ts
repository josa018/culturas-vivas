import { describe, it, expect, vi } from "vitest";
import { DISPOSABLE_TEXTURE_SLOTS } from "../../src/experience/constants";
import { disposeObject3DResources } from "../../src/experience/three-disposal";

describe("Three.js PBR Resource Disposal", () => {
  it("disposes geometry, material, and all PBR texture channels across single and array materials", () => {
    const textureDisposals: Record<string, ReturnType<typeof vi.fn>> = {};
    const pbrMaterial: Record<string, unknown> = {
      dispose: vi.fn(),
    };
    for (const slot of DISPOSABLE_TEXTURE_SLOTS) {
      const disposeSpy = vi.fn();
      textureDisposals[slot] = disposeSpy;
      pbrMaterial[slot] = { dispose: disposeSpy };
    }

    const arrayTexDispose = vi.fn();
    const arrayMatDispose = vi.fn();
    const geo1Dispose = vi.fn();
    const geo2Dispose = vi.fn();

    const rootObj = {
      traverse: (cb: (node: unknown) => void) => {
        cb({
          geometry: { dispose: geo1Dispose },
          material: pbrMaterial,
        });
        cb({
          geometry: { dispose: geo2Dispose },
          material: [
            {
              dispose: arrayMatDispose,
              normalMap: { dispose: arrayTexDispose },
            },
            null,
          ],
        });
      },
    };

    const stats = disposeObject3DResources(rootObj);

    expect(geo1Dispose).toHaveBeenCalledTimes(1);
    expect(geo2Dispose).toHaveBeenCalledTimes(1);
    expect(pbrMaterial.dispose).toHaveBeenCalledTimes(1);
    expect(arrayMatDispose).toHaveBeenCalledTimes(1);
    expect(arrayTexDispose).toHaveBeenCalledTimes(1);

    for (const slot of DISPOSABLE_TEXTURE_SLOTS) {
      expect(textureDisposals[slot]).toHaveBeenCalledTimes(1);
    }

    expect(stats).toEqual({
      geometriesDisposed: 2,
      materialsDisposed: 2,
      texturesDisposed: DISPOSABLE_TEXTURE_SLOTS.length + 1,
    });
  });

  it("deduplicates shared texture/material references and ignores null/malformed nodes", () => {
    const sharedTex = { dispose: vi.fn() };
    const sharedMat = { dispose: vi.fn(), map: sharedTex, normalMap: sharedTex };
    const sharedGeo = { dispose: vi.fn() };

    const rootObj = {
      traverse: (cb: (node: unknown) => void) => {
        cb({ geometry: sharedGeo, material: sharedMat });
        cb({ geometry: sharedGeo, material: sharedMat });
        cb({});
        cb(null);
      },
    };

    const stats = disposeObject3DResources(rootObj);

    expect(sharedGeo.dispose).toHaveBeenCalledTimes(1);
    expect(sharedMat.dispose).toHaveBeenCalledTimes(1);
    expect(sharedTex.dispose).toHaveBeenCalledTimes(1);
    expect(stats).toEqual({
      geometriesDisposed: 1,
      materialsDisposed: 1,
      texturesDisposed: 1,
    });
    expect(disposeObject3DResources(null)).toEqual({
      geometriesDisposed: 0,
      materialsDisposed: 0,
      texturesDisposed: 0,
    });
  });

  it("invokes InstancedMesh.dispose() and disposes Points geometry/material once each", () => {
    const instancedGeo = { dispose: vi.fn() };
    const instancedTex = { dispose: vi.fn() };
    const instancedMat = { dispose: vi.fn(), map: instancedTex };
    const instancedMesh = {
      isInstancedMesh: true,
      geometry: instancedGeo,
      material: instancedMat,
      dispose: vi.fn(),
    };

    const pointsGeo = { dispose: vi.fn() };
    const pointsMat = { dispose: vi.fn() };
    const pointsNode = {
      isPoints: true,
      geometry: pointsGeo,
      material: pointsMat,
    };

    const rootObj = {
      traverse: (cb: (node: unknown) => void) => {
        cb(instancedMesh);
        cb(instancedMesh);
        cb(pointsNode);
      },
    };

    const stats = disposeObject3DResources(rootObj);

    expect(instancedMesh.dispose).toHaveBeenCalledTimes(1);
    expect(instancedGeo.dispose).toHaveBeenCalledTimes(1);
    expect(instancedMat.dispose).toHaveBeenCalledTimes(1);
    expect(instancedTex.dispose).toHaveBeenCalledTimes(1);
    expect(pointsGeo.dispose).toHaveBeenCalledTimes(1);
    expect(pointsMat.dispose).toHaveBeenCalledTimes(1);
    expect(stats).toEqual({
      geometriesDisposed: 2,
      materialsDisposed: 2,
      texturesDisposed: 1,
    });
  });
});
