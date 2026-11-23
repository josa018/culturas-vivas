import type { RoomEnvironmentId, RoomId } from "../../shared/room-catalog";

export interface AudioParamLike {
  value: number;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): void;
  setValueAtTime?(value: number, startTime: number): void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike;
  disconnect?(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  readonly threshold: AudioParamLike;
  readonly knee: AudioParamLike;
  readonly ratio: AudioParamLike;
  readonly attack: AudioParamLike;
  readonly release: AudioParamLike;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  readonly frequency: AudioParamLike;
}

export interface PannerNodeLike extends AudioNodeLike {
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  refDistance: number;
  rolloffFactor: number;
  readonly positionX?: AudioParamLike;
  readonly positionY?: AudioParamLike;
  readonly positionZ?: AudioParamLike;
  setPosition?(x: number, y: number, z: number): void;
}

export interface AudioListenerLike {
  readonly positionX?: AudioParamLike;
  readonly positionY?: AudioParamLike;
  readonly positionZ?: AudioParamLike;
  readonly forwardX?: AudioParamLike;
  readonly forwardY?: AudioParamLike;
  readonly forwardZ?: AudioParamLike;
  readonly upX?: AudioParamLike;
  readonly upY?: AudioParamLike;
  readonly upZ?: AudioParamLike;
  setPosition?(x: number, y: number, z: number): void;
  setOrientation?(
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ): void;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBuffer | null;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  start(when?: number, offset?: number, duration?: number): void;
  stop?(when?: number): void;
}

export interface AudioContextLike {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  readonly listener: AudioListenerLike;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close?(): Promise<void>;
  createGain(): GainNodeLike;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createPanner(): PannerNodeLike;
  createMediaElementSource(element: unknown): AudioNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer>;
}

export interface AudioBusTarget {
  readonly context: AudioContextLike;
  readonly inputNode: AudioNodeLike;
}

export interface MusicPlayerPort {
  connectBus(bus: AudioBusTarget | null): void;
  setActiveRoom(roomId: RoomId): void;
  setAudible(audible: boolean): void;
  onCurtainFadeOut(): void;
  onCurtainFadeIn(): void;
  stopAll(): void;
}

export const noopMusicPlayerPort: MusicPlayerPort = {
  connectBus: () => {},
  setActiveRoom: () => {},
  setAudible: () => {},
  onCurtainFadeOut: () => {},
  onCurtainFadeIn: () => {},
  stopAll: () => {},
};

export interface AmbiencePlayerPort {
  transitionToEnvironment(environmentId: RoomEnvironmentId): void;
  setAudible(audible: boolean): void;
  stopAll(): void;
}

export const noopAmbiencePlayerPort: AmbiencePlayerPort = {
  transitionToEnvironment: () => {},
  setAudible: () => {},
  stopAll: () => {},
};
