import { MEDIA_STORAGE_LIMITS } from "./_media-validation.js";
import {
  normalizeObjectKey,
  signAwsV4Headers,
  signAwsV4PresignedUrl,
} from "./_r2-signer.js";

export interface PresignedUploadTarget {
  readonly key: string;
  readonly uploadUrl: string;
  readonly headers: Record<string, string>;
  readonly expiresInSeconds: number;
}

export interface CreatePresignedUploadInput {
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
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
