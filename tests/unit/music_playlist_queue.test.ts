import { describe, expect, it } from "vitest";
import { MusicPlaylistQueue } from "../../src/experience/audio/music-playlist-queue";

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("MusicPlaylistQueue", () => {
  it("returns null for empty playlists and always loops index 0 for single-track playlists", () => {
    const emptyQueue = new MusicPlaylistQueue(0, "SEQUENTIAL");
    expect(emptyQueue.current()).toBeNull();
    expect(emptyQueue.next()).toBeNull();

    const singleSeq = new MusicPlaylistQueue(1, "SEQUENTIAL");
    expect(singleSeq.current()).toBe(0);
    expect(singleSeq.next()).toBe(0);
    expect(singleSeq.next()).toBe(0);

    const singleShuffle = new MusicPlaylistQueue(1, "SHUFFLE", () => 0.99);
    expect(singleShuffle.current()).toBe(0);
    expect(singleShuffle.next()).toBe(0);
    expect(singleShuffle.next()).toBe(0);
  });

  it("advances sequentially with wrap-around across multi-track playlists", () => {
    const queue = new MusicPlaylistQueue(3, "SEQUENTIAL");
    const sequence = [queue.current(), queue.next(), queue.next(), queue.next(), queue.next()];
    expect(sequence).toEqual([0, 1, 2, 0, 1]);
  });

  it("produces deterministic shuffle order from seeded RNG and never repeats consecutive tracks", () => {
    const q1 = new MusicPlaylistQueue(4, "SHUFFLE", createSeededRng(42));
    const q2 = new MusicPlaylistQueue(4, "SHUFFLE", createSeededRng(42));

    const seq1: Array<number | null> = [q1.current()];
    const seq2: Array<number | null> = [q2.current()];
    for (let i = 0; i < 40; i++) {
      seq1.push(q1.next());
      seq2.push(q2.next());
    }

    expect(seq1).toEqual(seq2);
    // Every cycle of 4 contains all indices [0,1,2,3] once
    for (let offset = 0; offset + 4 <= seq1.length; offset += 4) {
      const cycle = [...(seq1.slice(offset, offset + 4) as number[])].sort(
        (a, b) => a - b,
      );
      expect(cycle).toEqual([0, 1, 2, 3]);
    }
    // Zero consecutive repeats even across cycle boundaries
    for (let i = 1; i < seq1.length; i++) {
      expect(seq1[i]).not.toBe(seq1[i - 1]);
    }

    // Worst-case constant RNG boundary never repeats back-to-back across refills
    const constantRngQueue = new MusicPlaylistQueue(3, "SHUFFLE", () => 0);
    const constantSeq = [
      constantRngQueue.current(),
      constantRngQueue.next(),
      constantRngQueue.next(),
      constantRngQueue.next(),
      constantRngQueue.next(),
      constantRngQueue.next(),
    ];
    for (let i = 1; i < constantSeq.length; i++) {
      expect(constantSeq[i]).not.toBe(constantSeq[i - 1]);
    }
  });
});
