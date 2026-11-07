import { DEFAULT_ROOM_ID, ROOM_DEFINITIONS } from "./constants";
import {
  RoomId,
  RoomTransitionState,
  type RoomTransitionListener,
} from "./types";

export type Unsubscribe = () => void;

export class RoomTransitionStateMachine {
  private state: RoomTransitionState = RoomTransitionState.IDLE;
  private activeRoomId: RoomId;
  private targetRoomId: RoomId | null = null;
  private readonly listeners = new Set<RoomTransitionListener>();

  constructor(initialRoomId: RoomId = DEFAULT_ROOM_ID) {
    this.activeRoomId = initialRoomId;
  }

  public getState(): RoomTransitionState {
    return this.state;
  }

  public getActiveRoomId(): RoomId {
    return this.activeRoomId;
  }

  public getTargetRoomId(): RoomId | null {
    return this.targetRoomId;
  }

  public isInputLocked(): boolean {
    return this.state !== RoomTransitionState.IDLE;
  }

  public subscribe(listener: RoomTransitionListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public triggerTransition(targetRoomId: RoomId): boolean {
    if (this.state !== RoomTransitionState.IDLE) {
      return false;
    }
    if (targetRoomId === this.activeRoomId) {
      return false;
    }
    if (!ROOM_DEFINITIONS[targetRoomId]) {
      return false;
    }

    this.targetRoomId = targetRoomId;
    this.state = RoomTransitionState.FADING_OUT;
    this.notify();
    return true;
  }

  public notifyFadeOutComplete(): void {
    if (this.state !== RoomTransitionState.FADING_OUT) {
      return;
    }

    this.state = RoomTransitionState.SWAPPING_ROOM;
    this.notify();
  }

  public notifyRoomReady(): void {
    if (this.state !== RoomTransitionState.SWAPPING_ROOM) {
      return;
    }

    if (this.targetRoomId) {
      this.activeRoomId = this.targetRoomId;
    }
    this.state = RoomTransitionState.FADING_IN;
    this.notify();
  }

  public notifyFadeInComplete(): void {
    if (this.state !== RoomTransitionState.FADING_IN) {
      return;
    }

    this.targetRoomId = null;
    this.state = RoomTransitionState.IDLE;
    this.notify();
  }

  public reset(roomId: RoomId = this.activeRoomId): void {
    this.state = RoomTransitionState.IDLE;
    this.activeRoomId = roomId;
    this.targetRoomId = null;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state, this.activeRoomId, this.targetRoomId);
      } catch (err: unknown) {
        console.error("[RoomTransitionStateMachine] listener error:", err);
      }
    }
  }
}
