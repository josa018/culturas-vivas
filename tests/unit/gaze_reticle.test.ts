import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CURTAIN_RENDER_ORDER,
  INSPECTION_TIMINGS,
  InspectionState,
  RETICLE_TOKENS,
} from "../../src/experience/constants";
import {
  computeReticleDepthTransform,
  computeReticleProgress,
  evaluateReticleVisibilityMode,
} from "../../src/experience/gaze-reticle-state";
import {
  createGazeReticleComponentDefinition,
  registerGazeReticleComponent,
  type GazeReticleComponentInstance,
  type GazeReticleEntity,
} from "../../src/experience/components/gaze-reticle";

describe("Gaze-Fuse Radial Progress Reticle (cv-gaze-reticle)", () => {
  afterEach(() => {
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    delete (globalThis as unknown as { THREE?: unknown }).THREE;
    vi.restoreAllMocks();
  });

  it("computes clamped normalized dwell fraction across boundary elapsed times", () => {
    const fuseMs = INSPECTION_TIMINGS.FUSE_TIMEOUT_MS;
    expect(fuseMs).toBe(1500);
    expect(computeReticleProgress(0, fuseMs)).toBe(0);
    expect(computeReticleProgress(750, fuseMs)).toBe(0.5);
    expect(computeReticleProgress(1800, fuseMs)).toBe(1);
    expect(computeReticleProgress(-50, fuseMs)).toBe(0);
    expect(computeReticleProgress(500, 0)).toBe(1);
  });

  it("fills radial arc across fuse dwell, enforces renderOrder 9999, and resets immediately on state-removed or mouseleave", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
      components: {},
    };

    registerGazeReticleComponent();
    expect(registered["cv-gaze-reticle"]).toBeDefined();

    let now = 1000;
    const cursorEl = document.createElement("a-cursor") as unknown as GazeReticleEntity;
    const def = createGazeReticleComponentDefinition({
      nowMs: () => now,
    });

    const instance = Object.create(def) as GazeReticleComponentInstance;
    instance.el = cursorEl;
    instance.data = {
      fuseTimeout: INSPECTION_TIMINGS.FUSE_TIMEOUT_MS,
      accentColor: RETICLE_TOKENS.DEFAULT_ACCENT_COLOR,
    };

    // Attach mock object3D children to verify renderOrder propagation on object3dset
    const mockChildNode = { renderOrder: 0 };
    cursorEl.object3D = {
      renderOrder: 0,
      traverse: (cb: (node: unknown) => void) => {
        cb(cursorEl.object3D);
        cb(mockChildNode);
      },
    };

    instance.init();

    expect(RETICLE_TOKENS.RENDER_ORDER).toBe(9999);
    expect(RETICLE_TOKENS.RENDER_ORDER).toBeLessThan(CURTAIN_RENDER_ORDER);
    expect(instance.progressRingEl).not.toBeNull();
    expect(cursorEl.object3D.renderOrder).toBe(RETICLE_TOKENS.RENDER_ORDER);
    expect(mockChildNode.renderOrder).toBe(RETICLE_TOKENS.RENDER_ORDER);
    expect(instance.progressRingEl?.getAttribute("material")).toContain(
      "depthTest: false",
    );

    cursorEl.dispatchEvent(new Event("fusing"));
    expect(instance.reticleState.isFusing).toBe(true);

    now = 1750;
    instance.tick();
    expect(instance.progressRingEl?.getAttribute("geometry")).toContain(
      "thetaLength: 180",
    );
    expect(instance.progressRingEl?.getAttribute("visible")).toBe("true");

    // Simulate fast tap cancellation from cv-vr-tap-trigger removing cursor-fusing state
    cursorEl.dispatchEvent(
      new CustomEvent("state-removed", { detail: { state: "cursor-fusing" } }),
    );
    expect(instance.reticleState.isFusing).toBe(false);
    expect(instance.progressRingEl?.getAttribute("geometry")).toContain(
      "thetaLength: 0",
    );
    expect(instance.progressRingEl?.getAttribute("visible")).toBe("false");

    // Re-fuse then leave target
    now = 2000;
    cursorEl.dispatchEvent(new Event("fusing"));
    now = 2375;
    instance.tick();
    expect(instance.progressRingEl?.getAttribute("geometry")).toContain(
      "thetaLength: 90",
    );
    cursorEl.dispatchEvent(new Event("mouseleave"));
    expect(instance.reticleState.isFusing).toBe(false);
    expect(instance.progressRingEl?.getAttribute("geometry")).toContain(
      "thetaLength: 0",
    );

    instance.remove();
  });

  it("updates room accent color via setAccentColor and triggers click confirmation pulse without hover SFX", async () => {
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: vi.fn(),
      components: {},
    };
    const cursorEl = document.createElement("a-cursor") as unknown as GazeReticleEntity;
    const def = createGazeReticleComponentDefinition();
    const instance = Object.create(def) as GazeReticleComponentInstance;
    instance.el = cursorEl;
    instance.data = {
      fuseTimeout: INSPECTION_TIMINGS.FUSE_TIMEOUT_MS,
      accentColor: RETICLE_TOKENS.DEFAULT_ACCENT_COLOR,
    };
    instance.init();

    instance.setAccentColor("#D99B26");
    expect(instance.progressRingEl?.getAttribute("material")).toContain(
      "color: #D99B26",
    );
    expect(instance.confirmRingEl?.getAttribute("material")).toContain(
      "color: #D99B26",
    );

    const { getSharedSfxPlayer } = await import(
      "../../src/experience/audio/sfx-player"
    );
    const { SfxId } = await import("../../src/experience/audio/audio-constants");
    const sfxSpy = vi.spyOn(getSharedSfxPlayer(), "play");

    cursorEl.dispatchEvent(new Event("fusing"));
    expect(sfxSpy).not.toHaveBeenCalledWith(SfxId.RETICLE_HOVER);
    cursorEl.dispatchEvent(new Event("click"));
    expect(sfxSpy).toHaveBeenCalledWith(SfxId.RETICLE_FUSE);
    expect(instance.reticleState.isFusing).toBe(false);
    expect(instance.confirmRingEl?.getAttribute("animation__reticle_pulse")).toContain(
      `dur: ${RETICLE_TOKENS.CONFIRM_PULSE_MS}`,
    );

    instance.remove();
  });

  it("index.html attaches cv-gaze-reticle to a-cursor with origin position 0 0 0", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain("cv-gaze-reticle");
    expect(html).toMatch(/<a-cursor[^>]*position="0 0 0"/);
  });

  it("updates reticle group depth/scale dynamically and applies Cinema Mode auto-hide and wake transitions in tick()", () => {
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: vi.fn(),
      components: {},
    };
    let now = 1000;
    let inspectionState: InspectionState = InspectionState.IDLE;
    let clickableDistance: number | null = 1.43;
    let wakeDistance: number | null = null;

    const cursorEl = document.createElement("a-cursor") as unknown as GazeReticleEntity;
    const def = createGazeReticleComponentDefinition({
      nowMs: () => now,
      getInspectionState: () => inspectionState,
      getRaycasterIntersection: () => clickableDistance,
      getWakeIntersection: () => wakeDistance,
    });
    const instance = Object.create(def) as GazeReticleComponentInstance;
    instance.el = cursorEl;
    instance.data = {
      fuseTimeout: INSPECTION_TIMINGS.FUSE_TIMEOUT_MS,
      accentColor: RETICLE_TOKENS.DEFAULT_ACCENT_COLOR,
    };
    instance.init();

    // Gallery surface hit -> 1.43 - 0.02 = 1.41 m
    instance.tick();
    expect(instance.containerEl?.getAttribute("visible")).toBe("true");
    expect(instance.containerEl?.getAttribute("position")).toBe("0 0 -1.41");
    expect(instance.containerEl?.getAttribute("scale")).toBe("1.41 1.41 1.41");

    // Enter inspection over video without hitting clickable or wake zone
    inspectionState = InspectionState.INSPECTING;
    clickableDistance = null;
    wakeDistance = null;
    now = 1100;
    instance.tick();
    expect(instance.containerEl?.getAttribute("visible")).toBe("true");
    expect(instance.containerEl?.getAttribute("position")).toBe(
      `0 0 -${RETICLE_TOKENS.REST_DEPTH_M}`,
    );

    // After 300ms -> Cinema Mode hides reticle
    now = 1400;
    instance.tick();
    expect(instance.containerEl?.getAttribute("visible")).toBe("false");

    // Hover wake band near control bar -> immediately wakes as GUIDE
    wakeDistance = 1.47;
    now = 1450;
    instance.tick();
    expect(instance.containerEl?.getAttribute("visible")).toBe("true");
    expect(instance.containerEl?.getAttribute("position")).toBe("0 0 -1.45");
    expect(instance.idleDotEl?.getAttribute("material")).toContain(
      `opacity: ${RETICLE_TOKENS.GUIDE_OPACITY}`,
    );

    // Hover actual button -> ACTIVE full opacity
    clickableDistance = 1.44;
    wakeDistance = null;
    now = 1500;
    instance.tick();
    expect(instance.idleDotEl?.getAttribute("material")).toContain("opacity: 0.95");

    // Switching to 2D hides reticle immediately
    instance.setViewMode("2d");
    expect(instance.containerEl?.getAttribute("visible")).toBe("false");

    instance.remove();
  });

  it("auto-hides reticle globally during InspectionState.IDLE after 300ms and wakes on wake zones and clickables", () => {
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: vi.fn(),
      components: {},
    };
    let now = 1000;
    let clickableDistance: number | null = null;
    let wakeDistance: number | null = null;

    const cursorEl = document.createElement("a-cursor") as unknown as GazeReticleEntity;
    const def = createGazeReticleComponentDefinition({
      nowMs: () => now,
      getInspectionState: () => InspectionState.IDLE,
      getRaycasterIntersection: () => clickableDistance,
      getWakeIntersection: () => wakeDistance,
    });
    const instance = Object.create(def) as GazeReticleComponentInstance;
    instance.el = cursorEl;
    instance.data = {
      fuseTimeout: INSPECTION_TIMINGS.FUSE_TIMEOUT_MS,
      accentColor: RETICLE_TOKENS.DEFAULT_ACCENT_COLOR,
    };
    instance.init();

    // Looking at empty space in IDLE starts grace delay in GUIDE
    instance.tick();
    expect(instance.visibilityMode).toBe("GUIDE");
    expect(instance.containerEl?.getAttribute("visible")).toBe("true");
    expect(instance.idleDotEl?.getAttribute("material")).toContain(
      `opacity: ${RETICLE_TOKENS.GUIDE_OPACITY}`,
    );

    // After 300ms on empty space while IDLE -> hidden
    now = 1300;
    instance.tick();
    expect(instance.visibilityMode).toBe("CINEMA_HIDDEN");
    expect(instance.containerEl?.getAttribute("visible")).toBe("false");

    // Looking at a wake zone while IDLE wakes reticle as GUIDE
    wakeDistance = 2.0;
    now = 1350;
    instance.tick();
    expect(instance.visibilityMode).toBe("GUIDE");
    expect(instance.containerEl?.getAttribute("visible")).toBe("true");
    expect(instance.containerEl?.getAttribute("position")).toBe("0 0 -1.98");

    // Looking at a clickable portal/exhibit/button wakes full ACTIVE opacity
    clickableDistance = 1.5;
    wakeDistance = null;
    now = 1400;
    instance.tick();
    expect(instance.visibilityMode).toBe("ACTIVE");
    expect(instance.idleDotEl?.getAttribute("material")).toContain("opacity: 0.95");

    instance.remove();
  });

  it("computes surface-conforming reticle depth, negative z offset, and constant angular scale", () => {
    expect(computeReticleDepthTransform(1.43)).toEqual({
      depthM: 1.41,
      z: -1.41,
      scale: 1.41,
    });
    expect(computeReticleDepthTransform(null)).toEqual({
      depthM: RETICLE_TOKENS.REST_DEPTH_M,
      z: -RETICLE_TOKENS.REST_DEPTH_M,
      scale: RETICLE_TOKENS.REST_DEPTH_M,
    });
    expect(computeReticleDepthTransform(0.3)).toEqual({
      depthM: RETICLE_TOKENS.MIN_DEPTH_M,
      z: -RETICLE_TOKENS.MIN_DEPTH_M,
      scale: RETICLE_TOKENS.MIN_DEPTH_M,
    });
    expect(computeReticleDepthTransform(8.2)).toEqual({
      depthM: RETICLE_TOKENS.MAX_DEPTH_M,
      z: -RETICLE_TOKENS.MAX_DEPTH_M,
      scale: RETICLE_TOKENS.MAX_DEPTH_M,
    });
  });

  it("evaluates global auto-hide visibility states across 2D, clickable/wake zones, and 300ms delay for both browsing and inspection", () => {
    expect(
      evaluateReticleVisibilityMode({
        viewMode: "2d",
        isInspecting: false,
        hasClickableHit: true,
        hasWakeZoneHit: false,
        isFusing: false,
        nonInteractiveSinceMs: null,
        nowMs: 1000,
      }),
    ).toBe("HIDDEN");

    // Browsing (isInspecting: false): grace window stays GUIDE < 300ms and hides at >= 300ms
    expect(
      evaluateReticleVisibilityMode({
        viewMode: "vr",
        isInspecting: false,
        hasClickableHit: false,
        hasWakeZoneHit: false,
        isFusing: false,
        nonInteractiveSinceMs: 1000,
        nowMs: 1200,
      }),
    ).toBe("GUIDE");

    expect(
      evaluateReticleVisibilityMode({
        viewMode: "vr",
        isInspecting: false,
        hasClickableHit: false,
        hasWakeZoneHit: false,
        isFusing: false,
        nonInteractiveSinceMs: 1000,
        nowMs: 1300,
      }),
    ).toBe("CINEMA_HIDDEN");

    expect(
      evaluateReticleVisibilityMode({
        viewMode: "vr",
        isInspecting: false,
        hasClickableHit: false,
        hasWakeZoneHit: true,
        isFusing: false,
        nonInteractiveSinceMs: 500,
        nowMs: 1500,
      }),
    ).toBe("GUIDE");

    expect(
      evaluateReticleVisibilityMode({
        viewMode: "vr",
        isInspecting: false,
        hasClickableHit: true,
        hasWakeZoneHit: false,
        isFusing: false,
        nonInteractiveSinceMs: 500,
        nowMs: 1500,
      }),
    ).toBe("ACTIVE");

    expect(
      evaluateReticleVisibilityMode({
        viewMode: "vr",
        isInspecting: true,
        hasClickableHit: true,
        hasWakeZoneHit: false,
        isFusing: false,
        nonInteractiveSinceMs: 500,
        nowMs: 1500,
      }),
    ).toBe("ACTIVE");

    expect(
      evaluateReticleVisibilityMode({
        viewMode: "vr",
        isInspecting: true,
        hasClickableHit: false,
        hasWakeZoneHit: true,
        isFusing: false,
        nonInteractiveSinceMs: 500,
        nowMs: 1500,
      }),
    ).toBe("GUIDE");

    expect(
      evaluateReticleVisibilityMode({
        viewMode: "vr",
        isInspecting: true,
        hasClickableHit: false,
        hasWakeZoneHit: false,
        isFusing: false,
        nonInteractiveSinceMs: 1000,
        nowMs: 1200,
      }),
    ).toBe("GUIDE");

    expect(
      evaluateReticleVisibilityMode({
        viewMode: "vr",
        isInspecting: true,
        hasClickableHit: false,
        hasWakeZoneHit: false,
        isFusing: false,
        nonInteractiveSinceMs: 1000,
        nowMs: 1300,
      }),
    ).toBe("CINEMA_HIDDEN");
  });
});
