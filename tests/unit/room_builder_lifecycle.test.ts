import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import { RoomId } from "../../src/experience/types";
import {
  EXHIBIT_ASSET_IDS,
  ROOM_DEFINITIONS,
} from "../../src/experience/constants";
import {
  getSharedInspectionController,
  setSharedInspectionController,
} from "../../src/experience/components/inspectable";

class MockObject3D {
  public geometryDisposed = false;
  public materialDisposed = false;
  public mapDisposed = false;

  public geometry = {
    dispose: () => {
      this.geometryDisposed = true;
    },
  };

  public material = {
    dispose: () => {
      this.materialDisposed = true;
    },
    map: {
      dispose: () => {
        this.mapDisposed = true;
      },
    },
  };

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
    ExhibitRoomBuilder.mountRoom(resetScene, RoomId.ARCHAEOLOGY);
    setSharedInspectionController(null);
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
  });

  it("mountRoom renders Archaeology exhibits, portal, skybox, and <a-assets>", () => {
    const scene = document.createElement("a-scene");
    const sky = document.createElement("a-sky");
    scene.appendChild(sky);

    const roomEl = ExhibitRoomBuilder.mountRoom(scene, RoomId.ARCHAEOLOGY);
    expect(roomEl.getAttribute("id")).toBe(ExhibitRoomBuilder.ROOM_CONTAINER_ID);
    expect(roomEl.getAttribute("data-room-id")).toBe(RoomId.ARCHAEOLOGY);
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);

    expect(sky.getAttribute("src")).toBe(
      ROOM_DEFINITIONS[RoomId.ARCHAEOLOGY].skyboxUrl,
    );
    expect(roomEl.querySelector("#portal-archaeology-to-textiles")).not.toBeNull();

    const controller = getSharedInspectionController();
    expect(controller.getAllExhibits()).toHaveLength(
      ROOM_DEFINITIONS[RoomId.ARCHAEOLOGY].exhibits.length,
    );

    const assetsEl = scene.querySelector("a-assets")!;
    expect(assetsEl.querySelector(`#${EXHIBIT_ASSET_IDS.PAINTING_2D}`)).not.toBeNull();
    expect(assetsEl.querySelector(`#${EXHIBIT_ASSET_IDS.PHOTO_STEREO}`)).not.toBeNull();
    expect(assetsEl.querySelector(`#${EXHIBIT_ASSET_IDS.VIDEO_2D}`)).not.toBeNull();
    expect(assetsEl.querySelector(`#${EXHIBIT_ASSET_IDS.VIDEO_STEREO_SBS}`)).not.toBeNull();

    const paintingPlane = roomEl.querySelector(
      "#exhibit-painting-2d a-plane.clickable",
    );
    expect(paintingPlane?.getAttribute("src")).toBe(
      `#${EXHIBIT_ASSET_IDS.PAINTING_2D}`,
    );
  });

  it("disposes single and array Three.js materials/geometries and swaps rooms cleanly", () => {
    const scene = document.createElement("a-scene");
    const sky = document.createElement("a-sky");
    scene.appendChild(sky);

    const room1 = ExhibitRoomBuilder.mountRoom(scene, RoomId.ARCHAEOLOGY);
    const mockObj3D = new MockObject3D();
    (room1 as unknown as { object3D: MockObject3D }).object3D = mockObj3D;

    let arrayMatDisposed = false;
    let arrayMapDisposed = false;
    const childWithArrayMat = document.createElement("a-entity");
    (childWithArrayMat as unknown as { object3D: unknown }).object3D = {
      traverse: (cb: (n: unknown) => void) =>
        cb({
          material: [
            {
              dispose: () => {
                arrayMatDisposed = true;
              },
              map: {
                dispose: () => {
                  arrayMapDisposed = true;
                },
              },
            },
          ],
        }),
    };
    room1.appendChild(childWithArrayMat);

    const room2 = ExhibitRoomBuilder.mountRoom(scene, RoomId.TEXTILES);
    expect(room2).not.toBe(room1);
    expect(room2.getAttribute("data-room-id")).toBe(RoomId.TEXTILES);
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.TEXTILES);

    expect(mockObj3D.geometryDisposed).toBe(true);
    expect(mockObj3D.materialDisposed).toBe(true);
    expect(mockObj3D.mapDisposed).toBe(true);
    expect(arrayMatDisposed).toBe(true);
    expect(arrayMapDisposed).toBe(true);

    expect(room2.querySelector("#portal-textiles-to-archaeology")).not.toBeNull();
    expect(getSharedInspectionController().getAllExhibits()).toHaveLength(
      ROOM_DEFINITIONS[RoomId.TEXTILES].exhibits.length,
    );
  });

  it("ensureRoom reuses existing room and updates cv-stereo-media viewMode attribute", () => {
    const scene = document.createElement("a-scene");
    const room1 = ExhibitRoomBuilder.ensureRoom(scene, "vr");
    const room2 = ExhibitRoomBuilder.ensureRoom(scene, "2d");

    expect(room2).toBe(room1);
    const stereoPlanes = room2.querySelectorAll("[cv-stereo-media]");
    expect(stereoPlanes.length).toBeGreaterThan(0);
    stereoPlanes.forEach((plane) => {
      expect(plane.getAttribute("cv-stereo-media")).toContain("viewMode: 2d");
    });
  });

  it("teardownRoom removes room container from scene", () => {
    const scene = document.createElement("a-scene");
    ExhibitRoomBuilder.mountRoom(scene, RoomId.ARCHAEOLOGY);
    expect(
      scene.querySelector(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`),
    ).not.toBeNull();

    ExhibitRoomBuilder.teardownRoom(scene);
    expect(
      scene.querySelector(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`),
    ).toBeNull();
  });

  it("waitForSkyboxReady resolves on materialtextureloaded or timeout", async () => {
    expect(await ExhibitRoomBuilder.waitForSkyboxReady(null)).toBe(true);

    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};

    const sky = document.createElement("a-sky");
    const eventPromise = ExhibitRoomBuilder.waitForSkyboxReady(sky, 500);
    sky.dispatchEvent(new Event("materialtextureloaded"));
    expect(await eventPromise).toBe(true);

    const stalledSky = document.createElement("a-sky");
    const timeoutPromise = ExhibitRoomBuilder.waitForSkyboxReady(stalledSky, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await timeoutPromise).toBe(true);
  });

  it("waitForRoomReady coordinates room loaded, skybox texture, and double rAF", async () => {
    expect(await ExhibitRoomBuilder.waitForRoomReady(null, null)).toBe(true);

    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};

    const roomGroup = document.createElement("a-entity") as HTMLElement & {
      hasLoaded: boolean;
    };
    roomGroup.hasLoaded = false;
    const sky = document.createElement("a-sky");

    const promise = ExhibitRoomBuilder.waitForRoomReady(roomGroup, sky, 500);
    roomGroup.dispatchEvent(new Event("loaded"));
    sky.dispatchEvent(new Event("materialtextureloaded"));
    await vi.runAllTimersAsync();

    expect(await promise).toBe(true);
  });
});
