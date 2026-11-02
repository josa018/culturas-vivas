import { assert } from "../helpers/assert";
import {
  StereoEye,
  StereoTextureMapper,
} from "../../src/experience/stereo-mapper";
import { ViewMode } from "../../src/navigation/types";

function runStereoMapperUnitTests(): void {
  console.log("--- [UNIT TEST] Stereo Texture Mapper ---");

  // Test 1: Full 2D Media Bounds
  {
    const bounds = StereoTextureMapper.getUVBounds(StereoEye.MONO, false);
    assert.equal(bounds.uMin, 0.0);
    assert.equal(bounds.uMax, 1.0);
    assert.equal(bounds.uOffset, 0.0);
    assert.equal(bounds.uRepeat, 1.0);
    assert.equal(bounds.vMin, 0.0);
    assert.equal(bounds.vMax, 1.0);
    console.log("✓ Test 1 Passed: 2D non-stereo full UV bounds verified");
  }

  // Test 2: Half-SBS Left Eye and Right Eye Bounds
  {
    const leftBounds = StereoTextureMapper.getUVBounds(StereoEye.LEFT, true);
    assert.equal(leftBounds.uMin, 0.0);
    assert.equal(leftBounds.uMax, 0.5);
    assert.equal(leftBounds.uOffset, 0.0);
    assert.equal(leftBounds.uRepeat, 0.5);

    const rightBounds = StereoTextureMapper.getUVBounds(StereoEye.RIGHT, true);
    assert.equal(rightBounds.uMin, 0.5);
    assert.equal(rightBounds.uMax, 1.0);
    assert.equal(rightBounds.uOffset, 0.5);
    assert.equal(rightBounds.uRepeat, 0.5);

    console.log(
      "✓ Test 2 Passed: Half-SBS Left and Right UV sub-bounds verified",
    );
  }

  // Test 3: Layer Indices for WebXR Camera Layers
  {
    assert.equal(
      StereoTextureMapper.getEyeLayer(StereoEye.LEFT),
      StereoTextureMapper.THREE_LAYER_LEFT,
    );
    assert.equal(
      StereoTextureMapper.getEyeLayer(StereoEye.RIGHT),
      StereoTextureMapper.THREE_LAYER_RIGHT,
    );
    assert.equal(
      StereoTextureMapper.getEyeLayer(StereoEye.MONO),
      StereoTextureMapper.THREE_LAYER_DEFAULT,
    );
    console.log("✓ Test 3 Passed: Three.js camera eye layer mappings verified");
  }

  // Test 4: ViewMode Effective Eye Resolution
  {
    // In VR mode: respects left and right eyes
    assert.equal(
      StereoTextureMapper.resolveEffectiveEye(ViewMode.VR, StereoEye.LEFT),
      StereoEye.LEFT,
    );
    assert.equal(
      StereoTextureMapper.resolveEffectiveEye(ViewMode.VR, StereoEye.RIGHT),
      StereoEye.RIGHT,
    );

    // In 2D Touch mode: forces MONO (left-crop) to avoid split-screen distortion
    assert.equal(
      StereoTextureMapper.resolveEffectiveEye(
        ViewMode.TOUCH_2D,
        StereoEye.LEFT,
      ),
      StereoEye.MONO,
    );
    assert.equal(
      StereoTextureMapper.resolveEffectiveEye(
        ViewMode.TOUCH_2D,
        StereoEye.RIGHT,
      ),
      StereoEye.MONO,
    );

    console.log("✓ Test 4 Passed: View-mode adaptive eye resolution verified");
  }

  // Test 5: UV Coordinate Re-mapping
  {
    const standardQuadUVs = [0, 0, 1, 0, 0, 1, 1, 1];
    const rightBounds = StereoTextureMapper.getUVBounds(StereoEye.RIGHT, true);
    const remappedRight = StereoTextureMapper.remapUVCoordinates(
      standardQuadUVs,
      rightBounds,
    );

    // Expected:
    // [0, 0] -> [0.5 + 0 * 0.5, 0] = [0.5, 0]
    // [1, 0] -> [0.5 + 1 * 0.5, 0] = [1.0, 0]
    // [0, 1] -> [0.5 + 0 * 0.5, 1] = [0.5, 1]
    // [1, 1] -> [0.5 + 1 * 0.5, 1] = [1.0, 1]
    assert.deepEqual(remappedRight, [0.5, 0, 1.0, 0, 0.5, 1, 1.0, 1]);

    const leftBounds = StereoTextureMapper.getUVBounds(StereoEye.LEFT, true);
    const remappedLeft = StereoTextureMapper.remapUVCoordinates(
      standardQuadUVs,
      leftBounds,
    );
    assert.deepEqual(remappedLeft, [0.0, 0, 0.5, 0, 0.0, 1, 0.5, 1]);

    console.log("✓ Test 5 Passed: Numerical UV quad transformation verified");
  }

  console.log("All StereoTextureMapper unit tests passed successfully.\n");
}

runStereoMapperUnitTests();
