import {
  DEFAULT_ROOM_ID,
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

  public static mountRoom(
    sceneEl: HTMLElement,
    roomId: RoomId = DEFAULT_ROOM_ID,
    viewMode: string = "vr",
  ): HTMLElement {
    // Teardown previous room entities and dispose resources
    this.teardownRoom(sceneEl);

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

    const paintingTexture = PlaceholderAssetGenerator.createPaintingTexture();
    const stereoImageTexture =
      PlaceholderAssetGenerator.createStereoImageTexture();
    const videoThumbnail =
      PlaceholderAssetGenerator.createVideoThumbnailTexture();
    const stereoVideoThumbnail =
      PlaceholderAssetGenerator.createStereoVideoThumbnailTexture();

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
          plane.setAttribute("src", paintingTexture);
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
          leftPlane.setAttribute("src", stereoImageTexture);
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
          rightPlane.setAttribute("src", stereoImageTexture);
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
          plane.setAttribute("src", videoThumbnail);
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
          leftPlane.setAttribute("src", stereoVideoThumbnail);
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
          rightPlane.setAttribute("src", stereoVideoThumbnail);
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

  public static ensureRoom(
    sceneEl: HTMLElement,
    viewMode: string = "vr",
  ): HTMLElement {
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
