import {
  DEFAULT_ROOM_ID,
  EXHIBIT_ASSET_IDS,
  EXHIBIT_DIMENSIONS,
  EXHIBIT_DICTIONARY,
  ExhibitMediaType,
  GLB_FALLBACK_COLORS,
  ROOM_DEFINITIONS,
  ROOM_LAYOUT_TOKENS,
  type ExhibitItemConfig,
} from "./constants";
import type { RoomId, RoomStandSlotConfig } from "./types";
import { createPortalEntity } from "./components/portal-waypoint";
import { getSharedInspectionController } from "./components/inspectable";
import { disposeObject3DResources } from "./three-disposal";

const STAND_PLACEHOLDER_COLORS = {
  SURFACE: "#0f172a",
  TEXT: "#EDE8DF",
} as const;

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

    const disposeEntity = (el: Element): void => {
      const obj3D = (el as unknown as { object3D?: unknown }).object3D;
      disposeObject3DResources(obj3D);
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

  private static createExhibitEntity(
    exhibit: ExhibitItemConfig,
    viewMode: string,
  ): HTMLElement {
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

    const creatorAttr = exhibit.creatorName
      ? `; creatorName: ${exhibit.creatorName}`
      : "";
    exhibitRoot.setAttribute(
      "cv-inspectable",
      `id: ${exhibit.id}; title: ${exhibit.title}; description: ${exhibit.description}${creatorAttr}; autoRotate: ${exhibit.autoRotate}; rotationSpeed: ${exhibit.rotationSpeed}; mediaType: ${exhibit.mediaType}`,
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
        pedestal.setAttribute("color", GLB_FALLBACK_COLORS.PEDESTAL);
        pedestal.setAttribute("material", "shader: flat");

        const modelGroup = document.createElement("a-entity");
        modelGroup.setAttribute("class", "clickable");
        modelGroup.setAttribute("position", "0 0 0");

        if (exhibit.modelUrl) {
          modelGroup.setAttribute(
            "cv-glb-model",
            `src: ${exhibit.modelUrl}; maxExtent: ${ROOM_LAYOUT_TOKENS.MODEL_MAX_EXTENT_M}`,
          );
        } else {
          const sphere = document.createElement("a-sphere");
          sphere.setAttribute("radius", "0.25");
          sphere.setAttribute("position", "0 0.25 0");
          sphere.setAttribute("color", GLB_FALLBACK_COLORS.PRIMARY);
          sphere.setAttribute("material", "shader: flat");

          const cone = document.createElement("a-cone");
          cone.setAttribute("radius-bottom", "0.28");
          cone.setAttribute("radius-top", "0.1");
          cone.setAttribute("height", "0.4");
          cone.setAttribute("position", "0 -0.05 0");
          cone.setAttribute("color", GLB_FALLBACK_COLORS.SECONDARY);
          cone.setAttribute("material", "shader: flat");

          const ring = document.createElement("a-ring");
          ring.setAttribute("radius-inner", "0.28");
          ring.setAttribute("radius-outer", "0.34");
          ring.setAttribute("position", "0 0.1 0");
          ring.setAttribute("rotation", "90 0 0");
          ring.setAttribute("color", GLB_FALLBACK_COLORS.RING);
          ring.setAttribute("material", "shader: flat");

          modelGroup.append(sphere, cone, ring);
        }

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
        leftPlane.setAttribute("width", String(EXHIBIT_DIMENSIONS.PLANE_WIDTH));
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
        leftPlane.setAttribute("width", String(EXHIBIT_DIMENSIONS.PLANE_WIDTH));
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

    return exhibitRoot;
  }

  private static createStandPlaceholderEntity(
    stand: RoomStandSlotConfig,
    accentColor: string,
  ): HTMLElement {
    const standRoot = document.createElement("a-entity");
    standRoot.setAttribute("id", stand.id);
    standRoot.setAttribute("class", "cv-stand-slot");
    standRoot.setAttribute("data-room-id", stand.roomId);
    standRoot.setAttribute("data-stand-id", stand.standId);
    standRoot.setAttribute(
      "position",
      `${stand.position.x} ${stand.position.y} ${stand.position.z}`,
    );
    standRoot.setAttribute(
      "rotation",
      `${stand.rotation.x} ${stand.rotation.y} ${stand.rotation.z}`,
    );

    const frame = document.createElement("a-plane");
    frame.setAttribute("width", String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08));
    frame.setAttribute("height", String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08));
    frame.setAttribute("position", "0 0 -0.01");
    frame.setAttribute("color", accentColor);
    frame.setAttribute("material", "shader: flat");

    const backdrop = document.createElement("a-plane");
    backdrop.setAttribute("width", String(EXHIBIT_DIMENSIONS.PLANE_WIDTH));
    backdrop.setAttribute("height", String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT));
    backdrop.setAttribute("color", STAND_PLACEHOLDER_COLORS.SURFACE);
    backdrop.setAttribute("material", "shader: flat");

    const title = document.createElement("a-text");
    title.setAttribute("value", stand.label);
    title.setAttribute("align", "center");
    title.setAttribute("color", accentColor);
    title.setAttribute("width", "2.1");
    title.setAttribute("position", "0 0.14 0.02");

    const subtitle = document.createElement("a-text");
    subtitle.setAttribute("value", EXHIBIT_DICTIONARY.STAND_PLACEHOLDER_DESC);
    subtitle.setAttribute("align", "center");
    subtitle.setAttribute("color", STAND_PLACEHOLDER_COLORS.TEXT);
    subtitle.setAttribute("width", "1.35");
    subtitle.setAttribute("wrap-count", "32");
    subtitle.setAttribute("position", "0 -0.1 0.02");

    standRoot.append(frame, backdrop, title, subtitle);
    return standRoot;
  }

  public static mountRoom(
    sceneEl: HTMLElement,
    roomId: RoomId = DEFAULT_ROOM_ID,
    viewMode: string = "vr",
  ): HTMLElement {
    this.teardownRoom(sceneEl);

    const roomDef =
      ROOM_DEFINITIONS[roomId] ?? ROOM_DEFINITIONS[DEFAULT_ROOM_ID];
    this.activeRoomId = roomDef.id;

    getSharedInspectionController().setExhibits(roomDef.exhibits);

    const skyEl = sceneEl.querySelector("a-sky");
    if (skyEl) {
      skyEl.setAttribute("src", roomDef.skyboxUrl);
    }

    const roomGroup = document.createElement("a-entity");
    roomGroup.setAttribute("id", this.ROOM_CONTAINER_ID);
    roomGroup.setAttribute("data-room-id", roomDef.id);

    for (const exhibit of roomDef.exhibits) {
      roomGroup.appendChild(this.createExhibitEntity(exhibit, viewMode));
    }

    for (const stand of roomDef.stands) {
      roomGroup.appendChild(
        this.createStandPlaceholderEntity(stand, roomDef.accentColor),
      );
    }

    for (const portal of roomDef.portals) {
      roomGroup.appendChild(createPortalEntity(portal));
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
