import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_ROOM_ID,
  InspectionState,
  ROOM_DEFINITIONS,
  VR_HUD_ANIMATION_DURATION_MS,
  VR_HUD_COLORS,
  VR_HUD_DICTIONARY,
  VR_HUD_ELEMENT_IDS,
  VR_HUD_FOCAL_DISTANCE_M,
  VR_HUD_FOCAL_ELEVATION_OFFSET_M,
  VR_HUD_GEOMETRY,
  VR_HUD_MAX_TAP_DRAG_PX,
  VR_HUD_TAP_DEBOUNCE_MS,
} from "../../src/experience/constants";
import { RoomId } from "../../src/experience/types";
import {
  VR_HUD_EXIT_EVENT,
  VR_HUD_SWITCH_2D_EVENT,
  calculateHudWorldTransform,
  createVrHologramHudComponentDefinition,
  ensureVrHologramHud,
  registerVrHologramHudComponent,
  type VrHologramHudComponentInstance,
  type VrHologramHudEntity,
} from "../../src/experience/components/vr-hologram-hud";
import {
  VR_TAP_HUD_TOGGLE_EVENT,
  computeDragDistancePx,
  createVrTapTriggerComponentDefinition,
  ensureVrTapTrigger,
  evaluateCursorTap,
  registerVrTapTriggerComponent,
  type AFrameCursorElement,
  type VrTapTriggerComponentInstance,
  type VrTapTriggerEntity,
} from "../../src/experience/components/vr-tap-trigger";
import { getSharedInspectionController } from "../../src/experience/components/inspectable";
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

describe("VR Spatial HUD & Dual Tap Interaction", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
  });

  it("exports declarative spatial metrics, tap guards, and cultural-design-system colors", () => {
    expect(VR_HUD_FOCAL_DISTANCE_M).toBe(1.5);
    expect(VR_HUD_FOCAL_ELEVATION_OFFSET_M).toBe(-0.15);
    expect(VR_HUD_ANIMATION_DURATION_MS).toBe(250);
    expect(VR_HUD_TAP_DEBOUNCE_MS).toBe(350);
    expect(VR_HUD_MAX_TAP_DRAG_PX).toBe(12);

    expect(VR_HUD_GEOMETRY.CURVED_RADIUS_M).toBe(1.8);
    expect(VR_HUD_GEOMETRY.THETA_LENGTH_DEG).toBe(50);
    expect(VR_HUD_GEOMETRY.PANEL_HEIGHT_M).toBe(0.8);

    expect(VR_HUD_COLORS.SURFACE_OBSIDIAN).toBe("#0B0F17");
    expect(VR_HUD_COLORS.ACCENT_CEMPASUCHIL).toBe("#D99B26");
    expect(VR_HUD_COLORS.ACCENT_TURQUESA).toBe("#008F85");
    expect(VR_HUD_COLORS.ACCENT_COCHINILLA).toBe("#B83A2C");
    expect(VR_HUD_COLORS.TEXT_BONE).toBe("#EDE8DF");

    for (const id of Object.values(VR_HUD_ELEMENT_IDS)) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }

    for (const label of Object.values(VR_HUD_DICTIONARY)) {
      expect(typeof label).toBe("string");
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it("registers cv-vr-hologram-hud component and ensures idempotent scene-root entity", () => {
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
    expect(hud1.getAttribute("cv-vr-hologram-hud")).toBe("");
  });

  it("computes world-space transform ahead of gaze azimuth at focal distance", () => {
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

  it("renders curved backdrop and clickable controls, summons in world space, and dismisses cleanly", () => {
    const el = document.createElement("a-entity") as VrHologramHudEntity;
    el.object3D = {
      visible: false,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };

    const instance = createMockHudInstance(el);
    instance.init();

    const backdrop = el.querySelector(`#${VR_HUD_ELEMENT_IDS.PANEL_BACKDROP}`);
    const roomChip = el.querySelector(`#${VR_HUD_ELEMENT_IDS.ROOM_CHIP}`);
    const switchBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.SWITCH_2D_BTN}`);
    const exitBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.EXIT_BTN}`);
    const dismissBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.DISMISS_BTN}`);

    expect(backdrop).toBeTruthy();
    expect(backdrop?.tagName.toLowerCase()).toBe("a-cylinder");
    expect(backdrop?.classList.contains("clickable")).toBe(true);
    expect(roomChip?.getAttribute("value")).toBe(
      ROOM_DEFINITIONS[DEFAULT_ROOM_ID].title,
    );
    expect(switchBtn?.classList.contains("clickable")).toBe(true);
    expect(exitBtn?.classList.contains("clickable")).toBe(true);
    expect(dismissBtn?.classList.contains("clickable")).toBe(true);

    const controller = getSharedInspectionController();
    controller.setExhibits(ROOM_DEFINITIONS[DEFAULT_ROOM_ID].exhibits);
    controller.focus("exhibit-statue-3d");
    expect(controller.getState()).toBe(InspectionState.FOCUSING);

    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(instance.isOpen).toBe(true);
    expect(el.getAttribute("visible")).toBe("true");
    expect(el.getAttribute("scale")).toBe("1 1 1");
    expect(el.getAttribute("position")).toBe("0 1.45 -1.5");
    expect(controller.getState()).toBe(InspectionState.IDLE);

    instance.setRoomTitle(RoomId.TEXTILES);
    expect(roomChip?.getAttribute("value")).toBe(
      ROOM_DEFINITIONS[RoomId.TEXTILES].title,
    );

    dismissBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(instance.isOpen).toBe(false);
    expect(el.getAttribute("visible")).toBe("false");
    expect(el.getAttribute("scale")).toBe("0.001 0.001 0.001");

    instance.setEnabled(false);
    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(instance.isOpen).toBe(false);
  });

  it("registers cv-vr-tap-trigger, bridges tap clicks while cancelling fuseTimeout, and blocks double-taps/drags", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
    };

    registerVrTapTriggerComponent();
    expect(registered["cv-vr-tap-trigger"]).toBeDefined();

    // Pure helper validation
    expect(
      computeDragDistancePx({ x: 100, y: 100 }, { x: 103, y: 104 }),
    ).toBeCloseTo(5, 3);
    expect(computeDragDistancePx(null, { x: 10, y: 10 })).toBe(0);

    const target = document.createElement("a-entity");
    expect(
      evaluateCursorTap({
        downEl: target,
        upEl: target,
        dragDistancePx: 2,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: true,
        isTransitionIdle: true,
      }),
    ).toBe("ACTIVATE_ENTITY");

    expect(
      evaluateCursorTap({
        downEl: null,
        upEl: null,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: true,
        isTransitionIdle: true,
      }),
    ).toBe("TOGGLE_HUD");

    expect(
      evaluateCursorTap({
        downEl: null,
        upEl: null,
        dragDistancePx: 20,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: true,
        isTransitionIdle: true,
      }),
    ).toBe("IGNORE");

    expect(
      evaluateCursorTap({
        downEl: null,
        upEl: null,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: 100,
        hudToggleEnabled: true,
        isTransitionIdle: true,
      }),
    ).toBe("IGNORE");

    expect(
      evaluateCursorTap({
        downEl: null,
        upEl: null,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: false,
        isTransitionIdle: true,
      }),
    ).toBe("IGNORE");

    expect(
      evaluateCursorTap({
        downEl: null,
        upEl: null,
        dragDistancePx: 0,
        elapsedSinceLastTapMs: 500,
        hudToggleEnabled: true,
        isTransitionIdle: false,
      }),
    ).toBe("IGNORE");

    // Runtime cursor integration test
    const scene = document.createElement("a-scene");
    const camera = document.createElement("a-camera");
    const cursor = document.createElement("a-cursor") as AFrameCursorElement;
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
        data: { fuse: true, rayOrigin: "entity" },
      },
    };
    camera.appendChild(cursor);
    scene.append(camera, target);
    document.body.appendChild(scene);

    const t1 = ensureVrTapTrigger(scene) as VrTapTriggerEntity;
    const t2 = ensureVrTapTrigger(scene);
    expect(t1).toBe(t2);
    expect(t1.getAttribute("id")).toBe(VR_HUD_ELEMENT_IDS.TAP_TRIGGER);

    const tapTrigger = createMockTapTriggerInstance(t1);
    tapTrigger.init();

    let targetClickCount = 0;
    target.addEventListener("click", () => {
      targetClickCount++;
    });
    let hudToggleCount = 0;
    scene.addEventListener(VR_TAP_HUD_TOGGLE_EVENT, () => {
      hudToggleCount++;
    });

    // 1. Tap on .clickable target cancels pending fuseTimeout and fires exactly 1 click
    vi.spyOn(Date, "now").mockReturnValue(1000);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", {
        detail: {
          intersectedEl: target,
          mouseEvent: { clientX: 50, clientY: 50 },
        },
      }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", {
        detail: {
          intersectedEl: target,
          mouseEvent: { clientX: 52, clientY: 51 },
        },
      }),
    );

    expect(targetClickCount).toBe(1);
    expect(hudToggleCount).toBe(0);
    expect(removedStates).toContain("cursor-fusing");
    expect(cursor.components.cursor.fuseTimeout).toBeUndefined();
    expect(fuseFired).toBe(false);

    // 2. Synthetic mouseup 100ms later is ignored by debounce
    vi.spyOn(Date, "now").mockReturnValue(1100);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", { detail: { intersectedEl: target } }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", { detail: { intersectedEl: target } }),
    );
    expect(targetClickCount).toBe(1);

    // 3. Tap on empty space after debounce emits VR_TAP_HUD_TOGGLE_EVENT
    vi.spyOn(Date, "now").mockReturnValue(1500);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", {
        detail: {
          intersectedEl: null,
          touchEvent: { touches: [{ clientX: 100, clientY: 100 }] },
        },
      }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", {
        detail: {
          intersectedEl: null,
          touchEvent: { changedTouches: [{ clientX: 103, clientY: 104 }] },
        },
      }),
    );
    expect(hudToggleCount).toBe(1);

    // 4. Drag gesture (>12px) on empty space is ignored
    vi.spyOn(Date, "now").mockReturnValue(2000);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", {
        detail: {
          intersectedEl: null,
          touchEvent: { touches: [{ clientX: 100, clientY: 100 }] },
        },
      }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", {
        detail: {
          intersectedEl: null,
          touchEvent: { changedTouches: [{ clientX: 140, clientY: 100 }] },
        },
      }),
    );
    expect(hudToggleCount).toBe(1);

    // 5. In 2D mode (hudToggleEnabled=false), empty-space tap is ignored while .clickable tap still works
    tapTrigger.setHudToggleEnabled(false);
    vi.spyOn(Date, "now").mockReturnValue(2500);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", { detail: { intersectedEl: null } }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", { detail: { intersectedEl: null } }),
    );
    expect(hudToggleCount).toBe(1);

    vi.spyOn(Date, "now").mockReturnValue(3000);
    cursor.dispatchEvent(
      new CustomEvent("mousedown", { detail: { intersectedEl: target } }),
    );
    cursor.dispatchEvent(
      new CustomEvent("mouseup", { detail: { intersectedEl: target } }),
    );
    expect(targetClickCount).toBe(2);

    vi.restoreAllMocks();
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
      clear: () => {
        storeMap.clear();
      },
    };
    const fsm = new NavigationStateMachine(new SessionStore(memoryStorage));
    fsm.dispatch(NavigationAction.FINISH_LOADING);
    fsm.dispatch(NavigationAction.SELECT_VR);
    fsm.dispatch(NavigationAction.CONFIRM_INSERTION);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.VR);

    const el = document.createElement("a-entity") as VrHologramHudEntity;
    const hud = createMockHudInstance(el);
    hud.init();
    hud.setCallbacks({
      onSwitchTo2D: () => fsm.dispatch(NavigationAction.SWITCH_TO_TOUCH),
      onRequestExit: () => fsm.dispatch(NavigationAction.REQUEST_EXIT),
    });

    hud.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(hud.isOpen).toBe(true);

    const switchBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.SWITCH_2D_BTN}`);
    switchBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(hud.isOpen).toBe(false);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);

    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);
    fsm.dispatch(NavigationAction.RESUME_TOUR);

    hud.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    const exitBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.EXIT_BTN}`);
    exitBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(hud.isOpen).toBe(false);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);
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

    const hudEl = scene.querySelector(
      `#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`,
    ) as VrHologramHudEntity;
    const tapEl = scene.querySelector(
      `#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`,
    ) as VrTapTriggerEntity;
    expect(hudEl).toBeTruthy();
    expect(tapEl).toBeTruthy();
    expect(
      hudEl.closest(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`),
    ).toBeNull();
    expect(
      tapEl.closest(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`),
    ).toBeNull();

    const hudInstance = createMockHudInstance(hudEl);
    hudInstance.init();
    const tapInstance = createMockTapTriggerInstance(tapEl);
    tapInstance.init();
    (
      hudEl as unknown as {
        components?: Record<string, VrHologramHudComponentInstance>;
      }
    ).components = { "cv-vr-hologram-hud": hudInstance };
    (
      tapEl as unknown as {
        components?: Record<string, VrTapTriggerComponentInstance>;
      }
    ).components = { "cv-vr-tap-trigger": tapInstance };

    // First empty-space tap toggles 3D HUD open
    tapEl.dispatchEvent(
      new CustomEvent(VR_TAP_HUD_TOGGLE_EVENT, { bubbles: true }),
    );
    expect(hudInstance.isOpen).toBe(true);
    expect(hudEl.getAttribute("visible")).toBe("true");

    // Second empty-space tap toggles 3D HUD closed
    tapEl.dispatchEvent(
      new CustomEvent(VR_TAP_HUD_TOGGLE_EVENT, { bubbles: true }),
    );
    expect(hudInstance.isOpen).toBe(false);
    expect(hudEl.getAttribute("visible")).toBe("false");

    // Open again, then verify room transition dismisses HUD, preserves entities, and updates room chip
    tapEl.dispatchEvent(
      new CustomEvent(VR_TAP_HUD_TOGGLE_EVENT, { bubbles: true }),
    );
    expect(hudInstance.isOpen).toBe(true);

    const transitioned = screen.transitionToRoom(RoomId.TEXTILES);
    expect(transitioned).toBe(true);
    expect(hudInstance.isOpen).toBe(false);
    expect(tapInstance.isTransitionIdle).toBe(true);
    expect(scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`)).toBe(hudEl);
    expect(scene.querySelector(`#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`)).toBe(
      tapEl,
    );
    expect(
      hudEl
        .querySelector(`#${VR_HUD_ELEMENT_IDS.ROOM_CHIP}`)
        ?.getAttribute("value"),
    ).toBe(ROOM_DEFINITIONS[RoomId.TEXTILES].title);

    hudEl.dispatchEvent(
      new CustomEvent(VR_HUD_SWITCH_2D_EVENT, { bubbles: true }),
    );
    hudEl.dispatchEvent(new CustomEvent(VR_HUD_EXIT_EVENT, { bubbles: true }));
    expect(dispatched).toEqual([
      NavigationAction.SWITCH_TO_TOUCH,
      NavigationAction.REQUEST_EXIT,
    ]);

    // Switching to 2D touch mode reveals 2D DOM HUD and disables empty-space HUD toggle
    screen.setViewMode(ViewMode.TOUCH_2D);
    screen.show();
    expect(topBar.classList.contains("cv-hud-topbar--hidden")).toBe(false);
    expect(tapInstance.hudToggleEnabled).toBe(false);
    expect(hudInstance.enabled).toBe(false);

    screen.unmount();
  });
});
