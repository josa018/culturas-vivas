import { describe, it, expect } from "vitest";
import {
  StereoEye,
  StereoTextureMapper,
} from "../../src/experience/stereo-mapper";
import { ViewMode } from "../../src/navigation/types";

describe("StereoTextureMapper", () => {
  it("computes full 2D non-stereo UV bounds", () => {
    const bounds = StereoTextureMapper.getUVBounds(StereoEye.MONO, false);
    expect(bounds.uMin).toBe(0.0);
    expect(bounds.uMax).toBe(1.0);
    expect(bounds.uOffset).toBe(0.0);
    expect(bounds.uRepeat).toBe(1.0);
    expect(bounds.vMin).toBe(0.0);
    expect(bounds.vMax).toBe(1.0);
  });

  it("computes Half-SBS Left and Right eye UV sub-bounds", () => {
    const leftBounds = StereoTextureMapper.getUVBounds(StereoEye.LEFT, true);
    expect(leftBounds.uMin).toBe(0.0);
    expect(leftBounds.uMax).toBe(0.5);
    expect(leftBounds.uOffset).toBe(0.0);
    expect(leftBounds.uRepeat).toBe(0.5);

    const rightBounds = StereoTextureMapper.getUVBounds(StereoEye.RIGHT, true);
    expect(rightBounds.uMin).toBe(0.5);
    expect(rightBounds.uMax).toBe(1.0);
    expect(rightBounds.uOffset).toBe(0.5);
    expect(rightBounds.uRepeat).toBe(0.5);
  });

  it("maps Three.js camera eye layer indices", () => {
    expect(StereoTextureMapper.getEyeLayer(StereoEye.LEFT)).toBe(
      StereoTextureMapper.THREE_LAYER_LEFT,
    );
    expect(StereoTextureMapper.getEyeLayer(StereoEye.RIGHT)).toBe(
      StereoTextureMapper.THREE_LAYER_RIGHT,
    );
    expect(StereoTextureMapper.getEyeLayer(StereoEye.MONO)).toBe(
      StereoTextureMapper.THREE_LAYER_DEFAULT,
    );
  });

  it("resolves view-mode adaptive effective eye", () => {
    // In VR mode: respects left and right eyes
    expect(
      StereoTextureMapper.resolveEffectiveEye(ViewMode.VR, StereoEye.LEFT),
    ).toBe(StereoEye.LEFT);
    expect(
      StereoTextureMapper.resolveEffectiveEye(ViewMode.VR, StereoEye.RIGHT),
    ).toBe(StereoEye.RIGHT);

    // In 2D Touch mode: forces MONO (left-crop) to avoid split-screen distortion
    expect(
      StereoTextureMapper.resolveEffectiveEye(
        ViewMode.TOUCH_2D,
        StereoEye.LEFT,
      ),
    ).toBe(StereoEye.MONO);
    expect(
      StereoTextureMapper.resolveEffectiveEye(
        ViewMode.TOUCH_2D,
        StereoEye.RIGHT,
      ),
    ).toBe(StereoEye.MONO);
  });

  it("remaps numerical UV quad coordinates", () => {
    const standardQuadUVs = [0, 0, 1, 0, 0, 1, 1, 1];
    const rightBounds = StereoTextureMapper.getUVBounds(StereoEye.RIGHT, true);
    const remappedRight = StereoTextureMapper.remapUVCoordinates(
      standardQuadUVs,
      rightBounds,
    );
    expect(remappedRight).toEqual([0.5, 0, 1.0, 0, 0.5, 1, 1.0, 1]);

    const leftBounds = StereoTextureMapper.getUVBounds(StereoEye.LEFT, true);
    const remappedLeft = StereoTextureMapper.remapUVCoordinates(
      standardQuadUVs,
      leftBounds,
    );
    expect(remappedLeft).toEqual([0.0, 0, 0.5, 0, 0.0, 1, 0.5, 1]);
  });
});
