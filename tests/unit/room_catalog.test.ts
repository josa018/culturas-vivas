import { describe, it, expect } from "vitest";
import {
  DEFAULT_ROOM_ID,
  ROOM_CATALOG,
  ROOM_LAYOUT_TOKENS,
  ROOM_PORTAL_ACCENTS,
  ROOM_TITLES,
  RoomEnvironmentId,
  RoomId,
  STAND_LABELS,
  StandId,
  computeRingTransform,
  getLobbyReturnTarget,
  isValidRoomStand,
} from "../../src/shared/room-catalog";

describe("Culture Room Catalog & Polar Layout", () => {
  it("defines LOBBY as DEFAULT_ROOM_ID plus all four Nayarit cultural rooms with bidirectional portals", () => {
    expect(DEFAULT_ROOM_ID).toBe(RoomId.LOBBY);
    expect(ROOM_TITLES[RoomId.LOBBY]).toBe("Vestíbulo Cultural");
    expect(ROOM_TITLES[RoomId.WIXARIKA]).toBe("Cultura Wixárika");
    expect(ROOM_TITLES[RoomId.NAAYERI]).toBe("Cultura Náayeri");
    expect(ROOM_TITLES[RoomId.ODAM]).toBe("Cultura O'dam");
    expect(ROOM_TITLES[RoomId.MEXICANERO]).toBe("Cultura Mexicanero");
    expect(getLobbyReturnTarget()).toBe(RoomId.LOBBY);

    const lobby = ROOM_CATALOG[RoomId.LOBBY];
    expect(lobby.portals).toHaveLength(4);
    expect(lobby.portals.map((p) => p.targetRoomId)).toEqual([
      RoomId.WIXARIKA,
      RoomId.NAAYERI,
      RoomId.ODAM,
      RoomId.MEXICANERO,
    ]);
    expect(lobby.portals.map((p) => p.title)).toEqual([
      "Cultura Wixárika",
      "Cultura Náayeri",
      "Cultura O'dam",
      "Cultura Mexicanero",
    ]);

    for (const cultureId of [
      RoomId.WIXARIKA,
      RoomId.NAAYERI,
      RoomId.ODAM,
      RoomId.MEXICANERO,
    ]) {
      const room = ROOM_CATALOG[cultureId];
      expect(room.portals).toHaveLength(1);
      expect(room.portals[0].targetRoomId).toBe(RoomId.LOBBY);
      expect(room.portals[0].title).toBe("Volver al Lobby");
      expect(ROOM_PORTAL_ACCENTS[cultureId]).toBeTruthy();
    }
  });

  it("validates Lobby and cultural stand slots via isValidRoomStand", () => {
    expect(STAND_LABELS[StandId.BIENVENIDA]).toBe("Bienvenida");
    expect(STAND_LABELS[StandId.NAYARIT]).toBe("Pueblos de Nayarit");
    expect(STAND_LABELS[StandId.COSMOVISION]).toBe("Cosmovisión y Tradición");
    expect(STAND_LABELS[StandId.ARTE]).toBe("Arte y Artesanías");
    expect(STAND_LABELS[StandId.VESTIMENTA]).toBe("Vestimenta");
    expect(STAND_LABELS[StandId.GASTRONOMIA]).toBe("Gastronomía");
    expect(STAND_LABELS[StandId.VIVIENDA]).toBe("Vivienda");

    expect(isValidRoomStand(RoomId.WIXARIKA, StandId.VESTIMENTA)).toBe(true);
    expect(isValidRoomStand(RoomId.LOBBY, StandId.BIENVENIDA)).toBe(true);
    expect(isValidRoomStand(RoomId.LOBBY, StandId.VESTIMENTA)).toBe(false);
    expect(isValidRoomStand(RoomId.NAAYERI, StandId.BIENVENIDA)).toBe(false);
    expect(isValidRoomStand("UNKNOWN_ROOM", StandId.ARTE)).toBe(false);
  });

  it("computes inward-facing polar ring transforms at cardinal azimuths", () => {
    const north = computeRingTransform(
      0,
      ROOM_LAYOUT_TOKENS.RING_RADIUS_M,
      ROOM_LAYOUT_TOKENS.EYE_HEIGHT_M,
    );
    expect(north).toEqual({
      position: { x: 0, y: 1.6, z: -3.2 },
      rotation: { x: 0, y: 0, z: 0 },
    });

    const east = computeRingTransform(
      90,
      ROOM_LAYOUT_TOKENS.RING_RADIUS_M,
      ROOM_LAYOUT_TOKENS.EYE_HEIGHT_M,
    );
    expect(east).toEqual({
      position: { x: 3.2, y: 1.6, z: 0 },
      rotation: { x: 0, y: -90, z: 0 },
    });

    const south = computeRingTransform(
      180,
      ROOM_LAYOUT_TOKENS.RING_RADIUS_M,
      ROOM_LAYOUT_TOKENS.EYE_HEIGHT_M,
    );
    expect(south).toEqual({
      position: { x: 0, y: 1.6, z: 3.2 },
      rotation: { x: 0, y: 180, z: 0 },
    });
  });

  it("enforces minimum 45 deg separation and >= 2.45m chord across all 7 Wixárika stations", () => {
    const wixarika = ROOM_CATALOG[RoomId.WIXARIKA];
    expect(wixarika.model3d).not.toBeNull();
    expect(wixarika.stands).toHaveLength(5);
    expect(wixarika.portals).toHaveLength(1);

    const angles = [
      wixarika.model3d!.angleDeg,
      ...wixarika.stands.map((s) => s.angleDeg),
      ...wixarika.portals.map((p) => p.angleDeg),
    ];
    expect(angles).toHaveLength(7);

    const normalizeAngle = (a: number) => ((a % 360) + 360) % 360;
    const sorted = angles.map(normalizeAngle).sort((a, b) => a - b);

    let minDiffDeg = 360;
    for (let i = 0; i < sorted.length; i++) {
      const next = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
      const diff = next - sorted[i];
      if (diff < minDiffDeg) {
        minDiffDeg = diff;
      }
    }

    const minChordM =
      2 *
      ROOM_LAYOUT_TOKENS.RING_RADIUS_M *
      Math.sin((minDiffDeg * Math.PI) / 360);

    expect(minDiffDeg).toBeGreaterThanOrEqual(45);
    expect(Number(minChordM.toFixed(2))).toBeGreaterThanOrEqual(2.45);
  });

  it("maps all five rooms to RoomEnvironmentId presets without equirectangular skybox paths and grounds pedestal height to 1.2m", () => {
    expect(ROOM_LAYOUT_TOKENS.MODEL_PEDESTAL_HEIGHT_M).toBe(
      ROOM_LAYOUT_TOKENS.PEDESTAL_ELEVATION_M,
    );
    expect(ROOM_LAYOUT_TOKENS.MODEL_PEDESTAL_HEIGHT_M).toBe(1.2);

    const expectedPresets: Record<RoomId, RoomEnvironmentId> = {
      [RoomId.LOBBY]: RoomEnvironmentId.LOBBY,
      [RoomId.WIXARIKA]: RoomEnvironmentId.WIXARIKA,
      [RoomId.NAAYERI]: RoomEnvironmentId.NAAYERI,
      [RoomId.ODAM]: RoomEnvironmentId.ODAM,
      [RoomId.MEXICANERO]: RoomEnvironmentId.MEXICANERO,
    };

    for (const roomId of Object.values(RoomId)) {
      const entry = ROOM_CATALOG[roomId] as unknown as Record<string, unknown>;
      expect(entry.environmentPresetId).toBe(expectedPresets[roomId]);
      expect(entry.skyboxUrl).toBeUndefined();
      expect(entry.skyboxAssetId).toBeUndefined();
    }
  });
});
