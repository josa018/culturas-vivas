import { describe, it, expect } from "vitest";
import { PlaceholderAssetGenerator } from "../../src/experience/placeholders";

describe("PlaceholderAssetGenerator", () => {
  const decodeDataUri = (dataUri: string): string => {
    expect(dataUri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const base64Part = dataUri.replace("data:image/svg+xml;base64,", "");
    return Buffer.from(base64Part, "base64").toString("utf-8");
  };

  it("creates valid 2D painting placeholder data-URI", () => {
    const uri = PlaceholderAssetGenerator.createPaintingTexture();
    const svg = decodeDataUri(uri);
    expect(svg).toContain("LIENZO 2D");
    expect(svg).toContain('width="512"');
  });

  it("creates valid stereoscopic SBS image placeholder data-URI", () => {
    const uri = PlaceholderAssetGenerator.createStereoImageTexture();
    const svg = decodeDataUri(uri);
    expect(svg).toContain("OJO IZQUIERDO [L]");
    expect(svg).toContain("OJO DERECHO [R]");
    expect(svg).toContain('width="1024"');
  });

  it("creates valid 2D video thumbnail placeholder", () => {
    const uri = PlaceholderAssetGenerator.createVideoThumbnailTexture();
    const svg = decodeDataUri(uri);
    expect(svg).toContain("VIDEO 2D ESTANDAR");
  });

  it("creates valid stereoscopic SBS video thumbnail placeholder", () => {
    const uri = PlaceholderAssetGenerator.createStereoVideoThumbnailTexture();
    const svg = decodeDataUri(uri);
    expect(svg).toContain("VIDEO SBS [L]");
    expect(svg).toContain("VIDEO SBS [R]");
  });
});
