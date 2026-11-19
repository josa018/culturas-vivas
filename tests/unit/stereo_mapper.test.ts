import { describe, it, expect } from "vitest";
import {
  StereoEye,
  StereoTextureMapper,
} from "../../src/experience/stereo-mapper";
import { ViewMode } from "../../src/navigation/types";

describe("StereoTextureMapper", () => {
  it("computes full 2D non-stereo UV bounds", () => {
    expect(StereoTextureMapper.getUVBounds(StereoEye.MONO, false)).toEqual({
      uMin: 0.0,
      uMax: 1.0,
      vMin: 0.0,
      vMax: 1.0,
      uOffset: 0.0,
      uRepeat: 1.0,
      vOffset: 0.0,
      vRepeat: 1.0,
    });
  });

  it("computes Half-SBS Left and Right eye UV sub-bounds", () => {
    expect(StereoTextureMapper.getUVBounds(StereoEye.LEFT, true)).toEqual({
      uMin: 0.0,
      uMax: 0.5,
      vMin: 0.0,
      vMax: 1.0,
      uOffset: 0.0,
      uRepeat: 0.5,
      vOffset: 0.0,
      vRepeat: 1.0,
    });

    expect(StereoTextureMapper.getUVBounds(StereoEye.RIGHT, true)).toEqual({
      uMin: 0.5,
      uMax: 1.0,
      vMin: 0.0,
      vMax: 1.0,
      uOffset: 0.5,
      uRepeat: 0.5,
      vOffset: 0.0,
      vRepeat: 1.0,
    });
  });

  it("maps Three.js camera eye layer indices (0=default, 1=left, 2=right)", () => {
    expect(StereoTextureMapper.getEyeLayer(StereoEye.MONO)).toBe(0);
    expect(StereoTextureMapper.getEyeLayer(StereoEye.LEFT)).toBe(1);
    expect(StereoTextureMapper.getEyeLayer(StereoEye.RIGHT)).toBe(2);
  });

  it("resolves view-mode adaptive effective eye", () => {
    expect(StereoTextureMapper.resolveEffectiveEye(ViewMode.VR, StereoEye.LEFT)).toBe(
      StereoEye.LEFT,
    );
    expect(StereoTextureMapper.resolveEffectiveEye(ViewMode.VR, StereoEye.RIGHT)).toBe(
      StereoEye.RIGHT,
    );
    expect(
      StereoTextureMapper.resolveEffectiveEye(ViewMode.TOUCH_2D, StereoEye.LEFT),
    ).toBe(StereoEye.MONO);
    expect(
      StereoTextureMapper.resolveEffectiveEye(ViewMode.TOUCH_2D, StereoEye.RIGHT),
    ).toBe(StereoEye.MONO);
    expect(StereoTextureMapper.resolveEffectiveEye(null, StereoEye.RIGHT)).toBe(
      StereoEye.MONO,
    );
  });

  it("remaps numerical UV quad coordinates", () => {
    const standardQuadUVs = [0, 0, 1, 0, 0, 1, 1, 1];
    const rightBounds = StereoTextureMapper.getUVBounds(StereoEye.RIGHT, true);
    expect(
      StereoTextureMapper.remapUVCoordinates(standardQuadUVs, rightBounds),
    ).toEqual([0.5, 0, 1.0, 0, 0.5, 1, 1.0, 1]);

    const leftBounds = StereoTextureMapper.getUVBounds(StereoEye.LEFT, true);
    expect(
      StereoTextureMapper.remapUVCoordinates(standardQuadUVs, leftBounds),
    ).toEqual([0.0, 0, 0.5, 0, 0.0, 1, 0.5, 1]);
  });
});
