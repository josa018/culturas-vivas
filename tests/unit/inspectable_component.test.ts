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
    expect(instance.billboardEl?.getAttribute("position")).toBe("0 -0.9 0.08");
    expect(instance.billboardEl?.getAttribute("rotation")).toBe("-12 0 0");
    expect(instance.billboardEl?.getAttribute("scale")).toBe("0.001 0.001 0.001");

    const titleText = instance.billboardEl?.querySelector("[cv-canvas-text]");
    expect(titleText).not.toBeNull();
    expect(titleText?.getAttribute("value")).toBe("Lienzo de Prueba");
    expect(titleText?.getAttribute("width")).toBe(
      String(EXHIBIT_DIMENSIONS.BILLBOARD_TITLE_WIDTH),
    );
    expect(titleText?.getAttribute("cv-canvas-text")).toContain("paddingY: 12");
    expect(titleText?.getAttribute("cv-canvas-text")).toContain("canvasHeight: 112");
    const billboardPlane = instance.billboardEl?.querySelector("a-plane");
    const billboardPosY = Number((instance.billboardEl?.getAttribute("position") ?? "0 0 0").split(/\s+/)[1]);
    const billboardH = Number(billboardPlane?.getAttribute("height") ?? 0);
    expect(billboardPosY + billboardH / 2).toBeLessThanOrEqual(-(EXHIBIT_DIMENSIONS.PLANE_HEIGHT / 2 + 0.04));
    expect(instance.billboardEl?.querySelector("a-text")).toBeNull();
    expect(instance.returnBtnEl?.getAttribute("geometry")).toContain(
      "segments: 48",
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
      focalDistance: 1.4,
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
    expect(mockEl.getAttribute("position")).toBe("0 1.78 -1.4");

    const inspectAnim = mockEl.getAttribute("animation__inspect");
    expect(inspectAnim).toContain(
      `dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}`,
    );
    expect(inspectAnim).toContain("from: 0 1.4 -2.8");
    expect(inspectAnim).toContain("to: 0 1.78 -1.4");

    // Pedestal counter-translation keeps pedestal anchored in gallery space
    expect(pedestal.getAttribute("position")).toBe("0 -0.78 -1.4");

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
      focalDistance: 1.4,
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
    expect(mockEl.getAttribute("position")).toBe("0 1.78 -1.4");

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
    expect(elB.getAttribute("position")).toBe("0.919 1.78 -0.919");
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

  it("retains billboard and controller sync when re-focusing after preemption and aborts if controller rejects focus", () => {
    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};
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
    const createInst = (id: string, pos: { x: number; y: number; z: number }) => {
      const el = createMockEntity(pos);
      const inst: InspectableComponentInstance = Object.create(def);
      inst.el = el as unknown as InspectableComponentInstance["el"];
      inst.data = {
        id,
        focalDistance: FOCAL_INSPECTION_DISTANCE,
        autoRotate: false,
        rotationSpeed: 0,
        title: id,
        description: "Desc",
        mediaType: ExhibitMediaType.IMAGE_2D,
      };
      inst.init();
      return inst;
    };

    const instA = createInst("exhibit-a", { x: 0, y: 1.4, z: -2.8 });
    const instB = createInst("exhibit-b", { x: 2, y: 1.6, z: -2 });

    // Preempt A with B, close B, then re-focus A
    instA.inspect();
    instB.inspect();
    instB.returnToGallery();
    vi.advanceTimersByTime(300);

    instA.inspect();
    vi.advanceTimersByTime(450);
    instA.billboardEl?.dispatchEvent(new Event("animationcomplete__panel_in"));

    expect(instA.state).toBe(InspectionState.INSPECTING);
    expect(dedicatedController.getActiveExhibit()?.id).toBe("exhibit-a");
    expect(instA.billboardEl?.getAttribute("visible")).toBe("true");
    expect(instA.billboardEl?.getAttribute("scale")).toBe("1 1 1");

    // A desynchronized IDLE instance for an already-active registered exhibit aborts inspect()
    const duplicateA = createInst("exhibit-a", { x: 0, y: 1.4, z: -2.8 });
    duplicateA.inspect();
    expect(duplicateA.state).toBe(InspectionState.IDLE);
    expect(duplicateA.billboardEl?.getAttribute("visible")).toBe("false");
  });

  it("cancels pending hide timer and orphaned panel_out listener on rapid close -> reopen, and gates .clickable on return button", () => {
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
    const returnBtn = instance.billboardEl?.querySelector(
      '[data-action="return-exhibit"]',
    ) as HTMLElement;
    expect(returnBtn.classList.contains("clickable")).toBe(false);

    // First inspection -> panel opens after entrance delay
    instance.inspect();
    vi.advanceTimersByTime(INSPECTION_TIMINGS.PANEL_ENTRANCE_DELAY_MS);
    expect(instance.billboardEl?.getAttribute("visible")).toBe("true");
    expect(returnBtn.classList.contains("clickable")).toBe(true);
    instance.billboardEl?.dispatchEvent(new Event("animationcomplete__panel_in"));

    // Close at t = 0ms -> immediately drops .clickable
    instance.returnToGallery();
    expect(returnBtn.classList.contains("clickable")).toBe(false);

    // Re-open at t = 100ms (< 260ms hide timer)
    vi.advanceTimersByTime(100);
    instance.inspect();

    // Advance past entrance delay (150ms) and old hide timer (160ms remaining) -> total 450ms
    vi.advanceTimersByTime(INSPECTION_TIMINGS.PANEL_ENTRANCE_DELAY_MS);
    expect(instance.billboardEl?.getAttribute("animation__panel_in")).not.toContain(
      "delay:",
    );
    expect(instance.billboardEl?.getAttribute("visible")).toBe("true");
    expect(returnBtn.classList.contains("clickable")).toBe(true);

    vi.advanceTimersByTime(300);
    instance.billboardEl?.dispatchEvent(new Event("animationcomplete__panel_in"));
    // Even a stray animationcomplete__panel_out event must not hide the reopened billboard
    instance.billboardEl?.dispatchEvent(new Event("animationcomplete__panel_out"));

    expect(instance.state).toBe(InspectionState.INSPECTING);
    expect(instance.billboardEl?.getAttribute("visible")).toBe("true");
    expect(instance.billboardEl?.getAttribute("scale")).toBe("1 1 1");
    expect(returnBtn.classList.contains("clickable")).toBe(true);
  });

  it("cancels panelDelayTimer when interrupted before entrance delay and clears timers on remove()", () => {
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

    // Interrupt before 150ms entrance delay elapses
    vi.advanceTimersByTime(50);
    instance.returnToGallery();

    // Advancing past entrance delay must NOT apply animation__panel_in or show billboard
    vi.advanceTimersByTime(200);
    expect(instance.billboardEl?.getAttribute("animation__panel_in")).toBeNull();
    vi.advanceTimersByTime(100);
    expect(instance.billboardEl?.getAttribute("visible")).toBe("false");

    // Start inspection and remove() before timers fire -> no pending timer leaks
    instance.inspect();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    instance.remove();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders optional creatorName attribution on billboard only when non-empty", () => {
    const def = createInspectableComponentDefinition();

    const withCreatorEl = createMockEntity({ x: 0, y: 1.4, z: -3.2 });
    const withCreator: InspectableComponentInstance = Object.create(def);
    withCreator.el = withCreatorEl as unknown as InspectableComponentInstance["el"];
    withCreator.data = {
      id: "exhibit-with-creator",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Pieza Ceremonial",
      creatorName: "Artesano Wixárika",
      description: "Descripción de la pieza",
      mediaType: ExhibitMediaType.MODEL_3D,
    };
    withCreator.init();

    const creatorText = withCreator.billboardEl?.querySelector(
      ".cv-billboard-creator",
    );
    expect(creatorText?.getAttribute("visible")).toBe("true");
    expect(creatorText?.getAttribute("value")).toBe(
      "Crédito: Artesano Wixárika",
    );
    expect(creatorText?.hasAttribute("cv-canvas-text")).toBe(true);
    expect(withCreator.returnBtnEl?.querySelector("[cv-canvas-text]")?.getAttribute("value")).toBe(
      "✕",
    );
    expect(withCreator.billboardEl?.querySelector("a-text")).toBeNull();

    const withoutCreatorEl = createMockEntity({ x: 0, y: 1.4, z: -3.2 });
    const withoutCreator: InspectableComponentInstance = Object.create(def);
    withoutCreator.el = withoutCreatorEl as unknown as InspectableComponentInstance["el"];
    withoutCreator.data = {
      id: "exhibit-no-creator",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Pieza Anónima",
      creatorName: "   ",
      description: "Descripción sin autor",
      mediaType: ExhibitMediaType.IMAGE_2D,
    };
    withoutCreator.init();

    const emptyCreatorText = withoutCreator.billboardEl?.querySelector(
      ".cv-billboard-creator",
    );
    expect(emptyCreatorText?.getAttribute("visible")).toBe("false");
    expect(emptyCreatorText?.getAttribute("value")).toBe("");
  });

  it("counter-translates stepped .cv-model-pedestal from rest y = 0 so base stays grounded at world y = 0 during inspect", () => {
    const def = createInspectableComponentDefinition();
    const mockEl = createMockEntity({ x: 0, y: 1.2, z: -2.8 }, { x: 0, y: 0, z: 0 });
    const pedestal = document.createElement("a-entity");
    pedestal.setAttribute("class", "cv-model-pedestal");
    pedestal.setAttribute("position", "0 0 0");
    mockEl.appendChild(pedestal);

    const instance: InspectableComponentInstance = Object.create(def);
    instance.el = mockEl as unknown as InspectableComponentInstance["el"];
    instance.data = {
      id: "exhibit-stepped-pedestal",
      focalDistance: FOCAL_INSPECTION_DISTANCE,
      autoRotate: false,
      rotationSpeed: 0,
      title: "Escultura",
      description: "Desc",
      mediaType: ExhibitMediaType.MODEL_3D,
    };

    instance.init();
    instance.inspect();

    expect(pedestal.getAttribute("animation__pedestal")).toContain("from: 0 0 0");
    expect(pedestal.getAttribute("position")).not.toBe("0 0 0");

    instance.returnToGallery();
    expect(pedestal.getAttribute("position")).toBe("0 0 0");
    expect(pedestal.getAttribute("animation__pedestal_return")).toContain("to: 0 0 0");
  });
});
