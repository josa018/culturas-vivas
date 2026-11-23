import type { RoomEnvironmentId } from "../../shared/room-catalog";
import { AMBIENT_MANIFEST, AUDIO_TOKENS } from "./audio-constants";
import { AudioEngine, getSharedAudioEngine } from "./audio-engine";
import type {
  AmbiencePlayerPort,
  AudioNodeLike,
  GainNodeLike,
} from "./audio-types";

export interface AmbientAudioElementLike {
  src: string;
  loop: boolean;
  crossOrigin: string | null;
  preload: string;
  volume: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

export interface AmbiencePlayerOptions {
  readonly audioEngine?: AudioEngine;
  readonly createAudioElement?: () => AmbientAudioElementLike | null;
  readonly manifest?: Readonly<Record<RoomEnvironmentId, string>>;
}

interface AmbientSlot {
  readonly element: AmbientAudioElementLike;
  sourceNode: AudioNodeLike | null;
  gainNode: GainNodeLike | null;
  environmentId: RoomEnvironmentId | null;
}

function defaultCreateAmbientAudio(): AmbientAudioElementLike | null {
  if (typeof document === "undefined") {
    return null;
  }
  const el = document.createElement("audio");
  return el as unknown as AmbientAudioElementLike;
}

/**
 * Plays seamless CC0 biome ambient loops routed through sfxGain with curtain crossfading.
 */
export class AmbiencePlayer implements AmbiencePlayerPort {
  private readonly audioEngine: AudioEngine;
  private readonly createAudioElement: () => AmbientAudioElementLike | null;
  private readonly manifest: Readonly<Record<RoomEnvironmentId, string>>;

  private readonly slots: AmbientSlot[] = [];
  private activeSlotIndex = -1;
  private currentEnvironment: RoomEnvironmentId | null = null;
  private audible = false;

  constructor(options: AmbiencePlayerOptions = {}) {
    this.audioEngine = options.audioEngine ?? getSharedAudioEngine();
    this.createAudioElement =
      options.createAudioElement ?? defaultCreateAmbientAudio;
    this.manifest = options.manifest ?? AMBIENT_MANIFEST;
  }

  public transitionToEnvironment(environmentId: RoomEnvironmentId): void {
    const previousEnv = this.currentEnvironment;
    this.currentEnvironment = environmentId;

    if (!this.audible) {
      return;
    }

    if (
      previousEnv === environmentId &&
      this.activeSlotIndex >= 0 &&
      !this.slots[this.activeSlotIndex]?.element.paused
    ) {
      return;
    }

    this.startEnvironmentSlot(environmentId);
  }

  public setAudible(audible: boolean): void {
    if (this.audible === audible) {
      return;
    }
    this.audible = audible;
    if (!audible) {
      this.pauseAllSlots();
      return;
    }
    if (this.currentEnvironment) {
      const activeSlot =
        this.activeSlotIndex >= 0 ? this.slots[this.activeSlotIndex] : null;
      if (
        activeSlot &&
        activeSlot.environmentId === this.currentEnvironment
      ) {
        this.ensureSlotGraph(activeSlot);
        this.rampSlotGain(activeSlot, AUDIO_TOKENS.AMBIENCE_GAIN);
        void activeSlot.element.play().catch(() => {});
      } else {
        this.startEnvironmentSlot(this.currentEnvironment);
      }
    }
  }

  public stopAll(): void {
    this.audible = false;
    this.pauseAllSlots();
  }

  private startEnvironmentSlot(environmentId: RoomEnvironmentId): void {
    const url = this.manifest[environmentId];
    if (!url) {
      return;
    }

    const outgoingIndex = this.activeSlotIndex;
    const outgoingSlot =
      outgoingIndex >= 0 ? this.slots[outgoingIndex] : undefined;

    const incomingIndex = this.acquireNextSlotIndex(outgoingIndex);
    if (incomingIndex < 0) {
      return;
    }
    const incomingSlot = this.slots[incomingIndex]!;

    if (outgoingSlot && outgoingSlot !== incomingSlot) {
      this.rampSlotGain(outgoingSlot, 0);
      outgoingSlot.element.pause();
    }

    this.ensureSlotGraph(incomingSlot);
    if (incomingSlot.element.src !== url) {
      incomingSlot.element.src = url;
    }
    incomingSlot.element.loop = true;
    incomingSlot.element.crossOrigin = "anonymous";
    incomingSlot.element.preload = "auto";
    incomingSlot.environmentId = environmentId;
    this.activeSlotIndex = incomingIndex;

    if (incomingSlot.gainNode) {
      incomingSlot.gainNode.gain.value = 0;
    }
    this.rampSlotGain(incomingSlot, AUDIO_TOKENS.AMBIENCE_GAIN);
    void incomingSlot.element.play().catch(() => {});
  }

  private acquireNextSlotIndex(outgoingIndex: number): number {
    const candidateIndex = outgoingIndex === 0 ? 1 : 0;
    if (this.slots[candidateIndex]) {
      return candidateIndex;
    }
    if (this.slots.length < 2) {
      const el = this.createAudioElement();
      if (!el) {
        return -1;
      }
      this.slots.push({
        element: el,
        sourceNode: null,
        gainNode: null,
        environmentId: null,
      });
      return this.slots.length - 1;
    }
    return candidateIndex;
  }

  private ensureSlotGraph(slot: AmbientSlot): void {
    if (slot.sourceNode && slot.gainNode) {
      return;
    }
    const sfxBus = this.audioEngine.getSfxBus();
    if (!sfxBus) {
      return;
    }
    const source = sfxBus.context.createMediaElementSource(slot.element);
    const gain = sfxBus.context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(sfxBus.inputNode);
    slot.sourceNode = source;
    slot.gainNode = gain;
  }

  private rampSlotGain(slot: AmbientSlot, targetGain: number): void {
    const ctx = this.audioEngine.getAudioContext();
    if (!ctx || !slot.gainNode) {
      slot.element.volume = targetGain;
      return;
    }
    const tau =
      AUDIO_TOKENS.AMBIENT_CROSSFADE_MS /
      AUDIO_TOKENS.MS_PER_SECOND /
      AUDIO_TOKENS.DUCK_TAU_SETTLE_DIVISOR;
    slot.gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, tau);
  }

  private pauseAllSlots(): void {
    for (const slot of this.slots) {
      this.rampSlotGain(slot, 0);
      if (!slot.element.paused) {
        slot.element.pause();
      }
    }
  }
}

let sharedAmbiencePlayer: AmbiencePlayer | null = null;

export function getSharedAmbiencePlayer(): AmbiencePlayer {
  if (!sharedAmbiencePlayer) {
    sharedAmbiencePlayer = new AmbiencePlayer();
    getSharedAudioEngine().setAmbiencePlayer(sharedAmbiencePlayer);
  }
  return sharedAmbiencePlayer;
}

export function setSharedAmbiencePlayer(player: AmbiencePlayer | null): void {
  sharedAmbiencePlayer = player;
}
