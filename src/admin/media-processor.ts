import { ADMIN_MEDIA_LIMITS } from "./constants";

export interface ScaledDimensions {
  readonly width: number;
  readonly height: number;
}

export interface OptimizedImageResult {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly mimeType: typeof ADMIN_MEDIA_LIMITS.OUTPUT_IMAGE_MIME;
}

export interface ExtractedVideoPosterResult {
  readonly posterBlob: Blob;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly posterWidth: number;
  readonly posterHeight: number;
  readonly posterMimeType: typeof ADMIN_MEDIA_LIMITS.OUTPUT_IMAGE_MIME;
}

export interface ProcessorCanvas {
  width: number;
  height: number;
  drawImage(
    source: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  toBlob(mimeType: string, quality: number): Promise<Blob>;
}

export interface DecodedImageHandle {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly cleanup: () => void;
}

export interface DecodedVideoHandle {
  readonly source: CanvasImageSource;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly cleanup: () => void;
}

export interface AdminMediaProcessorDeps {
  readonly createCanvas?: (width: number, height: number) => ProcessorCanvas;
  readonly decodeImage?: (file: Blob) => Promise<DecodedImageHandle>;
  readonly extractVideoFrame?: (file: Blob) => Promise<DecodedVideoHandle>;
}

const BYTES_PER_MIB = 1024 * 1024;

export function computeScaledDimensions(
  width: number,
  height: number,
  maxEdge: number,
): ScaledDimensions {
  if (width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function defaultCreateCanvas(width: number, height: number): ProcessorCanvas {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context unavailable.");
  }
  return {
    get width() {
      return canvas.width;
    },
    set width(value: number) {
      canvas.width = value;
    },
    get height() {
      return canvas.height;
    },
    set height(value: number) {
      canvas.height = value;
    },
    drawImage: (source, dx, dy, dw, dh) => {
      ctx.drawImage(source, dx, dy, dw, dh);
    },
    toBlob: (mimeType, quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error(`Failed to encode ${mimeType} output.`));
              return;
            }
            resolve(blob);
          },
          mimeType,
          quality,
        );
      }),
  };
}

function defaultDecodeImage(file: Blob): Promise<DecodedImageHandle> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image file."));
    };
    img.src = objectUrl;
  });
}

function defaultExtractVideoFrame(file: Blob): Promise<DecodedVideoHandle> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const fail = (message: string) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(message));
    };

    video.onerror = () => fail("Could not decode MP4 video metadata.");

    video.onloadedmetadata = () => {
      const targetTime =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(ADMIN_MEDIA_LIMITS.POSTER_SEEK_SECONDS, video.duration / 2)
          : 0;
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      resolve({
        source: video,
        videoWidth: video.videoWidth || 1280,
        videoHeight: video.videoHeight || 720,
        cleanup: () => {
          video.removeAttribute("src");
          video.load();
          URL.revokeObjectURL(objectUrl);
        },
      });
    };

    video.src = objectUrl;
  });
}

/**
 * Optimizes client-selected images to WebP and captures MP4 video poster thumbnails cleanly.
 */
export class AdminMediaProcessor {
  private readonly createCanvas: (
    width: number,
    height: number,
  ) => ProcessorCanvas;
  private readonly decodeImage: (file: Blob) => Promise<DecodedImageHandle>;
  private readonly extractVideoFrame: (
    file: Blob,
  ) => Promise<DecodedVideoHandle>;

  constructor(deps: AdminMediaProcessorDeps = {}) {
    this.createCanvas = deps.createCanvas ?? defaultCreateCanvas;
    this.decodeImage = deps.decodeImage ?? defaultDecodeImage;
    this.extractVideoFrame = deps.extractVideoFrame ?? defaultExtractVideoFrame;
  }

  public async optimizeImage(file: Blob): Promise<OptimizedImageResult> {
    const handle = await this.decodeImage(file);
    try {
      const scaled = computeScaledDimensions(
        handle.width,
        handle.height,
        ADMIN_MEDIA_LIMITS.MAX_IMAGE_EDGE_PX,
      );
      const canvas = this.createCanvas(scaled.width, scaled.height);
      canvas.drawImage(handle.source, 0, 0, scaled.width, scaled.height);
      const blob = await canvas.toBlob(
        ADMIN_MEDIA_LIMITS.OUTPUT_IMAGE_MIME,
        ADMIN_MEDIA_LIMITS.IMAGE_WEBP_QUALITY,
      );
      return {
        blob,
        width: scaled.width,
        height: scaled.height,
        mimeType: ADMIN_MEDIA_LIMITS.OUTPUT_IMAGE_MIME,
      };
    } finally {
      handle.cleanup();
    }
  }

  public async extractVideoPoster(
    file: Blob,
  ): Promise<ExtractedVideoPosterResult> {
    if (file.type && file.type !== "video/mp4") {
      throw new Error("El video debe estar en formato MP4 (video/mp4).");
    }
    const maxMb = Math.round(
      ADMIN_MEDIA_LIMITS.MAX_VIDEO_BYTES / BYTES_PER_MIB,
    );
    if (file.size > ADMIN_MEDIA_LIMITS.MAX_VIDEO_BYTES) {
      throw new Error(`El video excede el límite máximo de ${maxMb} MiB.`);
    }

    const handle = await this.extractVideoFrame(file);
    try {
      const posterScaled = computeScaledDimensions(
        handle.videoWidth,
        handle.videoHeight,
        ADMIN_MEDIA_LIMITS.POSTER_MAX_WIDTH_PX,
      );
      const canvas = this.createCanvas(posterScaled.width, posterScaled.height);
      canvas.drawImage(
        handle.source,
        0,
        0,
        posterScaled.width,
        posterScaled.height,
      );
      const posterBlob = await canvas.toBlob(
        ADMIN_MEDIA_LIMITS.OUTPUT_IMAGE_MIME,
        ADMIN_MEDIA_LIMITS.IMAGE_WEBP_QUALITY,
      );
      return {
        posterBlob,
        videoWidth: handle.videoWidth,
        videoHeight: handle.videoHeight,
        posterWidth: posterScaled.width,
        posterHeight: posterScaled.height,
        posterMimeType: ADMIN_MEDIA_LIMITS.OUTPUT_IMAGE_MIME,
      };
    } finally {
      handle.cleanup();
    }
  }
}
