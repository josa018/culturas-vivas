/**
 * Deterministic 32-bit LCG pseudo-random generator returning values in [0, 1].
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function hashGrid2D(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0xffffffff;
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Creates a deterministic smooth 2D value-noise sampler returning values in [0, 1].
 */
export function valueNoise2D(seed: number): (x: number, z: number) => number {
  return (x: number, z: number): number => {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = smoothstep01(x - x0);
    const tz = smoothstep01(z - z0);

    const n00 = hashGrid2D(x0, z0, seed);
    const n10 = hashGrid2D(x0 + 1, z0, seed);
    const n01 = hashGrid2D(x0, z0 + 1, seed);
    const n11 = hashGrid2D(x0 + 1, z0 + 1, seed);

    const nx0 = n00 + (n10 - n00) * tx;
    const nx1 = n01 + (n11 - n01) * tx;
    return nx0 + (nx1 - nx0) * tz;
  };
}
