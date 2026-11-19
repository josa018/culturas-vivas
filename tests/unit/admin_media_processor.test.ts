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
      /100 MiB/i,
    );
  });
});
