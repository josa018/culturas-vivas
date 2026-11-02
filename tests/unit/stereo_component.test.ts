import { assert } from "../helpers/assert";
import { MockElement, setupMockDocument } from "../helpers/mock_dom";
import {
  createStereoMediaComponentDefinition,
  StereoMediaComponentInstance,
} from "../../src/experience/components/stereo-media";
import { StereoTextureMapper } from "../../src/experience/stereo-mapper";

interface MockObject3DWithLayers {
  layers: {
    currentLayer: number;
    set: (ch: number) => void;
  };
  visible: boolean;
}

function createMockStereoEntity(): MockElement & {
  object3D: MockObject3DWithLayers;
} {
  const el = new MockElement("a-plane") as unknown as MockElement & {
    object3D: MockObject3DWithLayers;
  };
  el.object3D = {
    layers: {
      currentLayer: 0,
      set: function (ch: number) {
        this.currentLayer = ch;
      },
    },
    visible: true,
  };
  return el;
}

function runStereoComponentUnitTests(): void {
  console.log("--- [UNIT TEST] A-Frame Stereo Media Component ---");

  setupMockDocument();

  // Test 1: VR Mode Layer Separation
  {
    const def = createStereoMediaComponentDefinition();

    // Left Eye Entity
    const leftEl = createMockStereoEntity();
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = leftEl as unknown as StereoMediaComponentInstance["el"];
    leftInstance.data = {
      eye: "LEFT",
      isHalfSBS: true,
      viewMode: "vr",
    };
    leftInstance.init();

    assert.equal(
      leftEl.object3D.layers.currentLayer,
      StereoTextureMapper.THREE_LAYER_LEFT,
    );
    assert.equal(leftEl.object3D.visible, true);
    assert.equal(leftEl.getAttribute("visible"), "true");

    // Right Eye Entity
    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaComponentInstance["el"];
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "vr",
    };
    rightInstance.init();

    assert.equal(
      rightEl.object3D.layers.currentLayer,
      StereoTextureMapper.THREE_LAYER_RIGHT,
    );
    assert.equal(rightEl.object3D.visible, true);
    assert.equal(rightEl.getAttribute("visible"), "true");

    console.log(
      "✓ Test 1 Passed: VR mode assigns eye layers 1 and 2 to SBS pair",
    );
  }

  // Test 2: 2D Mode Monoscopic Crop
  {
    const def = createStereoMediaComponentDefinition();

    // Left Eye Entity in 2D Mode (renders on default layer 0)
    const leftEl = createMockStereoEntity();
    const leftInstance: StereoMediaComponentInstance = Object.create(def);
    leftInstance.el = leftEl as unknown as StereoMediaComponentInstance["el"];
    leftInstance.data = {
      eye: "LEFT",
      isHalfSBS: true,
      viewMode: "2d",
    };
    leftInstance.init();

    assert.equal(
      leftEl.object3D.layers.currentLayer,
      StereoTextureMapper.THREE_LAYER_DEFAULT,
    );
    assert.equal(leftEl.object3D.visible, true);

    // Right Eye Entity in 2D Mode (hidden to prevent split-screen duplication)
    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaComponentInstance["el"];
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "2d",
    };
    rightInstance.init();

    assert.equal(rightEl.object3D.visible, false);
    assert.equal(rightEl.getAttribute("visible"), "false");

    console.log(
      "✓ Test 2 Passed: 2D mode hides duplicate right eye and defaults left eye",
    );
  }

  // Test 3: Dynamic ViewMode Switching
  {
    const def = createStereoMediaComponentDefinition();
    const rightEl = createMockStereoEntity();
    const rightInstance: StereoMediaComponentInstance = Object.create(def);
    rightInstance.el = rightEl as unknown as StereoMediaComponentInstance["el"];
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "vr",
    };
    rightInstance.init();
    assert.equal(
      rightEl.object3D.layers.currentLayer,
      StereoTextureMapper.THREE_LAYER_RIGHT,
    );
    assert.equal(rightEl.object3D.visible, true);

    // Switch viewMode to "2d"
    rightInstance.data = {
      eye: "RIGHT",
      isHalfSBS: true,
      viewMode: "2d",
    };
    rightInstance.update({ viewMode: "vr" });
    assert.equal(rightEl.object3D.visible, false);
    assert.equal(rightEl.getAttribute("visible"), "false");

    console.log(
      "✓ Test 3 Passed: Dynamic viewMode transition properly updates layers",
    );
  }

  console.log("All Stereo Media Component unit tests passed successfully.\n");
}

runStereoComponentUnitTests();
