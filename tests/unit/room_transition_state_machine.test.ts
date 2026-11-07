import { describe, it, expect } from "vitest";
import { RoomTransitionStateMachine } from "../../src/experience/room-transition-state-machine";
import { RoomId, RoomTransitionState } from "../../src/experience/types";
import { DEFAULT_ROOM_ID } from "../../src/experience/constants";

describe("RoomTransitionStateMachine", () => {
  it("initializes in IDLE state with input unlocked", () => {
    const sm = new RoomTransitionStateMachine();
    expect(sm.getState()).toBe(RoomTransitionState.IDLE);
    expect(sm.getActiveRoomId()).toBe(DEFAULT_ROOM_ID);
    expect(sm.getTargetRoomId()).toBeNull();
    expect(sm.isInputLocked()).toBe(false);
  });

  it("completes full linear transition lifecycle", () => {
    const sm = new RoomTransitionStateMachine();
    const history: Array<{
      state: RoomTransitionState;
      active: RoomId;
      target: RoomId | null;
    }> = [];

    sm.subscribe((state, active, target) => {
      history.push({ state, active, target });
    });

    // Step A: Trigger transition to TEXTILES
    const triggered = sm.triggerTransition(RoomId.TEXTILES);
    expect(triggered).toBe(true);
    expect(sm.getState()).toBe(RoomTransitionState.FADING_OUT);
    expect(sm.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);
    expect(sm.getTargetRoomId()).toBe(RoomId.TEXTILES);
    expect(sm.isInputLocked()).toBe(true);

    // Step B: Curtain becomes opaque
    sm.notifyFadeOutComplete();
    expect(sm.getState()).toBe(RoomTransitionState.SWAPPING_ROOM);
    expect(sm.isInputLocked()).toBe(true);

    // Step C: Room swapping finishes and ready
    sm.notifyRoomReady();
    expect(sm.getState()).toBe(RoomTransitionState.FADING_IN);
    expect(sm.getActiveRoomId()).toBe(RoomId.TEXTILES);
    expect(sm.getTargetRoomId()).toBe(RoomId.TEXTILES);
    expect(sm.isInputLocked()).toBe(true);

    // Step D: Curtain becomes transparent
    sm.notifyFadeInComplete();
    expect(sm.getState()).toBe(RoomTransitionState.IDLE);
    expect(sm.getActiveRoomId()).toBe(RoomId.TEXTILES);
    expect(sm.getTargetRoomId()).toBeNull();
    expect(sm.isInputLocked()).toBe(false);

    expect(history).toHaveLength(4);
    expect(history[0].state).toBe(RoomTransitionState.FADING_OUT);
    expect(history[1].state).toBe(RoomTransitionState.SWAPPING_ROOM);
    expect(history[2].state).toBe(RoomTransitionState.FADING_IN);
    expect(history[3].state).toBe(RoomTransitionState.IDLE);
  });

  it("correctly rejects illegal transitions with state guards", () => {
    const sm = new RoomTransitionStateMachine();
    sm.triggerTransition(RoomId.TEXTILES);

    // Concurrent trigger must be rejected
    const concurrent = sm.triggerTransition(RoomId.ARCHAEOLOGY);
    expect(concurrent).toBe(false);
    expect(sm.getState()).toBe(RoomTransitionState.FADING_OUT);

    // Transition to active room must be rejected
    const smIdle = new RoomTransitionStateMachine(RoomId.ARCHAEOLOGY);
    const selfTransition = smIdle.triggerTransition(RoomId.ARCHAEOLOGY);
    expect(selfTransition).toBe(false);

    // Transition to unregistered room must be rejected
    const invalidTransition = smIdle.triggerTransition(
      "NON_EXISTENT_ROOM" as RoomId,
    );
    expect(invalidTransition).toBe(false);
  });

  it("safely ignores out-of-order notifications", () => {
    const sm = new RoomTransitionStateMachine();
    sm.notifyRoomReady();
    expect(sm.getState()).toBe(RoomTransitionState.IDLE);

    sm.notifyFadeOutComplete();
    expect(sm.getState()).toBe(RoomTransitionState.IDLE);

    sm.notifyFadeInComplete();
    expect(sm.getState()).toBe(RoomTransitionState.IDLE);
  });

  it("manages subscription teardown and reset cleanly", () => {
    const sm = new RoomTransitionStateMachine();
    let callCount = 0;
    const unsub = sm.subscribe(() => {
      callCount++;
    });

    sm.triggerTransition(RoomId.TEXTILES);
    expect(callCount).toBe(1);

    unsub();
    sm.notifyFadeOutComplete();
    expect(callCount).toBe(1);

    sm.reset(RoomId.ARCHAEOLOGY);
    expect(sm.getState()).toBe(RoomTransitionState.IDLE);
    expect(sm.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);
    expect(sm.getTargetRoomId()).toBeNull();
  });
});
