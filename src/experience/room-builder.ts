import {
  DEFAULT_ROOM_ID,
  EXHIBIT_ASSET_IDS,
  EXHIBIT_DIMENSIONS,
  ExhibitMediaType,
  ROOM_DEFINITIONS,
} from "./constants";
import type { RoomId } from "./types";
import { PlaceholderAssetGenerator } from "./placeholders";
import { createPortalEntity } from "./components/portal-waypoint";
import { getSharedInspectionController } from "./components/inspectable";

export class ExhibitRoomBuilder {
  public static readonly ROOM_CONTAINER_ID = "cv-prototype-room-group";
  private static activeRoomId: RoomId = DEFAULT_ROOM_ID;

  public static getActiveRoomId(): RoomId {
    return this.activeRoomId;
  }

  public static teardownRoom(sceneEl: HTMLElement): void {
    const roomGroup = sceneEl.querySelector(`#${this.ROOM_CONTAINER_ID}`);
    if (!roomGroup) {
      return;
    }

    // Explicit Three.js geometry, material and texture disposal
    const disposeEntity = (el: Element) => {
      const obj3D = (
        el as unknown as {
          object3D?: {
            traverse?: (cb: (node: unknown) => void) => void;
          };
        }
      ).object3D;

      if (obj3D && typeof obj3D.traverse === "function") {
        obj3D.traverse((node: unknown) => {
          const mesh = node as {
            geometry?: { dispose?: () => void };
            material?:
              | {
                  dispose?: () => void;
                  map?: { dispose?: () => void };
                }
              | Array<{
                  dispose?: () => void;
                  map?: { dispose?: () => void };
                }>;
          };
          if (mesh.geometry && typeof mesh.geometry.dispose === "function") {
            mesh.geometry.dispose();
          }
          if (Array.isArray(mesh.material)) {
            for (const mat of mesh.material) {
              if (mat?.map && typeof mat.map.dispose === "function") {
                mat.map.dispose();
              }
              if (mat && typeof mat.dispose === "function") {
                mat.dispose();
              }
            }
          } else if (mesh.material) {
            if (
              mesh.material.map &&
              typeof mesh.material.map.dispose === "function"
            ) {
              mesh.material.map.dispose();
            }
            if (typeof mesh.material.dispose === "function") {
              mesh.material.dispose();
            }
          }
        });
      }
    };

    disposeEntity(roomGroup);
    const children = roomGroup.querySelectorAll("*");
    children.forEach((child) => disposeEntity(child));

    if (typeof roomGroup.remove === "function") {
      roomGroup.remove();
    } else if (roomGroup.parentNode) {
      roomGroup.parentNode.removeChild(roomGroup);
    }
  }

  public static async waitForSkyboxReady(
    skyEl: HTMLElement | null,
    timeoutMs = 1500,
  ): Promise<boolean> {
    if (!skyEl) {
      return true;
    }

    const hasAFrame =
      typeof globalThis !== "undefined" &&
      Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

    if (!hasAFrame || typeof skyEl.addEventListener !== "function") {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          skyEl.removeEventListener("materialtextureloaded", onTextureLoaded);
          resolve(true);
        }
      }, timeoutMs);

      const onTextureLoaded = (): void => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          skyEl.removeEventListener("materialtextureloaded", onTextureLoaded);
          resolve(true);
        }
      };

      skyEl.addEventListener("materialtextureloaded", onTextureLoaded, {
        once: true,
      });
    });
  }

  public static ensureMediaAssets(sceneEl: HTMLElement): void {
    let assetsEl = sceneEl.querySelector("a-assets");
    if (!assetsEl) {
      assetsEl = document.createElement("a-assets");
      sceneEl.prepend(assetsEl);
    }

    const requiredAssets: Array<{ id: string; texture: () => string }> = [
      {
        id: EXHIBIT_ASSET_IDS.PAINTING_2D,
        texture: () => PlaceholderAssetGenerator.createPaintingTexture(),
      },
      {
        id: EXHIBIT_ASSET_IDS.PHOTO_STEREO,
        texture: () => PlaceholderAssetGenerator.createStereoImageTexture(),
      },
      {
        id: EXHIBIT_ASSET_IDS.VIDEO_2D,
        texture: () => PlaceholderAssetGenerator.createVideoThumbnailTexture(),
      },
      {
        id: EXHIBIT_ASSET_IDS.VIDEO_STEREO_SBS,
        texture: () =>
          PlaceholderAssetGenerator.createStereoVideoThumbnailTexture(),
      },
    ];

    for (const item of requiredAssets) {
      if (!assetsEl.querySelector(`#${item.id}`)) {
        const img = document.createElement("img");
        img.setAttribute("id", item.id);
        img.setAttribute("src", item.texture());
        assetsEl.appendChild(img);
      }
    }
  }

  public static async waitForRoomReady(
    roomGroup: HTMLElement | null,
    skyEl: HTMLElement | null,
    timeoutMs = 1500,
  ): Promise<boolean> {
    const hasAFrame =
      typeof globalThis !== "undefined" &&
      Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

    if (!hasAFrame) {
      return true;
    }

    const skyboxPromise = this.waitForSkyboxReady(skyEl, timeoutMs);

    const roomGroupPromise = new Promise<boolean>((resolve) => {
      if (!roomGroup) {
        resolve(true);
        return;
      }

      const aframeGroup = roomGroup as unknown as { hasLoaded?: boolean };
      if (aframeGroup.hasLoaded) {
        resolve(true);
        return;
      }

      if (typeof roomGroup.addEventListener !== "function") {
        resolve(true);
        return;
      }

      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          roomGroup.removeEventListener("loaded", onLoaded);
          resolve(true);
        }
      }, timeoutMs);

      const onLoaded = (): void => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          roomGroup.removeEventListener("loaded", onLoaded);
          resolve(true);
        }
      };

      roomGroup.addEventListener("loaded", onLoaded, { once: true });
    });

    await Promise.all([skyboxPromise, roomGroupPromise]);

    if (typeof requestAnimationFrame === "function") {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    }

    return true;
  }

  public static mountRoom(
    sceneEl: HTMLElement,
    roomId: RoomId = DEFAULT_ROOM_ID,
    viewMode: string = "vr",
  ): HTMLElement {
    // Teardown previous room entities and dispose resources
    this.teardownRoom(sceneEl);
    this.ensureCameraRig(sceneEl);

    const roomDef =
      ROOM_DEFINITIONS[roomId] ?? ROOM_DEFINITIONS[DEFAULT_ROOM_ID];
    this.activeRoomId = roomDef.id;

    // Update shared inspection controller with current room's exhibits
    getSharedInspectionController().setExhibits(roomDef.exhibits);

    // Update a-sky background if present
    const skyEl = sceneEl.querySelector("a-sky");
    if (skyEl) {
      skyEl.setAttribute("src", roomDef.skyboxUrl);
    }

    const roomGroup = document.createElement("a-entity");
    roomGroup.setAttribute("id", this.ROOM_CONTAINER_ID);
    roomGroup.setAttribute("data-room-id", roomDef.id);

    // Ensure preloaded media asset IDs are registered in <a-assets>
    this.ensureMediaAssets(sceneEl);

    // Build room exhibits
    for (const exhibit of roomDef.exhibits) {
      const exhibitRoot = document.createElement("a-entity");
      exhibitRoot.setAttribute("id", exhibit.id);
      exhibitRoot.setAttribute(
        "position",
        `${exhibit.galleryPosition.x} ${exhibit.galleryPosition.y} ${exhibit.galleryPosition.z}`,
      );
      exhibitRoot.setAttribute(
        "rotation",
        `${exhibit.galleryRotation.x} ${exhibit.galleryRotation.y} ${exhibit.galleryRotation.z}`,
      );
      exhibitRoot.setAttribute(
        "cv-inspectable",
        `id: ${exhibit.id}; title: ${exhibit.title}; description: ${exhibit.description}; autoRotate: ${exhibit.autoRotate}; rotationSpeed: ${exhibit.rotationSpeed}; mediaType: ${exhibit.mediaType}`,
      );

      switch (exhibit.mediaType) {
        case ExhibitMediaType.MODEL_3D: {
          const pedestal = document.createElement("a-cylinder");
          pedestal.setAttribute("id", `${exhibit.id}-pedestal`);
          pedestal.setAttribute(
            "radius",
            String(EXHIBIT_DIMENSIONS.PEDESTAL_RADIUS),
          );
          pedestal.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PEDESTAL_HEIGHT),
          );
          pedestal.setAttribute("position", "0 -0.4 0");
          pedestal.setAttribute("color", "#334155");
          pedestal.setAttribute("material", "shader: flat");

          const modelGroup = document.createElement("a-entity");
          modelGroup.setAttribute("class", "clickable");
          modelGroup.setAttribute("position", "0 0.1 0");

          const sphere = document.createElement("a-sphere");
          sphere.setAttribute("radius", "0.25");
          sphere.setAttribute("position", "0 0.25 0");
          sphere.setAttribute("color", "#f59e0b");
          sphere.setAttribute("material", "shader: flat");

          const cone = document.createElement("a-cone");
          cone.setAttribute("radius-bottom", "0.28");
          cone.setAttribute("radius-top", "0.1");
          cone.setAttribute("height", "0.4");
          cone.setAttribute("position", "0 -0.05 0");
          cone.setAttribute("color", "#d97706");
          cone.setAttribute("material", "shader: flat");

          const ring = document.createElement("a-ring");
          ring.setAttribute("radius-inner", "0.28");
          ring.setAttribute("radius-outer", "0.34");
          ring.setAttribute("position", "0 0.1 0");
          ring.setAttribute("rotation", "90 0 0");
          ring.setAttribute("color", "#fbbf24");
          ring.setAttribute("material", "shader: flat");

          modelGroup.append(sphere, cone, ring);
          exhibitRoot.append(pedestal, modelGroup);
          break;
        }

        case ExhibitMediaType.IMAGE_2D: {
          const plane = document.createElement("a-plane");
          plane.setAttribute("class", "clickable");
          plane.setAttribute("width", String(EXHIBIT_DIMENSIONS.PLANE_WIDTH));
          plane.setAttribute("height", String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT));
          plane.setAttribute(
            "src",
            exhibit.mediaUrl || `#${EXHIBIT_ASSET_IDS.PAINTING_2D}`,
          );
          plane.setAttribute("material", "shader: flat");

          const frame = document.createElement("a-plane");
          frame.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08),
          );
          frame.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08),
          );
          frame.setAttribute("position", "0 0 -0.01");
          frame.setAttribute("color", "#d4af37");
          frame.setAttribute("material", "shader: flat");

          exhibitRoot.append(frame, plane);
          break;
        }

        case ExhibitMediaType.IMAGE_STEREO_SBS: {
          const mediaSrc =
            exhibit.mediaUrl || `#${EXHIBIT_ASSET_IDS.PHOTO_STEREO}`;
          const leftPlane = document.createElement("a-plane");
          leftPlane.setAttribute("class", "clickable");
          leftPlane.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH),
          );
          leftPlane.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT),
          );
          leftPlane.setAttribute("src", mediaSrc);
          leftPlane.setAttribute(
            "cv-stereo-media",
            `eye: LEFT; isHalfSBS: true; viewMode: ${viewMode}`,
          );
          leftPlane.setAttribute("material", "shader: flat");

          const rightPlane = document.createElement("a-plane");
          rightPlane.setAttribute("class", "clickable");
          rightPlane.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH),
          );
          rightPlane.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT),
          );
          rightPlane.setAttribute("src", mediaSrc);
          rightPlane.setAttribute(
            "cv-stereo-media",
            `eye: RIGHT; isHalfSBS: true; viewMode: ${viewMode}`,
          );
          rightPlane.setAttribute("material", "shader: flat");

          const frame = document.createElement("a-plane");
          frame.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08),
          );
          frame.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08),
          );
          frame.setAttribute("position", "0 0 -0.01");
          frame.setAttribute("color", "#38bdf8");
          frame.setAttribute("material", "shader: flat");

          exhibitRoot.append(frame, leftPlane, rightPlane);
          break;
        }

        case ExhibitMediaType.VIDEO_2D: {
          const plane = document.createElement("a-plane");
          plane.setAttribute("class", "clickable");
          plane.setAttribute("width", String(EXHIBIT_DIMENSIONS.PLANE_WIDTH));
          plane.setAttribute("height", String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT));
          plane.setAttribute(
            "src",
            exhibit.mediaUrl || `#${EXHIBIT_ASSET_IDS.VIDEO_2D}`,
          );
          plane.setAttribute("material", "shader: flat");

          const frame = document.createElement("a-plane");
          frame.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08),
          );
          frame.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08),
          );
          frame.setAttribute("position", "0 0 -0.01");
          frame.setAttribute("color", "#2ec4b6");
          frame.setAttribute("material", "shader: flat");

          exhibitRoot.append(frame, plane);
          break;
        }

        case ExhibitMediaType.VIDEO_STEREO_SBS: {
          const mediaSrc =
            exhibit.mediaUrl || `#${EXHIBIT_ASSET_IDS.VIDEO_STEREO_SBS}`;
          const leftPlane = document.createElement("a-plane");
          leftPlane.setAttribute("class", "clickable");
          leftPlane.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH),
          );
          leftPlane.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT),
          );
          leftPlane.setAttribute("src", mediaSrc);
          leftPlane.setAttribute(
            "cv-stereo-media",
            `eye: LEFT; isHalfSBS: true; viewMode: ${viewMode}`,
          );
          leftPlane.setAttribute("material", "shader: flat");

          const rightPlane = document.createElement("a-plane");
          rightPlane.setAttribute("class", "clickable");
          rightPlane.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH),
          );
          rightPlane.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT),
          );
          rightPlane.setAttribute("src", mediaSrc);
          rightPlane.setAttribute(
            "cv-stereo-media",
            `eye: RIGHT; isHalfSBS: true; viewMode: ${viewMode}`,
          );
          rightPlane.setAttribute("material", "shader: flat");

          const frame = document.createElement("a-plane");
          frame.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08),
          );
          frame.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08),
          );
          frame.setAttribute("position", "0 0 -0.01");
          frame.setAttribute("color", "#e879f9");
          frame.setAttribute("material", "shader: flat");

          exhibitRoot.append(frame, leftPlane, rightPlane);
          break;
        }
      }

      roomGroup.appendChild(exhibitRoot);
    }

    // Build in-world 3D portals
    for (const portal of roomDef.portals) {
      const portalEl = createPortalEntity(portal);
      roomGroup.appendChild(portalEl);
    }

    sceneEl.appendChild(roomGroup);
    return roomGroup as HTMLElement;
  }

  public static ensureCameraRig(sceneEl: HTMLElement): HTMLElement {
    let rigEl = sceneEl.querySelector("#camera-rig") as HTMLElement | null;
    if (!rigEl) {
      rigEl = document.createElement("a-entity");
      rigEl.setAttribute("id", "camera-rig");
      rigEl.setAttribute("position", "0 0 0");
      rigEl.setAttribute("rotation", "0 0 0");

      const cameraEl =
        sceneEl.querySelector("a-camera") || sceneEl.querySelector("[camera]");
      if (cameraEl && cameraEl.parentElement === sceneEl) {
        cameraEl.setAttribute("cv-camera-gyro-stabilizer", "");
        sceneEl.removeChild(cameraEl);
        rigEl.appendChild(cameraEl);
      }
      sceneEl.appendChild(rigEl);
    } else {
      const cameraEl =
        rigEl.querySelector("a-camera") || rigEl.querySelector("[camera]");
      if (cameraEl && !cameraEl.hasAttribute("cv-camera-gyro-stabilizer")) {
        cameraEl.setAttribute("cv-camera-gyro-stabilizer", "");
      }
    }
    return rigEl;
  }

  public static ensureRoom(
    sceneEl: HTMLElement,
    viewMode: string = "vr",
  ): HTMLElement {
    this.ensureCameraRig(sceneEl);
    const existing = sceneEl.querySelector(`#${this.ROOM_CONTAINER_ID}`);
    if (existing) {
      // Update stereo components viewMode
      const stereoEntities = existing.querySelectorAll("[cv-stereo-media]");
      stereoEntities.forEach((el) => {
        const currentAttr = el.getAttribute("cv-stereo-media");
        if (typeof currentAttr === "string") {
          el.setAttribute(
            "cv-stereo-media",
            currentAttr.replace(/viewMode:\s*[^;]+/, `viewMode: ${viewMode}`),
          );
        } else if (currentAttr && typeof currentAttr === "object") {
          const aframeEl = el as unknown as {
            setAttribute: (attr: string, prop: string, val: unknown) => void;
          };
          aframeEl.setAttribute("cv-stereo-media", "viewMode", viewMode);
        }
      });
      return existing as HTMLElement;
    }

    return this.mountRoom(sceneEl, this.activeRoomId, viewMode);
  }
}
