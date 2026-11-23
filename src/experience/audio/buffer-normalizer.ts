/**
 * Normalizes quiet decoded AudioBuffers in-place toward targetPeak within a bounded gain cap.
 */
export function normalizeAudioBufferInPlace(
  buffer: AudioBuffer | null | undefined,
  targetPeak: number,
  maxGain: number,
): number {
  if (
    !buffer ||
    typeof buffer.getChannelData !== "function" ||
    typeof buffer.numberOfChannels !== "number" ||
    buffer.numberOfChannels <= 0 ||
    !Number.isFinite(targetPeak) ||
    targetPeak <= 0 ||
    !Number.isFinite(maxGain) ||
    maxGain <= 1
  ) {
    return 1;
  }

  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i += 1) {
      const abs = Math.abs(channelData[i]!);
      if (abs > peak) {
        peak = abs;
      }
    }
  }

  if (peak <= 0) {
    return 1;
  }

  const gain = Math.min(maxGain, targetPeak / peak);
  if (gain <= 1.05) {
    return 1;
  }

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i += 1) {
      channelData[i] = Math.max(-1, Math.min(1, channelData[i]! * gain));
    }
  }

  return gain;
}
