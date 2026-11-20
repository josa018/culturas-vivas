import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { RENDERER_QUALITY_TOKENS } from "../../src/experience/constants";
import {
  computeClampedPixelRatio,
  computeXrFramebufferScaleFactor,
} from "../../src/experience/renderer-quality";
import {
  createRendererQualityComponentDefinition,
  registerRendererQualityComponent,
  type RendererQualityComponentInstance,
} from "../../src/experience/components/renderer-quality";

describe("Renderer Quality & Anti-Aliasing", () => {
  afterEach(() => {
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    vi.restoreAllMocks();
  });

  it("clamps high-DPR mobile pixel ratios while preserving desktop native ratios and handling invalid inputs", () => {
    expect(RENDERER_QUALITY_TOKENS.MOBILE_MAX_PIXEL_RATIO).toBe(1.75);
    expect(RENDERER_QUALITY_TOKENS.DESKTOP_MAX_PIXEL_RATIO).toBe(2);
    expect(RENDERER_QUALITY_TOKENS.XR_MOBILE_MAX_FRAMEBUFFER_SCALE).toBe(1.15);
    expect(RENDERER_QUALITY_TOKENS.XR_DESKTOP_MAX_FRAMEBUFFER_SCALE).toBe(1.25);
    expect(RENDERER_QUALITY_TOKENS.TEXTURE_ANISOTROPY).toBe(4);
    expect(RENDERER_QUALITY_TOKENS.CIRCLE_SEGMENTS).toBe(48);

    expect(computeClampedPixelRatio(3, true)).toBe(1.75);
    expect(computeClampedPixelRatio(2, false)).toBe(2);
    expect(computeClampedPixelRatio(1, true)).toBe(1);
    expect(computeClampedPixelRatio(Number.NaN, true)).toBe(1);
    expect(computeClampedPixelRatio(-2, false)).toBe(1);

    expect(computeXrFramebufferScaleFactor(3, true)).toBe(1.15);
    expect(computeXrFramebufferScaleFactor(2, false)).toBe(1.25);
    expect(computeXrFramebufferScaleFactor(1, true)).toBe(1);
    expect(computeXrFramebufferScaleFactor(Number.NaN, true)).toBe(1);
    expect(computeXrFramebufferScaleFactor(-1, false)).toBe(1);
  });

  it("cv-renderer-quality applies clamped pixel ratio and WebXR framebuffer scale across init, renderstart, enter-vr, and exit-vr", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
      components: {},
    };

    registerRendererQualityComponent();
    expect(registered["cv-renderer-quality"]).toBeDefined();

    const setPixelRatio = vi.fn();
    const setFramebufferScaleFactor = vi.fn();
    const sceneEl = document.createElement("a-scene") as HTMLElement & {
      renderer?: {
        setPixelRatio?: (dpr: number) => void;
        xr?: { setFramebufferScaleFactor?: (scale: number) => void };
      };
    };
    sceneEl.renderer = {
      setPixelRatio,
      xr: { setFramebufferScaleFactor },
    };

    const def = createRendererQualityComponentDefinition({
      getDevicePixelRatio: () => 3,
      isMobileDevice: () => true,
    });
    const instance = Object.create(def) as RendererQualityComponentInstance;
    instance.el = sceneEl;
    instance.init();

    expect(setPixelRatio).toHaveBeenCalledTimes(1);
    expect(setPixelRatio).toHaveBeenCalledWith(1.75);

    sceneEl.dispatchEvent(new Event("renderstart"));
    expect(setPixelRatio).toHaveBeenCalledTimes(2);
    expect(setPixelRatio).toHaveBeenLastCalledWith(1.75);

    sceneEl.dispatchEvent(new Event("enter-vr"));
    expect(setFramebufferScaleFactor).toHaveBeenCalledTimes(1);
    expect(setFramebufferScaleFactor).toHaveBeenCalledWith(1.15);

    sceneEl.dispatchEvent(new Event("exit-vr"));
    expect(setPixelRatio).toHaveBeenCalledTimes(3);
    expect(setPixelRatio).toHaveBeenLastCalledWith(1.75);

    instance.remove();
  });

  it("index.html configures anti-aliased renderer attributes, zero foveation, tight camera near/far, and cv-renderer-quality on a-scene", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain("antialias: true");
    expect(html).toContain("anisotropy: 4");
    expect(html).toContain("alpha: false");
    expect(html).toContain("toneMapping: ACESFilmic");
    expect(html).toContain("foveationLevel: 0");
    expect(html).toContain("cv-renderer-quality");
    expect(html).toMatch(/<a-camera[^>]*near="0\.1"/);
    expect(html).toMatch(/<a-camera[^>]*far="80"/);
  });
});
