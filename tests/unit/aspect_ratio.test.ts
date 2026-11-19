import { describe, expect, it } from "vitest";
import { computeContainDimensions } from "../../src/experience/aspect-ratio";
import { STAND_DIMENSIONS } from "../../src/experience/constants";

describe("computeContainDimensions", () => {
  it("computes exact contain bounds for 16:9, 9:16, 1:1, and 0x0 within stand limits", () => {
    expect(
      computeContainDimensions(
        1920,
        1080,
        STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
        STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
      ),
    ).toEqual({ width: 1.5, height: 0.844 });

    expect(
      computeContainDimensions(
        1080,
        1920,
        STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
        STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
      ),
    ).toEqual({ width: 0.534, height: 0.95 });

    expect(
      computeContainDimensions(
        1000,
        1000,
        STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
        STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
      ),
    ).toEqual({ width: 0.95, height: 0.95 });

    expect(
      computeContainDimensions(
        0,
        0,
        STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
        STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
      ),
    ).toEqual({ width: 1.5, height: 0.95 });
  });

  it("falls back safely on negative or non-finite natural dimensions", () => {
    expect(computeContainDimensions(-100, 500)).toEqual({
      width: STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
      height: STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
    });
    expect(computeContainDimensions(Number.NaN, 500)).toEqual({
      width: STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
      height: STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
    });
  });
});
