import { STAND_DICTIONARY } from "./constants";
import {
  isHalfSbsMediaType,
  isVideoMediaType,
  type StandMediaItem,
} from "./media-types";

/**
 * Pure domain controller managing ordered carousel indexing, playback flags, and counters.
 */
export class MediaCarouselController {
  private readonly items: readonly StandMediaItem[];
  private currentIndex = 0;
  private playing = false;
  private muted = false;

  constructor(items: readonly StandMediaItem[]) {
    this.items = [...items];
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  public getCount(): number {
    return this.items.length;
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getCurrentItem(): StandMediaItem | null {
    if (this.items.length === 0) {
      return null;
    }
    return this.items[this.currentIndex] ?? null;
  }

  public next(): StandMediaItem | null {
    if (this.items.length === 0) {
      return null;
    }
    this.currentIndex = (this.currentIndex + 1) % this.items.length;
    return this.getCurrentItem();
  }

  public prev(): StandMediaItem | null {
    if (this.items.length === 0) {
      return null;
    }
    this.currentIndex =
      (this.currentIndex - 1 + this.items.length) % this.items.length;
    return this.getCurrentItem();
  }

  public reset(): void {
    this.currentIndex = 0;
    this.playing = false;
  }

  public getCounterLabel(): string {
    if (this.items.length === 0) {
      return `0${STAND_DICTIONARY.COUNTER_SEPARATOR}0`;
    }
    return `${this.currentIndex + 1}${STAND_DICTIONARY.COUNTER_SEPARATOR}${this.items.length}`;
  }

  public isCurrentVideo(): boolean {
    const item = this.getCurrentItem();
    return item !== null && isVideoMediaType(item.mediaType);
  }

  public isCurrentHalfSBS(): boolean {
    const item = this.getCurrentItem();
    return item !== null && isHalfSbsMediaType(item.mediaType);
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  public togglePlay(): boolean {
    this.playing = !this.playing;
    return this.playing;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * Returns the image or poster URL of the subsequent item `(index + 1) % N` to prefetch.
   */
  public getNextPrefetchUrl(): string | null {
    if (this.items.length <= 1) {
      return null;
    }
    const nextIndex = (this.currentIndex + 1) % this.items.length;
    const nextItem = this.items[nextIndex];
    if (!nextItem) {
      return null;
    }
    if (nextItem.posterUrl && nextItem.posterUrl.trim().length > 0) {
      return nextItem.posterUrl;
    }
    if (!isVideoMediaType(nextItem.mediaType)) {
      return nextItem.mediaUrl;
    }
    return null;
  }
}
