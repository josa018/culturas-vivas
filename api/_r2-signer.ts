import { createHash, createHmac } from "node:crypto";

const AWS_SIGV4_CONSTANTS = {
  ALGORITHM: "AWS4-HMAC-SHA256",
  REGION: "auto",
  SERVICE: "s3",
  REQUEST_TYPE: "aws4_request",
  UNSIGNED_PAYLOAD: "UNSIGNED-PAYLOAD",
  EMPTY_SHA256:
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  R2_HOST_SUFFIX: "r2.cloudflarestorage.com",
} as const;

export interface R2Credentials {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}

export interface PresignUrlInput extends R2Credentials {
  readonly method: "PUT";
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly expiresSeconds: number;
  readonly now?: () => Date;
}

export interface PresignedUploadResult {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly expiresInSeconds: number;
}

export interface PresignDownloadUrlInput extends R2Credentials {
  readonly objectKey: string;
  readonly filename: string;
  readonly expiresSeconds: number;
  readonly now?: () => Date;
}

export interface PresignedDownloadResult {
  readonly url: string;
  readonly expiresInSeconds: number;
}

export interface SignHeadersInput extends R2Credentials {
  readonly method: "DELETE" | "HEAD" | "GET";
  readonly objectKey: string;
  readonly now?: () => Date;
}

export interface SignedHeadersResult {
  readonly url: string;
  readonly headers: Record<string, string>;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeUriPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function formatAmzTimestamps(date: Date): {
  readonly dateStamp: string;
  readonly amzDate: string;
} {
  const iso = date.toISOString();
  const dateStamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
  const amzDate = `${dateStamp}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return { dateStamp, amzDate };
}

function deriveSigningKey(secretAccessKey: string, dateStamp: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, AWS_SIGV4_CONSTANTS.REGION);
  const kService = hmacSha256(kRegion, AWS_SIGV4_CONSTANTS.SERVICE);
  return hmacSha256(kService, AWS_SIGV4_CONSTANTS.REQUEST_TYPE);
}

function getR2Host(accountId: string): string {
  return `${accountId}.${AWS_SIGV4_CONSTANTS.R2_HOST_SUFFIX}`;
}

export function normalizeObjectKey(objectKey: string): string {
  return objectKey.replace(/^\/+/, "");
}

export function buildR2ObjectUrl(
  accountId: string,
  bucket: string,
  objectKey: string,
): string {
  const host = getR2Host(accountId);
  const cleanKey = normalizeObjectKey(objectKey);
  const canonicalPath = encodeUriPath(`/${bucket}/${cleanKey}`);
  return `https://${host}${canonicalPath}`;
}

function buildPresignedUrlCore(params: {
  readonly credentials: R2Credentials;
  readonly method: "PUT" | "GET";
  readonly objectKey: string;
  readonly expiresSeconds: number;
  readonly signedHeaderPairs: Array<[string, string]>;
  readonly extraQueryParams?: Array<[string, string]>;
  readonly now?: () => Date;
}): string {
  const { credentials, method, objectKey, expiresSeconds, signedHeaderPairs } =
    params;
  const nowDate = params.now ? params.now() : new Date();
  const { dateStamp, amzDate } = formatAmzTimestamps(nowDate);
  const host = getR2Host(credentials.accountId);
  const cleanKey = normalizeObjectKey(objectKey);
  const canonicalUri = encodeUriPath(`/${credentials.bucket}/${cleanKey}`);
  const credentialScope = `${dateStamp}/${AWS_SIGV4_CONSTANTS.REGION}/${AWS_SIGV4_CONSTANTS.SERVICE}/${AWS_SIGV4_CONSTANTS.REQUEST_TYPE}`;

  const sortedHeaderPairs = [...signedHeaderPairs].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const signedHeaders = sortedHeaderPairs.map(([k]) => k).join(";");
  const canonicalHeaders = sortedHeaderPairs
    .map(([k, v]) => `${k}:${v}\n`)
    .join("");

  const queryParams: Array<[string, string]> = [
    ["X-Amz-Algorithm", AWS_SIGV4_CONSTANTS.ALGORITHM],
    ["X-Amz-Credential", `${credentials.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders],
    ...(params.extraQueryParams ?? []),
  ];
  queryParams.sort(([a], [b]) => a.localeCompare(b));

  const canonicalQuery = queryParams
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    AWS_SIGV4_CONSTANTS.UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [
    AWS_SIGV4_CONSTANTS.ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(credentials.secretAccessKey, dateStamp);
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Generates an AWS SigV4 presigned URL for direct client-to-R2 PUT uploads.
 */
export function signAwsV4PresignedUrl(
  input: PresignUrlInput,
): PresignedUploadResult {
  const host = getR2Host(input.accountId);
  const url = buildPresignedUrlCore({
    credentials: input,
    method: input.method,
    objectKey: input.objectKey,
    expiresSeconds: input.expiresSeconds,
    signedHeaderPairs: [
      ["content-length", String(input.contentLength)],
      ["content-type", input.contentType],
      ["host", host],
    ],
    now: input.now,
  });

  return {
    url,
    headers: {
      "Content-Type": input.contentType,
      "Content-Length": String(input.contentLength),
    },
    expiresInSeconds: input.expiresSeconds,
  };
}

/**
 * Generates an AWS SigV4 presigned GET URL with Content-Disposition attachment for direct downloads.
 */
export function signAwsV4PresignedDownloadUrl(
  input: PresignDownloadUrlInput,
): PresignedDownloadResult {
  const host = getR2Host(input.accountId);
  const safeFilename = input.filename.replace(/["\r\n\\/]/g, "_").trim() || "archivo";
  const url = buildPresignedUrlCore({
    credentials: input,
    method: "GET",
    objectKey: input.objectKey,
    expiresSeconds: input.expiresSeconds,
    signedHeaderPairs: [["host", host]],
    extraQueryParams: [
      ["response-content-disposition", `attachment; filename="${safeFilename}"`],
    ],
    now: input.now,
  });

  return {
    url,
    expiresInSeconds: input.expiresSeconds,
  };
}

/**
 * Generates AWS SigV4 Authorization headers for server-to-R2 requests (e.g. DELETE).
 */
export function signAwsV4Headers(input: SignHeadersInput): SignedHeadersResult {
  const nowDate = input.now ? input.now() : new Date();
  const { dateStamp, amzDate } = formatAmzTimestamps(nowDate);
  const host = getR2Host(input.accountId);
  const cleanKey = normalizeObjectKey(input.objectKey);
  const canonicalUri = encodeUriPath(`/${input.bucket}/${cleanKey}`);
  const credentialScope = `${dateStamp}/${AWS_SIGV4_CONSTANTS.REGION}/${AWS_SIGV4_CONSTANTS.SERVICE}/${AWS_SIGV4_CONSTANTS.REQUEST_TYPE}`;

  const headerPairs: Array<[string, string]> = [
    ["host", host],
    ["x-amz-content-sha256", AWS_SIGV4_CONSTANTS.EMPTY_SHA256],
    ["x-amz-date", amzDate],
  ];
  const signedHeaders = headerPairs.map(([k]) => k).join(";");
  const canonicalHeaders = headerPairs.map(([k, v]) => `${k}:${v}\n`).join("");

  const canonicalRequest = [
    input.method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    AWS_SIGV4_CONSTANTS.EMPTY_SHA256,
  ].join("\n");

  const stringToSign = [
    AWS_SIGV4_CONSTANTS.ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(input.secretAccessKey, dateStamp);
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  return {
    url: `https://${host}${canonicalUri}`,
    headers: {
      Authorization: `${AWS_SIGV4_CONSTANTS.ALGORITHM} Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": AWS_SIGV4_CONSTANTS.EMPTY_SHA256,
    },
  };
}
