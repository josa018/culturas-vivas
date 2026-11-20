import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import { RoomId } from "../../src/experience/types";
import {
  DISPOSABLE_TEXTURE_SLOTS,
  ExhibitMediaType,
  ROOM_DEFINITIONS,
  ROOM_PORTAL_ACCENTS,
} from "../../src/experience/constants";
import { StandId } from "../../src/shared/room-catalog";
import type { RoomMediaProvider, StandMediaItem } from "../../src/experience/media-types";
import {
  getSharedVideoController,
  setSharedVideoController,
  SharedVideoController,
} from "../../src/experience/shared-video-controller";
import {
  getSharedInspectionController,
  setSharedInspectionController,
} from "../../src/experience/components/inspectable";

class MockPbrObject3D {
  public geometryDisposed = false;
  public materialDisposed = false;
  public readonly slotDisposals: Record<string, boolean> = {};

  public geometry = {
    dispose: () => {
      this.geometryDisposed = true;
    },
  };

  public material: Record<string, unknown>;

  constructor() {
    const mat: Record<string, unknown> = {
      dispose: () => {
        this.materialDisposed = true;
      },
    };
    for (const slot of DISPOSABLE_TEXTURE_SLOTS) {
      this.slotDisposals[slot] = false;
      mat[slot] = {
        dispose: () => {
          this.slotDisposals[slot] = true;
        },
      };
    }
    this.material = mat;
  }

  public traverse(cb: (node: unknown) => void): void {
    cb(this);
  }
}

describe("ExhibitRoomBuilder Lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    const resetScene = document.createElement("a-scene");
    ExhibitRoomBuilder.mountRoom(resetScene, RoomId.LOBBY);
    setSharedInspectionController(null);
    setSharedVideoController(new SharedVideoController());
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
  });

  it("mountRoom renders LOBBY with 4 cultural portals, accent colors, 2 stands, and procedural preset without legacy skybox src", () => {
    const scene = document.createElement("a-scene");
    const sky = document.createElement("a-sky");
    scene.appendChild(sky);

    const roomEl = ExhibitRoomBuilder.mountRoom(scene, RoomId.LOBBY);
    expect(roomEl.getAttribute("id")).toBe(ExhibitRoomBuilder.ROOM_CONTAINER_ID);
    expect(roomEl.getAttribute("data-room-id")).toBe(RoomId.LOBBY);
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.LOBBY);

    expect(sky.getAttribute("src")).toBeNull();

    const wixarikaPortal = roomEl.querySelector("#portal-lobby-to-wixarika");
    expect(wixarikaPortal).not.toBeNull();
    expect(roomEl.querySelector("#portal-lobby-to-naayeri")).not.toBeNull();
    expect(roomEl.querySelector("#portal-lobby-to-odam")).not.toBeNull();
    expect(roomEl.querySelector("#portal-lobby-to-mexicanero")).not.toBeNull();

    const portalPillars = wixarikaPortal?.querySelectorAll("a-box");
    expect(portalPillars?.[0]?.getAttribute("color")).toBe(
      ROOM_PORTAL_ACCENTS[RoomId.WIXARIKA],
    );

    expect(roomEl.querySelector("#stand-lobby-bienvenida")).not.toBeNull();
    expect(roomEl.querySelector("#stand-lobby-nayarit")).not.toBeNull();
  });

  it("disposes all PBR texture channels across single/array materials when swapping from LOBBY to WIXARIKA", () => {
    const scene = document.createElement("a-scene");
    const sky = document.createElement("a-sky");
    scene.appendChild(sky);

    const room1 = ExhibitRoomBuilder.mountRoom(scene, RoomId.LOBBY);
    const mockObj3D = new MockPbrObject3D();
    (room1 as unknown as { object3D: MockPbrObject3D }).object3D = mockObj3D;

    let arrayMatDisposed = false;
    let arrayNormalDisposed = false;
    const childWithArrayMat = document.createElement("a-entity");
    (childWithArrayMat as unknown as { object3D: unknown }).object3D = {
      traverse: (cb: (n: unknown) => void) =>
        cb({
          material: [
            {
              dispose: () => {
                arrayMatDisposed = true;
              },
              normalMap: {
                dispose: () => {
                  arrayNormalDisposed = true;
                },
              },
            },
          ],
        }),
    };
    room1.appendChild(childWithArrayMat);

    const room2 = ExhibitRoomBuilder.mountRoom(scene, RoomId.WIXARIKA);
    expect(room2).not.toBe(room1);
    expect(room2.getAttribute("data-room-id")).toBe(RoomId.WIXARIKA);
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.WIXARIKA);

    expect(mockObj3D.geometryDisposed).toBe(true);
    expect(mockObj3D.materialDisposed).toBe(true);
    for (const slot of DISPOSABLE_TEXTURE_SLOTS) {
      expect(mockObj3D.slotDisposals[slot]).toBe(true);
    }
    expect(arrayMatDisposed).toBe(true);
    expect(arrayNormalDisposed).toBe(true);

    expect(room2.querySelector("#portal-wixarika-to-lobby")).not.toBeNull();
    expect(room2.querySelector("#exhibit-wixarika-artifact")).not.toBeNull();
    expect(room2.querySelector("#stand-wixarika-vestimenta")).not.toBeNull();
    expect(getSharedInspectionController().getAllExhibits()).toHaveLength(
      ROOM_DEFINITIONS[RoomId.WIXARIKA].exhibits.length,
    );
  });

  it("ensureRoom reuses existing room without duplicating DOM", () => {
    const scene = document.createElement("a-scene");
    const room1 = ExhibitRoomBuilder.ensureRoom(scene, "vr");
    const room2 = ExhibitRoomBuilder.ensureRoom(scene, "2d");

    expect(room2).toBe(room1);
  });

  it("teardownRoom removes room container from scene", () => {
    const scene = document.createElement("a-scene");
    ExhibitRoomBuilder.mountRoom(scene, RoomId.LOBBY);
    expect(
      scene.querySelector(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`),
    ).not.toBeNull();

    ExhibitRoomBuilder.teardownRoom(scene);
    expect(
      scene.querySelector(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`),
    ).toBeNull();
  });

  it("waitForRoomReady resolves on room loaded and double rAF without waiting for a-sky materialtextureloaded", async () => {
    expect(await ExhibitRoomBuilder.waitForRoomReady(null, null)).toBe(true);

    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};

    const roomGroup = document.createElement("a-entity") as HTMLElement & {
      hasLoaded: boolean;
    };
    roomGroup.hasLoaded = false;
    const stalledSky = document.createElement("a-sky");

    const promise = ExhibitRoomBuilder.waitForRoomReady(roomGroup, stalledSky, 5000);
    roomGroup.dispatchEvent(new Event("loaded"));
    await vi.runAllTimersAsync();

    expect(await promise).toBe(true);
  });

  it("mounts cv-media-stand entities from injected RoomMediaProvider and releases SharedVideoController on teardown", () => {
    const sampleItems: StandMediaItem[] = [
      {
        id: "gastro-1",
        roomId: RoomId.NAAYERI,
        standId: StandId.GASTRONOMIA,
        mediaType: ExhibitMediaType.IMAGE_2D,
        title: "Platillo Tradicional",
        creatorName: "Elena",
        description: "Gastronomía Náayeri.",
        mediaUrl: "https://cdn.example.com/gastro-1.jpg",
        sortOrder: 0,
      },
      {
        id: "gastro-2",
        roomId: RoomId.NAAYERI,
        standId: StandId.GASTRONOMIA,
        mediaType: ExhibitMediaType.VIDEO_2D,
        title: "Preparación",
        creatorName: "Elena",
        description: "Video de preparación.",
        mediaUrl: "https://cdn.example.com/gastro-2.mp4",
        posterUrl: "https://cdn.example.com/gastro-2.jpg",
        sortOrder: 1,
      },
    ];

    const mediaProvider: RoomMediaProvider = {
      getStandItems: (roomId, standId) =>
        roomId === RoomId.NAAYERI && standId === StandId.GASTRONOMIA ? sampleItems : [],
    };

    const videoController = new SharedVideoController();
    const stopSpy = vi.spyOn(videoController, "stopAndRelease");
    setSharedVideoController(videoController);

    const scene = document.createElement("a-scene");
    const roomEl = (ExhibitRoomBuilder.mountRoom as unknown as (
      sceneEl: HTMLElement,
      roomId: RoomId,
      viewMode: string,
      provider: RoomMediaProvider,
    ) => HTMLElement)(scene, RoomId.NAAYERI, "vr", mediaProvider);

    const standNodes = roomEl.querySelectorAll("[cv-media-stand]");
    expect(standNodes).toHaveLength(5);

    const gastroStand = roomEl.querySelector("#stand-naayeri-gastronomia") as
      | (HTMLElement & { standItems?: StandMediaItem[] })
      | null;
    const arteStand = roomEl.querySelector("#stand-naayeri-arte") as
      | (HTMLElement & { standItems?: StandMediaItem[] })
      | null;

    expect(gastroStand?.standItems).toHaveLength(2);
    expect(arteStand?.standItems).toEqual([]);
    expect(getSharedInspectionController().getAllExhibits()).toHaveLength(
      ROOM_DEFINITIONS[RoomId.NAAYERI].exhibits.length + 1,
    );

    const envEl = roomEl.querySelector("[cv-room-environment]");
    expect(envEl).not.toBeNull();
    expect(envEl?.getAttribute("cv-room-environment")).toContain(RoomId.NAAYERI);

    const instancedDispose = vi.fn();
    const envGeoDispose = vi.fn();
    const envTexDispose = vi.fn();
    const envMatDispose = vi.fn();
    (roomEl as unknown as { object3D?: unknown }).object3D = {
      traverse: (cb: (node: unknown) => void) => {
        cb({
          geometry: envGeoDispose ? { dispose: envGeoDispose } : undefined,
          material: { dispose: envMatDispose, map: { dispose: envTexDispose } },
          dispose: instancedDispose,
        });
      },
    };

    ExhibitRoomBuilder.teardownRoom(scene);
    expect(instancedDispose).toHaveBeenCalledTimes(1);
    expect(envGeoDispose).toHaveBeenCalledTimes(1);
    expect(envMatDispose).toHaveBeenCalledTimes(1);
    expect(envTexDispose).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalled();
    expect(getSharedVideoController()).toBe(videoController);
  });

  it("removes legacy <a-sky> and fallback <a-light> elements from index.html", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const html = fs.readFileSync(
      path.resolve(process.cwd(), "index.html"),
      "utf-8",
    );
    expect(html).not.toMatch(/<a-sky\b/i);
    expect(html).not.toMatch(/<a-light\b/i);
  });

  it("bakes room PCF shadow map once on waitForRoomReady and attaches .cv-contact-shadow decals to movable stands and models", async () => {
    const shadowMap = {
      enabled: false,
      type: 0,
      autoUpdate: true,
      needsUpdate: false,
    };
    const scene = document.createElement("a-scene") as HTMLElement & {
      renderer?: unknown;
    };
    scene.renderer = { shadowMap };

    const roomEl = ExhibitRoomBuilder.mountRoom(scene, RoomId.WIXARIKA, "vr");

    expect(roomEl.querySelector(".cv-contact-shadow")).not.toBeNull();

    await ExhibitRoomBuilder.waitForRoomReady(roomEl, 100);

    expect(shadowMap.enabled).toBe(true);
    expect(shadowMap.autoUpdate).toBe(false);
    expect(shadowMap.needsUpdate).toBe(true);

    // Triggering async model-loaded re-bakes shadows cleanly without enabling autoUpdate
    shadowMap.needsUpdate = false;
    roomEl.dispatchEvent(new CustomEvent("model-loaded", { bubbles: true }));
    expect(shadowMap.needsUpdate).toBe(true);
    expect(shadowMap.autoUpdate).toBe(false);

    ExhibitRoomBuilder.teardownRoom(scene);
  });
});
