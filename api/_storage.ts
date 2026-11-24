import { MEDIA_STORAGE_LIMITS } from "./_media-validation.js";
import {
  normalizeObjectKey,
  signAwsV4Headers,
  signAwsV4PresignedDownloadUrl,
  signAwsV4PresignedUrl,
} from "./_r2-signer.js";

export interface PresignedUploadTarget {
  readonly key: string;
  readonly uploadUrl: string;
  readonly headers: Record<string, string>;
  readonly expiresInSeconds: number;
}

export interface PresignedDownloadTarget {
  readonly key: string;
  readonly downloadUrl: string;
  readonly filename: string;
  readonly expiresInSeconds: number;
}

export interface CreatePresignedUploadInput {
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly expiresInSeconds?: number;
}

export interface CreatePresignedDownloadInput {
  readonly objectKey: string;
  readonly filename: string;
  readonly expiresInSeconds?: number;
}

/**
 * Storage adapter seam decoupling R2 presigned object operations from API handlers.
 */
export interface MediaStorageProvider {
  getProviderId(): string;
  createPresignedUpload(
    input: CreatePresignedUploadInput,
  ): Promise<PresignedUploadTarget>;
  createPresignedDownload?(
    input: CreatePresignedDownloadInput,
  ): Promise<PresignedDownloadTarget>;
  deleteObject(objectKey: string): Promise<void>;
}

export interface R2StorageProviderConfig {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly now?: () => Date;
  readonly fetchImpl?: typeof fetch;
}

export function buildSafeDownloadFilename(
  title: string,
  extension: string,
  fallbackBase: string = "archivo",
): string {
  const normalizedBase = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const cleanExt = extension.replace(/^\.+/, "").toLowerCase() || "bin";
  return `${normalizedBase || fallbackBase}.${cleanExt}`;
}

export async function resolveDownloadTargetPayload(params: {
  readonly storage: MediaStorageProvider;
  readonly objectKey: string;
  readonly filename: string;
  readonly publicBaseUrl: string | undefined;
  readonly expiresInSeconds?: number;
}): Promise<{
  readonly downloadUrl: string;
  readonly filename: string;
  readonly expiresInSeconds: number;
}> {
  const expiresInSeconds =
    params.expiresInSeconds ?? MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS;
  if (typeof params.storage.createPresignedDownload === "function") {
    const presigned = await params.storage.createPresignedDownload({
      objectKey: params.objectKey,
      filename: params.filename,
      expiresInSeconds,
    });
    return {
      downloadUrl: presigned.downloadUrl,
      filename: presigned.filename,
      expiresInSeconds: presigned.expiresInSeconds,
    };
  }

  return {
    downloadUrl:
      resolvePublicMediaUrl(params.publicBaseUrl, params.objectKey) ?? "",
    filename: params.filename,
    expiresInSeconds,
  };
}

/**
 * Resolves a stored relative object key against a configured base URL or local path prefix.
 */
export function resolvePublicMediaUrl(
  baseUrl: string | undefined | null,
  objectKey: string | undefined | null,
): string | undefined {
  if (!objectKey || objectKey.trim().length === 0) {
    return undefined;
  }
  const cleanKey = normalizeObjectKey(objectKey.trim());
  if (!baseUrl || baseUrl.trim().length === 0) {
    return `/${cleanKey}`;
  }
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  return `${cleanBase}/${cleanKey}`;
}

export class R2StorageProvider implements MediaStorageProvider {
  private readonly config: R2StorageProviderConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: R2StorageProviderConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  public getProviderId(): string {
    return "r2";
  }

  public async createPresignedUpload(
    input: CreatePresignedUploadInput,
  ): Promise<PresignedUploadTarget> {
    const cleanKey = normalizeObjectKey(input.objectKey);
    const expiresSeconds =
      input.expiresInSeconds ?? MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS;
    const signed = signAwsV4PresignedUrl({
      accountId: this.config.accountId,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      bucket: this.config.bucket,
      method: "PUT",
      objectKey: cleanKey,
      contentType: input.contentType,
      contentLength: input.contentLength,
      expiresSeconds,
      now: this.config.now,
    });

    return {
      key: cleanKey,
      uploadUrl: signed.url,
      headers: signed.headers,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }

  public async createPresignedDownload(
    input: CreatePresignedDownloadInput,
  ): Promise<PresignedDownloadTarget> {
    const cleanKey = normalizeObjectKey(input.objectKey);
    const expiresSeconds =
      input.expiresInSeconds ?? MEDIA_STORAGE_LIMITS.PRESIGN_TTL_SECONDS;
    const signed = signAwsV4PresignedDownloadUrl({
      accountId: this.config.accountId,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      bucket: this.config.bucket,
      objectKey: cleanKey,
      filename: input.filename,
      expiresSeconds,
      now: this.config.now,
    });

    return {
      key: cleanKey,
      downloadUrl: signed.url,
      filename: input.filename,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }

  public async deleteObject(objectKey: string): Promise<void> {
    const cleanKey = normalizeObjectKey(objectKey);
    const signed = signAwsV4Headers({
      accountId: this.config.accountId,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      bucket: this.config.bucket,
      method: "DELETE",
      objectKey: cleanKey,
      now: this.config.now,
    });

    const response = await this.fetchImpl(signed.url, {
      method: "DELETE",
      headers: signed.headers,
    });

    if (response.status === 404 || response.ok) {
      return;
    }

    throw new Error(
      `R2 object deletion failed for '${cleanKey}' with HTTP ${response.status}.`,
    );
  }
}

function readRequiredEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createMediaStorageProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): MediaStorageProvider {
  const driver = (env.MEDIA_STORAGE_DRIVER ?? "r2").trim().toLowerCase();
  if (driver !== "r2") {
    throw new Error(
      `Unsupported MEDIA_STORAGE_DRIVER '${driver}'. Expected 'r2'.`,
    );
  }

  return new R2StorageProvider({
    accountId: readRequiredEnv(env, "R2_ACCOUNT_ID"),
    accessKeyId: readRequiredEnv(env, "R2_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredEnv(env, "R2_SECRET_ACCESS_KEY"),
    bucket: readRequiredEnv(env, "R2_BUCKET_NAME"),
  });
}
