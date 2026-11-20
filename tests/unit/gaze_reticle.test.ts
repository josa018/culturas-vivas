import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CURTAIN_RENDER_ORDER,
  INSPECTION_TIMINGS,
  RETICLE_TOKENS,
} from "../../src/experience/constants";
import { computeReticleProgress } from "../../src/experience/gaze-reticle-state";
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

  it("updates room accent color via setAccentColor and triggers click confirmation pulse", () => {
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

    cursorEl.dispatchEvent(new Event("fusing"));
    cursorEl.dispatchEvent(new Event("click"));
    expect(instance.reticleState.isFusing).toBe(false);
    expect(instance.confirmRingEl?.getAttribute("animation__reticle_pulse")).toContain(
      `dur: ${RETICLE_TOKENS.CONFIRM_PULSE_MS}`,
    );

    instance.remove();
  });

  it("index.html attaches cv-gaze-reticle to a-cursor", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain("cv-gaze-reticle");
  });
});
