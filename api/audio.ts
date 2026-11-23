import type { Client } from "@libsql/client";
import { getDb } from "./_db.js";
import {
  API_HTTP_STATUS,
  extractQueryParam,
  type ServerlessRequest,
  type ServerlessResponse,
} from "./_http.js";
import {
  fetchRoomAudioTracks,
  fetchRoomPlaybackMode,
} from "./_audio-validation.js";
import { isValidRoomId, RoomId } from "../src/shared/room-catalog.js";

const PUBLIC_AUDIO_CACHE_HEADER =
  "public, max-age=30, stale-while-revalidate=120";

export interface AudioGetHandlerDeps {
  readonly resolveDb?: () => Client;
  readonly resolvePublicBaseUrl?: () => string | undefined;
}

export function createAudioGetHandler(deps: AudioGetHandlerDeps = {}) {
  const resolveDb = deps.resolveDb ?? getDb;
  const resolvePublicBaseUrl =
    deps.resolvePublicBaseUrl ?? (() => process.env.MEDIA_PUBLIC_BASE_URL);

  return async function handler(
    req: ServerlessRequest,
    res: ServerlessResponse,
  ): Promise<void> {
    if (req.method !== "GET") {
      res.status(API_HTTP_STATUS.METHOD_NOT_ALLOWED).json({
        error: "Method not allowed. Use GET.",
      });
      return;
    }

    const roomId = extractQueryParam(req, "roomId");
    if (!roomId || !isValidRoomId(roomId)) {
      res.status(API_HTTP_STATUS.BAD_REQUEST).json({
        error: "Valid roomId query parameter is required.",
      });
      return;
    }

    try {
      const db = resolveDb();
      const baseUrl = resolvePublicBaseUrl();

      let resolvedFromRoomId: RoomId = roomId;
      let tracks = await fetchRoomAudioTracks(db, roomId, baseUrl);

      if (tracks.length === 0 && roomId !== RoomId.LOBBY) {
        const lobbyTracks = await fetchRoomAudioTracks(
          db,
          RoomId.LOBBY,
          baseUrl,
        );
        if (lobbyTracks.length > 0) {
          tracks = lobbyTracks;
          resolvedFromRoomId = RoomId.LOBBY;
        }
      }

      const playbackMode = await fetchRoomPlaybackMode(
        db,
        resolvedFromRoomId,
      );

      res.setHeader?.("Cache-Control", PUBLIC_AUDIO_CACHE_HEADER);
      res.status(API_HTTP_STATUS.OK).json({
        roomId,
        resolvedFromRoomId,
        playbackMode,
        tracks,
      });
    } catch (error) {
      console.error("[/api/audio] Database read failure:", error);
      res.status(API_HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Failed to load room playlist.",
      });
    }
  };
}

export default createAudioGetHandler();
