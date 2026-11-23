import type { Vector3D } from "../constants";
import { AUDIO_TOKENS } from "./audio-constants";
import { AudioEngine, getSharedAudioEngine } from "./audio-engine";
import type {
  AudioNodeLike,
  BiquadFilterNodeLike,
  GainNodeLike,
  PannerNodeLike,
} from "./audio-types";

export interface ListenerPose {
  readonly position: Vector3D;
  readonly forward: Vector3D;
  readonly up: Vector3D;
}

export interface OcclusionParams {
  readonly cutoffHz: number;
  readonly gain: number;
  readonly occluded: boolean;
}

export interface SpatialMediaAudioOptions {
  readonly audioEngine?: AudioEngine;
}

const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * Pure angular occlusion evaluator: attenuates high frequencies when the stand is behind the listener.
 */
export function computeListenerOcclusionParams(
  cameraForward: Vector3D,
  standDirection: Vector3D,
): OcclusionParams {
  const fwdMag = Math.hypot(cameraForward.x, cameraForward.y, cameraForward.z);
  const dirMag = Math.hypot(
    standDirection.x,
    standDirection.y,
    standDirection.z,
  );
  if (fwdMag === 0 || dirMag === 0) {
    return {
      cutoffHz: AUDIO_TOKENS.OPEN_LOWPASS_HZ,
      gain: 1,
      occluded: false,
    };
  }
  const dot =
    (cameraForward.x * standDirection.x +
      cameraForward.y * standDirection.y +
      cameraForward.z * standDirection.z) /
    (fwdMag * dirMag);
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const angleDeg = Math.acos(clampedDot) * DEGREES_PER_RADIAN;
  const occluded = angleDeg > AUDIO_TOKENS.OCCLUSION_ANGLE_DEG;

  return {
    cutoffHz: occluded
      ? AUDIO_TOKENS.OCCLUSION_LOWPASS_HZ
      : AUDIO_TOKENS.OPEN_LOWPASS_HZ,
    gain: occluded ? AUDIO_TOKENS.OCCLUSION_GAIN : 1,
    occluded,
  };
}

/**
 * Routes the single shared <video> decoder through one HRTF PannerNode and behind-listener occlusion filter.
 */
export class SpatialMediaAudio {
  private readonly audioEngine: AudioEngine;
  private attachedVideo: unknown = null;
  private pendingVideo: unknown = null;
  private sourceNode: AudioNodeLike | null = null;
  private pannerNode: PannerNodeLike | null = null;
  private occlusionFilter: BiquadFilterNodeLike | null = null;
  private occlusionGain: GainNodeLike | null = null;
  private standPosition: Vector3D = { x: 0, y: 0, z: -1 };
  private listenerPosition: Vector3D = { x: 0, y: 0, z: 0 };
  private listenerForward: Vector3D = { x: 0, y: 0, z: -1 };
  private lastOccluded: boolean | null = null;
  private unsubscribeUnlock: (() => void) | null = null;

  constructor(options: SpatialMediaAudioOptions = {}) {
    this.audioEngine = options.audioEngine ?? getSharedAudioEngine();
    this.unsubscribeUnlock = this.audioEngine.onUnlock?.(() => {
      this.ensureConnected();
    }) ?? null;
  }

  public dispose(): void {
    this.unsubscribeUnlock?.();
    this.unsubscribeUnlock = null;
  }

  public attachVideoElement(video: unknown): boolean {
    if (!video) {
      return false;
    }
    this.pendingVideo = video;
    return this.ensureConnected();
  }

  public ensureConnected(): boolean {
    if (!this.pendingVideo) {
      return false;
    }
    if (this.attachedVideo === this.pendingVideo && this.sourceNode) {
      return true;
    }
    const mediaBus = this.audioEngine.getMediaBus();
    if (!mediaBus) {
      return false;
    }
    if (this.attachedVideo === this.pendingVideo && this.sourceNode) {
      return true;
    }

    const ctx = mediaBus.context;
    const source = ctx.createMediaElementSource(this.pendingVideo);
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = AUDIO_TOKENS.PANNER_REF_DISTANCE_M;
    panner.rolloffFactor = AUDIO_TOKENS.PANNER_ROLLOFF_FACTOR;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = AUDIO_TOKENS.OPEN_LOWPASS_HZ;

    const occlusionGain = ctx.createGain();
    occlusionGain.gain.value = 1;

    source.connect(panner);
    panner.connect(filter);
    filter.connect(occlusionGain);
    occlusionGain.connect(mediaBus.inputNode);

    this.attachedVideo = this.pendingVideo;
    this.sourceNode = source;
    this.pannerNode = panner;
    this.occlusionFilter = filter;
    this.occlusionGain = occlusionGain;
    this.lastOccluded = null;

    this.applyStandPositionToPanner();
    this.applyOcclusion();
    return true;
  }

  public setStandWorldPosition(position: Vector3D): void {
    this.standPosition = { ...position };
    this.applyStandPositionToPanner();
    this.applyOcclusion();
  }

  public updateListenerPose(pose: ListenerPose): void {
    this.listenerPosition = { ...pose.position };
    this.listenerForward = { ...pose.forward };

    const ctx = this.audioEngine.getAudioContext();
    if (ctx) {
      const listener = ctx.listener;
      if (listener.positionX && listener.positionY && listener.positionZ) {
        listener.positionX.value = pose.position.x;
        listener.positionY.value = pose.position.y;
        listener.positionZ.value = pose.position.z;
      } else {
        listener.setPosition?.(
          pose.position.x,
          pose.position.y,
          pose.position.z,
        );
      }

      if (
        listener.forwardX &&
        listener.forwardY &&
        listener.forwardZ &&
        listener.upX &&
        listener.upY &&
        listener.upZ
      ) {
        listener.forwardX.value = pose.forward.x;
        listener.forwardY.value = pose.forward.y;
        listener.forwardZ.value = pose.forward.z;
        listener.upX.value = pose.up.x;
        listener.upY.value = pose.up.y;
        listener.upZ.value = pose.up.z;
      } else {
        listener.setOrientation?.(
          pose.forward.x,
          pose.forward.y,
          pose.forward.z,
          pose.up.x,
          pose.up.y,
          pose.up.z,
        );
      }
    }

    this.applyOcclusion();
  }

  private applyStandPositionToPanner(): void {
    if (!this.pannerNode) {
      return;
    }
    if (
      this.pannerNode.positionX &&
      this.pannerNode.positionY &&
      this.pannerNode.positionZ
    ) {
      this.pannerNode.positionX.value = this.standPosition.x;
      this.pannerNode.positionY.value = this.standPosition.y;
      this.pannerNode.positionZ.value = this.standPosition.z;
    } else {
      this.pannerNode.setPosition?.(
        this.standPosition.x,
        this.standPosition.y,
        this.standPosition.z,
      );
    }
  }

  private applyOcclusion(): void {
    const ctx = this.audioEngine.getAudioContext();
    if (!ctx || !this.occlusionFilter || !this.occlusionGain) {
      return;
    }
    const standDir: Vector3D = {
      x: this.standPosition.x - this.listenerPosition.x,
      y: this.standPosition.y - this.listenerPosition.y,
      z: this.standPosition.z - this.listenerPosition.z,
    };
    const params = computeListenerOcclusionParams(
      this.listenerForward,
      standDir,
    );
    if (this.lastOccluded === params.occluded) {
      return;
    }
    this.lastOccluded = params.occluded;
    const now = ctx.currentTime;
    this.occlusionFilter.frequency.setTargetAtTime(
      params.cutoffHz,
      now,
      AUDIO_TOKENS.OCCLUSION_TIME_CONSTANT_S,
    );
    this.occlusionGain.gain.setTargetAtTime(
      params.gain,
      now,
      AUDIO_TOKENS.OCCLUSION_TIME_CONSTANT_S,
    );
  }
}

let sharedSpatialMediaAudio = new SpatialMediaAudio();

export function getSharedSpatialMediaAudio(): SpatialMediaAudio {
  return sharedSpatialMediaAudio;
}

export function setSharedSpatialMediaAudio(
  spatial: SpatialMediaAudio | null,
): void {
  sharedSpatialMediaAudio = spatial ?? new SpatialMediaAudio();
}
