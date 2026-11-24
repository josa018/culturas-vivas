import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildR2ObjectUrl,
  signAwsV4Headers,
  signAwsV4PresignedDownloadUrl,
  signAwsV4PresignedUrl,
} from "../../api/_r2-signer";

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

describe("api/_r2-signer", () => {
  const credentials = {
    accountId: "acct123",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    bucket: "culturas-media",
  };
  const fixedDate = new Date("2026-11-18T12:00:00.000Z");

  it("builds deterministic AWS SigV4 presigned PUT URL with signed Content-Length and Content-Type", () => {
    const objectKey = "rooms/wixarika/arte/a1.webp";
    const result = signAwsV4PresignedUrl({
      ...credentials,
      method: "PUT",
      objectKey,
      contentType: "image/webp",
      contentLength: 245000,
      expiresSeconds: 300,
      now: () => fixedDate,
    });

    const parsed = new URL(result.url);
    expect(parsed.origin).toBe("https://acct123.r2.cloudflarestorage.com");
    expect(parsed.pathname).toBe("/culturas-media/rooms/wixarika/arte/a1.webp");
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Credential")).toBe(
      "AKIAIOSFODNN7EXAMPLE/20261118/auto/s3/aws4_request",
    );
    expect(parsed.searchParams.get("X-Amz-Date")).toBe("20261118T120000Z");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host",
    );

    // Independently verify AWS SigV4 HMAC computation
    const canonicalQuery = [
      "X-Amz-Algorithm=AWS4-HMAC-SHA256",
      `X-Amz-Credential=${encodeURIComponent("AKIAIOSFODNN7EXAMPLE/20261118/auto/s3/aws4_request")}`,
      "X-Amz-Date=20261118T120000Z",
      "X-Amz-Expires=300",
      `X-Amz-SignedHeaders=${encodeURIComponent("content-length;content-type;host")}`,
    ].join("&");

    const canonicalRequest = [
      "PUT",
      "/culturas-media/rooms/wixarika/arte/a1.webp",
      canonicalQuery,
      "content-length:245000\ncontent-type:image/webp\nhost:acct123.r2.cloudflarestorage.com\n",
      "content-length;content-type;host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      "20261118T120000Z",
      "20261118/auto/s3/aws4_request",
      sha256Hex(canonicalRequest),
    ].join("\n");

    const kDate = hmac(`AWS4${credentials.secretAccessKey}`, "20261118");
    const kRegion = hmac(kDate, "auto");
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const expectedSig = hmac(kSigning, stringToSign).toString("hex");

    expect(parsed.searchParams.get("X-Amz-Signature")).toBe(expectedSig);
    expect(result.headers).toEqual({
      "Content-Type": "image/webp",
      "Content-Length": "245000",
    });
  });

  it("signs DELETE authorization headers deterministically", () => {
    const objectKey = "rooms/wixarika/arte/a1.webp";
    const targetUrl = buildR2ObjectUrl(credentials.accountId, credentials.bucket, objectKey);
    const signed = signAwsV4Headers({
      ...credentials,
      method: "DELETE",
      objectKey,
      now: () => fixedDate,
    });

    expect(targetUrl).toBe(
      "https://acct123.r2.cloudflarestorage.com/culturas-media/rooms/wixarika/arte/a1.webp",
    );
    expect(signed.headers["x-amz-date"]).toBe("20261118T120000Z");
    expect(signed.headers["x-amz-content-sha256"]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(signed.headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20261118\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it("builds deterministic AWS SigV4 presigned GET download URL with response-content-disposition", () => {
    const objectKey = "rooms/wixarika/arte/a1.webp";
    const result = signAwsV4PresignedDownloadUrl({
      ...credentials,
      objectKey,
      filename: "estambre-ceremonial.webp",
      expiresSeconds: 300,
      now: () => fixedDate,
    });

    const parsed = new URL(result.url);
    expect(parsed.origin).toBe("https://acct123.r2.cloudflarestorage.com");
    expect(parsed.pathname).toBe("/culturas-media/rooms/wixarika/arte/a1.webp");
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(parsed.searchParams.get("response-content-disposition")).toBe(
      'attachment; filename="estambre-ceremonial.webp"',
    );
    expect(result.expiresInSeconds).toBe(300);

    // Independently verify AWS SigV4 HMAC computation for GET with sorted query params
    const encodeRfc = (v: string) =>
      encodeURIComponent(v).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
    const canonicalQuery = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential", "AKIAIOSFODNN7EXAMPLE/20261118/auto/s3/aws4_request"],
      ["X-Amz-Date", "20261118T120000Z"],
      ["X-Amz-Expires", "300"],
      ["X-Amz-SignedHeaders", "host"],
      [
        "response-content-disposition",
        'attachment; filename="estambre-ceremonial.webp"',
      ],
    ]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeRfc(k)}=${encodeRfc(v)}`)
      .join("&");

    const canonicalRequest = [
      "GET",
      "/culturas-media/rooms/wixarika/arte/a1.webp",
      canonicalQuery,
      "host:acct123.r2.cloudflarestorage.com\n",
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      "20261118T120000Z",
      "20261118/auto/s3/aws4_request",
      sha256Hex(canonicalRequest),
    ].join("\n");

    const kDate = hmac(`AWS4${credentials.secretAccessKey}`, "20261118");
    const kRegion = hmac(kDate, "auto");
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const expectedSig = hmac(kSigning, stringToSign).toString("hex");

    expect(parsed.searchParams.get("X-Amz-Signature")).toBe(expectedSig);
  });
});
