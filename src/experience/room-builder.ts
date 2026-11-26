import {
  DEFAULT_ROOM_ID,
  EXHIBIT_ASSET_IDS,
  EXHIBIT_DIMENSIONS,
  ExhibitMediaType,
  GLB_FALLBACK_COLORS,
  ROOM_DEFINITIONS,
  ROOM_LAYOUT_TOKENS,
  STATION_ARCHITECTURE_TOKENS,
  type ExhibitItemConfig,
} from "./constants";
import type { RoomId, RoomStandSlotConfig } from "./types";
import { createPortalEntity } from "./components/portal-waypoint";
import { getSharedInspectionController } from "./components/inspectable";
import { emptyRoomMediaProvider, type RoomMediaProvider, type StandMediaItem } from "./media-types";
import { getSharedVideoController } from "./shared-video-controller";
import { bakeRoomShadowMap, createContactShadowDecal } from "./shadow-baker";
import {
  getRoomEnvironmentPreset,
  type RoomEnvironmentPreset,
} from "./room-environment-presets";
import {
  createModelPedestalEntity,
  createStandPlinthEntity,
} from "./station-architecture";
import { disposeObject3DResources } from "./three-disposal";

export class ExhibitRoomBuilder {
  public static readonly ROOM_CONTAINER_ID = "cv-prototype-room-group";
  private static activeRoomId: RoomId = DEFAULT_ROOM_ID;

  public static getActiveRoomId(): RoomId {
    return this.activeRoomId;
  }

  public static teardownRoom(sceneEl: HTMLElement): void {
    getSharedVideoController().stopAndRelease();

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

  public static resetToDefaultRoom(sceneEl?: HTMLElement | null): void {
    if (sceneEl) {
      this.teardownRoom(sceneEl);
    } else {
      getSharedVideoController().stopAndRelease();
    }
    const inspectionController = getSharedInspectionController();
    inspectionController.abortActiveInspection();
    inspectionController.setExhibits([
      ...ROOM_DEFINITIONS[DEFAULT_ROOM_ID].exhibits,
    ]);
    this.activeRoomId = DEFAULT_ROOM_ID;
  }

  public static async waitForRoomReady(
    roomGroup: HTMLElement | null,
    skyElOrTimeout: HTMLElement | number | null = null,
    timeoutMs = 1500,
  ): Promise<boolean> {
    const resolvedTimeoutMs =
      typeof skyElOrTimeout === "number" ? skyElOrTimeout : timeoutMs;
    const sceneEl =
      (roomGroup?.closest?.("a-scene") as HTMLElement | null) ??
      roomGroup?.parentElement ??
      null;

    const hasAFrame =
      typeof globalThis !== "undefined" &&
      Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

    if (!hasAFrame) {
      bakeRoomShadowMap(sceneEl);
      return true;
    }

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
      }, resolvedTimeoutMs);

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

    await roomGroupPromise;

    if (typeof requestAnimationFrame === "function") {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    }

    bakeRoomShadowMap(sceneEl);
    return true;
  }

  public static createExhibitEntity(
    exhibit: ExhibitItemConfig,
    viewMode: string,
    preset: RoomEnvironmentPreset = getRoomEnvironmentPreset(DEFAULT_ROOM_ID),
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
        const pedestal = createModelPedestalEntity(exhibit.id, preset);

        const modelGroup = document.createElement("a-entity");
        modelGroup.setAttribute("class", "clickable cv-inspectable-model");
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
          sphere.setAttribute("material", "shader: lambert");

          const cone = document.createElement("a-cone");
          cone.setAttribute("radius-bottom", "0.28");
          cone.setAttribute("radius-top", "0.1");
          cone.setAttribute("height", "0.4");
          cone.setAttribute("position", "0 -0.05 0");
          cone.setAttribute("color", GLB_FALLBACK_COLORS.SECONDARY);
          cone.setAttribute("material", "shader: lambert");

          const ring = document.createElement("a-ring");
          ring.setAttribute("radius-inner", "0.28");
          ring.setAttribute("radius-outer", "0.34");
          ring.setAttribute("position", "0 0.1 0");
          ring.setAttribute("rotation", "90 0 0");
          ring.setAttribute("color", GLB_FALLBACK_COLORS.RING);
          ring.setAttribute("material", "shader: lambert; side: double");

          modelGroup.append(sphere, cone, ring);
        }

        const contactShadow = createContactShadowDecal({
          width: 0.95,
          depth: 0.95,
          yOffset: -1.18,
        });
        pedestal.appendChild(contactShadow);
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

  private static createMediaStandEntity(
    stand: RoomStandSlotConfig,
    accentColor: string,
    viewMode: string,
    items: readonly StandMediaItem[],
  ): HTMLElement {
    const standRoot = document.createElement("a-entity") as HTMLElement & {
      standItems?: StandMediaItem[];
    };
    standRoot.standItems = [...items];
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
    standRoot.setAttribute(
      "cv-media-stand",
      `roomId: ${stand.roomId}; standId: ${stand.standId}; label: ${stand.label}; accentColor: ${accentColor}; viewMode: ${viewMode}; galleryPosition: ${stand.position.x} ${stand.position.y} ${stand.position.z}; galleryRotation: ${stand.rotation.x} ${stand.rotation.y} ${stand.rotation.z}`,
    );

    standRoot.appendChild(
      createContactShadowDecal({
        width: 1.35,
        depth: 0.72,
        yOffset: Number(
          (
            -(
              ROOM_LAYOUT_TOKENS.STAND_ELEVATION_M -
              STATION_ARCHITECTURE_TOKENS.CONTACT_SHADOW_CLEARANCE_M
            )
          ).toFixed(2),
        ),
      }),
    );

    return standRoot;
  }

  public static mountRoom(
    sceneEl: HTMLElement,
    roomId: RoomId = DEFAULT_ROOM_ID,
    viewMode: string = "vr",
    mediaProvider: RoomMediaProvider = emptyRoomMediaProvider,
  ): HTMLElement {
    this.teardownRoom(sceneEl);

    const roomDef =
      ROOM_DEFINITIONS[roomId] ?? ROOM_DEFINITIONS[DEFAULT_ROOM_ID];
    this.activeRoomId = roomDef.id;

    const standItemsBySlot = roomDef.stands.map((stand) => ({
      stand,
      items: mediaProvider.getStandItems(roomDef.id, stand.standId),
    }));

    const standExhibits: ExhibitItemConfig[] = standItemsBySlot
      .filter(({ items }) => items.length > 0)
      .map(({ stand, items }) => {
        const firstItem = items[0]!;
        return {
          id: `${stand.roomId}:${stand.standId}`,
          title: firstItem.title,
          description: firstItem.description,
          creatorName: firstItem.creatorName,
          mediaType: firstItem.mediaType,
          galleryPosition: stand.position,
          galleryRotation: stand.rotation,
          autoRotate: false,
          rotationSpeed: 0,
          mediaUrl: firstItem.mediaUrl,
          posterUrl: firstItem.posterUrl,
        };
      });

    getSharedInspectionController().setExhibits([
      ...roomDef.exhibits,
      ...standExhibits,
    ]);

    const roomGroup = document.createElement("a-entity");
    roomGroup.setAttribute("id", this.ROOM_CONTAINER_ID);
    roomGroup.setAttribute("data-room-id", roomDef.id);

    const preset = getRoomEnvironmentPreset(roomDef.id);

    const envEl = document.createElement("a-entity");
    envEl.setAttribute(
      "cv-room-environment",
      `roomId: ${roomDef.id}`,
    );
    roomGroup.appendChild(envEl);

    for (const exhibit of roomDef.exhibits) {
      roomGroup.appendChild(this.createExhibitEntity(exhibit, viewMode, preset));
    }

    for (const { stand, items } of standItemsBySlot) {
      roomGroup.appendChild(createStandPlinthEntity(stand, preset));
      roomGroup.appendChild(
        this.createMediaStandEntity(stand, roomDef.accentColor, viewMode, items),
      );
    }

    for (const portal of roomDef.portals) {
      roomGroup.appendChild(createPortalEntity(portal, preset));
    }

    roomGroup.addEventListener("model-loaded", () => {
      bakeRoomShadowMap(sceneEl);
    });

    sceneEl.appendChild(roomGroup);
    bakeRoomShadowMap(sceneEl);
    return roomGroup as HTMLElement;
  }

  public static ensureRoom(
    sceneEl: HTMLElement,
    viewMode: string = "vr",
    mediaProvider: RoomMediaProvider = emptyRoomMediaProvider,
  ): HTMLElement {
    const existing = sceneEl.querySelector(`#${this.ROOM_CONTAINER_ID}`);
    if (existing) {
      const propagateViewMode = (selector: string, attrName: string): void => {
        existing.querySelectorAll(selector).forEach((el) => {
          const currentAttr = el.getAttribute(attrName);
          if (typeof currentAttr === "string") {
            el.setAttribute(
              attrName,
              currentAttr.replace(/viewMode:\s*[^;]+/, `viewMode: ${viewMode}`),
            );
          } else if (currentAttr && typeof currentAttr === "object") {
            const aframeEl = el as unknown as {
              setAttribute: (attr: string, prop: string, val: unknown) => void;
            };
            aframeEl.setAttribute(attrName, "viewMode", viewMode);
          }
        });
      };

      propagateViewMode("[cv-stereo-media]", "cv-stereo-media");
      propagateViewMode("[cv-media-stand]", "cv-media-stand");
      return existing as HTMLElement;
    }

    return this.mountRoom(sceneEl, this.activeRoomId, viewMode, mediaProvider);
  }
}
