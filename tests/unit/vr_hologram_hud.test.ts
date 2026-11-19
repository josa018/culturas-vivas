import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_ROOM_ID,
  InspectionState,
  ROOM_DEFINITIONS,
  VR_HUD_ANIMATION_DURATION_MS,
  VR_HUD_ELEMENT_IDS,
} from "../../src/experience/constants";
import { RoomId } from "../../src/experience/types";
import {
  VR_HUD_EXIT_EVENT,
  VR_HUD_RETURN_LOBBY_EVENT,
  VR_HUD_SWITCH_2D_EVENT,
  calculateHudWorldTransform,
  createVrHologramHudComponentDefinition,
  ensureVrHologramHud,
  readCameraPoseFromScene,
  registerVrHologramHudComponent,
  type VrHologramHudComponentInstance,
  type VrHologramHudEntity,
} from "../../src/experience/components/vr-hologram-hud";
import {
  VR_TAP_HUD_TOGGLE_EVENT,
  VR_TAP_OUTSIDE_HUD_EVENT,
  computeDragDistancePx,
  createVrTapTriggerComponentDefinition,
  ensureVrTapTrigger,
  evaluateCursorTap,
  registerVrTapTriggerComponent,
  type AFrameCursorElement,
  type VrTapTriggerComponentInstance,
  type VrTapTriggerEntity,
} from "../../src/experience/components/vr-tap-trigger";
import {
  getSharedInspectionController,
  setSharedInspectionController,
} from "../../src/experience/components/inspectable";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import { ExperienceScreenView } from "../../src/screens/screen-experience";
import {
  NavigationAction,
  NavigationStateMachine,
  ScreenId,
  SessionStore,
  ViewMode,
  type StorageAdapter,
} from "../../src/navigation/index";

function createMockHudInstance(
  el: VrHologramHudEntity,
): VrHologramHudComponentInstance {
  const def = createVrHologramHudComponentDefinition();
  const instance: VrHologramHudComponentInstance = {
    el,
    isOpen: false,
    enabled: true,
    activeRoomId: DEFAULT_ROOM_ID,
    callbacks: {},
    roomChipEl: null,
    init: function (this: VrHologramHudComponentInstance) {
      def.init.call(this);
    },
    setCallbacks: function (
      this: VrHologramHudComponentInstance,
      callbacks,
    ) {
      def.setCallbacks.call(this, callbacks);
    },
    setEnabled: function (
      this: VrHologramHudComponentInstance,
      enabled: boolean,
    ) {
      def.setEnabled.call(this, enabled);
    },
    setRoomTitle: function (
      this: VrHologramHudComponentInstance,
      roomId: RoomId,
    ) {
      def.setRoomTitle.call(this, roomId);
    },
    summon: function (this: VrHologramHudComponentInstance, pose) {
      def.summon.call(this, pose);
    },
    dismiss: function (this: VrHologramHudComponentInstance) {
      def.dismiss.call(this);
    },
    remove: function (this: VrHologramHudComponentInstance) {
      def.remove.call(this);
    },
  };
  return instance;
}

function createMockTapTriggerInstance(
  el: VrTapTriggerEntity,
): VrTapTriggerComponentInstance {
  const def = createVrTapTriggerComponentDefinition();
  const instance: VrTapTriggerComponentInstance = {
    el,
    hudToggleEnabled: true,
    isTransitionIdle: true,
    downEl: null,
    downPoint: null,
    lastActivationTimestampMs: -Infinity,
    cursorEl: null,
    cursorDownHandler: null,
    cursorUpHandler: null,
    cursorClickHandler: null,
    init: function (this: VrTapTriggerComponentInstance) {
      def.init.call(this);
    },
    setHudToggleEnabled: function (
      this: VrTapTriggerComponentInstance,
      enabled: boolean,
    ) {
      def.setHudToggleEnabled.call(this, enabled);
    },
    setTransitionIdle: function (
      this: VrTapTriggerComponentInstance,
      isIdle: boolean,
    ) {
      def.setTransitionIdle.call(this, isIdle);
    },
    handleCursorDown: function (
      this: VrTapTriggerComponentInstance,
      evt: Event,
    ) {
      def.handleCursorDown.call(this, evt);
    },
    handleCursorUp: function (
      this: VrTapTriggerComponentInstance,
      evt: Event,
      nowMs?: number,
    ) {
      return def.handleCursorUp.call(this, evt, nowMs);
    },
    attachCursorListeners: function (
      this: VrTapTriggerComponentInstance,
      cursorEl: AFrameCursorElement | null,
    ) {
      def.attachCursorListeners.call(this, cursorEl);
    },
    detachCursorListeners: function (this: VrTapTriggerComponentInstance) {
      def.detachCursorListeners.call(this);
    },
    remove: function (this: VrTapTriggerComponentInstance) {
      def.remove.call(this);
    },
  };
  return instance;
}

describe("VR Hologram HUD Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    const resetScene = document.createElement("a-scene");
    ExhibitRoomBuilder.mountRoom(resetScene, RoomId.LOBBY);
    setSharedInspectionController(null);
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("registers cv-vr-hologram-hud and creates idempotent scene-root HUD entity", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
    };

    registerVrHologramHudComponent();
    expect(registered["cv-vr-hologram-hud"]).toBeDefined();

    const scene = document.createElement("a-scene");
    const hud1 = ensureVrHologramHud(scene);
    const hud2 = ensureVrHologramHud(scene);

    expect(hud1).toBe(hud2);
    expect(hud1.getAttribute("id")).toBe(VR_HUD_ELEMENT_IDS.HUD_ROOT);
    expect(hud1.getAttribute("visible")).toBe("false");
  });

  it("computes world-space transform 1.5m ahead of gaze azimuth and -0.15m elevation", () => {
    const forward = calculateHudWorldTransform({
      position: { x: 0, y: 1.6, z: 0 },
      yawRad: 0,
    });
    expect(forward.position.x).toBeCloseTo(0, 3);
    expect(forward.position.y).toBeCloseTo(1.45, 3);
    expect(forward.position.z).toBeCloseTo(-1.5, 3);
    expect(forward.rotationDeg.y).toBeCloseTo(0, 3);

    const left = calculateHudWorldTransform({
      position: { x: 0, y: 1.6, z: 0 },
      yawRad: Math.PI / 2,
    });
    expect(left.position.x).toBeCloseTo(-1.5, 3);
    expect(left.position.z).toBeCloseTo(0, 3);
    expect(left.rotationDeg.y).toBeCloseTo(90, 2);
  });

  it("readCameraPoseFromScene extracts camera object3D pose or returns default fallback", () => {
    expect(readCameraPoseFromScene(null)).toEqual({
      position: { x: 0, y: 1.6, z: 0 },
      yawRad: 0,
    });

    const scene = document.createElement("a-scene");
    const camera = document.createElement("a-camera") as HTMLElement & {
      object3D?: { position: { x: number; y: number; z: number }; rotation: { y: number } };
    };
    camera.object3D = { position: { x: 1.2, y: 1.7, z: -0.5 }, rotation: { y: 0.75 } };
    scene.appendChild(camera);

    expect(readCameraPoseFromScene(scene)).toEqual({
      position: { x: 1.2, y: 1.7, z: -0.5 },
      yawRad: 0.75,
    });
  });

  it("summons HUD, aborts active inspection, updates room chip, dismisses, and respects setEnabled(false)", () => {
    const el = document.createElement("a-entity") as VrHologramHudEntity;
    el.object3D = {
      visible: false,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };

    const instance = createMockHudInstance(el);
    instance.init();

    expect(el.querySelector(`#${VR_HUD_ELEMENT_IDS.PANEL_BACKDROP}`)?.tagName.toLowerCase()).toBe("a-cylinder");
    expect(el.querySelector(`#${VR_HUD_ELEMENT_IDS.ROOM_CHIP}`)?.getAttribute("value")).toBe(
      ROOM_DEFINITIONS[DEFAULT_ROOM_ID].title,
    );

    const controller = getSharedInspectionController();
    controller.setExhibits(ROOM_DEFINITIONS[RoomId.WIXARIKA].exhibits);
    controller.focus("exhibit-wixarika-artifact");
    expect(controller.getState()).toBe(InspectionState.FOCUSING);

    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(instance.isOpen).toBe(true);
    expect(el.getAttribute("visible")).toBe("true");
    expect(el.getAttribute("position")).toBe("0 1.45 -1.5");
    expect(controller.getState()).toBe(InspectionState.IDLE);
    const returnLobbyBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.RETURN_LOBBY_BTN}`);
    expect(returnLobbyBtn?.getAttribute("visible")).toBe("false");
    expect(returnLobbyBtn?.classList.contains("clickable")).toBe(false);

    instance.setRoomTitle(RoomId.WIXARIKA);
    expect(el.querySelector(`#${VR_HUD_ELEMENT_IDS.ROOM_CHIP}`)?.getAttribute("value")).toBe(
      ROOM_DEFINITIONS[RoomId.WIXARIKA].title,
    );
    expect(returnLobbyBtn?.getAttribute("visible")).toBe("true");
    expect(returnLobbyBtn?.classList.contains("clickable")).toBe(true);

    el.querySelector(`#${VR_HUD_ELEMENT_IDS.DISMISS_BTN}`)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(instance.isOpen).toBe(false);
    expect(el.getAttribute("visible")).toBe("false");

    instance.setEnabled(false);
    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(instance.isOpen).toBe(false);
  });

  it("animates HUD dismiss with AFRAME animationcomplete and timeout fallback", () => {
    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};
    const el = document.createElement("a-entity") as VrHologramHudEntity;
    const instance = createMockHudInstance(el);
    instance.init();

    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(el.getAttribute("animation__hud_in")).toContain("to: 1 1 1");

    instance.dismiss();
    expect(instance.isOpen).toBe(false);
    expect(el.getAttribute("animation__hud_out")).toContain("to: 0.001 0.001 0.001");
    expect(el.getAttribute("visible")).toBe("true");

    vi.advanceTimersByTime(VR_HUD_ANIMATION_DURATION_MS + 30);
    expect(el.getAttribute("visible")).toBe("false");
  });

  it("cancels pending dismissTimer/hud_out listener on rapid re-summon and gates .clickable on HUD controls", () => {
    (globalThis as unknown as { AFRAME: unknown }).AFRAME = {};
    const el = document.createElement("a-entity") as VrHologramHudEntity;
    const instance = createMockHudInstance(el);
    instance.init();

    const interactiveIds = [
      VR_HUD_ELEMENT_IDS.PANEL_BACKDROP,
      VR_HUD_ELEMENT_IDS.SWITCH_2D_BTN,
      VR_HUD_ELEMENT_IDS.EXIT_BTN,
      VR_HUD_ELEMENT_IDS.DISMISS_BTN,
    ];
    for (const id of interactiveIds) {
      expect(el.querySelector(`#${id}`)?.classList.contains("clickable")).toBe(
        false,
      );
    }

    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    for (const id of interactiveIds) {
      expect(el.querySelector(`#${id}`)?.classList.contains("clickable")).toBe(
        true,
      );
    }

    // Dismiss at t = 0ms -> controls immediately drop .clickable
    instance.dismiss();
    for (const id of interactiveIds) {
      expect(el.querySelector(`#${id}`)?.classList.contains("clickable")).toBe(
        false,
      );
    }

    // Re-summon at t = 100ms (< 280ms) and advance past dismiss buffer
    vi.advanceTimersByTime(100);
    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    vi.advanceTimersByTime(VR_HUD_ANIMATION_DURATION_MS + 50);
    el.dispatchEvent(new Event("animationcomplete__hud_out"));

    expect(instance.isOpen).toBe(true);
    expect(el.getAttribute("visible")).toBe("true");
    for (const id of interactiveIds) {
      expect(el.querySelector(`#${id}`)?.classList.contains("clickable")).toBe(
        true,
      );
    }

    // Clean up timers on remove()
    instance.dismiss();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    instance.remove();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("automatically dismisses an open HUD when ExhibitInspectionController focuses an exhibit and unsubscribes on remove()", () => {
    const controller = getSharedInspectionController();
    controller.setExhibits(ROOM_DEFINITIONS[RoomId.WIXARIKA].exhibits);

    const el = document.createElement("a-entity") as VrHologramHudEntity;
    const instance = createMockHudInstance(el);
    instance.init();

    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(instance.isOpen).toBe(true);
    expect(
      el.querySelector(`#${VR_HUD_ELEMENT_IDS.PANEL_BACKDROP}`)?.classList.contains("clickable"),
    ).toBe(true);

    // Focusing an exhibit (via gaze-fuse or tap) must auto-dismiss the open HUD
    controller.focus("exhibit-wixarika-artifact");
    expect(instance.isOpen).toBe(false);
    expect(el.getAttribute("visible")).toBe("false");
    expect(
      el.querySelector(`#${VR_HUD_ELEMENT_IDS.PANEL_BACKDROP}`)?.classList.contains("clickable"),
    ).toBe(false);

    // Re-summon, remove(), and verify subsequent focus does not invoke dismiss() on torn-down instance
    controller.abortActiveInspection();
    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    const dismissSpy = vi.spyOn(instance, "dismiss");
    instance.remove();
    controller.focus("exhibit-wixarika-artifact");
    expect(dismissSpy).not.toHaveBeenCalled();
  });

  it("emits VR_HUD_RETURN_LOBBY_EVENT only when in cultural rooms and dismisses HUD", () => {
    const el = document.createElement("a-entity") as VrHologramHudEntity;
    const hud = createMockHudInstance(el);
    hud.init();

    let returnLobbyCount = 0;
    el.addEventListener(VR_HUD_RETURN_LOBBY_EVENT, () => {
      returnLobbyCount++;
    });

    // In LOBBY -> button hidden and non-clickable
    hud.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    const lobbyBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.RETURN_LOBBY_BTN}`) as HTMLElement;
    expect(lobbyBtn.getAttribute("visible")).toBe("false");
    expect(lobbyBtn.classList.contains("clickable")).toBe(false);

    // Switch to NAAYERI -> button becomes visible and .clickable; click dismisses HUD and emits event
    hud.setRoomTitle(RoomId.NAAYERI);
    expect(lobbyBtn.getAttribute("visible")).toBe("true");
    expect(lobbyBtn.classList.contains("clickable")).toBe(true);
    lobbyBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(hud.isOpen).toBe(false);
    expect(returnLobbyCount).toBe(1);
  });

  it("wires 3D HUD action buttons to NavigationStateMachine (SWITCH_TO_TOUCH and REQUEST_EXIT)", () => {
    const storeMap = new Map<string, string>();
    const memoryStorage: StorageAdapter = {
      getItem: (k) => storeMap.get(k) ?? null,
      setItem: (k, v) => {
        storeMap.set(k, v);
      },
      removeItem: (k) => {
        storeMap.delete(k);
      },
    };
    const fsm = new NavigationStateMachine(new SessionStore(memoryStorage));
    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_VR);
    fsm.dispatch(NavigationAction.CONFIRM_INSERTION);

    const el = document.createElement("a-entity") as VrHologramHudEntity;
    const hud = createMockHudInstance(el);
    hud.init();
    hud.setCallbacks({
      onSwitchTo2D: () => fsm.dispatch(NavigationAction.SWITCH_TO_TOUCH),
      onRequestExit: () => fsm.dispatch(NavigationAction.REQUEST_EXIT),
    });

    hud.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    el.querySelector(`#${VR_HUD_ELEMENT_IDS.SWITCH_2D_BTN}`)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(hud.isOpen).toBe(false);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);

    hud.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    el.querySelector(`#${VR_HUD_ELEMENT_IDS.EXIT_BTN}`)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(hud.isOpen).toBe(false);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);
  });
});

describe("VR Tap Trigger Pure Helpers & Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("computeDragDistancePx computes Euclidean distance or 0 when coordinates are missing", () => {
    expect(computeDragDistancePx({ x: 100, y: 100 }, { x: 103, y: 104 })).toBeCloseTo(5, 3);
    expect(computeDragDistancePx(null, { x: 10, y: 10 })).toBe(0);
    expect(computeDragDistancePx({ x: 10, y: 10 }, null)).toBe(0);
  });

  const dummyTarget = document.createElement("a-entity");
  it.each([
    {
      label: "matching clickable target",
      input: {
        downEl: dummyTarget,
        upEl: dummyTarget,
        dragDistancePx: 2,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: true,
        isTransitionIdle: true,
      },
      expected: "ACTIVATE_ENTITY",
    },
    {
      label: "empty space in VR mode when idle",
      input: {
        downEl: null,
        upEl: null,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: true,
        isTransitionIdle: true,
      },
      expected: "TOGGLE_HUD",
    },
    {
      label: "drag exceeding 12px threshold",
      input: {
        downEl: null,
        upEl: null,
        dragDistancePx: 20,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: true,
        isTransitionIdle: true,
      },
      expected: "IGNORE",
    },
    {
      label: "tap inside 350ms debounce window",
      input: {
        downEl: null,
        upEl: null,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: 100,
        hudToggleEnabled: true,
        isTransitionIdle: true,
      },
      expected: "IGNORE",
    },
    {
      label: "empty space when HUD toggle disabled (2D mode)",
      input: {
        downEl: null,
        upEl: null,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: false,
        isTransitionIdle: true,
      },
      expected: "IGNORE",
    },
    {
      label: "empty space while room transition is active",
      input: {
        downEl: null,
        upEl: null,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: true,
        isTransitionIdle: false,
      },
      expected: "IGNORE",
    },
  ])("evaluateCursorTap returns $expected for $label", ({ input, expected }) => {
    expect(evaluateCursorTap(input)).toBe(expected);
  });

  function setupTapScene(cursorData: { fuse: boolean; rayOrigin: string } = { fuse: true, rayOrigin: "entity" }) {
    const scene = document.createElement("a-scene");
    const camera = document.createElement("a-camera");
    const cursor = document.createElement("a-cursor") as AFrameCursorElement;
    const target = document.createElement("a-entity");
    const removedStates: string[] = [];
    let fuseFired = false;
    const pendingFuse = setTimeout(() => {
      fuseFired = true;
    }, 50);

    cursor.removeState = (state: string) => {
      removedStates.push(state);
    };
    cursor.components = {
      cursor: {
        fuseTimeout: pendingFuse,
        intersectedEl: target,
        data: cursorData,
      },
    };

    camera.appendChild(cursor);
    scene.append(camera, target);
    document.body.appendChild(scene);

    const triggerEl = ensureVrTapTrigger(scene) as VrTapTriggerEntity;
    const tapTrigger = createMockTapTriggerInstance(triggerEl);
    tapTrigger.init();

    return {
      scene,
      cursor,
      target,
      triggerEl,
      tapTrigger,
      removedStates,
      didFuseFire: () => fuseFired,
    };
  }

  it("registers cv-vr-tap-trigger and ensures idempotent entity", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
    };
    registerVrTapTriggerComponent();
    expect(registered["cv-vr-tap-trigger"]).toBeDefined();

    const scene = document.createElement("a-scene");
    const t1 = ensureVrTapTrigger(scene);
    const t2 = ensureVrTapTrigger(scene);
    expect(t1).toBe(t2);
  });

  it("tap on .clickable cancels fuseTimeout, clears cursor-fusing state, and dispatches click", () => {
    const { cursor, target, removedStates, didFuseFire } = setupTapScene();
    let clickCount = 0;
    target.addEventListener("click", () => {
      clickCount++;
    });

    vi.spyOn(Date, "now").mockReturnValue(1000);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", {
        detail: { intersectedEl: target, mouseEvent: { clientX: 50, clientY: 50 } },
      }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", {
        detail: { intersectedEl: target, mouseEvent: { clientX: 52, clientY: 51 } },
      }),
    );

    expect(clickCount).toBe(1);
    expect(removedStates).toContain("cursor-fusing");
    expect(cursor.components?.cursor?.fuseTimeout).toBeUndefined();
    vi.advanceTimersByTime(100);
    expect(didFuseFire()).toBe(false);
  });

  it("does not emit duplicate synthetic click when cursor handles click natively (fuse=false / rayOrigin=mouse)", () => {
    const { cursor, target } = setupTapScene({ fuse: false, rayOrigin: "mouse" });
    let clickCount = 0;
    target.addEventListener("click", () => {
      clickCount++;
    });

    vi.spyOn(Date, "now").mockReturnValue(1000);
    cursor.dispatchEvent(new CustomEvent("mousedown", { detail: { intersectedEl: target } }));
    cursor.dispatchEvent(new CustomEvent("mouseup", { detail: { intersectedEl: target } }));

    expect(clickCount).toBe(0);
  });

  it("enforces debounce, drag threshold, 2D empty-space disablement, and detaches listeners on remove()", () => {
    const { scene, cursor, target, tapTrigger } = setupTapScene();
    let hudToggleCount = 0;
    scene.addEventListener(VR_TAP_HUD_TOGGLE_EVENT, () => {
      hudToggleCount++;
    });

    // Empty-space tap toggles HUD
    vi.spyOn(Date, "now").mockReturnValue(1000);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", {
        detail: { intersectedEl: null, touchEvent: { touches: [{ clientX: 100, clientY: 100 }] } },
      }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", {
        detail: { intersectedEl: null, touchEvent: { changedTouches: [{ clientX: 103, clientY: 104 }] } },
      }),
    );
    expect(hudToggleCount).toBe(1);

    // Debounce (< 350ms) ignored
    vi.spyOn(Date, "now").mockReturnValue(1100);
    cursor.dispatchEvent(new CustomEvent("mousedown", { detail: { intersectedEl: null } }));
    cursor.dispatchEvent(new CustomEvent("mouseup", { detail: { intersectedEl: null } }));
    expect(hudToggleCount).toBe(1);

    // Drag (> 12px) ignored
    vi.spyOn(Date, "now").mockReturnValue(2000);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", {
        detail: { intersectedEl: null, touchEvent: { touches: [{ clientX: 100, clientY: 100 }] } },
      }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", {
        detail: { intersectedEl: null, touchEvent: { changedTouches: [{ clientX: 140, clientY: 100 }] } },
      }),
    );
    expect(hudToggleCount).toBe(1);

    // 2D mode ignores empty-space tap
    tapTrigger.setHudToggleEnabled(false);
    vi.spyOn(Date, "now").mockReturnValue(2500);
    cursor.dispatchEvent(new CustomEvent("mousedown", { detail: { intersectedEl: null } }));
    cursor.dispatchEvent(new CustomEvent("mouseup", { detail: { intersectedEl: null } }));
    expect(hudToggleCount).toBe(1);

    // remove() detaches cursor listeners completely
    let targetClicks = 0;
    target.addEventListener("click", () => {
      targetClicks++;
    });
    tapTrigger.remove();
    vi.spyOn(Date, "now").mockReturnValue(3000);
    cursor.dispatchEvent(new CustomEvent("mousedown", { detail: { intersectedEl: target } }));
    cursor.dispatchEvent(new CustomEvent("mouseup", { detail: { intersectedEl: target } }));
    expect(targetClicks).toBe(0);
  });

  it("records gaze-fuse cursor click timestamp to debounce immediate follow-up tap and detaches click listener on remove()", () => {
    const { scene, cursor, target, tapTrigger } = setupTapScene();
    let targetClicks = 0;
    let hudToggleCount = 0;
    target.addEventListener("click", () => {
      targetClicks++;
    });
    scene.addEventListener(VR_TAP_HUD_TOGGLE_EVENT, () => {
      hudToggleCount++;
    });

    // Gaze-fuse click fires on cursor at t0 = 1000
    vi.spyOn(Date, "now").mockReturnValue(1000);
    cursor.dispatchEvent(new CustomEvent("click", { detail: { intersectedEl: target } }));
    expect(tapTrigger.lastActivationTimestampMs).toBe(1000);

    // Follow-up tap within 350ms (at t = 1120) must be suppressed as IGNORE
    vi.spyOn(Date, "now").mockReturnValue(1120);
    cursor.dispatchEvent(new CustomEvent("mousedown", { detail: { intersectedEl: target } }));
    cursor.dispatchEvent(new CustomEvent("mouseup", { detail: { intersectedEl: target } }));
    expect(targetClicks).toBe(0);
    expect(hudToggleCount).toBe(0);

    // Tap after debounce window (>= 350ms) succeeds
    vi.spyOn(Date, "now").mockReturnValue(1400);
    cursor.dispatchEvent(new CustomEvent("mousedown", { detail: { intersectedEl: target } }));
    cursor.dispatchEvent(new CustomEvent("mouseup", { detail: { intersectedEl: target } }));
    expect(targetClicks).toBe(1);

    // remove() detaches click listener so cursor clicks no longer mutate lastActivationTimestampMs
    tapTrigger.remove();
    vi.spyOn(Date, "now").mockReturnValue(5000);
    cursor.dispatchEvent(new CustomEvent("click", { detail: { intersectedEl: target } }));
    expect(tapTrigger.lastActivationTimestampMs).toBe(1400);
  });

  it("synchronizes 2D DOM HUD vs 3D tap-toggled HUD in ExperienceScreenView and persists across room transitions", () => {
    const scene = document.createElement("a-scene");
    const camera = document.createElement("a-camera");
    const cursor = document.createElement("a-cursor") as AFrameCursorElement;
    cursor.setAttribute("raycaster", "objects: .clickable");
    const sky = document.createElement("a-sky");
    camera.appendChild(cursor);
    scene.append(camera, sky);
    document.body.appendChild(scene);

    const appRoot = document.createElement("div");
    document.body.appendChild(appRoot);

    const dispatched: NavigationAction[] = [];
    const screen = new ExperienceScreenView((action) => {
      dispatched.push(action);
    }, ViewMode.VR);

    screen.mount(appRoot);
    screen.show();

    const topBar = appRoot.querySelector(".cv-hud-topbar") as HTMLElement;
    expect(topBar.classList.contains("cv-hud-topbar--hidden")).toBe(true);

    const hudEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`) as VrHologramHudEntity;
    const tapEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`) as VrTapTriggerEntity;
    expect(hudEl.closest(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`)).toBeNull();
    expect(tapEl.closest(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`)).toBeNull();

    const hudInstance = createMockHudInstance(hudEl);
    hudInstance.init();
    const tapInstance = createMockTapTriggerInstance(tapEl);
    tapInstance.init();
    (hudEl as unknown as { components?: Record<string, VrHologramHudComponentInstance> }).components = {
      "cv-vr-hologram-hud": hudInstance,
    };
    (tapEl as unknown as { components?: Record<string, VrTapTriggerComponentInstance> }).components = {
      "cv-vr-tap-trigger": tapInstance,
    };

    tapEl.dispatchEvent(new CustomEvent(VR_TAP_HUD_TOGGLE_EVENT, { bubbles: true }));
    expect(hudInstance.isOpen).toBe(true);

    tapEl.dispatchEvent(new CustomEvent(VR_TAP_HUD_TOGGLE_EVENT, { bubbles: true }));
    expect(hudInstance.isOpen).toBe(false);

    tapEl.dispatchEvent(new CustomEvent(VR_TAP_HUD_TOGGLE_EVENT, { bubbles: true }));
    expect(screen.transitionToRoom(RoomId.WIXARIKA)).toBe(true);
    expect(hudInstance.isOpen).toBe(false);
    expect(tapInstance.isTransitionIdle).toBe(true);
    expect(scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`)).toBe(hudEl);
    expect(
      hudEl.querySelector(`#${VR_HUD_ELEMENT_IDS.ROOM_CHIP}`)?.getAttribute("value"),
    ).toBe(ROOM_DEFINITIONS[RoomId.WIXARIKA].title);

    hudEl.dispatchEvent(new CustomEvent(VR_HUD_RETURN_LOBBY_EVENT, { bubbles: true }));
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.LOBBY);
    expect(
      hudEl.querySelector(`#${VR_HUD_ELEMENT_IDS.ROOM_CHIP}`)?.getAttribute("value"),
    ).toBe(ROOM_DEFINITIONS[RoomId.LOBBY].title);

    hudEl.dispatchEvent(new CustomEvent(VR_HUD_SWITCH_2D_EVENT, { bubbles: true }));
    hudEl.dispatchEvent(new CustomEvent(VR_HUD_EXIT_EVENT, { bubbles: true }));
    expect(dispatched).toEqual([
      NavigationAction.SWITCH_TO_TOUCH,
      NavigationAction.REQUEST_EXIT,
    ]);

    screen.setViewMode(ViewMode.TOUCH_2D);
    screen.show();
    expect(topBar.classList.contains("cv-hud-topbar--hidden")).toBe(false);
    expect(tapInstance.hudToggleEnabled).toBe(false);
    expect(hudInstance.enabled).toBe(false);

    screen.unmount();
  });

  it("dismisses open 3D HUD when tapping a .clickable target outside HUD_ROOT, while keeping HUD open when tapping PANEL_BACKDROP", () => {
    const scene = document.createElement("a-scene");
    const camera = document.createElement("a-camera");
    const cursor = document.createElement("a-cursor") as AFrameCursorElement;
    cursor.setAttribute("raycaster", "objects: .clickable");
    cursor.components = {
      cursor: {
        data: { fuse: true, rayOrigin: "entity" },
      },
    };
    const sky = document.createElement("a-sky");
    const externalTarget = document.createElement("a-entity");
    externalTarget.setAttribute("class", "clickable");
    camera.appendChild(cursor);
    scene.append(camera, sky, externalTarget);
    document.body.appendChild(scene);

    const appRoot = document.createElement("div");
    document.body.appendChild(appRoot);

    const screen = new ExperienceScreenView(() => {}, ViewMode.VR);
    screen.mount(appRoot);
    screen.show();

    const hudEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`) as VrHologramHudEntity;
    const tapEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`) as VrTapTriggerEntity;
    const hudInstance = createMockHudInstance(hudEl);
    hudInstance.init();
    const tapInstance = createMockTapTriggerInstance(tapEl);
    tapInstance.init();
    (hudEl as unknown as { components?: Record<string, VrHologramHudComponentInstance> }).components = {
      "cv-vr-hologram-hud": hudInstance,
    };
    (tapEl as unknown as { components?: Record<string, VrTapTriggerComponentInstance> }).components = {
      "cv-vr-tap-trigger": tapInstance,
    };

    let outsideHudEvents = 0;
    scene.addEventListener(VR_TAP_OUTSIDE_HUD_EVENT, () => {
      outsideHudEvents++;
    });

    // Summon HUD
    hudInstance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(hudInstance.isOpen).toBe(true);

    // Tapping PANEL_BACKDROP inside HUD_ROOT must NOT emit outside-HUD dismiss or close HUD
    const backdropEl = hudEl.querySelector(`#${VR_HUD_ELEMENT_IDS.PANEL_BACKDROP}`) as Element;
    vi.spyOn(Date, "now").mockReturnValue(1000);
    cursor.dispatchEvent(new CustomEvent("mousedown", { detail: { intersectedEl: backdropEl } }));
    cursor.dispatchEvent(new CustomEvent("mouseup", { detail: { intersectedEl: backdropEl } }));
    expect(outsideHudEvents).toBe(0);
    expect(hudInstance.isOpen).toBe(true);

    // Tapping external .clickable target outside HUD_ROOT must emit event, deliver click, and dismiss HUD
    let externalClicks = 0;
    externalTarget.addEventListener("click", () => {
      externalClicks++;
    });
    vi.spyOn(Date, "now").mockReturnValue(2000);
    cursor.dispatchEvent(new CustomEvent("mousedown", { detail: { intersectedEl: externalTarget } }));
    cursor.dispatchEvent(new CustomEvent("mouseup", { detail: { intersectedEl: externalTarget } }));

    expect(externalClicks).toBe(1);
    expect(outsideHudEvents).toBe(1);
    expect(hudInstance.isOpen).toBe(false);

    screen.unmount();
  });
});
