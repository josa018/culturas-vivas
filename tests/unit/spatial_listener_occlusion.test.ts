import { describe, it, expect, vi } from "vitest";
import { AUDIO_TOKENS } from "../../src/experience/audio/audio-constants";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import {
  SpatialMediaAudio,
  computeListenerOcclusionParams,
} from "../../src/experience/audio/spatial-media-audio";
import {
  createSpatialAudioListenerComponentDefinition,
  ensureSpatialAudioListener,
  readCameraListenerPose,
} from "../../src/experience/components/spatial-audio-listener";
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
} from "../../src/experience/audio/audio-types";

function createParam(initial = 0): AudioParamLike & {
  setTargetAtTime: ReturnType<typeof vi.fn>;
} {
  const param = {
    value: initial,
    setTargetAtTime: vi.fn((target: number) => {
      param.value = target;
    }),
    setValueAtTime: vi.fn((value: number) => {
      param.value = value;
    }),
  };
  return param;
}

function createMockAudioCtx() {
  const makeNode = (label: string) => ({
    label,
    connect: vi.fn((dest: AudioNodeLike) => dest),
    disconnect: vi.fn(),
  });
  const panner = {
    ...makeNode("panner"),
    panningModel: "equalpower" as PanningModelType,
    distanceModel: "inverse" as DistanceModelType,
    refDistance: 1,
    rolloffFactor: 1,
    positionX: createParam(0),
    positionY: createParam(0),
    positionZ: createParam(0),
  };
  const filter = {
    ...makeNode("filter"),
    type: "lowpass" as BiquadFilterType,
    frequency: createParam(20000),
  };
  const gains: Array<
    ReturnType<typeof makeNode> & { gain: ReturnType<typeof createParam> }
  > = [];

  const ctx: AudioContextLike = {
    state: "running",
    currentTime: 3.0,
    destination: makeNode("destination"),
    listener: {
      positionX: createParam(0),
      positionY: createParam(0),
      positionZ: createParam(0),
      forwardX: createParam(0),
      forwardY: createParam(0),
      forwardZ: createParam(-1),
      upX: createParam(0),
      upY: createParam(1),
      upZ: createParam(0),
    },
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    createGain: vi.fn(() => {
      const g = { ...makeNode("gain"), gain: createParam(1) };
      gains.push(g);
      return g;
    }),
    createDynamicsCompressor: vi.fn(() => ({
      ...makeNode("compressor"),
      threshold: createParam(0),
      knee: createParam(0),
      ratio: createParam(1),
      attack: createParam(0),
      release: createParam(0),
    })),
    createBiquadFilter: vi.fn(() => filter),
    createPanner: vi.fn(() => panner),
    createMediaElementSource: vi.fn(() => makeNode("mediaSource")),
    createBufferSource: vi.fn(() => ({
      ...makeNode("buf"),
      buffer: null,
      start: vi.fn(),
      stop: vi.fn(),
    })),
    decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
  };

  return { ctx, panner, filter, gains };
}

describe("Spatial Listener Pose & Behind-Listener Occlusion", () => {
  it("computes deterministic occlusion parameters for 0 deg, 45 deg, and 135 deg", () => {
    const front = computeListenerOcclusionParams(
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: -3.2 },
    );
    expect(front).toEqual({
      cutoffHz: AUDIO_TOKENS.OPEN_LOWPASS_HZ,
      gain: 1,
      occluded: false,
    });

    const angle45 = computeListenerOcclusionParams(
      { x: 0, y: 0, z: -1 },
      { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 },
    );
    expect(angle45).toEqual({
      cutoffHz: AUDIO_TOKENS.OPEN_LOWPASS_HZ,
      gain: 1,
      occluded: false,
    });

    const angle135 = computeListenerOcclusionParams(
      { x: 0, y: 0, z: -1 },
      { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
    );
    expect(angle135).toEqual({
      cutoffHz: AUDIO_TOKENS.OCCLUSION_LOWPASS_HZ,
      gain: AUDIO_TOKENS.OCCLUSION_GAIN,
      occluded: true,
    });
  });

  it("syncs AudioListener orientation and ramps occlusion filter targets when turning away", async () => {
    const map = new Map<string, string>();
    const prefs = new AudioPreferencesStore({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    });
    const mock = createMockAudioCtx();
    const engine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => mock.ctx,
    });
    await engine.unlockFromUserGesture();

    const spatial = new SpatialMediaAudio({ audioEngine: engine });
    spatial.attachVideoElement({});
    spatial.setStandWorldPosition({ x: 0, y: 1.65, z: -3.2 });

    // Turn 180 deg to face +Z
    spatial.updateListenerPose({
      position: { x: 0, y: 1.65, z: 0 },
      forward: { x: 0, y: 0, z: 1 },
      up: { x: 0, y: 1, z: 0 },
    });

    expect(mock.ctx.listener.forwardX?.value).toBe(0);
    expect(mock.ctx.listener.forwardY?.value).toBe(0);
    expect(mock.ctx.listener.forwardZ?.value).toBe(1);
    expect(mock.ctx.listener.upY?.value).toBe(1);

    expect(mock.filter.frequency.setTargetAtTime).toHaveBeenLastCalledWith(
      AUDIO_TOKENS.OCCLUSION_LOWPASS_HZ,
      mock.ctx.currentTime,
      AUDIO_TOKENS.OCCLUSION_TIME_CONSTANT_S,
    );
    const occlusionGain = mock.gains[mock.gains.length - 1];
    expect(occlusionGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      AUDIO_TOKENS.OCCLUSION_GAIN,
      mock.ctx.currentTime,
      AUDIO_TOKENS.OCCLUSION_TIME_CONSTANT_S,
    );
  });

  it("A-Frame tick component reads Three.js camera world pose and updates SpatialMediaAudio each frame", () => {
    const scene = document.createElement("a-scene") as HTMLElement & {
      camera?: unknown;
    };
    scene.camera = {
      getWorldPosition: (out: { x: number; y: number; z: number }) => {
        out.x = 0.1;
        out.y = 1.65;
        out.z = 0.2;
        return out;
      },
      getWorldDirection: (out: { x: number; y: number; z: number }) => {
        out.x = 1;
        out.y = 0;
        out.z = 0;
        return out;
      },
      getWorldQuaternion: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      up: {
        x: 0,
        y: 1,
        z: 0,
        clone: () => ({
          x: 0,
          y: 1,
          z: 0,
          applyQuaternion: function () {
            return this;
          },
          normalize: function () {
            return this;
          },
        }),
      },
    };

    const pose = readCameraListenerPose(scene);
    expect(pose).toEqual({
      position: { x: 0.1, y: 1.65, z: 0.2 },
      forward: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    });

    const listenerEl = ensureSpatialAudioListener(scene);
    expect(listenerEl).toBe(ensureSpatialAudioListener(scene));

    const updateSpy = vi.fn();
    const def = createSpatialAudioListenerComponentDefinition({
      getSpatialMediaAudio: () =>
        ({ updateListenerPose: updateSpy }) as unknown as SpatialMediaAudio,
    });
    const inst = { el: listenerEl };
    def.tick.call(inst);
    expect(updateSpy).toHaveBeenCalledWith(pose);
  });

  it("instantiates real AFRAME.THREE.Vector3 and Quaternion when available so Three.js setFromMatrixPosition succeeds", () => {
    class FakeThreeVec3 {
      public x: number;
      public y: number;
      public z: number;
      constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
      }
      public setFromMatrixPosition() {
        this.x = 0.25;
        this.y = 1.65;
        this.z = -0.1;
        return this;
      }
      public set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
      }
    }
    class FakeThreeQuat {
      public x = 0;
      public y = 0;
      public z = 0;
      public w = 1;
      public set(x: number, y: number, z: number, w: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
        return this;
      }
    }

    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      THREE: { Vector3: FakeThreeVec3, Quaternion: FakeThreeQuat },
    };

    try {
      const scene = document.createElement("a-scene") as HTMLElement & {
        camera?: unknown;
      };
      scene.camera = {
        getWorldPosition: (out: FakeThreeVec3) => out.setFromMatrixPosition(),
        getWorldDirection: (out: FakeThreeVec3) => out.set(0, 0, -1),
        getWorldQuaternion: (q: FakeThreeQuat) => q.set(0, 0, 0, 1),
        up: {
          x: 0,
          y: 1,
          z: 0,
          clone: () => ({
            x: 0,
            y: 1,
            z: 0,
            applyQuaternion: function () {
              return this;
            },
            normalize: function () {
              return this;
            },
          }),
        },
      };

      const pose = readCameraListenerPose(scene);
      expect(pose).toEqual({
        position: { x: 0.25, y: 1.65, z: -0.1 },
        forward: { x: 0, y: 0, z: -1 },
        up: { x: 0, y: 1, z: 0 },
      });
    } finally {
      delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    }
  });

  it("never inverts gaze forward when falling back to a non-camera a-camera Object3D", () => {
    const scene = document.createElement("a-scene");
    const camEl = document.createElement("a-camera") as HTMLElement & {
      object3D?: unknown;
      getObject3D?: (type: string) => unknown;
    };

    // Simulate THREE.Object3D (isCamera undefined) whose getWorldDirection returns +Z backward column
    camEl.object3D = {
      getWorldPosition: (out: { x: number; y: number; z: number }) => {
        out.x = 0;
        out.y = 1.65;
        out.z = 0;
        return out;
      },
      getWorldDirection: (out: { x: number; y: number; z: number }) => {
        // Object3D +Z when rig is rotated 180 deg points to -Z (opposite of camera gaze +Z)
        out.x = 0;
        out.y = 0;
        out.z = -1;
        return out;
      },
      getWorldQuaternion: () => ({ x: 0, y: 1, z: 0, w: 0 }),
      up: { x: 0, y: 1, z: 0 },
    };
    scene.appendChild(camEl);

    const pose = readCameraListenerPose(scene);
    expect(pose.forward).toEqual({ x: 0, y: 0, z: 1 });

    // When getObject3D('camera') is available on a-camera, prefer its Camera.getWorldDirection directly
    camEl.getObject3D = (type: string) =>
      type === "camera"
        ? {
            isCamera: true,
            getWorldPosition: (out: { x: number; y: number; z: number }) => {
              out.x = 0;
              out.y = 1.65;
              out.z = 0;
              return out;
            },
            getWorldDirection: (out: { x: number; y: number; z: number }) => {
              out.x = 0;
              out.y = 0;
              out.z = 1;
              return out;
            },
          }
        : null;

    expect(readCameraListenerPose(scene).forward).toEqual({
      x: 0,
      y: 0,
      z: 1,
    });
  });
});
