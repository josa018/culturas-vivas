export type PlaylistPlaybackMode = "SEQUENTIAL" | "SHUFFLE";

function clampUnitRandom(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value >= 1) {
    return 0.9999999999999999;
  }
  return value;
}

/**
 * Pure playlist index scheduler supporting deterministic sequential wrap-around
 * and non-repeating Fisher-Yates shuffle cycles.
 */
export class MusicPlaylistQueue {
  private readonly trackCount: number;
  private readonly mode: PlaylistPlaybackMode;
  private readonly random: () => number;
  private currentIndex: number | null;
  private shuffleBag: number[] = [];

  constructor(
    trackCount: number,
    mode: PlaylistPlaybackMode,
    random: () => number = Math.random,
  ) {
    this.trackCount = Math.max(0, Math.floor(trackCount));
    this.mode = mode;
    this.random = random;

    if (this.trackCount === 0) {
      this.currentIndex = null;
      return;
    }

    if (this.trackCount === 1 || this.mode === "SEQUENTIAL") {
      this.currentIndex = 0;
      return;
    }

    this.refillShuffleBag(null);
    this.currentIndex = this.shuffleBag.shift() ?? 0;
  }

  public current(): number | null {
    return this.currentIndex;
  }

  public next(): number | null {
    if (this.trackCount === 0 || this.currentIndex === null) {
      return null;
    }
    if (this.trackCount === 1) {
      this.currentIndex = 0;
      return 0;
    }

    if (this.mode === "SEQUENTIAL") {
      this.currentIndex = (this.currentIndex + 1) % this.trackCount;
      return this.currentIndex;
    }

    if (this.shuffleBag.length === 0) {
      this.refillShuffleBag(this.currentIndex);
    }
    this.currentIndex = this.shuffleBag.shift() ?? 0;
    return this.currentIndex;
  }

  private refillShuffleBag(avoidFirstIndex: number | null): void {
    const indices = Array.from({ length: this.trackCount }, (_, idx) => idx);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(clampUnitRandom(this.random()) * (i + 1));
      const tmp = indices[i]!;
      indices[i] = indices[j]!;
      indices[j] = tmp;
    }

    if (
      avoidFirstIndex !== null &&
      indices.length > 1 &&
      indices[0] === avoidFirstIndex
    ) {
      const swapTarget = indices[1]!;
      indices[1] = indices[0]!;
      indices[0] = swapTarget;
    }

    this.shuffleBag = indices;
  }
}
