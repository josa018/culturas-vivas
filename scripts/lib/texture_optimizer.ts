import sharp from "sharp";
import { ASSET_CONFIG, type AssetConfig } from "../config/asset_config.js";

export interface OptimizationResult {
  readonly buffer: Buffer;
  readonly originalSizeBytes: number;
  readonly optimizedSizeBytes: number;
  readonly savingsPercentage: number;
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly isAspectValid: boolean;
}

export async function optimizeTexture(
  inputBuffer: Buffer,
  configOverrides?: Partial<AssetConfig>,
): Promise<OptimizationResult> {
  const config = { ...ASSET_CONFIG, ...configOverrides };
  const originalSizeBytes = inputBuffer.byteLength;

  const metadata = await sharp(inputBuffer).metadata();

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const aspectRatio = height > 0 ? width / height : 0;

  const isAspectValid =
    Math.abs(aspectRatio - config.EXPECTED_ASPECT_RATIO) <=
    config.ASPECT_RATIO_TOLERANCE;

  const optimizedBuffer = await sharp(inputBuffer)
    .webp({
      quality: config.WEBP_QUALITY,
      effort: config.WEBP_EFFORT,
    })
    .toBuffer();

  const optimizedSizeBytes = optimizedBuffer.byteLength;
  const savingsPercentage =
    originalSizeBytes > 0
      ? Number(
          (
            ((originalSizeBytes - optimizedSizeBytes) / originalSizeBytes) *
            100
          ).toFixed(2),
        )
      : 0;

  return {
    buffer: optimizedBuffer,
    originalSizeBytes,
    optimizedSizeBytes,
    savingsPercentage,
    width,
    height,
    aspectRatio: Number(aspectRatio.toFixed(2)),
    isAspectValid,
  };
}
