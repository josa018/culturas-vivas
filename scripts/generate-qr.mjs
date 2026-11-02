import { writeFileSync } from "node:fs";

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.error("Usage: node scripts/generate-qr.mjs <URL>");
  process.exit(1);
}

try {
  const QRCode = (await import("qrcode")).default;
  const svg = await QRCode.toString(targetUrl, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
  });
  writeFileSync("public/assets/qr-culturas-vivas.svg", svg, "utf8");
  console.log("Vector QR code successfully generated for:", targetUrl);
} catch (err) {
  console.error("Failed to generate QR code. Ensure 'qrcode' is installed: npm i -D qrcode");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
