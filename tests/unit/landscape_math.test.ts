import { describe, expect, it } from "vitest";
import {
  hexToRgb01,
  mixHexColors,
  scaleHexBrightness,
} from "../../src/experience/landscape/color-math";
import {
  createSeededRandom,
  valueNoise2D,
} from "../../src/experience/landscape/seeded-noise";

describe("Landscape pure color math and seeded noise seams", () => {
  it("mixes hex colors with clamped interpolation factors", () => {
    expect(mixHexColors("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHexColors("#000000", "#ffffff", -0.4)).toBe("#000000");
    expect(mixHexColors("#000000", "#ffffff", 1.8)).toBe("#ffffff");
    expect(mixHexColors("#d97724", "#d97724", 0.37)).toBe("#d97724");
  });

  it("scales hex brightness and converts hex strings to normalized RGB tuples", () => {
    expect(scaleHexBrightness("#804020", 0.5)).toBe("#402010");
    expect(scaleHexBrightness("#804020", 3)).toBe("#ffc060");
    expect(scaleHexBrightness("#804020", 10)).toBe("#ffffff");
    expect(scaleHexBrightness("#804020", -1)).toBe("#000000");

    const [r, g, b] = hexToRgb01("#ff8000");
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(128 / 255, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it("produces deterministic seeded pseudo-random streams and smooth 2D value noise in [0, 1]", () => {
    const randA = createSeededRandom(42);
    const randB = createSeededRandom(42);
    const randC = createSeededRandom(99);

    const seqA = [randA(), randA(), randA(), randA()];
    const seqB = [randB(), randB(), randB(), randB()];
    const seqC = [randC(), randC(), randC(), randC()];

    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }

    const noise1 = valueNoise2D(17);
    const noise2 = valueNoise2D(17);
    expect(noise1(3.4, -2.7)).toBe(noise2(3.4, -2.7));

    for (let x = -10; x <= 10; x += 0.75) {
      for (let z = -10; z <= 10; z += 0.75) {
        const sample = noise1(x, z);
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }
    }
    // Smooth interpolation: close coordinates must vary smoothly
    expect(Math.abs(noise1(1.1, 2.2) - noise1(1.15, 2.2))).toBeLessThan(0.25);
  });
});
