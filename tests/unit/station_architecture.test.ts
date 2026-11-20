// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ROOM_LAYOUT_TOKENS, RoomId, StandId } from "../../src/shared/room-catalog";
import {
  PORTAL_DIMENSIONS,
  STATION_ARCHITECTURE_TOKENS,
} from "../../src/experience/constants";
import { getRoomEnvironmentPreset } from "../../src/experience/room-environment-presets";
import { createPortalEntity } from "../../src/experience/components/portal-waypoint";
import {
  createModelPedestalEntity,
  createStandPlinthEntity,
} from "../../src/experience/station-architecture";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";

describe("Grounded cultural stand plinths, stepped pedestals & monumental portals", () => {
  it("builds a static .cv-stand-plinth grounded at world y = 0 matching stand xz/rotation with Lambert shadow meshes", () => {
    const preset = getRoomEnvironmentPreset(RoomId.WIXARIKA);
    const plinth = createStandPlinthEntity(
      {
        roomId: RoomId.WIXARIKA,
        standId: StandId.ARTE,
        label: "ARTE",
        position: { x: 3.2, y: 1.76, z: 0 },
        rotation: { x: 0, y: -90, z: 0 },
      },
      preset,
    );

    expect(plinth.classList.contains("cv-stand-plinth")).toBe(true);
    expect(plinth.getAttribute("position")).toBe("3.2 0 0");
    expect(plinth.getAttribute("rotation")).toBe("0 -90 0");

    const parts = Array.from(plinth.querySelectorAll("a-box"));
    expect(parts.length).toBeGreaterThanOrEqual(3);
    for (const part of parts) {
      expect(part.getAttribute("material")).toContain("shader: lambert");
      expect(part.getAttribute("shadow")).toContain("cast: true");
    }

    const maxPlinthY = Math.max(
      ...parts.map((part) => {
        const y = Number((part.getAttribute("position") ?? "0 0 0").split(" ")[1]);
        const h = Number(part.getAttribute("height") ?? "0");
        return y + h / 2;
      }),
    );
    expect(STATION_ARCHITECTURE_TOKENS.PLINTH_HEIGHT_M).toBe(1.16);
    expect(maxPlinthY).toBeCloseTo(1.16, 2);
  });

  it("builds a stepped .cv-model-pedestal flush from world y = 0.0 to y = 1.2 m", () => {
    const preset = getRoomEnvironmentPreset(RoomId.LOBBY);
    const pedestal = createModelPedestalEntity("exhibit-test", preset);

    expect(pedestal.classList.contains("cv-model-pedestal")).toBe(true);
    expect(pedestal.getAttribute("id")).toBe("exhibit-test-pedestal");
    expect(pedestal.getAttribute("position")).toBe("0 0 0");

    const tiers = Array.from(pedestal.querySelectorAll("a-cylinder"));
    expect(tiers.length).toBeGreaterThanOrEqual(3);

    // Compute exact bottom and top bounds relative to world y = MODEL_PEDESTAL_HEIGHT_M (1.2 m)
    const minLocalY = Math.min(
      ...tiers.map((tier) => {
        const y = Number((tier.getAttribute("position") ?? "0 0 0").split(" ")[1]);
        const h = Number(tier.getAttribute("height") ?? "0");
        return y - h / 2;
      }),
    );
    const maxLocalY = Math.max(
      ...tiers.map((tier) => {
        const y = Number((tier.getAttribute("position") ?? "0 0 0").split(" ")[1]);
        const h = Number(tier.getAttribute("height") ?? "0");
        return y + h / 2;
      }),
    );

    expect(minLocalY).toBeCloseTo(-ROOM_LAYOUT_TOKENS.MODEL_PEDESTAL_HEIGHT_M, 2);
    expect(maxLocalY).toBeCloseTo(0, 2);
    expect(
      tiers.every(
        (t) =>
          (t.getAttribute("material") ?? "").includes("shader: lambert") &&
          (t.getAttribute("shadow") ?? "").includes("cast: true"),
      ),
    ).toBe(true);
  });

  it("upgrades createPortalEntity into a monumental grounded archway with threshold, fluted pillars, and carved frieze", () => {
    const preset = getRoomEnvironmentPreset(RoomId.NAAYERI);
    const portal = createPortalEntity(
      {
        id: "portal-lobby-to-naayeri",
        targetRoomId: RoomId.NAAYERI,
        title: "Cultura Naáyeri",
        position: { x: -1.1, y: 1.6, z: -3.0 },
        rotation: { x: 0, y: 18, z: 0 },
        accentColor: "#008F85",
      },
      preset,
    );

    const threshold = portal.querySelector(".cv-portal-threshold");
    expect(threshold).not.toBeNull();
    expect(threshold?.getAttribute("material")).toContain("shader: lambert");
    const threshY = Number((threshold?.getAttribute("position") ?? "0 0 0").split(" ")[1]);
    const threshH = Number(threshold?.getAttribute("height") ?? "0");
    expect(threshY - threshH / 2).toBeCloseTo(
      STATION_ARCHITECTURE_TOKENS.PORTAL_PILLAR_GROUND_DROP_Y,
      2,
    );

    const frieze = portal.querySelector(".cv-portal-frieze");
    expect(frieze).not.toBeNull();
    expect(frieze?.getAttribute("material")).toContain("shader: lambert");

    const flutedCols = Array.from(
      portal.querySelectorAll(`[segments-radial="${STATION_ARCHITECTURE_TOKENS.PORTAL_FLUTED_SEGMENTS}"]`),
    );
    expect(flutedCols.length).toBeGreaterThanOrEqual(2);

    const aperture = portal.querySelector("a-plane.clickable");
    expect(aperture?.getAttribute("material")).toContain("shader: flat");
    expect(portal.querySelector("[cv-canvas-text]")?.getAttribute("material")).toContain(
      "shader: flat",
    );
    expect(PORTAL_DIMENSIONS.FRAME_WIDTH).toBeGreaterThan(1);
  });

  it("mounts grounded .cv-stand-plinth siblings at r = 3.2 m and stepped .cv-model-pedestal in ExhibitRoomBuilder.mountRoom()", () => {
    const scene = document.createElement("a-scene");
    const roomEl = ExhibitRoomBuilder.mountRoom(scene, RoomId.WIXARIKA, "vr");

    const stands = roomEl.querySelectorAll("[cv-media-stand]");
    const plinths = roomEl.querySelectorAll(".cv-stand-plinth");
    expect(plinths).toHaveLength(stands.length);
    for (const plinth of Array.from(plinths)) {
      // Plinth sits independently inside roomGroup, never nested inside sliding [cv-media-stand]
      expect(plinth.closest("[cv-media-stand]")).toBeNull();
      const [, py] = (plinth.getAttribute("position") ?? "").split(" ");
      expect(Number(py)).toBe(0);
    }

    const pedestals = roomEl.querySelectorAll(".cv-model-pedestal");
    expect(pedestals.length).toBeGreaterThanOrEqual(1);
  });
});
