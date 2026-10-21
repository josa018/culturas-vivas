import { promises as fs } from "node:fs";
import path from "node:path";
import { ASSET_CONFIG } from "./config/asset_config.js";
import { optimizeTexture } from "./lib/texture_optimizer.js";

interface SummaryRow {
  readonly file: string;
  readonly originalMb: string;
  readonly optimizedMb: string;
  readonly savings: string;
  readonly dimensions: string;
}

const BYTES_PER_MB = 1024 * 1024;

async function runPipeline(): Promise<void> {
  const rootDir = process.cwd();
  const inputDir = path.resolve(rootDir, ASSET_CONFIG.INPUT_DIR);
  const outputDir = path.resolve(rootDir, ASSET_CONFIG.OUTPUT_DIR);

  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const allEntries = await fs.readdir(inputDir, { withFileTypes: true });
  const targetFiles = allEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        (ASSET_CONFIG.ALLOWED_EXTENSIONS as readonly string[]).includes(
          path.extname(entry.name).toLowerCase(),
        ),
    )
    .map((entry) => entry.name);

  if (targetFiles.length === 0) {
    console.warn(
      `[WARN] No matching raw images found in '${ASSET_CONFIG.INPUT_DIR}'.`,
    );
    console.info(
      `Supported extensions: ${ASSET_CONFIG.ALLOWED_EXTENSIONS.join(", ")}`,
    );
    return;
  }

  console.info(
    `[INFO] Found ${targetFiles.length} file(s) to process. Starting optimization...`,
  );

  const summary: SummaryRow[] = [];
  let hasErrors = false;

  for (const filename of targetFiles) {
    const inputFilePath = path.join(inputDir, filename);
    const parsed = path.parse(filename);
    const outputFileName = `${parsed.name}.${ASSET_CONFIG.TARGET_FORMAT}`;
    const outputFilePath = path.join(outputDir, outputFileName);

    try {
      const fileBuffer = await fs.readFile(inputFilePath);
      const result = await optimizeTexture(fileBuffer);

      await fs.writeFile(outputFilePath, result.buffer);

      summary.push({
        file: filename,
        originalMb: `${(result.originalSizeBytes / BYTES_PER_MB).toFixed(2)} MB`,
        optimizedMb: `${(result.optimizedSizeBytes / BYTES_PER_MB).toFixed(2)} MB`,
        savings: `${result.savingsPercentage}%`,
        dimensions: `${result.width}x${result.height}`,
      });

      if (!result.isAspectValid) {
        console.warn(
          `[WARN] '${filename}' has non-standard equirectangular aspect ratio: ${result.aspectRatio} (expected ~${ASSET_CONFIG.EXPECTED_ASPECT_RATIO})`,
        );
      }
    } catch (error) {
      hasErrors = true;
      console.error(`[ERROR] Failed to process '${filename}':`, error);
    }
  }

  console.table(summary);

  if (hasErrors) {
    console.error("[ERROR] One or more assets failed to process.");
    process.exit(1);
  }

  console.info("[SUCCESS] All textures processed successfully.");
}

runPipeline().catch((error) => {
  console.error("[FATAL] Pipeline execution failed:", error);
  process.exit(1);
});
