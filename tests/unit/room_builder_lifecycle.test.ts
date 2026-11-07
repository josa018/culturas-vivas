import { describe, it, expect } from "vitest";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import { RoomId } from "../../src/experience/types";
import { ROOM_DEFINITIONS } from "../../src/experience/constants";
import { getSharedInspectionController } from "../../src/experience/components/inspectable";

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
  it("mountRoom renders Archaeology exhibits, portal, and skybox", () => {
    const scene = document.createElement("a-scene");
    const sky = document.createElement("a-sky");
    scene.appendChild(sky);

    const roomEl = ExhibitRoomBuilder.mountRoom(scene, RoomId.ARCHAEOLOGY);
    expect(roomEl.getAttribute("id")).toBe(ExhibitRoomBuilder.ROOM_CONTAINER_ID);
    expect(roomEl.getAttribute("data-room-id")).toBe(RoomId.ARCHAEOLOGY);
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);

    // Verify skybox URL was updated
    expect(sky.getAttribute("src")).toBe(
      ROOM_DEFINITIONS[RoomId.ARCHAEOLOGY].skyboxUrl,
    );

    // Verify portal entity is mounted
    const portal = roomEl.querySelector("#portal-archaeology-to-textiles");
    expect(portal).not.toBeNull();

    // Verify inspection controller exhibits are updated
    const controller = getSharedInspectionController();
    expect(controller.getAllExhibits()).toHaveLength(
      ROOM_DEFINITIONS[RoomId.ARCHAEOLOGY].exhibits.length,
    );
  });

  it("disposes Three.js resources and mounts destination room on swap", () => {
    const scene = document.createElement("a-scene");
    const sky = document.createElement("a-sky");
    scene.appendChild(sky);

    const room1 = ExhibitRoomBuilder.mountRoom(scene, RoomId.ARCHAEOLOGY);
    const mockObj3D = new MockObject3D();
    (room1 as unknown as { object3D: MockObject3D }).object3D = mockObj3D;

    // Mount Room 2 (Textiles)
    const room2 = ExhibitRoomBuilder.mountRoom(scene, RoomId.TEXTILES);
    expect(room2).not.toBe(room1);
    expect(room2.getAttribute("data-room-id")).toBe(RoomId.TEXTILES);
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.TEXTILES);

    // Old room object3D should have had its geometry/materials disposed
    expect(mockObj3D.geometryDisposed).toBe(true);
    expect(mockObj3D.materialDisposed).toBe(true);
    expect(mockObj3D.mapDisposed).toBe(true);

    // Verify room 2 has portal to archaeology
    const portal = room2.querySelector("#portal-textiles-to-archaeology");
    expect(portal).not.toBeNull();

    // Verify inspection controller now has Textiles exhibits
    const controller = getSharedInspectionController();
    expect(controller.getAllExhibits()).toHaveLength(
      ROOM_DEFINITIONS[RoomId.TEXTILES].exhibits.length,
    );
  });

  it("teardownRoom removes room entity completely from scene", () => {
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

  it("waitForSkyboxReady handles null and event lifecycle cleanly", async () => {
    // Null element
    const nullReady = await ExhibitRoomBuilder.waitForSkyboxReady(null);
    expect(nullReady).toBe(true);

    // Mock element with event dispatch
    let textureCallback: (() => void) | null = null;
    const mockSky = {
      addEventListener: (evt: string, cb: () => void) => {
        if (evt === "materialtextureloaded") textureCallback = cb;
      },
      removeEventListener: () => {
        textureCallback = null;
      },
    } as unknown as HTMLElement;

    // Simulate AFRAME presence for test
    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};

    const promise = ExhibitRoomBuilder.waitForSkyboxReady(mockSky, 500);
    expect(textureCallback).not.toBeNull();
    textureCallback!();
    const result = await promise;
    expect(result).toBe(true);

    // Timeout fallback
    const mockTimeoutSky = {
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLElement;
    const timeoutResult = await ExhibitRoomBuilder.waitForSkyboxReady(
      mockTimeoutSky,
      50,
    );
    expect(timeoutResult).toBe(true);

    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
  });
});
