import { describe, expect, it, vi } from "vitest";
import { SHARED_VIDEO_ELEMENT_ID } from "../../src/experience/constants";
import {
  SharedVideoController,
  type DisposableVideoTexture,
  type VideoElementLike,
} from "../../src/experience/shared-video-controller";

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

    const controller = new SharedVideoController({
      createVideoElement: () => video,
      createVideoTexture: textureFactory,
      onStateChange,
    });

    const firstTex = await controller.playVideo("https://cdn.example.com/clip-1.mp4");

    expect(firstTex).toBe(tex1);
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(true);
    expect(controller.isMuted()).toBe(true);
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
    const controller = new SharedVideoController({
      createVideoElement: () => video,
      createVideoTexture: () => createMockTexture(),
    });

    await controller.playVideo("https://cdn.example.com/clip-1.mp4");
    expect(await controller.togglePause()).toBe(false);
    expect(controller.isPlaying()).toBe(false);
    expect(video.pause).toHaveBeenCalled();

    expect(await controller.togglePause()).toBe(true);
    expect(controller.isPlaying()).toBe(true);

    expect(controller.toggleMute()).toBe(true);
    expect(video.muted).toBe(true);
    expect(controller.toggleMute()).toBe(false);
    expect(video.muted).toBe(false);
  });
});
