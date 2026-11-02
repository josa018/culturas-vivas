import { assert } from "../helpers/assert";
import { MockElement, setupMockDocument } from "../helpers/mock_dom";
import {
  createInspectableComponentDefinition,
  InspectableComponentInstance,
} from "../../src/experience/components/inspectable";
import {
  ExhibitMediaType,
  InspectionState,
} from "../../src/experience/constants";

function runInspectableComponentUnitTests(): void {
  console.log("--- [UNIT TEST] A-Frame Inspectable Component ---");

  setupMockDocument();

  // Test 1: Initialization & Billboard Attachment
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
      focalDistance: 1.2,
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

    console.log(
      "✓ Test 1 Passed: Component initialization and hidden billboard hierarchy verified",
    );
  }

  // Test 2: Inspection Focal Animation & Return
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
      focalDistance: 1.2,
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
    assert.equal(mockEl.getAttribute("position"), "0 1.5 -1.2");

    // Tick test with autoRotate enabled
    instance.tick(0, 16);
    assert.equal(mockEl.object3D.rotation.y, 0.02);

    // Trigger return
    instance.returnToGallery();
    assert.equal(instance.state, InspectionState.IDLE);
    assert.equal(instance.billboardEl?.getAttribute("visible"), "false");
    assert.equal(mockEl.getAttribute("position"), "0 1.4 -2.8");

    console.log(
      "✓ Test 2 Passed: Inspect transition, tick auto-rotation, and return restoration verified",
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
      focalDistance: 1.2,
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

  // Test 4: Return Button Click Event
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
      focalDistance: 1.2,
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

    (returnBtn as unknown as MockElement)?.dispatchEvent("click");
    assert.equal(instance.state, InspectionState.IDLE);

    console.log(
      "✓ Test 4 Passed: Return button dispatch event returns to gallery",
    );
  }

  console.log("All Inspectable Component unit tests passed successfully.\n");
}

runInspectableComponentUnitTests();
