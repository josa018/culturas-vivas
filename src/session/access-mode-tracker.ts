import type { ViewMode } from "../navigation/types";
import { SESSION_CONSTANTS } from "./constants";
import {
  createBrowserStorageAdapter,
  createDefaultFetcher,
  type SessionNetworkFetcher,
  type SessionStorageAdapter,
} from "./visitor-session-manager";

export type AccessTrackStatus = "recorded" | "skipped_no_session" | "failed";

export interface AccessTrackResult {
  readonly status: AccessTrackStatus;
}

export type DeviceTypeResolver = () => string;

const MOBILE_UA_PATTERN = /Mobi|Android|iPhone|iPad|iPod/i;
const VR_UA_PATTERN = /OculusBrowser|Quest|Pico|Vive|Mobile VR/i;

export function detectCoarseDeviceType(): string {
  if (typeof navigator === "undefined" || typeof navigator.userAgent !== "string") {
    return SESSION_CONSTANTS.DEVICE_TYPES.UNKNOWN;
  }
  const ua = navigator.userAgent;
  if (VR_UA_PATTERN.test(ua)) {
    return SESSION_CONSTANTS.DEVICE_TYPES.VR_HEADSET;
  }
  if (MOBILE_UA_PATTERN.test(ua)) {
    return SESSION_CONSTANTS.DEVICE_TYPES.MOBILE;
  }
  return SESSION_CONSTANTS.DEVICE_TYPES.DESKTOP;
}

/**
 * Records visitor viewing modality transitions (`vr` / `2d`) to `/api/session/access`
 * via composition without DOM dependencies.
 */
export class AccessModeTracker {
  private readonly storage: SessionStorageAdapter;
  private readonly fetcher: SessionNetworkFetcher;
  private readonly resolveDeviceType: DeviceTypeResolver;

  constructor(
    storage: SessionStorageAdapter = createBrowserStorageAdapter(),
    fetcher: SessionNetworkFetcher = createDefaultFetcher(),
    resolveDeviceType: DeviceTypeResolver = detectCoarseDeviceType,
  ) {
    this.storage = storage;
    this.fetcher = fetcher;
    this.resolveDeviceType = resolveDeviceType;
  }

  public async track(mode: ViewMode): Promise<AccessTrackResult> {
    const rawSessionId = this.storage.getItem(SESSION_CONSTANTS.STORAGE_KEY);
    const sessionId =
      typeof rawSessionId === "string"
        ? rawSessionId.trim().toLowerCase()
        : null;

    if (!sessionId || !SESSION_CONSTANTS.REGEX.UUID_V4.test(sessionId)) {
      return { status: "skipped_no_session" };
    }

    try {
      await this.fetcher.post(SESSION_CONSTANTS.ENDPOINTS.ACCESS, {
        sessionId,
        deviceType: this.resolveDeviceType(),
        mode,
      });
      return { status: "recorded" };
    } catch {
      return { status: "failed" };
    }
  }
}
