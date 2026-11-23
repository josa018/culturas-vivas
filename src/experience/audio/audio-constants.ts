import { RoomEnvironmentId } from "../../shared/room-catalog";

export const AUDIO_STORAGE_KEYS = {
  PREFERENCES: "cv_audio_preferences",
} as const;

export interface AudioPreferences {
  readonly masterEnabled: boolean;
  readonly musicVolume: number;
  readonly effectsVolume: number;
  readonly mediaMuted: boolean;
}

export const AUDIO_TOKENS = {
  VOLUME_MIN: 0,
  VOLUME_MAX: 1,
  VOLUME_STEP: 0.05,
  DEFAULT_MUSIC_VOLUME: 0.7,
  DEFAULT_EFFECTS_VOLUME: 0.8,
  PERCENT_MULTIPLIER: 100,
  MUSIC_DEFAULT_GAIN: 0.75,
  MUSIC_DUCK_GAIN: 0.22,
  DUCK_RAMP_MS: 400,
  DUCK_TAU_SETTLE_DIVISOR: 3,
  MS_PER_SECOND: 1000,
  GAIN_RAMP_TIME_CONSTANT_S: 0.04,
  SFX_GAIN: 0.9,
  AMBIENCE_GAIN: 0.3,
  AMBIENT_CROSSFADE_MS: 600,
  OCCLUSION_ANGLE_DEG: 70,
  OCCLUSION_LOWPASS_HZ: 800,
  OPEN_LOWPASS_HZ: 20000,
  OCCLUSION_GAIN: 0.5,
  OCCLUSION_TIME_CONSTANT_S: 0.08,
  COMPRESSOR_THRESHOLD_DB: -14,
  COMPRESSOR_KNEE_DB: 18,
  COMPRESSOR_RATIO: 4,
  COMPRESSOR_ATTACK_S: 0.005,
  COMPRESSOR_RELEASE_S: 0.15,
  PANNER_REF_DISTANCE_M: 1,
  PANNER_ROLLOFF_FACTOR: 0,
  IOS_AUDIO_SESSION_TYPE: "playback",
} as const;

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  masterEnabled: false,
  musicVolume: AUDIO_TOKENS.DEFAULT_MUSIC_VOLUME,
  effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
  mediaMuted: true,
} as const;

export const SfxId = {
  RETICLE_HOVER: "RETICLE_HOVER",
  RETICLE_FUSE: "RETICLE_FUSE",
  STAND_OPEN: "STAND_OPEN",
  STAND_CLOSE: "STAND_CLOSE",
  CAROUSEL_STEP: "CAROUSEL_STEP",
  PORTAL_WHOOSH: "PORTAL_WHOOSH",
  HUD_OPEN: "HUD_OPEN",
  HUD_CLOSE: "HUD_CLOSE",
  TOGGLE_CLICK: "TOGGLE_CLICK",
} as const;

export type SfxId = (typeof SfxId)[keyof typeof SfxId];

export const SFX_MANIFEST: Record<SfxId, string> = {
  [SfxId.RETICLE_HOVER]: "/assets/audio/sfx/reticle-hover.mp3",
  [SfxId.RETICLE_FUSE]: "/assets/audio/sfx/reticle-fuse.mp3",
  [SfxId.STAND_OPEN]: "/assets/audio/sfx/stand-open.mp3",
  [SfxId.STAND_CLOSE]: "/assets/audio/sfx/stand-close.mp3",
  [SfxId.CAROUSEL_STEP]: "/assets/audio/sfx/carousel-step.mp3",
  [SfxId.PORTAL_WHOOSH]: "/assets/audio/sfx/portal-whoosh.mp3",
  [SfxId.HUD_OPEN]: "/assets/audio/sfx/hud-open.mp3",
  [SfxId.HUD_CLOSE]: "/assets/audio/sfx/hud-close.mp3",
  [SfxId.TOGGLE_CLICK]: "/assets/audio/sfx/toggle-click.mp3",
} as const;

export const AMBIENT_MANIFEST: Record<RoomEnvironmentId, string> = {
  [RoomEnvironmentId.LOBBY]: "/assets/audio/ambient/lobby-atrium.mp3",
  [RoomEnvironmentId.WIXARIKA]: "/assets/audio/ambient/wixarika-sierra.mp3",
  [RoomEnvironmentId.NAAYERI]: "/assets/audio/ambient/naayeri-canyon.mp3",
  [RoomEnvironmentId.ODAM]: "/assets/audio/ambient/odam-forest.mp3",
  [RoomEnvironmentId.MEXICANERO]: "/assets/audio/ambient/mexicanero-highland.mp3",
} as const;
