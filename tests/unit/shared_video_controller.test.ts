import { describe, expect, it, vi } from "vitest";
import { SHARED_VIDEO_ELEMENT_ID } from "../../src/experience/constants";
import {
  SharedVideoController,
  type DisposableVideoTexture,
  type VideoElementLike,
} from "../../src/experience/shared-video-controller";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";

function createTestPrefsStore(initialMediaMuted = true): AudioPreferencesStore {
  const map = new Map<string, string>();
  const store = new AudioPreferencesStore({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  });
  if (!initialMediaMuted) {
    store.syncMediaMuted(false);
  }
  return store;
}

function createMockVideoElement(overrides: Partial<VideoElementLike> = {}): {
  video: VideoElementLike;
  attributes: Map<string, string>;
} {
  const attributes = new Map<string, string>();
  const video: VideoElementLike = {
    id: "",
    src: "",
    muted: false,
    paused: true,
    loop: false,
    playsInline: false,
    crossOrigin: null,
    preload: "",
    style: {},
    setAttribute: vi.fn((name: string, value: string) => {
      attributes.set(name, value);
    }),
    removeAttribute: vi.fn((name: string) => {
      attributes.delete(name);
      if (name === "src") {
        video.src = "";
      }
    }),
    play: vi.fn(async () => {
      video.paused = false;
    }),
    pause: vi.fn(() => {
      video.paused = true;
    }),
    load: vi.fn(),
    ...overrides,
  };
  return { video, attributes };
}

function createMockTexture(): DisposableVideoTexture {
  return {
    needsUpdate: false,
    dispose: vi.fn(),
  };
}

describe("SharedVideoController", () => {
  it("creates a single mobile-safe video element configured with playsinline and crossorigin", () => {
    const { video, attributes } = createMockVideoElement();
    const factory = vi.fn(() => video);
    const controller = new SharedVideoController({ createVideoElement: factory });

    const first = controller.ensureVideoElement();
    const second = controller.ensureVideoElement();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.id).toBe(SHARED_VIDEO_ELEMENT_ID);
    expect(first.playsInline).toBe(true);
    expect(first.crossOrigin).toBe("anonymous");
    expect(attributes.get("playsinline")).toBe("");
    expect(attributes.get("webkit-playsinline")).toBe("");
    expect(attributes.get("crossorigin")).toBe("anonymous");
  });

  it("unlocks media playback on user gesture without leaking errors", async () => {
    const { video } = createMockVideoElement();
    const controller = new SharedVideoController({
      createVideoElement: () => video,
    });

    await controller.unlockFromUserGesture();

    expect(controller.isUnlocked()).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it("plays video texture, disposes previous textures, and auto-falls back to muted on NotAllowedError", async () => {
    const notAllowed = Object.assign(new Error("Autoplay blocked"), {
      name: "NotAllowedError",
    });
    const playSpy = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(notAllowed)
      .mockResolvedValueOnce(undefined);

    const { video } = createMockVideoElement({ play: playSpy });
    const tex1 = createMockTexture();
    const tex2 = createMockTexture();
    const textureFactory = vi
      .fn<(el: VideoElementLike) => DisposableVideoTexture>()
      .mockReturnValueOnce(tex1)
      .mockReturnValueOnce(tex2);
    const onStateChange = vi.fn();

    const prefs = createTestPrefsStore(false);
    const controller = new SharedVideoController({
      createVideoElement: () => video,
      createVideoTexture: textureFactory,
      onStateChange,
      preferencesStore: prefs,
    });

    const firstTex = await controller.playVideo("https://cdn.example.com/clip-1.mp4");

    expect(firstTex).toBe(tex1);
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(true);
    expect(controller.isMuted()).toBe(true);
    expect(prefs.getPreferences().mediaMuted).toBe(true);
    expect(controller.isPlaying()).toBe(true);
    expect(controller.getCurrentUrl()).toBe("https://cdn.example.com/clip-1.mp4");

    const secondTex = await controller.playVideo("https://cdn.example.com/clip-2.mp4");
    expect(secondTex).toBe(tex2);
    expect(tex1.dispose).toHaveBeenCalledTimes(1);
  });

  it("pauses, clears src, calls load(), and disposes texture on stopAndRelease()", async () => {
    const { video } = createMockVideoElement();
    const tex = createMockTexture();
    const controller = new SharedVideoController({
      createVideoElement: () => video,
      createVideoTexture: () => tex,
    });

    await controller.playVideo("https://cdn.example.com/clip-1.mp4");
    controller.stopAndRelease();

    expect(video.pause).toHaveBeenCalled();
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(video.src).toBe("");
    expect(video.load).toHaveBeenCalled();
    expect(tex.dispose).toHaveBeenCalledTimes(1);
    expect(controller.isPlaying()).toBe(false);
    expect(controller.getCurrentUrl()).toBeNull();
    expect(controller.getTexture()).toBeNull();
  });

  it("toggles pause/resume and mute state cleanly", async () => {
    const { video } = createMockVideoElement();
    const prefs = createTestPrefsStore(true);
    const controller = new SharedVideoController({
      createVideoElement: () => video,
      createVideoTexture: () => createMockTexture(),
      preferencesStore: prefs,
    });

    await controller.playVideo("https://cdn.example.com/clip-1.mp4");
    expect(controller.isMuted()).toBe(true);
    expect(await controller.togglePause()).toBe(false);
    expect(controller.isPlaying()).toBe(false);
    expect(video.pause).toHaveBeenCalled();

    expect(await controller.togglePause()).toBe(true);
    expect(controller.isPlaying()).toBe(true);

    expect(controller.toggleMute()).toBe(false);
    expect(video.muted).toBe(false);
    expect(controller.toggleMute()).toBe(true);
    expect(video.muted).toBe(true);
  });

  it("pauseIfPlaying pauses active playback without clearing src/texture and returns whether playback stopped", async () => {
    const { video } = createMockVideoElement();
    const tex = createMockTexture();
    const audioEngine = { setMediaPlaybackActive: vi.fn() } as unknown as import("../../src/experience/audio/audio-engine").AudioEngine;
    const onStateChange = vi.fn();

    const controller = new SharedVideoController({
      createVideoElement: () => video,
      createVideoTexture: () => tex,
      audioEngine,
      onStateChange,
    });

    // Returns false when idle
    expect(controller.pauseIfPlaying()).toBe(false);

    await controller.playVideo("https://cdn.example.com/clip-1.mp4");
    expect(controller.isPlaying()).toBe(true);

    onStateChange.mockClear();
    expect(controller.pauseIfPlaying()).toBe(true);
    expect(video.pause).toHaveBeenCalled();
    expect(video.src).toBe("https://cdn.example.com/clip-1.mp4");
    expect(video.removeAttribute).not.toHaveBeenCalledWith("src");
    expect(tex.dispose).not.toHaveBeenCalled();
    expect(controller.isPlaying()).toBe(false);
    expect(controller.getCurrentUrl()).toBe("https://cdn.example.com/clip-1.mp4");
    expect(controller.getTexture()).toBe(tex);
    expect(audioEngine.setMediaPlaybackActive).toHaveBeenLastCalledWith(false);
    expect(onStateChange).toHaveBeenCalledTimes(1);

    // Subsequent call when already paused returns false
    expect(controller.pauseIfPlaying()).toBe(false);
  });

  it("refuses playVideo and resume via togglePause when injected isExperienceActive returns false", async () => {
    const { video } = createMockVideoElement();
    let active = false;
    const controller = new SharedVideoController({
      createVideoElement: () => video,
      createVideoTexture: () => createMockTexture(),
      isExperienceActive: () => active,
    });

    const blockedTex = await controller.playVideo("https://cdn.example.com/clip-1.mp4");
    expect(blockedTex).toBeNull();
    expect(controller.isPlaying()).toBe(false);
    expect(video.play).not.toHaveBeenCalled();

    active = true;
    const activeTex = await controller.playVideo("https://cdn.example.com/clip-1.mp4");
    expect(activeTex).not.toBeNull();
    expect(controller.isPlaying()).toBe(true);

    expect(controller.pauseIfPlaying()).toBe(true);
    active = false;
    expect(await controller.togglePause()).toBe(false);
    expect(controller.isPlaying()).toBe(false);
  });

  it("assigns SRGBColorSpace and needsUpdate on VideoTexture created by default factory", async () => {
    const { video } = createMockVideoElement();
    const createdTextures: Array<{ colorSpace?: string; needsUpdate: boolean }> = [];
    class MockVideoTexture {
      public colorSpace = "";
      public needsUpdate = false;
      public dispose = vi.fn();
      constructor(_el: VideoElementLike) {
        createdTextures.push(this);
      }
    }

    const previousAframe = (globalThis as { AFRAME?: unknown }).AFRAME;
    (globalThis as { AFRAME?: unknown }).AFRAME = {
      THREE: {
        SRGBColorSpace: "srgb",
        VideoTexture: MockVideoTexture,
      },
    };

    try {
      const controller = new SharedVideoController({
        createVideoElement: () => video,
      });
      const texture = await controller.playVideo("https://cdn.example.com/sbs.mp4");

      expect(texture).not.toBeNull();
      expect(createdTextures).toHaveLength(1);
      expect(createdTextures[0]?.colorSpace).toBe("srgb");
      expect(createdTextures[0]?.needsUpdate).toBe(true);
    } finally {
      if (previousAframe === undefined) {
        delete (globalThis as { AFRAME?: unknown }).AFRAME;
      } else {
        (globalThis as { AFRAME?: unknown }).AFRAME = previousAframe;
      }
    }
  });
});
