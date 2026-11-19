import {
  DEFAULT_ROOM_ID,
  InspectionState,
  ROOM_DEFINITIONS,
  VR_HUD_ANIMATION_DURATION_MS,
  VR_HUD_COLORS,
  VR_HUD_DICTIONARY,
  VR_HUD_DISMISS_BUFFER_MS,
  VR_HUD_ELEMENT_IDS,
  VR_HUD_FOCAL_DISTANCE_M,
  VR_HUD_FOCAL_ELEVATION_OFFSET_M,
  VR_HUD_GEOMETRY,
  VR_HUD_HIDDEN_SCALE,
  VR_HUD_VISIBLE_SCALE,
  type Vector3D,
} from "../constants";
import { RoomId } from "../types";
import { getSharedInspectionController } from "./inspectable";

export const VR_HUD_SWITCH_2D_EVENT = "cv-vr-hud-switch-2d";
export const VR_HUD_RETURN_LOBBY_EVENT = "cv-vr-hud-return-lobby";
export const VR_HUD_EXIT_EVENT = "cv-vr-hud-exit";
export const VR_HUD_DISMISS_EVENT = "cv-vr-hud-dismiss";

export interface VrHudActionCallbacks {
  readonly onSwitchTo2D?: () => void;
  readonly onReturnToLobby?: () => void;
  readonly onRequestExit?: () => void;
  readonly onDismiss?: () => void;
}

export interface VrHudCameraPose {
  readonly position: Vector3D;
  readonly yawRad: number;
}

export interface VrHudWorldTransform {
  readonly position: Vector3D;
  readonly rotationDeg: Vector3D;
}

export interface VrHologramHudEntity extends HTMLElement {
  object3D?: {
    visible?: boolean;
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
  };
  sceneEl?: HTMLElement;
}

export interface VrHologramHudComponentInstance {
  el: VrHologramHudEntity;
  data?: {
    enabled?: boolean;
    roomId?: string;
  };
  isOpen: boolean;
  enabled: boolean;
  activeRoomId: RoomId;
  callbacks: VrHudActionCallbacks;
  roomChipEl: HTMLElement | null;
  returnLobbyBtnEl?: HTMLElement | null;
  hudEpoch?: number;
  dismissTimer?: ReturnType<typeof setTimeout> | null;
  hudOutCompleteHandler?: (() => void) | null;
  interactiveEls?: HTMLElement[];
  unsubscribeInspection?: (() => void) | null;
  init: () => void;
  setCallbacks: (callbacks: VrHudActionCallbacks) => void;
  setEnabled: (enabled: boolean) => void;
  setRoomTitle: (roomId: RoomId) => void;
  summon: (pose?: VrHudCameraPose) => void;
  dismiss: () => void;
  remove: () => void;
}

function setElementClickable(el: HTMLElement, enabled: boolean): void {
  const current = el.getAttribute("class") ?? "";
  const filtered = current
    .split(/\s+/)
    .filter((cls) => cls.length > 0 && cls !== "clickable");
  if (enabled) {
    filtered.push("clickable");
  }
  el.setAttribute("class", filtered.join(" "));
}

function setHudInteractiveClickable(
  instance: VrHologramHudComponentInstance,
  enabled: boolean,
): void {
  if (!instance.interactiveEls) {
    return;
  }
  const canReturnToLobby = instance.activeRoomId !== RoomId.LOBBY;
  for (const el of instance.interactiveEls) {
    if (el === instance.returnLobbyBtnEl) {
      setElementClickable(el, enabled && canReturnToLobby);
    } else {
      setElementClickable(el, enabled);
    }
  }
}

function clearPendingHudDismiss(
  instance: VrHologramHudComponentInstance,
): void {
  if (instance.dismissTimer !== null && instance.dismissTimer !== undefined) {
    clearTimeout(instance.dismissTimer);
    instance.dismissTimer = null;
  }
  if (instance.hudOutCompleteHandler) {
    instance.el.removeEventListener?.(
      "animationcomplete__hud_out",
      instance.hudOutCompleteHandler,
    );
    instance.hudOutCompleteHandler = null;
  }
}

/**
 * Computes world-space position and Y-rotation for the HUD panel
 * placed at focal distance ahead of the camera along its gaze azimuth.
 */
export function calculateHudWorldTransform(
  pose: VrHudCameraPose,
): VrHudWorldTransform {
  const forwardX = -Math.sin(pose.yawRad);
  const forwardZ = -Math.cos(pose.yawRad);

  const posX = Number(
    (pose.position.x + forwardX * VR_HUD_FOCAL_DISTANCE_M).toFixed(4),
  );
  const posY = Number(
    (pose.position.y + VR_HUD_FOCAL_ELEVATION_OFFSET_M).toFixed(4),
  );
  const posZ = Number(
    (pose.position.z + forwardZ * VR_HUD_FOCAL_DISTANCE_M).toFixed(4),
  );

  const yawDeg = Number(((pose.yawRad * 180) / Math.PI).toFixed(3));

  return {
    position: { x: posX, y: posY, z: posZ },
    rotationDeg: { x: 0, y: yawDeg, z: 0 },
  };
}

/**
 * Extracts world position and yaw (radians) from the active scene camera.
 */
export function readCameraPoseFromScene(
  sceneEl: HTMLElement | null | undefined,
): VrHudCameraPose {
  const fallback: VrHudCameraPose = {
    position: { x: 0, y: 1.6, z: 0 },
    yawRad: 0,
  };
  if (!sceneEl) {
    return fallback;
  }

  const cameraEl =
    sceneEl.querySelector("a-camera") || sceneEl.querySelector("[camera]");
  if (!cameraEl) {
    return fallback;
  }

  const obj3D = (
    cameraEl as unknown as {
      object3D?: {
        position?: { x: number; y: number; z: number };
        rotation?: { y: number };
      };
    }
  ).object3D;

  const pos = obj3D?.position;
  const yawRad = typeof obj3D?.rotation?.y === "number" ? obj3D.rotation.y : 0;

  return {
    position: {
      x: typeof pos?.x === "number" ? pos.x : fallback.position.x,
      y: typeof pos?.y === "number" ? pos.y : fallback.position.y,
      z: typeof pos?.z === "number" ? pos.z : fallback.position.z,
    },
    yawRad,
  };
}

function createHudButtonEntity(options: {
  id: string;
  action: string;
  label: string;
  position: string;
  rotation?: string;
  backgroundColor: string;
  borderColor: string;
  width?: number;
  height?: number;
}): HTMLElement {
  const width = options.width ?? VR_HUD_GEOMETRY.BUTTON_WIDTH_M;
  const height = options.height ?? VR_HUD_GEOMETRY.BUTTON_HEIGHT_M;

  const btn = document.createElement("a-entity");
  btn.setAttribute("id", options.id);
  btn.setAttribute("class", "cv-hud-control");
  btn.setAttribute("data-action", options.action);
  btn.setAttribute("position", options.position);
  if (options.rotation) {
    btn.setAttribute("rotation", options.rotation);
  }
  btn.setAttribute("geometry", `primitive: plane; width: ${width}; height: ${height}`);
  btn.setAttribute(
    "material",
    `shader: flat; color: ${options.backgroundColor}; opacity: 0.95`,
  );

  const accentBar = document.createElement("a-plane");
  accentBar.setAttribute("width", String(width));
  accentBar.setAttribute("height", "0.018");
  accentBar.setAttribute("position", `0 ${height / 2 - 0.009} 0.005`);
  accentBar.setAttribute("color", options.borderColor);
  accentBar.setAttribute("material", "shader: flat");

  const labelEl = document.createElement("a-text");
  labelEl.setAttribute("value", options.label);
  labelEl.setAttribute("align", "center");
  labelEl.setAttribute("color", VR_HUD_COLORS.TEXT_BONE);
  labelEl.setAttribute("width", "1.35");
  labelEl.setAttribute("position", "0 0 0.01");

  btn.append(accentBar, labelEl);
  return btn;
}

export function createVrHologramHudComponentDefinition() {
  return {
    schema: {
      enabled: { type: "boolean", default: true },
      roomId: { type: "string", default: DEFAULT_ROOM_ID },
    },

    init: function (this: VrHologramHudComponentInstance) {
      this.isOpen = false;
      this.enabled = this.data?.enabled ?? true;
      this.activeRoomId =
        (this.data?.roomId as RoomId) || DEFAULT_ROOM_ID;
      this.callbacks = this.callbacks ?? {};
      this.roomChipEl = null;
      this.hudEpoch = 0;
      this.dismissTimer = null;
      this.hudOutCompleteHandler = null;

      this.el.setAttribute("visible", "false");
      this.el.setAttribute("scale", VR_HUD_HIDDEN_SCALE);
      if (this.el.object3D) {
        this.el.object3D.visible = false;
      }

      // Build curved obsidian Nierika backdrop centered in front of the viewer
      const thetaStart = 180 - VR_HUD_GEOMETRY.THETA_LENGTH_DEG / 2;
      const backdrop = document.createElement("a-cylinder");
      backdrop.setAttribute("id", VR_HUD_ELEMENT_IDS.PANEL_BACKDROP);
      backdrop.setAttribute("class", "cv-hud-backdrop");
      backdrop.setAttribute("radius", String(VR_HUD_GEOMETRY.CURVED_RADIUS_M));
      backdrop.setAttribute("height", String(VR_HUD_GEOMETRY.PANEL_HEIGHT_M));
      backdrop.setAttribute("theta-start", String(thetaStart));
      backdrop.setAttribute(
        "theta-length",
        String(VR_HUD_GEOMETRY.THETA_LENGTH_DEG),
      );
      backdrop.setAttribute("open-ended", "true");
      backdrop.setAttribute(
        "position",
        `0 0 ${VR_HUD_GEOMETRY.CURVED_RADIUS_M}`,
      );
      backdrop.setAttribute(
        "material",
        `shader: flat; side: back; color: ${VR_HUD_COLORS.SURFACE_OBSIDIAN}; transparent: true; opacity: ${VR_HUD_COLORS.SURFACE_OPACITY}`,
      );
      backdrop.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
      });

      // Top golden Nierika frame accent bar
      const topTrim = document.createElement("a-plane");
      topTrim.setAttribute("width", String(VR_HUD_GEOMETRY.PANEL_WIDTH_M));
      topTrim.setAttribute("height", "0.015");
      topTrim.setAttribute(
        "position",
        `0 ${VR_HUD_GEOMETRY.PANEL_HEIGHT_M / 2 - 0.02} 0.03`,
      );
      topTrim.setAttribute("color", VR_HUD_COLORS.ACCENT_CEMPASUCHIL);
      topTrim.setAttribute("material", "shader: flat");

      // Active room title chip
      const roomChip = document.createElement("a-text");
      roomChip.setAttribute("id", VR_HUD_ELEMENT_IDS.ROOM_CHIP);
      roomChip.setAttribute("align", "center");
      roomChip.setAttribute("color", VR_HUD_COLORS.ACCENT_CEMPASUCHIL);
      roomChip.setAttribute("width", "1.75");
      roomChip.setAttribute("position", "0 0.27 0.04");
      this.roomChipEl = roomChip;

      // Direct Switch to 2D Touch button
      const switch2dBtn = createHudButtonEntity({
        id: VR_HUD_ELEMENT_IDS.SWITCH_2D_BTN,
        action: "switch-to-touch",
        label: VR_HUD_DICTIONARY.SWITCH_TO_2D_LABEL,
        position: "-0.34 0.0 0.06",
        rotation: "0 10 0",
        backgroundColor: VR_HUD_COLORS.SURFACE_OBSIDIAN,
        borderColor: VR_HUD_COLORS.ACCENT_TURQUESA,
      });

      switch2dBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        this.dismiss();
        if (this.callbacks.onSwitchTo2D) {
          this.callbacks.onSwitchTo2D();
        }
        this.el.dispatchEvent?.(
          new CustomEvent(VR_HUD_SWITCH_2D_EVENT, { bubbles: true }),
        );
      });

      // Exit Tour modal trigger button
      const exitBtn = createHudButtonEntity({
        id: VR_HUD_ELEMENT_IDS.EXIT_BTN,
        action: "request-exit",
        label: VR_HUD_DICTIONARY.EXIT_TOUR_LABEL,
        position: "0.34 0.0 0.06",
        rotation: "0 -10 0",
        backgroundColor: VR_HUD_COLORS.SURFACE_OBSIDIAN,
        borderColor: VR_HUD_COLORS.ACCENT_COCHINILLA,
      });

      exitBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        this.dismiss();
        if (this.callbacks.onRequestExit) {
          this.callbacks.onRequestExit();
        }
        this.el.dispatchEvent?.(
          new CustomEvent(VR_HUD_EXIT_EVENT, { bubbles: true }),
        );
      });

      // Conditional Return to Lobby button (hidden when activeRoomId === LOBBY)
      const returnLobbyBtn = createHudButtonEntity({
        id: VR_HUD_ELEMENT_IDS.RETURN_LOBBY_BTN,
        action: "return-lobby",
        label: VR_HUD_DICTIONARY.RETURN_LOBBY_LABEL,
        position: "0 -0.28 0.06",
        width: VR_HUD_GEOMETRY.LOBBY_BUTTON_WIDTH_M,
        height: VR_HUD_GEOMETRY.LOBBY_BUTTON_HEIGHT_M,
        backgroundColor: VR_HUD_COLORS.SURFACE_OBSIDIAN,
        borderColor: VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
      });
      this.returnLobbyBtnEl = returnLobbyBtn;
      this.setRoomTitle(this.activeRoomId);

      returnLobbyBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        this.dismiss();
        if (this.callbacks.onReturnToLobby) {
          this.callbacks.onReturnToLobby();
        }
        this.el.dispatchEvent?.(
          new CustomEvent(VR_HUD_RETURN_LOBBY_EVENT, { bubbles: true }),
        );
      });

      // Top-right circular dismiss button
      const dismissBtn = document.createElement("a-entity");
      dismissBtn.setAttribute("id", VR_HUD_ELEMENT_IDS.DISMISS_BTN);
      dismissBtn.setAttribute("class", "cv-hud-control");
      dismissBtn.setAttribute("data-action", "dismiss-hud");
      dismissBtn.setAttribute("position", "0.60 0.28 0.08");
      dismissBtn.setAttribute("rotation", "0 -14 0");
      dismissBtn.setAttribute(
        "geometry",
        `primitive: circle; radius: ${VR_HUD_GEOMETRY.DISMISS_RADIUS_M}`,
      );
      dismissBtn.setAttribute(
        "material",
        `shader: flat; color: ${VR_HUD_COLORS.ACCENT_COCHINILLA}`,
      );

      const dismissLabel = document.createElement("a-text");
      dismissLabel.setAttribute("value", VR_HUD_DICTIONARY.DISMISS_LABEL);
      dismissLabel.setAttribute("align", "center");
      dismissLabel.setAttribute("color", VR_HUD_COLORS.TEXT_BONE);
      dismissLabel.setAttribute("width", "1.4");
      dismissLabel.setAttribute("position", "0 0 0.01");
      dismissBtn.appendChild(dismissLabel);

      dismissBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        this.dismiss();
      });

      this.interactiveEls = [
        backdrop,
        switch2dBtn,
        exitBtn,
        returnLobbyBtn,
        dismissBtn,
      ];
      this.el.append(
        backdrop,
        topTrim,
        roomChip,
        switch2dBtn,
        exitBtn,
        returnLobbyBtn,
        dismissBtn,
      );

      this.unsubscribeInspection?.();
      this.unsubscribeInspection = getSharedInspectionController().subscribe(
        (state) => {
          if (
            this.isOpen &&
            (state === InspectionState.FOCUSING ||
              state === InspectionState.INSPECTING)
          ) {
            this.dismiss();
          }
        },
      );
    },

    setCallbacks: function (
      this: VrHologramHudComponentInstance,
      callbacks: VrHudActionCallbacks,
    ) {
      this.callbacks = callbacks;
    },

    setEnabled: function (
      this: VrHologramHudComponentInstance,
      enabled: boolean,
    ) {
      this.enabled = enabled;
      if (!enabled && this.isOpen) {
        this.dismiss();
      }
    },

    setRoomTitle: function (
      this: VrHologramHudComponentInstance,
      roomId: RoomId,
    ) {
      this.activeRoomId = roomId;
      const roomDef =
        ROOM_DEFINITIONS[roomId] ?? ROOM_DEFINITIONS[DEFAULT_ROOM_ID];
      if (this.roomChipEl) {
        this.roomChipEl.setAttribute("value", roomDef.title);
      }
      if (this.returnLobbyBtnEl) {
        const showReturnLobby = roomId !== RoomId.LOBBY;
        this.returnLobbyBtnEl.setAttribute(
          "visible",
          showReturnLobby ? "true" : "false",
        );
        setElementClickable(
          this.returnLobbyBtnEl,
          this.isOpen && showReturnLobby,
        );
      }
    },

    summon: function (
      this: VrHologramHudComponentInstance,
      pose?: VrHudCameraPose,
    ) {
      if (!this.enabled) {
        return;
      }

      clearPendingHudDismiss(this);
      this.hudEpoch = (this.hudEpoch ?? 0) + 1;

      // Abort any active exhibit inspection to avoid spatial overlap
      getSharedInspectionController().abortActiveInspection();

      const resolvedPose =
        pose ??
        readCameraPoseFromScene(
          this.el.sceneEl ??
            (typeof document !== "undefined"
              ? document.querySelector<HTMLElement>("a-scene")
              : null),
        );
      const transform = calculateHudWorldTransform(resolvedPose);

      const posAttr = `${transform.position.x} ${transform.position.y} ${transform.position.z}`;
      const rotAttr = `${transform.rotationDeg.x} ${transform.rotationDeg.y} ${transform.rotationDeg.z}`;

      this.el.setAttribute("position", posAttr);
      this.el.setAttribute("rotation", rotAttr);
      if (this.el.object3D?.position) {
        this.el.object3D.position.x = transform.position.x;
        this.el.object3D.position.y = transform.position.y;
        this.el.object3D.position.z = transform.position.z;
      }
      if (this.el.object3D?.rotation) {
        this.el.object3D.rotation.x = 0;
        this.el.object3D.rotation.y = resolvedPose.yawRad;
        this.el.object3D.rotation.z = 0;
      }

      this.el.removeAttribute("animation__hud_out");
      this.el.setAttribute("visible", "true");
      if (this.el.object3D) {
        this.el.object3D.visible = true;
      }
      this.isOpen = true;
      setHudInteractiveClickable(this, true);

      const hasAFrame =
        typeof globalThis !== "undefined" &&
        Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

      if (!hasAFrame) {
        this.el.setAttribute("scale", VR_HUD_VISIBLE_SCALE);
      } else {
        this.el.setAttribute("scale", VR_HUD_HIDDEN_SCALE);
        this.el.setAttribute(
          "animation__hud_in",
          `property: scale; from: ${VR_HUD_HIDDEN_SCALE}; to: ${VR_HUD_VISIBLE_SCALE}; dur: ${VR_HUD_ANIMATION_DURATION_MS}; easing: easeOutCubic`,
        );
      }
    },

    dismiss: function (this: VrHologramHudComponentInstance) {
      setHudInteractiveClickable(this, false);
      if (!this.isOpen) {
        this.el.setAttribute("visible", "false");
        if (this.el.object3D) {
          this.el.object3D.visible = false;
        }
        return;
      }

      clearPendingHudDismiss(this);
      const epoch = (this.hudEpoch ?? 0) + 1;
      this.hudEpoch = epoch;
      this.isOpen = false;
      this.el.removeAttribute("animation__hud_in");

      const hasAFrame =
        typeof globalThis !== "undefined" &&
        Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

      const finalizeHide = () => {
        if (this.hudEpoch !== epoch || this.isOpen) {
          return;
        }
        clearPendingHudDismiss(this);
        this.el.setAttribute("scale", VR_HUD_HIDDEN_SCALE);
        this.el.setAttribute("visible", "false");
        if (this.el.object3D) {
          this.el.object3D.visible = false;
        }
      };

      if (!hasAFrame) {
        finalizeHide();
      } else {
        this.el.setAttribute(
          "animation__hud_out",
          `property: scale; from: ${VR_HUD_VISIBLE_SCALE}; to: ${VR_HUD_HIDDEN_SCALE}; dur: ${VR_HUD_ANIMATION_DURATION_MS}; easing: easeInCubic`,
        );
        if (typeof this.el.addEventListener === "function") {
          this.hudOutCompleteHandler = finalizeHide;
          this.el.addEventListener("animationcomplete__hud_out", finalizeHide, {
            once: true,
          });
        }
        this.dismissTimer = setTimeout(
          finalizeHide,
          VR_HUD_ANIMATION_DURATION_MS + VR_HUD_DISMISS_BUFFER_MS,
        );
      }

      if (this.callbacks.onDismiss) {
        this.callbacks.onDismiss();
      }
      this.el.dispatchEvent?.(
        new CustomEvent(VR_HUD_DISMISS_EVENT, { bubbles: true }),
      );
    },

    remove: function (this: VrHologramHudComponentInstance) {
      this.hudEpoch = (this.hudEpoch ?? 0) + 1;
      clearPendingHudDismiss(this);
      this.unsubscribeInspection?.();
      this.unsubscribeInspection = null;
      setHudInteractiveClickable(this, false);
      this.isOpen = false;
      this.roomChipEl = null;
      this.returnLobbyBtnEl = null;
      this.interactiveEls = [];
    },
  };
}

export function registerVrHologramHudComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-vr-hologram-hud",
      createVrHologramHudComponentDefinition(),
    );
  }
}

export function ensureVrHologramHud(sceneEl: HTMLElement): HTMLElement {
  let hudEl = sceneEl.querySelector(
    `#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`,
  ) as HTMLElement | null;
  if (hudEl) {
    return hudEl;
  }

  hudEl = document.createElement("a-entity");
  hudEl.setAttribute("id", VR_HUD_ELEMENT_IDS.HUD_ROOT);
  hudEl.setAttribute("visible", "false");
  hudEl.setAttribute("cv-vr-hologram-hud", "");
  sceneEl.appendChild(hudEl);
  return hudEl;
}

if (typeof globalThis !== "undefined") {
  registerVrHologramHudComponent();
}
