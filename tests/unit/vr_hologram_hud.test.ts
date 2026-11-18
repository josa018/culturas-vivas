import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  VR_HUD_SUMMON_PITCH_THRESHOLD_DEG,
  VR_HUD_SUMMON_TIMEOUT_MS,
} from "../../src/experience/constants";
import { RoomId } from "../../src/experience/types";
import {
  calculateHudWorldTransform,
  createVrHologramHudComponentDefinition,
  ensureVrHologramHud,
  registerVrHologramHudComponent,
  type VrHologramHudComponentInstance,
  type VrHologramHudEntity,
} from "../../src/experience/components/vr-hologram-hud";
import {
  NADIR_SUMMON_EVENT,
  createNadirTriggerComponentDefinition,
  ensureNadirTrigger,
  extractCameraPitchDeg,
  isNadirPitchReached,
  registerNadirTriggerComponent,
  type NadirTriggerComponentInstance,
  type NadirTriggerEntity,
} from "../../src/experience/components/nadir-trigger";
import {
  VR_HUD_EXIT_EVENT,
  VR_HUD_SWITCH_2D_EVENT,
} from "../../src/experience/components/vr-hologram-hud";
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

function createMockNadirInstance(
  el: NadirTriggerEntity,
): NadirTriggerComponentInstance {
  const def = createNadirTriggerComponentDefinition();
  const instance: NadirTriggerComponentInstance = {
    el,
    enabled: true,
    isGlyphVisible: false,
    isGazingAtGlyph: false,
    dwellElapsedMs: 0,
    hasSummonedInCurrentDwell: false,
    progressRingEl: null,
    init: function (this: NadirTriggerComponentInstance) {
      def.init.call(this);
    },
    setEnabled: function (
      this: NadirTriggerComponentInstance,
      enabled: boolean,
    ) {
      def.setEnabled.call(this, enabled);
    },
    setSummonHandler: function (
      this: NadirTriggerComponentInstance,
      handler?: () => void,
    ) {
      def.setSummonHandler.call(this, handler);
    },
    evaluatePitchAndDwell: function (
      this: NadirTriggerComponentInstance,
      pitchDeg: number,
      timeDeltaMs: number,
    ) {
      def.evaluatePitchAndDwell.call(this, pitchDeg, timeDeltaMs);
    },
    triggerSummon: function (this: NadirTriggerComponentInstance) {
      def.triggerSummon.call(this);
    },
    tick: function (
      this: NadirTriggerComponentInstance,
      time: number,
      timeDelta: number,
    ) {
      def.tick.call(this, time, timeDelta);
    },
    remove: function (this: NadirTriggerComponentInstance) {
      def.remove.call(this);
    },
  };
  return instance;
}

describe("VR Spatial HUD Constants & Component", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete (globalThis as unknown as { AFRAME?: unknown }).AFRAME;
  });

  it("exports declarative spatial metrics and cultural-design-system colors", () => {
    expect(VR_HUD_SUMMON_PITCH_THRESHOLD_DEG).toBe(-60);
    expect(VR_HUD_FOCAL_DISTANCE_M).toBe(1.5);
    expect(VR_HUD_FOCAL_ELEVATION_OFFSET_M).toBe(-0.15);
    expect(VR_HUD_SUMMON_TIMEOUT_MS).toBe(1000);
    expect(VR_HUD_ANIMATION_DURATION_MS).toBe(250);

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
    // Facing -Z (yaw = 0)
    const forward = calculateHudWorldTransform({
      position: { x: 0, y: 1.6, z: 0 },
      yawRad: 0,
    });
    expect(forward.position.x).toBeCloseTo(0, 3);
    expect(forward.position.y).toBeCloseTo(1.45, 3);
    expect(forward.position.z).toBeCloseTo(-1.5, 3);
    expect(forward.rotationDeg.y).toBeCloseTo(0, 3);

    // Facing -X (yaw = +PI/2)
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
    expect(roomChip?.getAttribute("value")).toBe(
      ROOM_DEFINITIONS[DEFAULT_ROOM_ID].title,
    );
    expect(switchBtn?.classList.contains("clickable")).toBe(true);
    expect(exitBtn?.classList.contains("clickable")).toBe(true);
    expect(dismissBtn?.classList.contains("clickable")).toBe(true);

    // Focus an exhibit and verify summon aborts it
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

    // Update room title dynamically
    instance.setRoomTitle(RoomId.TEXTILES);
    expect(roomChip?.getAttribute("value")).toBe(
      ROOM_DEFINITIONS[RoomId.TEXTILES].title,
    );

    // Dismiss via button click
    dismissBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(instance.isOpen).toBe(false);
    expect(el.getAttribute("visible")).toBe("false");
    expect(el.getAttribute("scale")).toBe("0.001 0.001 0.001");

    // Disabled HUD ignores summon
    instance.setEnabled(false);
    instance.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(instance.isOpen).toBe(false);
  });

  it("registers cv-nadir-trigger, validates pitch bounds, enforces gaze dwell, and suppresses 2D mode", () => {
    const registered: Record<string, unknown> = {};
    (globalThis as unknown as { AFRAME?: unknown }).AFRAME = {
      registerComponent: (name: string, def: unknown) => {
        registered[name] = def;
      },
    };

    registerNadirTriggerComponent();
    expect(registered["cv-nadir-trigger"]).toBeDefined();

    expect(isNadirPitchReached(-59.9)).toBe(false);
    expect(isNadirPitchReached(-60)).toBe(true);
    expect(isNadirPitchReached(-75)).toBe(true);

    const scene = document.createElement("a-scene");
    const cam = document.createElement("a-camera") as HTMLElement & {
      object3D?: {
        position?: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number };
      };
    };
    cam.object3D = {
      position: { x: 1, y: 1.6, z: -2 },
      rotation: { x: (-65 * Math.PI) / 180, y: 0, z: 0 },
    };
    scene.appendChild(cam);
    document.body.appendChild(scene);

    expect(extractCameraPitchDeg(cam)).toBeCloseTo(-65, 2);

    const t1 = ensureNadirTrigger(scene) as NadirTriggerEntity;
    const t2 = ensureNadirTrigger(scene);
    expect(t1).toBe(t2);
    expect(t1.getAttribute("id")).toBe(VR_HUD_ELEMENT_IDS.NADIR_TRIGGER);

    const nadir = createMockNadirInstance(t1);
    nadir.init();

    let summonCount = 0;
    let eventCount = 0;
    nadir.setSummonHandler(() => {
      summonCount++;
    });
    t1.addEventListener(NADIR_SUMMON_EVENT, () => {
      eventCount++;
    });

    // Above threshold: remains hidden
    nadir.evaluatePitchAndDwell(-30, 500);
    expect(nadir.isGlyphVisible).toBe(false);
    expect(t1.getAttribute("visible")).toBe("false");

    // Tick reveals rune and tracks camera XZ pivot
    nadir.tick(0, 16);
    expect(nadir.isGlyphVisible).toBe(true);
    expect(t1.getAttribute("visible")).toBe("true");
    expect(t1.getAttribute("position")).toBe(
      `1 ${VR_HUD_GEOMETRY.RUNE_FLOOR_Y_OFFSET_M} -2`,
    );

    // Gaze enters rune and accumulates dwell up to VR_HUD_SUMMON_TIMEOUT_MS
    const hitDisc = t1.querySelector(".cv-nadir-hit");
    expect(hitDisc).toBeTruthy();
    hitDisc?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    nadir.evaluatePitchAndDwell(-65, 500);
    expect(summonCount).toBe(0);
    nadir.evaluatePitchAndDwell(-65, 500);
    expect(summonCount).toBe(1);
    expect(eventCount).toBe(1);

    // Looking back up hides rune and resets dwell
    nadir.evaluatePitchAndDwell(-10, 16);
    expect(nadir.isGlyphVisible).toBe(false);
    expect(nadir.dwellElapsedMs).toBe(0);

    // Disabled (2D touch mode) suppresses trigger even below -60 deg
    nadir.setEnabled(false);
    nadir.evaluatePitchAndDwell(-75, 1200);
    expect(nadir.isGlyphVisible).toBe(false);
    expect(summonCount).toBe(1);
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

    // Summon and trigger Switch to 2D
    hud.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    expect(hud.isOpen).toBe(true);

    const switchBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.SWITCH_2D_BTN}`);
    switchBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(hud.isOpen).toBe(false);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXPERIENCE_3D);
    expect(fsm.getSession().viewMode).toBe(ViewMode.TOUCH_2D);

    // Re-enter VR scenario and test Exit Tour button
    fsm.dispatch(NavigationAction.REQUEST_EXIT);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);
    fsm.dispatch(NavigationAction.RESUME_TOUR);

    hud.summon({ position: { x: 0, y: 1.6, z: 0 }, yawRad: 0 });
    const exitBtn = el.querySelector(`#${VR_HUD_ELEMENT_IDS.EXIT_BTN}`);
    exitBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(hud.isOpen).toBe(false);
    expect(fsm.getCurrentScreen()).toBe(ScreenId.EXIT_MODAL);
  });

  it("synchronizes 2D DOM HUD vs 3D spatial HUD in ExperienceScreenView and persists across room transitions", () => {
    const scene = document.createElement("a-scene");
    const camera = document.createElement("a-camera");
    const cursor = document.createElement("a-cursor");
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
    const nadirEl = scene.querySelector(
      `#${VR_HUD_ELEMENT_IDS.NADIR_TRIGGER}`,
    ) as NadirTriggerEntity;
    expect(hudEl).toBeTruthy();
    expect(nadirEl).toBeTruthy();
    expect(
      hudEl.closest(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`),
    ).toBeNull();
    expect(
      nadirEl.closest(`#${ExhibitRoomBuilder.ROOM_CONTAINER_ID}`),
    ).toBeNull();

    // Attach mock A-Frame component instances so lifecycle calls propagate cleanly
    const hudInstance = createMockHudInstance(hudEl);
    hudInstance.init();
    const nadirInstance = createMockNadirInstance(nadirEl);
    nadirInstance.init();
    (
      hudEl as unknown as {
        components?: Record<string, VrHologramHudComponentInstance>;
      }
    ).components = { "cv-vr-hologram-hud": hudInstance };
    (
      nadirEl as unknown as {
        components?: Record<string, NadirTriggerComponentInstance>;
      }
    ).components = { "cv-nadir-trigger": nadirInstance };

    // Nadir summon event opens the 3D HUD in VR mode
    nadirEl.dispatchEvent(new CustomEvent(NADIR_SUMMON_EVENT, { bubbles: true }));
    expect(hudInstance.isOpen).toBe(true);
    expect(hudEl.getAttribute("visible")).toBe("true");

    // Room transition dismisses active HUD, preserves persistent HUD/nadir entities, and updates room chip
    const transitioned = screen.transitionToRoom(RoomId.TEXTILES);
    expect(transitioned).toBe(true);
    expect(hudInstance.isOpen).toBe(false);
    expect(scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`)).toBe(hudEl);
    expect(scene.querySelector(`#${VR_HUD_ELEMENT_IDS.NADIR_TRIGGER}`)).toBe(
      nadirEl,
    );
    expect(
      hudEl
        .querySelector(`#${VR_HUD_ELEMENT_IDS.ROOM_CHIP}`)
        ?.getAttribute("value"),
    ).toBe(ROOM_DEFINITIONS[RoomId.TEXTILES].title);

    // 3D HUD events dispatch NavigationActions in VR mode
    hudEl.dispatchEvent(
      new CustomEvent(VR_HUD_SWITCH_2D_EVENT, { bubbles: true }),
    );
    hudEl.dispatchEvent(new CustomEvent(VR_HUD_EXIT_EVENT, { bubbles: true }));
    expect(dispatched).toEqual([
      NavigationAction.SWITCH_TO_TOUCH,
      NavigationAction.REQUEST_EXIT,
    ]);

    // Switching to 2D touch mode reveals 2D DOM HUD and disables spatial HUD/nadir
    screen.setViewMode(ViewMode.TOUCH_2D);
    screen.show();
    expect(topBar.classList.contains("cv-hud-topbar--hidden")).toBe(false);
    expect(nadirInstance.enabled).toBe(false);
    expect(hudInstance.enabled).toBe(false);

    screen.unmount();
  });
});
