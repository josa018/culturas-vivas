export const ASSET_CONFIG = Object.freeze({
  INPUT_DIR: "assets/raw",
  OUTPUT_DIR: "public/scenes",
  TARGET_FORMAT: "webp" as const,
  WEBP_QUALITY: 80,
  WEBP_EFFORT: 6,
  EXPECTED_ASPECT_RATIO: 2.0,
  ASPECT_RATIO_TOLERANCE: 0.05,
  ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png"] as const,
});

export type AssetConfig = typeof ASSET_CONFIG;
