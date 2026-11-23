import { describe, expect, it, vi } from "vitest";
import { ADMIN_MEDIA_LIMITS } from "../../src/admin/constants";
import {
  AdminMediaProcessor,
  computeScaledDimensions,
} from "../../src/admin/media-processor";

describe("AdminMediaProcessor", () => {
  it("computes proportional scaled bounds clamping longest edge to 2048 px", () => {
    expect(computeScaledDimensions(4000, 3000, 2048)).toEqual({
      width: 2048,
      height: 1536,
    });
    expect(computeScaledDimensions(1080, 1920, 2048)).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(computeScaledDimensions(1000, 4000, 2048)).toEqual({
      width: 512,
      height: 2048,
    });
  });

  it("downscales 4000x3000 images proportionally to 2048x1536 image/webp", async () => {
    const drawImageSpy = vi.fn();
    const toBlobArgs: Array<{ mime: string; quality: number }> = [];
    const outputBlob = new Blob(["webp-bytes"], { type: "image/webp" });

    const processor = new AdminMediaProcessor({
      decodeImage: async () => ({
        source: {} as CanvasImageSource,
        width: 4000,
        height: 3000,
        cleanup: vi.fn(),
      }),
      createCanvas: (width, height) => ({
        width,
        height,
        drawImage: drawImageSpy,
        toBlob: async (mime, quality) => {
          toBlobArgs.push({ mime, quality });
          return outputBlob;
        },
      }),
    });

    const inputFile = new File(["raw-jpeg"], "foto.jpg", {
      type: "image/jpeg",
    });
    const result = await processor.optimizeImage(inputFile);

    expect(result).toEqual({
      blob: outputBlob,
      width: 2048,
      height: 1536,
      mimeType: "image/webp",
    });
    expect(drawImageSpy).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      2048,
      1536,
    );
    expect(toBlobArgs).toEqual([
      {
        mime: "image/webp",
        quality: ADMIN_MEDIA_LIMITS.IMAGE_WEBP_QUALITY,
      },
    ]);
  });

  it("extracts a scaled WebP poster frame from valid MP4 files and rejects oversized videos", async () => {
    const drawImageSpy = vi.fn();
    const posterBlob = new Blob(["poster-webp"], { type: "image/webp" });

    const processor = new AdminMediaProcessor({
      extractVideoFrame: async () => ({
        source: {} as CanvasImageSource,
        videoWidth: 1920,
        videoHeight: 1080,
        cleanup: vi.fn(),
      }),
      createCanvas: (width, height) => ({
        width,
        height,
        drawImage: drawImageSpy,
        toBlob: async () => posterBlob,
      }),
    });

    const mp4File = new File(["mp4-data"], "danza.mp4", { type: "video/mp4" });
    const result = await processor.extractVideoPoster(mp4File);

    expect(result.posterBlob).toBe(posterBlob);
    expect(result.videoWidth).toBe(1920);
    expect(result.videoHeight).toBe(1080);
    expect(result.posterMimeType).toBe("image/webp");
    expect(drawImageSpy).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      1024,
      576,
    );

    const oversizedMp4 = {
      type: "video/mp4",
      size: ADMIN_MEDIA_LIMITS.MAX_VIDEO_BYTES + 1,
    } as File;
    await expect(processor.extractVideoPoster(oversizedMp4)).rejects.toThrow(
      /supera el peso máximo permitido \(100 MB\)/i,
    );
  });

  it("prepareMp4ForUpload relocates trailing moov MP4 File to faststart and rejects disguised FLV containers", async () => {
    const ftyp = new Uint8Array([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const mdat = new Uint8Array([0, 0, 0, 12, 0x6d, 0x64, 0x61, 0x74, 1, 2, 3, 4]);
    const moov = new Uint8Array([
      0, 0, 0, 16, 0x6d, 0x6f, 0x6f, 0x76,
      0, 0, 0, 8, 0x6d, 0x76, 0x68, 0x64,
    ]);
    const combined = new Uint8Array(ftyp.length + mdat.length + moov.length);
    combined.set(ftyp, 0);
    combined.set(mdat, ftyp.length);
    combined.set(moov, ftyp.length + mdat.length);

    const processor = new AdminMediaProcessor();
    const file = new File([combined], "trailer.mp4", { type: "video/mp4" });
    const prepared = await processor.prepareMp4ForUpload(file);

    expect(prepared.relocated).toBe(true);
    expect(prepared.file.name).toBe("trailer.mp4");
    expect(prepared.file.size).toBe(file.size);
    const outBuf = new Uint8Array(await prepared.file.arrayBuffer());
    // moov must now immediately follow 12-byte ftyp
    expect(String.fromCharCode(...outBuf.slice(16, 20))).toBe("moov");

    const flvFile = new File(["FLV\x01test-bytes"], "disguised.mp4", {
      type: "video/mp4",
    });
    await expect(processor.prepareMp4ForUpload(flvFile)).rejects.toThrow(
      /no es un video MP4 válido/i,
    );
  });

  it("crops only the left eye (0..videoWidth/2) when extracting Half-SBS video posters", async () => {
    const drawImageSpy = vi.fn();
    const posterBlob = new Blob(["sbs-poster-webp"], { type: "image/webp" });

    const processor = new AdminMediaProcessor({
      extractVideoFrame: async () => ({
        source: {} as CanvasImageSource,
        videoWidth: 1920,
        videoHeight: 1080,
        cleanup: vi.fn(),
      }),
      createCanvas: (width, height) => ({
        width,
        height,
        drawImage: drawImageSpy,
        toBlob: async () => posterBlob,
      }),
    });

    const mp4File = new File(["mp4-data"], "danza-sbs.mp4", { type: "video/mp4" });
    await (
      processor as unknown as {
        extractVideoPoster: (
          file: Blob,
          seek?: number,
          opts?: { cropHalfSbsLeft?: boolean },
        ) => Promise<unknown>;
      }
    ).extractVideoPoster(mp4File, 1.5, { cropHalfSbsLeft: true });

    expect(drawImageSpy).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      960,
      1080,
      0,
      0,
      1024,
      576,
    );

    drawImageSpy.mockClear();
    await (
      processor as unknown as {
        extractVideoPoster: (
          file: Blob,
          seek?: number,
          opts?: { cropHalfSbsLeft?: boolean },
        ) => Promise<unknown>;
      }
    ).extractVideoPoster(mp4File, 1.5, { cropHalfSbsLeft: false });

    expect(drawImageSpy).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      1024,
      576,
    );
  });
});
