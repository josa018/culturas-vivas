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

    // Independently verify AWS SigV4 HMAC computation for GET using ASCII code-point order ('X' 0x58 < 'r' 0x72)
    expect(Array.from(parsed.searchParams.keys())).toEqual([
      "X-Amz-Algorithm",
      "X-Amz-Credential",
      "X-Amz-Date",
      "X-Amz-Expires",
      "X-Amz-SignedHeaders",
      "response-content-disposition",
      "X-Amz-Signature",
    ]);

    const encodeRfc = (v: string) =>
      encodeURIComponent(v).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
    const canonicalQuery = [
      `X-Amz-Algorithm=${encodeRfc("AWS4-HMAC-SHA256")}`,
      `X-Amz-Credential=${encodeRfc("AKIAIOSFODNN7EXAMPLE/20261118/auto/s3/aws4_request")}`,
      `X-Amz-Date=${encodeRfc("20261118T120000Z")}`,
      `X-Amz-Expires=${encodeRfc("300")}`,
      `X-Amz-SignedHeaders=${encodeRfc("host")}`,
      `response-content-disposition=${encodeRfc('attachment; filename="estambre-ceremonial.webp"')}`,
    ].join("&");

    expect(parsed.search.startsWith(`?${canonicalQuery}&X-Amz-Signature=`)).toBe(
      true,
    );

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

  it("matches Cloudflare R2 CanonicalRequest SHA-256 digest for real presigned attachment download parameters", () => {
    const r2Download = signAwsV4PresignedDownloadUrl({
      accountId: "82c53a4fbecf44d5072a8972d27cf15b",
      accessKeyId: "5aa86895e633854558126c56e01b8407",
      secretAccessKey: "test-secret-access-key",
      bucket: "culturas-vivas-media",
      objectKey:
        "rooms/wixarika/cosmovision/6a5c3969-8edf-4387-b9de-b3530874b2ea.webp",
      filename: "altar-y-figura-ceremonial-en-xiriki.webp",
      expiresSeconds: 300,
      now: () => new Date("2026-11-24T19:14:43.000Z"),
    });

    const parsed = new URL(r2Download.url);
    const rawQueryWithoutSig = parsed.search
      .slice(1)
      .replace(/&X-Amz-Signature=[0-9a-f]+$/, "");

    const canonicalRequest = [
      "GET",
      parsed.pathname,
      rawQueryWithoutSig,
      `host:${parsed.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const digest = sha256Hex(canonicalRequest);
    expect(digest).toBe(
      "b9801b038d98686528376cd57c3d1e8ef850f9075992a87706ca4b155121f08d",
    );

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      "20261124T191443Z",
      "20261124/auto/s3/aws4_request",
      digest,
    ].join("\n");
    const kDate = hmac("AWS4test-secret-access-key", "20261124");
    const kRegion = hmac(kDate, "auto");
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBe(
      hmac(kSigning, stringToSign).toString("hex"),
    );
  });
});
