import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const AUTH_CONFIG = {
  BCRYPT_SALT_ROUNDS: 10,
  JWT_ALGORITHM: "HS256",
  JWT_ISSUER: "culturas-vivas",
  JWT_AUDIENCE: "culturas-vivas-admin",
  JWT_EXPIRATION: "8h",
  MIN_SECRET_BYTES: 32,
} as const;

export interface AdminTokenClaims extends JWTPayload {
  readonly username: string;
  readonly role: string;
}

export function getJwtSecretKey(secretOverride?: string): Uint8Array {
  const rawSecret = secretOverride ?? process.env.ADMIN_JWT_SECRET;
  if (!rawSecret || rawSecret.trim().length === 0) {
    throw new Error("ADMIN_JWT_SECRET is not defined in environment variables.");
  }
  const encoded = new TextEncoder().encode(rawSecret);
  if (encoded.byteLength < AUTH_CONFIG.MIN_SECRET_BYTES) {
    throw new Error(
      `ADMIN_JWT_SECRET must be at least ${AUTH_CONFIG.MIN_SECRET_BYTES} bytes for HS256.`,
    );
  }
  return encoded;
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

export async function signAdminToken(
  user: { readonly id: string | number; readonly username: string; readonly role: string },
  secretOverride?: string,
): Promise<string> {
  const key = getJwtSecretKey(secretOverride);
  return new SignJWT({
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: AUTH_CONFIG.JWT_ALGORITHM })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setIssuer(AUTH_CONFIG.JWT_ISSUER)
    .setAudience(AUTH_CONFIG.JWT_AUDIENCE)
    .setExpirationTime(AUTH_CONFIG.JWT_EXPIRATION)
    .sign(key);
}

export function extractBearerToken(
  headers?: Record<string, string | string[] | undefined>,
): string | null {
  if (!headers) {
    return null;
  }
  const rawHeader = headers.authorization ?? headers.Authorization;
  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof headerValue !== "string") {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : null;
}

export async function verifyAdminBearerToken(
  headers?: Record<string, string | string[] | undefined>,
  secretOverride?: string,
): Promise<AdminTokenClaims | null> {
  const token = extractBearerToken(headers);
  if (!token) {
    return null;
  }

  try {
    const key = getJwtSecretKey(secretOverride);
    const { payload } = await jwtVerify<AdminTokenClaims>(token, key, {
      algorithms: [AUTH_CONFIG.JWT_ALGORITHM],
      issuer: AUTH_CONFIG.JWT_ISSUER,
      audience: AUTH_CONFIG.JWT_AUDIENCE,
    });

    if (
      typeof payload.username !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
