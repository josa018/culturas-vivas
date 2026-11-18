import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createInspectableComponentDefinition,
  type InspectableComponentInstance,
  setSharedInspectionController,
} from "../../src/experience/components/inspectable";
import {
  ExhibitMediaType,
  EXHIBIT_DIMENSIONS,
  FOCAL_INSPECTION_DISTANCE,
  InspectionState,
  INSPECTION_TIMINGS,
} from "../../src/experience/constants";
import { ExhibitInspectionController } from "../../src/experience/inspection-controller";

type MockEntity = HTMLElement & {
  object3D: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
};

function createMockEntity(
  pos = { x: 0, y: 0, z: 0 },
  rot = { x: 0, y: 0, z: 0 },
): MockEntity {
  const el = document.createElement("a-entity") as MockEntity;
  el.object3D = {
    position: { ...pos },
    rotation: { ...rot },
  };
  el.setAttribute("position", `${pos.x} ${pos.y} ${pos.z}`);
  el.setAttribute("rotation", `${rot.x} ${rot.y} ${rot.z}`);
  return el;
}

describe("A-Frame Inspectable Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    setSharedInspectionController(new ExhibitInspectionController());
  });

  afterEach(() => {
    vi.useRealTimers();
    setSharedInspectionController(null);
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    document.body.innerHTML = "";
  });

  it("initializes component and attaches hidden billboard hierarchy", () => {
    const def = createInspectableComponentDefinition();
    const mockEl = createMockEntity(
      { x: 2, y: 1.6, z: -2 },
      { x: 0, y: -45, z: 0 },
    );

    const instance: InspectableComponentInstance = Object.create(def);
    instance.el = mockEl as unknown as InspectableComponentInstance["el"];
    instance.data = {
      id: "test-painting",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0.015,
      title: "Lienzo de Prueba",
      description: "Descripcion detallada del lienzo",
      mediaType: ExhibitMediaType.IMAGE_2D,
    };

    instance.init();

    expect(instance.state).toBe(InspectionState.IDLE);
    expect(instance.galleryPosition).toEqual({ x: 2, y: 1.6, z: -2 });
    expect(instance.billboardEl?.getAttribute("visible")).toBe("false");
    expect(instance.billboardEl?.getAttribute("position")).toBe("0 -0.925 0");
    expect(instance.billboardEl?.getAttribute("scale")).toBe("0.001 0.001 0.001");

    const titleText = instance.billboardEl?.querySelector("a-text");
    expect(titleText?.getAttribute("width")).toBe(
      String(EXHIBIT_DIMENSIONS.BILLBOARD_TITLE_WIDTH),
    );
    expect(titleText?.getAttribute("wrap-count")).toBe(
      String(EXHIBIT_DIMENSIONS.BILLBOARD_TITLE_WRAP_COUNT),
    );
  });

  it("performs radial inspection focal animation, counter-translates pedestal, auto-rotates, and restores on return", () => {
    const def = createInspectableComponentDefinition();
    const mockEl = createMockEntity(
      { x: 0, y: 1.4, z: -2.8 },
      { x: 0, y: 0, z: 0 },
    );
    const pedestal = document.createElement("a-cylinder");
    pedestal.setAttribute("position", "0 -0.4 0");
    mockEl.appendChild(pedestal);

    const instance: InspectableComponentInstance = Object.create(def);
    instance.el = mockEl as unknown as InspectableComponentInstance["el"];
    instance.data = {
      id: "test-statue",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: true,
      rotationSpeed: 0.02,
      title: "Estatua 3D",
      description: "Modelo 3D",
      mediaType: ExhibitMediaType.MODEL_3D,
    };

    instance.init();
    instance.inspect();

    expect(instance.state).toBe(InspectionState.INSPECTING);
    expect(instance.billboardEl?.getAttribute("visible")).toBe("true");
    expect(instance.billboardEl?.getAttribute("scale")).toBe("1 1 1");
    expect(mockEl.getAttribute("position")).toBe("0 1.507 -1.297");

    const inspectAnim = mockEl.getAttribute("animation__inspect");
    expect(inspectAnim).toContain(
      `dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}`,
    );
    expect(inspectAnim).toContain("from: 0 1.4 -2.8");
    expect(inspectAnim).toContain("to: 0 1.507 -1.297");

    // Pedestal counter-translation keeps pedestal anchored in gallery space
    expect(pedestal.getAttribute("position")).toBe("0 -0.507 -1.503");

    instance.tick(0, 16);
    expect(mockEl.object3D.rotation.y).toBe(0.02);

    instance.returnToGallery();
    expect(instance.state).toBe(InspectionState.IDLE);
    expect(instance.billboardEl?.getAttribute("visible")).toBe("false");
    expect(mockEl.getAttribute("position")).toBe("0 1.4 -2.8");
    expect(pedestal.getAttribute("position")).toBe("0 -0.4 0");
    expect(mockEl.getAttribute("animation__return")).toContain("to: 0 1.4 -2.8");
  });

  it("defers position and billboard teardown until animationcomplete / timeout when AFRAME is active", () => {
    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};

    const def = createInspectableComponentDefinition();
    const mockEl = createMockEntity({ x: 0, y: 1.4, z: -2.8 });
    const instance: InspectableComponentInstance = Object.create(def);
    instance.el = mockEl as unknown as InspectableComponentInstance["el"];
    instance.data = {
      id: "exhibit-statue-3d",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Estatua",
      description: "Desc",
      mediaType: ExhibitMediaType.MODEL_3D,
    };

    instance.init();
    instance.inspect();

    // Position is deferred until animationcomplete__inspect fires
    expect(mockEl.getAttribute("position")).toBe("0 1.4 -2.8");
    mockEl.dispatchEvent(new Event("animationcomplete__inspect"));
    expect(mockEl.getAttribute("position")).toBe("0 1.507 -1.297");

    instance.billboardEl?.dispatchEvent(new Event("animationcomplete__panel_in"));
    expect(instance.billboardEl?.getAttribute("scale")).toBe("1 1 1");

    instance.returnToGallery();
    expect(instance.billboardEl?.getAttribute("visible")).toBe("true");
    vi.advanceTimersByTime(260);
    expect(instance.billboardEl?.getAttribute("visible")).toBe("false");
    mockEl.dispatchEvent(new Event("animationcomplete__return"));
    expect(mockEl.getAttribute("position")).toBe("0 1.4 -2.8");
  });

  it("plays video exhibit on inspection and pauses on return", () => {
    const def = createInspectableComponentDefinition();
    const mockEl = createMockEntity({ x: -2, y: 1.6, z: 2 });

    const videoChild = document.createElement("video") as HTMLVideoElement & {
      isPlaying?: boolean;
    };
    videoChild.isPlaying = false;
    videoChild.play = async () => {
      videoChild.isPlaying = true;
    };
    videoChild.pause = () => {
      videoChild.isPlaying = false;
    };
    mockEl.appendChild(videoChild);

    const instance: InspectableComponentInstance = Object.create(def);
    instance.el = mockEl as unknown as InspectableComponentInstance["el"];
    instance.data = {
      id: "test-video",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Video 2D",
      description: "Video tradicional",
      mediaType: ExhibitMediaType.VIDEO_2D,
    };

    instance.init();
    expect(videoChild.isPlaying).toBe(false);

    instance.inspect();
    expect(videoChild.isPlaying).toBe(true);

    instance.returnToGallery();
    expect(videoChild.isPlaying).toBe(false);
  });

  it("inspects on entity click when IDLE and returns when close button is clicked", () => {
    const def = createInspectableComponentDefinition();
    const mockEl = createMockEntity({ x: 0, y: 1.6, z: -2 });

    const instance: InspectableComponentInstance = Object.create(def);
    instance.el = mockEl as unknown as InspectableComponentInstance["el"];
    instance.data = {
      id: "test-interactive",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Item",
      description: "Item desc",
      mediaType: ExhibitMediaType.IMAGE_2D,
    };

    instance.init();
    mockEl.dispatchEvent(new Event("click"));
    expect(instance.state).toBe(InspectionState.INSPECTING);

    const returnBtn = instance.billboardEl?.querySelector(
      '[data-action="return-exhibit"]',
    ) as HTMLElement;
    returnBtn.dispatchEvent(new CustomEvent("click"));
    expect(instance.state).toBe(InspectionState.IDLE);
  });

  it("enforces mutual exclusivity by auto-returning preceding active exhibit", () => {
    const dedicatedController = new ExhibitInspectionController([
      {
        id: "exhibit-a",
        title: "Exhibit A",
        description: "Desc A",
        mediaType: ExhibitMediaType.IMAGE_2D,
        galleryPosition: { x: 0, y: 1.4, z: -2.8 },
        galleryRotation: { x: 0, y: 0, z: 0 },
        autoRotate: false,
        rotationSpeed: 0,
      },
      {
        id: "exhibit-b",
        title: "Exhibit B",
        description: "Desc B",
        mediaType: ExhibitMediaType.IMAGE_2D,
        galleryPosition: { x: 2, y: 1.6, z: -2 },
        galleryRotation: { x: 0, y: -45, z: 0 },
        autoRotate: false,
        rotationSpeed: 0,
      },
    ]);
    setSharedInspectionController(dedicatedController);

    const def = createInspectableComponentDefinition();

    const elA = createMockEntity({ x: 0, y: 1.4, z: -2.8 });
    const instA: InspectableComponentInstance = Object.create(def);
    instA.el = elA as unknown as InspectableComponentInstance["el"];
    instA.data = {
      id: "exhibit-a",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Exhibit A",
      description: "Desc A",
      mediaType: ExhibitMediaType.IMAGE_2D,
    };
    instA.init();

    const elB = createMockEntity({ x: 2, y: 1.6, z: -2 });
    const instB: InspectableComponentInstance = Object.create(def);
    instB.el = elB as unknown as InspectableComponentInstance["el"];
    instB.data = {
      id: "exhibit-b",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Exhibit B",
      description: "Desc B",
      mediaType: ExhibitMediaType.IMAGE_2D,
    };
    instB.init();

    instA.inspect();
    expect(instA.state).toBe(InspectionState.INSPECTING);

    instB.inspect();
    expect(instB.state).toBe(InspectionState.INSPECTING);
    expect(elB.getAttribute("position")).toBe("0.919 1.6 -0.919");
    expect(instA.state).toBe(InspectionState.IDLE);
    expect(elA.getAttribute("position")).toBe("0 1.4 -2.8");
    expect(instA.billboardEl?.getAttribute("visible")).toBe("false");
  });

  it("removes billboard and unsubscribes from shared controller on remove()", () => {
    const def = createInspectableComponentDefinition();
    const mockEl = createMockEntity({ x: 0, y: 1.4, z: -2.8 });
    const instance: InspectableComponentInstance = Object.create(def);
    instance.el = mockEl as unknown as InspectableComponentInstance["el"];
    instance.data = {
      id: "exhibit-statue-3d",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Estatua",
      description: "Desc",
      mediaType: ExhibitMediaType.MODEL_3D,
    };

    instance.init();
    expect(mockEl.querySelector(".cv-billboard")).not.toBeNull();

    instance.remove();
    expect(mockEl.querySelector(".cv-billboard")).toBeNull();
    expect(instance.billboardEl).toBeNull();
    expect(instance.unsubscribeController).toBeNull();
  });
});
