import { assert } from "../helpers/assert";
import { PlaceholderAssetGenerator } from "../../src/experience/placeholders";

function runPlaceholdersUnitTests(): void {
  console.log("--- [UNIT TEST] Placeholder Asset Generator ---");

  const decodeDataUri = (dataUri: string): string => {
    assert.ok(dataUri.startsWith("data:image/svg+xml;base64,"));
    const base64Part = dataUri.replace("data:image/svg+xml;base64,", "");
    const globalRef = globalThis as unknown as {
      Buffer?: {
        from: (
          str: string,
          enc: string,
        ) => { toString: (enc: string) => string };
      };
      atob?: (encoded: string) => string;
    };
    if (globalRef.Buffer) {
      return globalRef.Buffer.from(base64Part, "base64").toString("utf-8");
    }
    if (typeof globalRef.atob === "function") {
      return globalRef.atob(base64Part);
    }
    throw new Error("No base64 decoder available");
  };

  // Test 1: Painting Texture
  {
    const uri = PlaceholderAssetGenerator.createPaintingTexture();
    const svg = decodeDataUri(uri);
    assert.ok(svg.includes("LIENZO 2D"));
    assert.ok(svg.includes('width="512"'));
    console.log("✓ Test 1 Passed: 2D painting placeholder data-URI validated");
  }

  // Test 2: Stereo Image Texture
  {
    const uri = PlaceholderAssetGenerator.createStereoImageTexture();
    const svg = decodeDataUri(uri);
    assert.ok(svg.includes("OJO IZQUIERDO [L]"));
    assert.ok(svg.includes("OJO DERECHO [R]"));
    assert.ok(svg.includes('width="1024"'));
    console.log(
      "✓ Test 2 Passed: Stereoscopic SBS image placeholder data-URI validated",
    );
  }

  // Test 3: 2D Video Thumbnail
  {
    const uri = PlaceholderAssetGenerator.createVideoThumbnailTexture();
    const svg = decodeDataUri(uri);
    assert.ok(svg.includes("VIDEO 2D ESTANDAR"));
    console.log("✓ Test 3 Passed: 2D video thumbnail placeholder validated");
  }

  // Test 4: Stereo Video Thumbnail
  {
    const uri = PlaceholderAssetGenerator.createStereoVideoThumbnailTexture();
    const svg = decodeDataUri(uri);
    assert.ok(svg.includes("VIDEO SBS [L]"));
    assert.ok(svg.includes("VIDEO SBS [R]"));
    console.log(
      "✓ Test 4 Passed: Stereoscopic SBS video thumbnail placeholder validated",
    );
  }

  console.log(
    "All PlaceholderAssetGenerator unit tests passed successfully.\n",
  );
}

runPlaceholdersUnitTests();
