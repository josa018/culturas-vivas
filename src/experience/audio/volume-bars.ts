import { AUDIO_TOKENS } from "./audio-constants";

export interface VolumeBarItem {
  readonly index: number;
  readonly targetVolume: number;
  readonly active: boolean;
}

export interface VolumeBarState {
  readonly activeCount: number;
  readonly percent: number;
  readonly bars: readonly VolumeBarItem[];
}

function clampUnitVolume(volume: number, fallback = 0): number {
  if (!Number.isFinite(volume)) {
    return fallback;
  }
  return Math.max(
    AUDIO_TOKENS.VOLUME_MIN,
    Math.min(AUDIO_TOKENS.VOLUME_MAX, volume),
  );
}

/**
 * Projects a continuous [0, 1] volume into discrete uniform vertical bar states.
 */
export function computeVolumeBarState(
  volume: number,
  barCount: number = AUDIO_TOKENS.VOLUME_BAR_COUNT,
): VolumeBarState {
  const safeCount = Math.max(1, Math.round(barCount));
  const clamped = clampUnitVolume(volume);
  const activeCount = Math.max(
    0,
    Math.min(safeCount, Math.round(clamped * safeCount)),
  );
  const percent = Math.round(clamped * AUDIO_TOKENS.PERCENT_MULTIPLIER);

  const bars: VolumeBarItem[] = [];
  for (let index = 1; index <= safeCount; index += 1) {
    const targetVolume =
      Math.round((index / safeCount) * AUDIO_TOKENS.PERCENT_MULTIPLIER) /
      AUDIO_TOKENS.PERCENT_MULTIPLIER;
    bars.push({
      index,
      targetVolume,
      active: index <= activeCount,
    });
  }

  return {
    activeCount,
    percent,
    bars,
  };
}

/**
 * Steps and quantizes a channel volume to discrete bar increments within [0, 1].
 */
export function quantizeVolumeStep(
  currentVolume: number,
  delta: number,
  step: number = AUDIO_TOKENS.VOLUME_BAR_STEP,
): number {
  const safeStep = step > 0 ? step : AUDIO_TOKENS.VOLUME_BAR_STEP;
  const clampedCurrent = clampUnitVolume(currentVolume);
  const nextRaw =
    Math.round(
      clampUnitVolume(clampedCurrent + delta) * AUDIO_TOKENS.PERCENT_MULTIPLIER,
    ) / AUDIO_TOKENS.PERCENT_MULTIPLIER;
  const quantized = Math.round(nextRaw / safeStep) * safeStep;
  return clampUnitVolume(
    Math.round(quantized * AUDIO_TOKENS.PERCENT_MULTIPLIER) /
      AUDIO_TOKENS.PERCENT_MULTIPLIER,
  );
}
