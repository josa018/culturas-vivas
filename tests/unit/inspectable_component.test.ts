import { assert } from "../helpers/assert";
import { MockElement, setupMockDocument } from "../helpers/mock_dom";
import {
  createInspectableComponentDefinition,
  InspectableComponentInstance,
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

function runInspectableComponentUnitTests(): void {
  console.log("--- [UNIT TEST] A-Frame Inspectable Component ---");

  setupMockDocument();
  setSharedInspectionController(new ExhibitInspectionController());

  // Test 1: Initialization & Lateral Billboard Attachment
  {
    const def = createInspectableComponentDefinition();
    const mockEl = new MockElement("a-entity") as unknown as MockElement & {
      object3D: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
      };
    };
    mockEl.object3D = {
      position: { x: 2, y: 1.6, z: -2 },
      rotation: { x: 0, y: -45, z: 0 },
    };
    mockEl.setAttribute("position", "2 1.6 -2");
    mockEl.setAttribute("rotation", "0 -45 0");

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

    assert.equal(instance.state, InspectionState.IDLE);
    assert.equal(instance.galleryPosition.x, 2);
    assert.equal(instance.galleryPosition.y, 1.6);
    assert.equal(instance.galleryPosition.z, -2);

    assert.ok(instance.billboardEl !== null);
    assert.equal(instance.billboardEl?.getAttribute("visible"), "false");
    assert.equal(instance.billboardEl?.getAttribute("position"), "0 -0.925 0");
    assert.equal(
      instance.billboardEl?.getAttribute("scale"),
      "0.001 0.001 0.001",
    );

    const titleText = instance.billboardEl?.querySelector("a-text");
    assert.ok(titleText !== null);
    assert.equal(
      titleText?.getAttribute("width"),
      String(EXHIBIT_DIMENSIONS.BILLBOARD_TITLE_WIDTH),
    );
    assert.equal(
      titleText?.getAttribute("wrap-count"),
      String(EXHIBIT_DIMENSIONS.BILLBOARD_TITLE_WRAP_COUNT),
    );

    console.log(
      "✓ Test 1 Passed: Component initialization and sub-exhibit billboard hierarchy verified",
    );
  }

  // Test 2: Radial Inspection Focal Animation & Return
  {
    const def = createInspectableComponentDefinition();
    const mockEl = new MockElement("a-entity") as unknown as MockElement & {
      object3D: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
      };
    };
    mockEl.object3D = {
      position: { x: 0, y: 1.4, z: -2.8 },
      rotation: { x: 0, y: 0, z: 0 },
    };
    mockEl.setAttribute("position", "0 1.4 -2.8");
    mockEl.setAttribute("rotation", "0 0 0");

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

    // Trigger inspect
    instance.inspect();
    assert.equal(instance.state, InspectionState.INSPECTING);
    assert.equal(instance.billboardEl?.getAttribute("visible"), "true");
    assert.equal(instance.billboardEl?.getAttribute("scale"), "1 1 1");
    const panelAnimIn = instance.billboardEl?.getAttribute(
      "animation__panel_in",
    );
    assert.ok(panelAnimIn !== null);
    assert.ok(panelAnimIn?.includes("to: 1 1 1"));

    // Dynamic radial target computation
    assert.equal(mockEl.getAttribute("position"), "0 1.507 -1.297");
    const inspectAnim = mockEl.getAttribute("animation__inspect");
    assert.ok(inspectAnim !== null);
    assert.ok(
      inspectAnim?.includes(`dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}`),
    );
    assert.ok(
      inspectAnim?.includes(`easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`),
    );
    assert.ok(inspectAnim?.includes("from: 0 1.4 -2.8"));
    assert.ok(inspectAnim?.includes("to: 0 1.507 -1.297"));

    // Tick test with autoRotate enabled
    instance.tick(0, 16);
    assert.equal(mockEl.object3D.rotation.y, 0.02);

    // Trigger return
    instance.returnToGallery();
    assert.equal(instance.state, InspectionState.IDLE);
    assert.equal(instance.billboardEl?.getAttribute("visible"), "false");
    assert.equal(
      instance.billboardEl?.getAttribute("scale"),
      "0.001 0.001 0.001",
    );
    assert.equal(mockEl.getAttribute("position"), "0 1.4 -2.8");

    const returnAnim = mockEl.getAttribute("animation__return");
    assert.ok(returnAnim !== null);
    assert.ok(returnAnim?.includes("to: 0 1.4 -2.8"));

    console.log(
      "✓ Test 2 Passed: Inspect transition, lateral scale animation, and return restoration verified",
    );
  }

  // Test 3: Video Exhibit Play / Pause Handling
  {
    const def = createInspectableComponentDefinition();
    const mockEl = new MockElement("a-entity") as unknown as MockElement & {
      object3D: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
      };
    };
    mockEl.object3D = {
      position: { x: -2, y: 1.6, z: 2 },
      rotation: { x: 0, y: 135, z: 0 },
    };
    mockEl.setAttribute("position", "-2 1.6 2");
    mockEl.setAttribute("rotation", "0 135 0");

    const videoChild = new MockElement("video");
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
    assert.equal(videoChild.isPlaying, false);

    // When inspected -> video.play() is called
    instance.inspect();
    assert.equal(videoChild.isPlaying, true);

    // When returned -> video.pause() is called
    instance.returnToGallery();
    assert.equal(videoChild.isPlaying, false);

    console.log(
      "✓ Test 3 Passed: Video play on inspection and pause on return verified",
    );
  }

  // Test 4: Top-Right Corner Close Button Click Event
  {
    const def = createInspectableComponentDefinition();
    const mockEl = new MockElement("a-entity") as unknown as MockElement & {
      object3D: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
      };
    };
    mockEl.object3D = {
      position: { x: 0, y: 1.6, z: -2 },
      rotation: { x: 0, y: 0, z: 0 },
    };
    mockEl.setAttribute("position", "0 1.6 -2");
    mockEl.setAttribute("rotation", "0 0 0");

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
    instance.inspect();
    assert.equal(instance.state, InspectionState.INSPECTING);

    const returnBtn = instance.billboardEl?.querySelector(
      '[data-action="return-exhibit"]',
    );
    assert.ok(returnBtn !== null);
    assert.equal(returnBtn?.getAttribute("position"), "0.68 0.18 0.03");

    (returnBtn as unknown as MockElement)?.dispatchEvent("click");
    assert.equal(instance.state, InspectionState.IDLE);

    console.log(
      "✓ Test 4 Passed: Top-right corner close button dispatch event returns to gallery",
    );
  }

  // Test 5: Mutual Exclusivity - Auto-return of preceding active exhibit
  {
    // Configure dedicated controller with both exhibits
    const mockExhibits = [
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
    ];
    const dedicatedController = new ExhibitInspectionController(mockExhibits);
    setSharedInspectionController(dedicatedController);

    const def = createInspectableComponentDefinition();

    // Setup Exhibit A
    const elA = new MockElement("a-entity") as unknown as MockElement & {
      object3D: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
      };
    };
    elA.object3D = {
      position: { x: 0, y: 1.4, z: -2.8 },
      rotation: { x: 0, y: 0, z: 0 },
    };
    elA.setAttribute("position", "0 1.4 -2.8");
    elA.setAttribute("rotation", "0 0 0");

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

    // Setup Exhibit B
    const elB = new MockElement("a-entity") as unknown as MockElement & {
      object3D: {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
      };
    };
    elB.object3D = {
      position: { x: 2, y: 1.6, z: -2 },
      rotation: { x: 0, y: -45, z: 0 },
    };
    elB.setAttribute("position", "2 1.6 -2");
    elB.setAttribute("rotation", "0 -45 0");

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

    // 1. Inspect Exhibit A
    instA.inspect();
    assert.equal(instA.state, InspectionState.INSPECTING);
    assert.equal(elA.getAttribute("position"), "0 1.507 -1.297");
    assert.equal(instB.state, InspectionState.IDLE);

    // 2. Inspect Exhibit B while Exhibit A is inspecting
    instB.inspect();
    assert.equal(instB.state, InspectionState.INSPECTING);
    assert.equal(elB.getAttribute("position"), "0.919 1.6 -0.919");

    // Exhibit A must have automatically transitioned back to IDLE at gallery coordinates
    assert.equal(instA.state, InspectionState.IDLE);
    assert.equal(elA.getAttribute("position"), "0 1.4 -2.8");
    assert.equal(instA.billboardEl?.getAttribute("visible"), "false");

    console.log(
      "✓ Test 5 Passed: Mutual exclusivity verified - focusing B returns inspecting A to gallery",
    );
  }

  console.log("All Inspectable Component unit tests passed successfully.\n");
}

runInspectableComponentUnitTests();
