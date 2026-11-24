import {
  DEFAULT_ROOM_ID,
  InspectionState,
  PLAYER_RIG_TOKENS,
  ROOM_DEFINITIONS,
  ROOM_PORTAL_ACCENTS,
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
import {
  createCanvasTextureFromDrawer,
  renderFajaBorderPattern,
  renderHudIconGlyph,
  type HudIconId,
  type ProceduralHudTexture,
} from "../faja-pattern-renderer";
import { RoomId } from "../types";
import {
  createCanvasTextPlane,
  setCanvasTextElement,
} from "./canvas-text";
import { getSharedInspectionController } from "./inspectable";
import {
  AudioPreferencesStore,
  getSharedAudioPreferencesStore,
} from "../audio/audio-preferences-store";
import {
  AudioEngine,
  getSharedAudioEngine,
} from "../audio/audio-engine";
import { AUDIO_TOKENS, SfxId } from "../audio/audio-constants";
import { getSharedSfxPlayer } from "../audio/sfx-player";
import {
  computeVolumeBarState,
  quantizeVolumeStep,
} from "../audio/volume-bars";
import {
  ReticlePreferencesStore,
  getSharedReticlePreferencesStore,
} from "../reticle-preferences-store";
import {
  RETICLE_IDLE_BEHAVIOR,
  type ReticleFusePreset,
  type ReticleSizePreset,
} from "../constants";

export const VR_HUD_RETURN_LOBBY_EVENT = "cv-vr-hud-return-lobby";
export const VR_HUD_DISMISS_EVENT = "cv-vr-hud-dismiss";
export const VR_HUD_SOUND_TOGGLE_EVENT = "cv-vr-hud-sound-toggle";
export const VR_HUD_VOLUME_CHANGE_EVENT = "cv-vr-hud-volume-change";
export const VR_HUD_RETICLE_PREFS_EVENT = "cv-vr-hud-reticle-prefs";

export type VrHudTab = "AUDIO" | "RETICLE";

export interface VrHudActionCallbacks {
  readonly onReturnToLobby?: () => void;
  readonly onDismiss?: () => void;
  readonly onToggleSound?: () => void;
}

export interface VrHologramHudDeps {
  readonly audioPreferencesStore?: AudioPreferencesStore;
  readonly audioEngine?: Pick<AudioEngine, "unlockFromUserGesture">;
  readonly reticlePreferencesStore?: ReticlePreferencesStore;
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
  soundBtnEl?: HTMLElement | null;
  activeTab?: VrHudTab;
  audioGroupEl?: HTMLElement | null;
  reticleGroupEl?: HTMLElement | null;
  audioTabBtnEl?: HTMLElement | null;
  reticleTabBtnEl?: HTMLElement | null;
  hudEpoch?: number;
  dismissTimer?: ReturnType<typeof setTimeout> | null;
  hudOutCompleteHandler?: (() => void) | null;
  interactiveEls?: HTMLElement[];
  audioInteractiveEls?: HTMLElement[];
  reticleInteractiveEls?: HTMLElement[];
  sharedInteractiveEls?: HTMLElement[];
  ownedTextures?: ProceduralHudTexture[];
  lastTransform?: VrHudWorldTransform | null;
  unsubscribeInspection?: (() => void) | null;
  unsubscribeAudioPrefs?: (() => void) | null;
  unsubscribeReticlePrefs?: (() => void) | null;
  init: () => void;
  setCallbacks: (callbacks: VrHudActionCallbacks) => void;
  setEnabled: (enabled: boolean) => void;
  setRoomTitle: (roomId: RoomId) => void;
  setSoundEnabled?: (enabled: boolean) => void;
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
  const activeTab: VrHudTab = instance.activeTab ?? "AUDIO";
  const canReturnToLobby = instance.activeRoomId !== RoomId.LOBBY;

  if (instance.sharedInteractiveEls) {
    for (const el of instance.sharedInteractiveEls) {
      if (el === instance.returnLobbyBtnEl) {
        setElementClickable(el, enabled && canReturnToLobby);
      } else {
        setElementClickable(el, enabled);
      }
    }
  } else if (instance.interactiveEls) {
    for (const el of instance.interactiveEls) {
      if (el === instance.returnLobbyBtnEl) {
        setElementClickable(el, enabled && canReturnToLobby);
      } else {
        setElementClickable(el, enabled);
      }
    }
  }

  for (const el of instance.audioInteractiveEls ?? []) {
    setElementClickable(el, enabled && activeTab === "AUDIO");
  }
  for (const el of instance.reticleInteractiveEls ?? []) {
    setElementClickable(el, enabled && activeTab === "RETICLE");
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

export interface CurvedHudStripTransform {
  readonly radius: number;
  readonly thetaStart: number;
  readonly thetaLength: number;
  readonly centerZ: number;
}

/**
 * Computes cylindrical arc parameters inset radially inside the curved HUD backdrop.
 */
export function computeCurvedHudStripTransform(
  radiusM: number,
  radialInsetM: number,
  thetaLengthDeg: number,
  thetaOffsetDeg: number = 0,
): CurvedHudStripTransform {
  return {
    radius: Number((radiusM - radialInsetM).toFixed(4)),
    thetaStart: Number((180 - thetaLengthDeg / 2 + thetaOffsetDeg).toFixed(4)),
    thetaLength: Number(thetaLengthDeg.toFixed(4)),
    centerZ: Number(radiusM.toFixed(4)),
  };
}

export interface CurvedHudElementTransform {
  readonly position: string;
  readonly rotation: string;
}

/**
 * Places a HUD element along a concentric cylindrical arc strictly in front of the curved backdrop.
 */
export function computeCurvedHudElementTransform(
  arcOffsetX: number,
  yPos: number,
  clearanceM: number = VR_HUD_GEOMETRY.UI_RADIAL_CLEARANCE_M,
): CurvedHudElementTransform {
  const backdropRadius = VR_HUD_GEOMETRY.CURVED_RADIUS_M;
  const uiRadius = backdropRadius - clearanceM;
  const thetaRad = uiRadius > 0 ? arcOffsetX / uiRadius : 0;
  const x = Number((uiRadius * Math.sin(thetaRad)).toFixed(4));
  const y = Number(yPos.toFixed(4));
  const z = Number((backdropRadius - uiRadius * Math.cos(thetaRad)).toFixed(4));
  const yawDeg = Number(((-thetaRad * 180) / Math.PI).toFixed(3));
  return {
    position: `${x} ${y} ${z}`,
    rotation: `0 ${yawDeg} 0`,
  };
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
function readAncestorYawRad(cameraEl: Element, sceneEl: HTMLElement): number {
  let totalRad = 0;
  let ancestor = cameraEl.parentElement;
  while (ancestor && ancestor !== sceneEl) {
    const parentRot = (
      ancestor as unknown as {
        object3D?: { rotation?: { y?: number } };
      }
    ).object3D?.rotation;
    if (parentRot && typeof parentRot.y === "number") {
      totalRad += parentRot.y;
    } else {
      const rotAttr = ancestor.getAttribute("rotation");
      if (typeof rotAttr === "string") {
        const parts = rotAttr.trim().split(/\s+/).map(Number);
        if (Number.isFinite(parts[1])) {
          totalRad += (parts[1] * Math.PI) / 180;
        }
      }
    }
    ancestor = ancestor.parentElement;
  }
  return totalRad;
}

interface Vector3Scratch {
  x: number;
  y: number;
  z: number;
  set: (x: number, y: number, z: number) => Vector3Scratch;
  setFromMatrixPosition: (matrix: { elements?: ArrayLike<number> }) => Vector3Scratch;
  normalize: () => Vector3Scratch;
  negate: () => Vector3Scratch;
}

interface PoseReadableCamera {
  getWorldPosition?: (out: Vector3Scratch) => unknown;
  getWorldDirection?: (out: Vector3Scratch) => unknown;
}

function createScratchVector3(): Vector3Scratch {
  const GlobalThree = (
    globalThis as unknown as {
      THREE?: { Vector3?: new () => Vector3Scratch };
    }
  ).THREE;
  if (GlobalThree?.Vector3) {
    return new GlobalThree.Vector3();
  }
  const vec: Vector3Scratch = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
    setFromMatrixPosition(matrix: { elements?: ArrayLike<number> }) {
      const e = matrix?.elements;
      if (e && e.length >= 15) {
        this.x = e[12];
        this.y = e[13];
        this.z = e[14];
      }
      return this;
    },
    normalize() {
      const len = Math.hypot(this.x, this.y, this.z);
      if (len > 0) {
        this.x /= len;
        this.y /= len;
        this.z /= len;
      }
      return this;
    },
    negate() {
      this.x = -this.x;
      this.y = -this.y;
      this.z = -this.z;
      return this;
    },
  };
  return vec;
}

function readPoseFromThreeCamera(
  cam: PoseReadableCamera | null | undefined,
): VrHudCameraPose | null {
  if (
    !cam ||
    typeof cam.getWorldPosition !== "function" ||
    typeof cam.getWorldDirection !== "function"
  ) {
    return null;
  }
  const pos = createScratchVector3();
  const forward = createScratchVector3();
  cam.getWorldPosition(pos);
  cam.getWorldDirection(forward);
  if (
    !Number.isFinite(pos.x) ||
    !Number.isFinite(pos.y) ||
    !Number.isFinite(pos.z) ||
    !Number.isFinite(forward.x) ||
    !Number.isFinite(forward.z)
  ) {
    return null;
  }
  return {
    position: { x: pos.x, y: pos.y, z: pos.z },
    yawRad: Math.atan2(-forward.x, -forward.z),
  };
}

export function readCameraPoseFromScene(
  sceneEl: HTMLElement | null | undefined,
): VrHudCameraPose {
  const fallback: VrHudCameraPose = {
    position: { x: 0, y: PLAYER_RIG_TOKENS.EYE_HEIGHT_M, z: 0 },
    yawRad: 0,
  };
  if (!sceneEl) {
    return fallback;
  }

  const xrManager = (
    sceneEl as unknown as {
      renderer?: {
        xr?: {
          isPresenting?: boolean;
          getCamera?: () => PoseReadableCamera | null | undefined;
        };
      };
      camera?: PoseReadableCamera | null | undefined;
    }
  ).renderer?.xr;

  if (xrManager?.isPresenting) {
    const xrPose =
      readPoseFromThreeCamera(xrManager.getCamera?.()) ??
      readPoseFromThreeCamera(
        (sceneEl as unknown as { camera?: PoseReadableCamera }).camera,
      );
    if (xrPose) {
      return xrPose;
    }
  }

  const sceneCameraPose = readPoseFromThreeCamera(
    (sceneEl as unknown as { camera?: PoseReadableCamera }).camera,
  );
  if (sceneCameraPose) {
    return sceneCameraPose;
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
        getWorldPosition?: (out: Vector3Scratch) => unknown;
      };
    }
  ).object3D;

  const localYawRad = typeof obj3D?.rotation?.y === "number" ? obj3D.rotation.y : 0;
  const yawRad = localYawRad + readAncestorYawRad(cameraEl, sceneEl);

  if (obj3D && typeof obj3D.getWorldPosition === "function") {
    const worldPos = createScratchVector3();
    obj3D.getWorldPosition(worldPos);
    return {
      position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
      yawRad,
    };
  }

  const pos = obj3D?.position;
  if (!pos) {
    return { position: fallback.position, yawRad };
  }

  // Sum rig ancestor positions up to sceneEl when running under DOM mocks without Three.js
  let worldX = typeof pos.x === "number" ? pos.x : 0;
  let worldY = typeof pos.y === "number" ? pos.y : 0;
  let worldZ = typeof pos.z === "number" ? pos.z : 0;
  let ancestor = cameraEl.parentElement;
  while (ancestor && ancestor !== sceneEl) {
    const parentPos = (
      ancestor as unknown as {
        object3D?: { position?: { x?: number; y?: number; z?: number } };
      }
    ).object3D?.position;
    if (parentPos) {
      worldX += typeof parentPos.x === "number" ? parentPos.x : 0;
      worldY += typeof parentPos.y === "number" ? parentPos.y : 0;
      worldZ += typeof parentPos.z === "number" ? parentPos.z : 0;
    } else {
      const posAttr = ancestor.getAttribute("position");
      if (typeof posAttr === "string") {
        const parts = posAttr.trim().split(/\s+/).map(Number);
        worldX += Number.isFinite(parts[0]) ? parts[0] : 0;
        worldY += Number.isFinite(parts[1]) ? parts[1] : 0;
        worldZ += Number.isFinite(parts[2]) ? parts[2] : 0;
      }
    }
    ancestor = ancestor.parentElement;
  }

  return {
    position: { x: worldX, y: worldY, z: worldZ },
    yawRad,
  };
}

function bindProceduralTexture(
  plane: HTMLElement,
  texture: ProceduralHudTexture | null,
  ownedTextures: ProceduralHudTexture[],
): void {
  if (!texture) {
    return;
  }
  ownedTextures.push(texture);
  const attach = () => {
    const obj3D = (
      plane as unknown as {
        object3D?: {
          traverse?: (cb: (node: unknown) => void) => void;
        };
      }
    ).object3D;
    obj3D?.traverse?.((node: unknown) => {
      const mat = (
        node as {
          material?: { map?: unknown; transparent?: boolean; needsUpdate?: boolean };
        }
      )?.material;
      if (mat) {
        mat.map = texture;
        mat.transparent = true;
        mat.needsUpdate = true;
      }
    });
  };
  attach();
  plane.addEventListener?.("object3dset", attach);
}

function createHudButtonEntity(options: {
  id: string;
  action: string;
  label: string;
  iconId: HudIconId;
  position: string;
  rotation?: string;
  backgroundColor: string;
  borderColor: string;
  ownedTextures: ProceduralHudTexture[];
  width?: number;
  height?: number;
}): HTMLElement {
  const width = options.width ?? VR_HUD_GEOMETRY.BUTTON_WIDTH_M;
  const height = options.height ?? VR_HUD_GEOMETRY.BUTTON_HEIGHT_M;
  const depth = VR_HUD_GEOMETRY.BUTTON_DEPTH_M;

  const btn = document.createElement("a-entity");
  btn.setAttribute("id", options.id);
  btn.setAttribute("class", "cv-hud-control");
  btn.setAttribute("cv-interactive-feedback", "");
  btn.setAttribute("data-action", options.action);
  btn.setAttribute("position", options.position);
  if (options.rotation) {
    btn.setAttribute("rotation", options.rotation);
  }
  btn.setAttribute(
    "geometry",
    `primitive: box; width: ${width}; height: ${height}; depth: ${depth}`,
  );
  btn.setAttribute(
    "material",
    `shader: lambert; color: ${options.backgroundColor}; opacity: 0.95`,
  );

  const accentBar = document.createElement("a-plane");
  accentBar.setAttribute("width", String(width));
  accentBar.setAttribute("height", "0.018");
  accentBar.setAttribute(
    "position",
    `0 ${Number((height / 2 - 0.009).toFixed(4))} ${depth / 2 + 0.004}`,
  );
  accentBar.setAttribute("color", options.borderColor);
  accentBar.setAttribute("material", "shader: flat");

  const iconSize = Number((height * 0.48).toFixed(3));
  const iconEl = document.createElement("a-plane");
  iconEl.setAttribute("class", "cv-hud-btn-icon");
  iconEl.setAttribute("width", String(iconSize));
  iconEl.setAttribute("height", String(iconSize));
  iconEl.setAttribute(
    "position",
    `${Number((-width / 2 + iconSize * 0.85).toFixed(4))} 0 ${depth / 2 + 0.006}`,
  );
  iconEl.setAttribute(
    "material",
    `shader: flat; transparent: true; color: ${options.borderColor}`,
  );
  const iconTex = createCanvasTextureFromDrawer(96, 96, (ctx) =>
    renderHudIconGlyph(ctx, options.iconId, options.borderColor, 96),
  );
  bindProceduralTexture(iconEl, iconTex, options.ownedTextures);

  const labelEl = createCanvasTextPlane({
    value: options.label,
    align: "center",
    baseline: "middle",
    color: VR_HUD_COLORS.TEXT_BONE,
    width: width * 0.72,
    height: height * 0.64,
    fontSizePx: 42,
    fontWeight: "600",
    canvasWidth: 512,
    canvasHeight: 128,
    maxLines: 1,
    position: `${Number((iconSize * 0.42).toFixed(4))} 0 ${depth / 2 + 0.008}`,
  });

  btn.append(accentBar, iconEl, labelEl);
  return btn;
}

function createHudTabButton(options: {
  id: string;
  action: string;
  label: string;
  arcOffsetX: number;
  yPos: number;
  width: number;
  height: number;
}): HTMLElement {
  const transform = computeCurvedHudElementTransform(
    options.arcOffsetX,
    options.yPos,
  );
  const tab = document.createElement("a-entity");
  tab.setAttribute("id", options.id);
  tab.setAttribute("class", "cv-hud-control cv-hud-tab");
  tab.setAttribute("cv-interactive-feedback", "");
  tab.setAttribute("data-hud-role", "tab");
  tab.setAttribute("data-action", options.action);
  tab.setAttribute("data-selected", "false");
  tab.setAttribute("position", transform.position);
  tab.setAttribute("rotation", transform.rotation);
  tab.setAttribute(
    "geometry",
    `primitive: plane; width: ${options.width}; height: ${options.height}`,
  );
  tab.setAttribute(
    "material",
    `shader: flat; color: ${VR_HUD_COLORS.TAB_INACTIVE_SURFACE}; opacity: 0.65; transparent: true`,
  );

  const bottomIndicator = document.createElement("a-plane");
  bottomIndicator.setAttribute("class", "cv-hud-tab-indicator");
  bottomIndicator.setAttribute("width", String(options.width));
  bottomIndicator.setAttribute("height", "0.014");
  bottomIndicator.setAttribute(
    "position",
    `0 ${Number((-options.height / 2 + 0.007).toFixed(4))} 0.003`,
  );
  bottomIndicator.setAttribute("color", VR_HUD_COLORS.VOLUME_BAR_INACTIVE);
  bottomIndicator.setAttribute("material", "shader: flat; opacity: 0.35; transparent: true");

  const labelEl = createCanvasTextPlane({
    value: options.label,
    align: "center",
    baseline: "middle",
    color: VR_HUD_COLORS.TEXT_BONE,
    width: options.width * 0.88,
    height: options.height * 0.72,
    fontSizePx: 36,
    fontWeight: "700",
    canvasWidth: 384,
    canvasHeight: 96,
    maxLines: 1,
    position: "0 0.004 0.005",
  });

  tab.append(bottomIndicator, labelEl);
  return tab;
}

function setTabButtonSelected(
  tab: HTMLElement | null | undefined,
  selected: boolean,
  activeColor: string,
): void {
  if (!tab) {
    return;
  }
  tab.setAttribute("data-selected", selected ? "true" : "false");
  tab.setAttribute(
    "material",
    `shader: flat; color: ${selected ? VR_HUD_COLORS.TAB_ACTIVE_SURFACE : VR_HUD_COLORS.TAB_INACTIVE_SURFACE}; opacity: ${selected ? "0.96" : "0.6"}; transparent: true`,
  );
  const indicator = tab.querySelector(".cv-hud-tab-indicator");
  indicator?.setAttribute(
    "color",
    selected ? activeColor : VR_HUD_COLORS.VOLUME_BAR_INACTIVE,
  );
  indicator?.setAttribute(
    "material",
    `shader: flat; opacity: ${selected ? "1" : "0.25"}; transparent: true`,
  );
}

function createHudCompactButton(options: {
  id: string;
  action: string;
  label: string;
  arcOffsetX: number;
  yPos: number;
  width: number;
  height: number;
  borderColor: string;
  fontSizePx?: number;
}): HTMLElement {
  const depth = VR_HUD_GEOMETRY.BUTTON_DEPTH_M;
  const transform = computeCurvedHudElementTransform(
    options.arcOffsetX,
    options.yPos,
  );
  const btn = document.createElement("a-entity");
  btn.setAttribute("id", options.id);
  btn.setAttribute("class", "cv-hud-control");
  btn.setAttribute("cv-interactive-feedback", "");
  btn.setAttribute("data-hud-role", "option");
  btn.setAttribute("data-action", options.action);
  btn.setAttribute("data-selected", "false");
  btn.setAttribute("position", transform.position);
  btn.setAttribute("rotation", transform.rotation);
  btn.setAttribute(
    "geometry",
    `primitive: box; width: ${options.width}; height: ${options.height}; depth: ${depth}`,
  );
  btn.setAttribute(
    "material",
    `shader: lambert; color: ${VR_HUD_COLORS.BUTTON_SURFACE}; opacity: 0.95`,
  );

  const accentBar = document.createElement("a-plane");
  accentBar.setAttribute("class", "cv-hud-btn-accent");
  accentBar.setAttribute("width", String(options.width));
  accentBar.setAttribute("height", "0.012");
  accentBar.setAttribute(
    "position",
    `0 ${Number((options.height / 2 - 0.006).toFixed(4))} ${depth / 2 + 0.003}`,
  );
  accentBar.setAttribute("color", options.borderColor);
  accentBar.setAttribute("material", "shader: flat");

  const labelEl = createCanvasTextPlane({
    value: options.label,
    align: "center",
    baseline: "middle",
    color: VR_HUD_COLORS.TEXT_BONE,
    width: options.width * 0.88,
    height: options.height * 0.72,
    fontSizePx: options.fontSizePx ?? 34,
    fontWeight: "600",
    canvasWidth: 384,
    canvasHeight: 96,
    maxLines: 1,
    position: `0 0 ${depth / 2 + 0.006}`,
  });

  btn.append(accentBar, labelEl);
  return btn;
}

function setCompactButtonSelected(
  btn: HTMLElement | null | undefined,
  selected: boolean,
  activeColor: string,
  inactiveBorderColor: string = VR_HUD_COLORS.VOLUME_BAR_INACTIVE,
): void {
  if (!btn) {
    return;
  }
  btn.setAttribute("data-selected", selected ? "true" : "false");
  btn.setAttribute(
    "material",
    `shader: lambert; color: ${selected ? VR_HUD_COLORS.BUTTON_ACTIVE_SURFACE : VR_HUD_COLORS.BUTTON_SURFACE}; opacity: ${selected ? "1" : "0.9"}`,
  );
  const accent = btn.querySelector(".cv-hud-btn-accent");
  accent?.setAttribute("color", selected ? activeColor : inactiveBorderColor);
}

function setCompactButtonLabel(
  btn: HTMLElement | null | undefined,
  label: string,
  fontSizePx: number = 34,
): void {
  const labelEl = btn?.querySelector("[cv-canvas-text]") as HTMLElement | null;
  if (!labelEl) {
    return;
  }
  labelEl.setAttribute("value", label);
  setCanvasTextElement(labelEl, {
    mode: "label",
    value: label,
    align: "center",
    baseline: "middle",
    color: VR_HUD_COLORS.TEXT_BONE,
    fontSizePx,
    fontWeight: "600",
    canvasWidth: 384,
    canvasHeight: 96,
    maxLines: 1,
  });
}

function applyActiveTabState(
  instance: VrHologramHudComponentInstance,
  tab: VrHudTab,
): void {
  instance.activeTab = tab;
  const isAudio = tab === "AUDIO";
  instance.audioGroupEl?.setAttribute("visible", isAudio ? "true" : "false");
  instance.reticleGroupEl?.setAttribute("visible", isAudio ? "false" : "true");
  setTabButtonSelected(
    instance.audioTabBtnEl,
    isAudio,
    VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
  );
  setTabButtonSelected(
    instance.reticleTabBtnEl,
    !isAudio,
    VR_HUD_COLORS.ACCENT_TURQUESA,
  );
  setHudInteractiveClickable(instance, instance.isOpen);
}

interface HudVolumeBarsHandle {
  readonly groupEl: HTMLElement;
  readonly downBtn: HTMLElement;
  readonly upBtn: HTMLElement;
  readonly barEls: readonly HTMLElement[];
  readonly updateVisual: (volume: number) => void;
}

function formatVolumeGroupLabel(label: string, percent: number): string {
  return `${label}: ${percent}${VR_HUD_DICTIONARY.SLIDER_PERCENT_SUFFIX}`;
}

function createHudStepButton(options: {
  id: string;
  action: string;
  glyph: string;
  xPos: number;
  borderColor: string;
}): HTMLElement {
  const size = VR_HUD_GEOMETRY.VOLUME_STEP_BTN_SIZE_M;
  const depth = VR_HUD_GEOMETRY.BUTTON_DEPTH_M;

  const btn = document.createElement("a-entity");
  btn.setAttribute("id", options.id);
  btn.setAttribute("class", "cv-hud-control");
  btn.setAttribute("cv-interactive-feedback", "");
  btn.setAttribute("data-action", options.action);
  btn.setAttribute("position", `${options.xPos} 0 0`);
  btn.setAttribute(
    "geometry",
    `primitive: box; width: ${size}; height: ${size}; depth: ${depth}`,
  );
  btn.setAttribute(
    "material",
    `shader: lambert; color: ${VR_HUD_COLORS.BUTTON_SURFACE}; opacity: 0.95`,
  );

  const border = document.createElement("a-plane");
  border.setAttribute("width", String(size));
  border.setAttribute("height", "0.012");
  border.setAttribute(
    "position",
    `0 ${Number((size / 2 - 0.006).toFixed(4))} ${depth / 2 + 0.003}`,
  );
  border.setAttribute("color", options.borderColor);
  border.setAttribute("material", "shader: flat");

  const glyphEl = createCanvasTextPlane({
    value: options.glyph,
    align: "center",
    baseline: "middle",
    color: VR_HUD_COLORS.TEXT_BONE,
    width: size * 0.8,
    height: size * 0.8,
    fontSizePx: 64,
    fontWeight: "700",
    canvasWidth: 128,
    canvasHeight: 128,
    maxLines: 1,
    position: `0 0 ${depth / 2 + 0.006}`,
  });

  btn.append(border, glyphEl);
  return btn;
}

function createHudVolumeBarGroup(options: {
  groupId: string;
  downId: string;
  upId: string;
  barIdPrefix: string;
  channel: "music" | "effects";
  label: string;
  position: string;
  rotation: string;
  accentColor: string;
  initialVolume: number;
  onSelectVolume: (volume: number) => void;
  onStep: (delta: number) => void;
}): HudVolumeBarsHandle {
  const groupEl = document.createElement("a-entity");
  groupEl.setAttribute("id", options.groupId);
  groupEl.setAttribute("position", options.position);
  groupEl.setAttribute("rotation", options.rotation);

  const initialState = computeVolumeBarState(
    options.initialVolume,
    VR_HUD_GEOMETRY.VOLUME_BAR_COUNT,
  );

  const titleEl = createCanvasTextPlane({
    value: formatVolumeGroupLabel(options.label, initialState.percent),
    align: "center",
    baseline: "middle",
    color: VR_HUD_COLORS.TEXT_BONE,
    width: 0.44,
    height: 0.07,
    fontSizePx: 34,
    fontWeight: "600",
    canvasWidth: 512,
    canvasHeight: 96,
    maxLines: 1,
    position: "0 0.095 0.008",
  });

  const barCount = VR_HUD_GEOMETRY.VOLUME_BAR_COUNT;
  const barWidth = VR_HUD_GEOMETRY.VOLUME_BAR_WIDTH_M;
  const barHeight = VR_HUD_GEOMETRY.VOLUME_BAR_HEIGHT_M;
  const barDepth = VR_HUD_GEOMETRY.VOLUME_BAR_DEPTH_M;
  const barGap = VR_HUD_GEOMETRY.VOLUME_BAR_GAP_M;
  const totalBarsWidth = barCount * barWidth + (barCount - 1) * barGap;

  const barEls: HTMLElement[] = [];
  for (let idx = 0; idx < barCount; idx += 1) {
    const barIndex = idx + 1;
    const xPos = Number(
      (-totalBarsWidth / 2 + barWidth / 2 + idx * (barWidth + barGap)).toFixed(
        4,
      ),
    );
    const barItem = initialState.bars[idx]!;
    const barEl = document.createElement("a-entity");
    barEl.setAttribute("id", `${options.barIdPrefix}${barIndex}`);
    barEl.setAttribute("class", "cv-hud-control");
    barEl.setAttribute("cv-interactive-feedback", "");
    barEl.setAttribute("data-volume-bar", String(barIndex));
    barEl.setAttribute("data-bar-channel", options.channel);
    barEl.setAttribute("position", `${xPos} 0 0`);
    barEl.setAttribute(
      "geometry",
      `primitive: box; width: ${barWidth}; height: ${barHeight}; depth: ${barDepth}`,
    );
    barEl.addEventListener?.("click", (evt) => {
      evt?.stopPropagation?.();
      options.onSelectVolume(barItem.targetVolume);
    });
    barEls.push(barEl);
  }

  const stepOffset =
    totalBarsWidth / 2 +
    VR_HUD_GEOMETRY.VOLUME_STEP_BTN_SIZE_M / 2 +
    VR_HUD_GEOMETRY.VOLUME_STEP_BTN_GAP_M;

  const downBtn = createHudStepButton({
    id: options.downId,
    action: `${options.channel}-volume-down`,
    glyph: VR_HUD_DICTIONARY.SLIDER_DECREASE_ICON,
    xPos: -Number(stepOffset.toFixed(4)),
    borderColor: options.accentColor,
  });
  downBtn.addEventListener?.("click", (evt) => {
    evt?.stopPropagation?.();
    options.onStep(-VR_HUD_GEOMETRY.VOLUME_BAR_STEP);
  });

  const upBtn = createHudStepButton({
    id: options.upId,
    action: `${options.channel}-volume-up`,
    glyph: VR_HUD_DICTIONARY.SLIDER_INCREASE_ICON,
    xPos: Number(stepOffset.toFixed(4)),
    borderColor: options.accentColor,
  });
  upBtn.addEventListener?.("click", (evt) => {
    evt?.stopPropagation?.();
    options.onStep(VR_HUD_GEOMETRY.VOLUME_BAR_STEP);
  });

  const updateVisual = (volume: number): void => {
    const state = computeVolumeBarState(
      volume,
      VR_HUD_GEOMETRY.VOLUME_BAR_COUNT,
    );
    for (let idx = 0; idx < barEls.length; idx += 1) {
      const barEl = barEls[idx]!;
      const barState = state.bars[idx]!;
      barEl.setAttribute("data-bar-active", String(barState.active));
      const color = barState.active
        ? options.accentColor
        : VR_HUD_COLORS.VOLUME_BAR_INACTIVE;
      const opacity = barState.active ? "0.98" : "0.7";
      barEl.setAttribute(
        "material",
        `shader: lambert; color: ${color}; opacity: ${opacity}`,
      );
    }

    const formatted = formatVolumeGroupLabel(options.label, state.percent);
    titleEl.setAttribute("value", formatted);
    setCanvasTextElement(titleEl, {
      mode: "label",
      value: formatted,
      align: "center",
      baseline: "middle",
      color: VR_HUD_COLORS.TEXT_BONE,
      fontSizePx: 34,
      fontWeight: "600",
      canvasWidth: 512,
      canvasHeight: 96,
      maxLines: 1,
    });
  };

  updateVisual(options.initialVolume);
  groupEl.append(titleEl, downBtn, ...barEls, upBtn);

  return { groupEl, downBtn, upBtn, barEls, updateVisual };
}

function updateSoundButtonVisual(
  instance: VrHologramHudComponentInstance,
  enabled: boolean,
): void {
  if (!instance.soundBtnEl) {
    return;
  }
  const nextLabel = enabled
    ? VR_HUD_DICTIONARY.SOUND_ON_LABEL
    : VR_HUD_DICTIONARY.SOUND_OFF_LABEL;
  const labelEl = instance.soundBtnEl.querySelector("[cv-canvas-text]") as
    | HTMLElement
    | null;
  if (labelEl) {
    labelEl.setAttribute("value", nextLabel);
    setCanvasTextElement(labelEl, {
      mode: "label",
      value: nextLabel,
      align: "center",
      baseline: "middle",
      color: VR_HUD_COLORS.TEXT_BONE,
      fontSizePx: 42,
      fontWeight: "600",
      canvasWidth: 512,
      canvasHeight: 128,
      maxLines: 1,
    });
  }
  const iconEl = instance.soundBtnEl.querySelector(".cv-hud-btn-icon") as
    | HTMLElement
    | null;
  if (iconEl) {
    const nextTex = createCanvasTextureFromDrawer(96, 96, (ctx) =>
      renderHudIconGlyph(
        ctx,
        enabled ? "sound_on" : "sound_off",
        VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
        96,
      ),
    );
    bindProceduralTexture(iconEl, nextTex, instance.ownedTextures ?? []);
  }
}

export function createVrHologramHudComponentDefinition(
  deps: VrHologramHudDeps = {},
) {
  const resolveAudioPrefs = () =>
    deps.audioPreferencesStore ?? getSharedAudioPreferencesStore();
  const resolveAudioEngine = () => deps.audioEngine ?? getSharedAudioEngine();
  const resolveReticlePrefs = () =>
    deps.reticlePreferencesStore ?? getSharedReticlePreferencesStore();

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
      this.ownedTextures = [];
      this.lastTransform = null;

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

      // Top & bottom curved cylindrical procedural Nayarit faja trim strips
      const trimArc = computeCurvedHudStripTransform(
        VR_HUD_GEOMETRY.CURVED_RADIUS_M,
        VR_HUD_GEOMETRY.TRIM_RADIAL_INSET_M,
        VR_HUD_GEOMETRY.TRIM_ARC_THETA_DEG,
      );
      const createFajaTrim = (yPos: number): HTMLElement => {
        const trim = document.createElement("a-cylinder");
        trim.setAttribute("class", "cv-hud-faja-trim");
        trim.setAttribute("radius", String(trimArc.radius));
        trim.setAttribute("height", String(VR_HUD_GEOMETRY.FAJA_HEIGHT_M));
        trim.setAttribute("theta-start", String(trimArc.thetaStart));
        trim.setAttribute("theta-length", String(trimArc.thetaLength));
        trim.setAttribute("open-ended", "true");
        trim.setAttribute(
          "position",
          `0 ${Number(yPos.toFixed(4))} ${trimArc.centerZ}`,
        );
        trim.setAttribute(
          "material",
          "shader: flat; side: double; color: #ffffff; transparent: true",
        );
        const fajaTex = createCanvasTextureFromDrawer(512, 32, (ctx) =>
          renderFajaBorderPattern(ctx, 512, 32),
        );
        bindProceduralTexture(trim, fajaTex, this.ownedTextures ?? []);
        return trim;
      };

      const topFajaTrim = createFajaTrim(
        VR_HUD_GEOMETRY.PANEL_HEIGHT_M / 2 - VR_HUD_GEOMETRY.FAJA_HEIGHT_M / 2 - 0.008,
      );
      const bottomFajaTrim = createFajaTrim(
        -VR_HUD_GEOMETRY.PANEL_HEIGHT_M / 2 + VR_HUD_GEOMETRY.FAJA_HEIGHT_M / 2 + 0.008,
      );

      // Left & right golden curved Nierika side rails
      const createSideRail = (thetaOffsetDeg: number): HTMLElement => {
        const railArc = computeCurvedHudStripTransform(
          VR_HUD_GEOMETRY.CURVED_RADIUS_M,
          VR_HUD_GEOMETRY.TRIM_RADIAL_INSET_M,
          VR_HUD_GEOMETRY.SIDE_RAIL_ARC_THETA_DEG,
          thetaOffsetDeg,
        );
        const rail = document.createElement("a-cylinder");
        rail.setAttribute("class", "cv-hud-side-rail");
        rail.setAttribute("radius", String(railArc.radius));
        rail.setAttribute("height", String(VR_HUD_GEOMETRY.PANEL_HEIGHT_M - 0.04));
        rail.setAttribute("theta-start", String(railArc.thetaStart));
        rail.setAttribute("theta-length", String(railArc.thetaLength));
        rail.setAttribute("open-ended", "true");
        rail.setAttribute("position", `0 0 ${railArc.centerZ}`);
        rail.setAttribute("color", VR_HUD_COLORS.ACCENT_CEMPASUCHIL);
        rail.setAttribute("material", "shader: lambert; side: double");
        return rail;
      };
      const leftRail = createSideRail(-(VR_HUD_GEOMETRY.TRIM_ARC_THETA_DEG / 2));
      const rightRail = createSideRail(VR_HUD_GEOMETRY.TRIM_ARC_THETA_DEG / 2);

      // Active room title chip
      const roomChip = createCanvasTextPlane({
        id: VR_HUD_ELEMENT_IDS.ROOM_CHIP,
        value: "",
        align: "center",
        baseline: "middle",
        color: VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
        width: 1.25,
        height: 0.14,
        fontSizePx: 46,
        fontWeight: "700",
        canvasWidth: 1024,
        canvasHeight: 128,
        maxLines: 1,
        position: "0 0.43 0.04",
      });
      this.roomChipEl = roomChip;
      this.activeTab = "AUDIO";

      // Flat segmented top tab bar (Audio | Retícula) + divider track
      const audioTabBtn = createHudTabButton({
        id: VR_HUD_ELEMENT_IDS.TAB_AUDIO_BTN,
        action: "tab-audio",
        label: VR_HUD_DICTIONARY.TAB_AUDIO_LABEL,
        arcOffsetX: VR_HUD_GEOMETRY.TAB_AUDIO_X_M,
        yPos: VR_HUD_GEOMETRY.TAB_ROW_Y_M,
        width: VR_HUD_GEOMETRY.TAB_BTN_WIDTH_M,
        height: VR_HUD_GEOMETRY.TAB_BTN_HEIGHT_M,
      });
      const reticleTabBtn = createHudTabButton({
        id: VR_HUD_ELEMENT_IDS.TAB_RETICLE_BTN,
        action: "tab-reticle",
        label: VR_HUD_DICTIONARY.TAB_RETICLE_LABEL,
        arcOffsetX: VR_HUD_GEOMETRY.TAB_RETICLE_X_M,
        yPos: VR_HUD_GEOMETRY.TAB_ROW_Y_M,
        width: VR_HUD_GEOMETRY.TAB_BTN_WIDTH_M,
        height: VR_HUD_GEOMETRY.TAB_BTN_HEIGHT_M,
      });
      const tabTrackDivider = document.createElement("a-plane");
      tabTrackDivider.setAttribute("class", "cv-hud-tab-track");
      tabTrackDivider.setAttribute("width", String(VR_HUD_GEOMETRY.TAB_TRACK_WIDTH_M));
      tabTrackDivider.setAttribute("height", "0.005");
      tabTrackDivider.setAttribute(
        "position",
        `0 ${VR_HUD_GEOMETRY.TAB_TRACK_Y_M} ${VR_HUD_GEOMETRY.UI_RADIAL_CLEARANCE_M}`,
      );
      tabTrackDivider.setAttribute(
        "material",
        `shader: flat; color: ${VR_HUD_COLORS.VOLUME_BAR_INACTIVE}; opacity: 0.5; transparent: true`,
      );
      this.audioTabBtnEl = audioTabBtn;
      this.reticleTabBtnEl = reticleTabBtn;

      audioTabBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        applyActiveTabState(this, "AUDIO");
        getSharedSfxPlayer().play(SfxId.TOGGLE_CLICK);
      });
      reticleTabBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        applyActiveTabState(this, "RETICLE");
        getSharedSfxPlayer().play(SfxId.TOGGLE_CLICK);
      });

      const audioGroupEl = document.createElement("a-entity");
      audioGroupEl.setAttribute("id", VR_HUD_ELEMENT_IDS.AUDIO_GROUP);
      audioGroupEl.setAttribute("visible", "true");
      this.audioGroupEl = audioGroupEl;

      // Center Master Sound toggle button (stays open so user sees feedback)
      const initialPrefs = resolveAudioPrefs().getPreferences();
      const initialSoundOn = initialPrefs.masterEnabled;
      const soundToggleBtn = createHudButtonEntity({
        id: VR_HUD_ELEMENT_IDS.SOUND_TOGGLE_BTN,
        action: "toggle-sound",
        iconId: initialSoundOn ? "sound_on" : "sound_off",
        label: initialSoundOn
          ? VR_HUD_DICTIONARY.SOUND_ON_LABEL
          : VR_HUD_DICTIONARY.SOUND_OFF_LABEL,
        position: `0 ${VR_HUD_GEOMETRY.AUDIO_SOUND_Y_M} 0.05`,
        width: VR_HUD_GEOMETRY.BUTTON_WIDTH_M,
        backgroundColor: VR_HUD_COLORS.BUTTON_SURFACE,
        borderColor: VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
        ownedTextures: this.ownedTextures ?? [],
      });
      this.soundBtnEl = soundToggleBtn;

      soundToggleBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        if (this.callbacks.onToggleSound) {
          this.callbacks.onToggleSound();
        } else {
          void resolveAudioEngine().unlockFromUserGesture();
          resolveAudioPrefs().toggleMaster();
        }
        getSharedSfxPlayer().play(SfxId.TOGGLE_CLICK);
        this.el.dispatchEvent?.(
          new CustomEvent(VR_HUD_SOUND_TOGGLE_EVENT, { bubbles: true }),
        );
      });

      // Music & Effects 5-bar Volume Controls (stay open across bar/step clicks)
      const applyChannelVolume = (
        channel: "music" | "effects",
        nextVolume: number,
      ): void => {
        const prefsStore = resolveAudioPrefs();
        const current = prefsStore.getPreferences();
        if (current.masterEnabled) {
          void resolveAudioEngine().unlockFromUserGesture();
        }
        if (channel === "music") {
          prefsStore.setMusicVolume(nextVolume);
        } else {
          prefsStore.setEffectsVolume(nextVolume);
        }
        getSharedSfxPlayer().play(SfxId.TOGGLE_CLICK);
        this.el.dispatchEvent?.(
          new CustomEvent(VR_HUD_VOLUME_CHANGE_EVENT, {
            bubbles: true,
            detail: { channel, volume: nextVolume },
          }),
        );
      };

      const stepChannelVolume = (
        channel: "music" | "effects",
        delta: number,
      ): void => {
        const current = resolveAudioPrefs().getPreferences();
        const base =
          channel === "music" ? current.musicVolume : current.effectsVolume;
        const next = quantizeVolumeStep(
          base,
          delta,
          VR_HUD_GEOMETRY.VOLUME_BAR_STEP,
        );
        applyChannelVolume(channel, next);
      };

      const musicArc = computeCurvedHudElementTransform(
        VR_HUD_GEOMETRY.VOLUME_MUSIC_X_M,
        VR_HUD_GEOMETRY.VOLUME_GROUP_Y_M,
      );
      const musicBars = createHudVolumeBarGroup({
        groupId: VR_HUD_ELEMENT_IDS.MUSIC_SLIDER_GROUP,
        downId: VR_HUD_ELEMENT_IDS.MUSIC_SLIDER_DOWN_BTN,
        upId: VR_HUD_ELEMENT_IDS.MUSIC_SLIDER_UP_BTN,
        barIdPrefix: VR_HUD_ELEMENT_IDS.MUSIC_BAR_PREFIX,
        channel: "music",
        label: VR_HUD_DICTIONARY.MUSIC_SLIDER_LABEL,
        position: musicArc.position,
        rotation: musicArc.rotation,
        accentColor: VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
        initialVolume: initialPrefs.musicVolume,
        onSelectVolume: (volume) => applyChannelVolume("music", volume),
        onStep: (delta) => stepChannelVolume("music", delta),
      });

      const effectsArc = computeCurvedHudElementTransform(
        VR_HUD_GEOMETRY.VOLUME_EFFECTS_X_M,
        VR_HUD_GEOMETRY.VOLUME_GROUP_Y_M,
      );
      const effectsBars = createHudVolumeBarGroup({
        groupId: VR_HUD_ELEMENT_IDS.EFFECTS_SLIDER_GROUP,
        downId: VR_HUD_ELEMENT_IDS.EFFECTS_SLIDER_DOWN_BTN,
        upId: VR_HUD_ELEMENT_IDS.EFFECTS_SLIDER_UP_BTN,
        barIdPrefix: VR_HUD_ELEMENT_IDS.EFFECTS_BAR_PREFIX,
        channel: "effects",
        label: VR_HUD_DICTIONARY.EFFECTS_SLIDER_LABEL,
        position: effectsArc.position,
        rotation: effectsArc.rotation,
        accentColor: VR_HUD_COLORS.ACCENT_TURQUESA,
        initialVolume: initialPrefs.effectsVolume,
        onSelectVolume: (volume) => applyChannelVolume("effects", volume),
        onStep: (delta) => stepChannelVolume("effects", delta),
      });

      audioGroupEl.append(soundToggleBtn, musicBars.groupEl, effectsBars.groupEl);

      // Reticle tab group (centered rows along the curved arc; hidden & non-clickable while Audio tab is active)
      const reticleGroupEl = document.createElement("a-entity");
      reticleGroupEl.setAttribute("id", VR_HUD_ELEMENT_IDS.RETICLE_GROUP);
      reticleGroupEl.setAttribute("visible", "false");
      this.reticleGroupEl = reticleGroupEl;

      const createCenteredRowLabel = (value: string, yPos: number): HTMLElement =>
        createCanvasTextPlane({
          value,
          align: "center",
          baseline: "middle",
          color: VR_HUD_COLORS.TEXT_BONE,
          width: VR_HUD_GEOMETRY.RETICLE_LABEL_WIDTH_M,
          height: VR_HUD_GEOMETRY.RETICLE_LABEL_HEIGHT_M,
          fontSizePx: 30,
          fontWeight: "600",
          canvasWidth: 512,
          canvasHeight: 64,
          maxLines: 1,
          position: `0 ${yPos} ${VR_HUD_GEOMETRY.UI_RADIAL_CLEARANCE_M}`,
        });

      const sizeRowLabel = createCenteredRowLabel(
        VR_HUD_DICTIONARY.RETICLE_SIZE_LABEL,
        VR_HUD_GEOMETRY.RETICLE_SIZE_LABEL_Y_M,
      );
      const sizeSmallBtn = createHudCompactButton({
        id: VR_HUD_ELEMENT_IDS.RETICLE_SIZE_SMALL_BTN,
        action: "reticle-size-small",
        label: VR_HUD_DICTIONARY.RETICLE_SIZE_SMALL_LABEL,
        arcOffsetX: VR_HUD_GEOMETRY.RETICLE_OPTION_X_M[0],
        yPos: VR_HUD_GEOMETRY.RETICLE_SIZE_ROW_Y_M,
        width: VR_HUD_GEOMETRY.RETICLE_OPTION_WIDTH_M,
        height: VR_HUD_GEOMETRY.RETICLE_OPTION_HEIGHT_M,
        borderColor: VR_HUD_COLORS.VOLUME_BAR_INACTIVE,
        fontSizePx: 30,
      });
      const sizeNormalBtn = createHudCompactButton({
        id: VR_HUD_ELEMENT_IDS.RETICLE_SIZE_NORMAL_BTN,
        action: "reticle-size-normal",
        label: VR_HUD_DICTIONARY.RETICLE_SIZE_NORMAL_LABEL,
        arcOffsetX: VR_HUD_GEOMETRY.RETICLE_OPTION_X_M[1],
        yPos: VR_HUD_GEOMETRY.RETICLE_SIZE_ROW_Y_M,
        width: VR_HUD_GEOMETRY.RETICLE_OPTION_WIDTH_M,
        height: VR_HUD_GEOMETRY.RETICLE_OPTION_HEIGHT_M,
        borderColor: VR_HUD_COLORS.ACCENT_TURQUESA,
        fontSizePx: 30,
      });
      const sizeLargeBtn = createHudCompactButton({
        id: VR_HUD_ELEMENT_IDS.RETICLE_SIZE_LARGE_BTN,
        action: "reticle-size-large",
        label: VR_HUD_DICTIONARY.RETICLE_SIZE_LARGE_LABEL,
        arcOffsetX: VR_HUD_GEOMETRY.RETICLE_OPTION_X_M[2],
        yPos: VR_HUD_GEOMETRY.RETICLE_SIZE_ROW_Y_M,
        width: VR_HUD_GEOMETRY.RETICLE_OPTION_WIDTH_M,
        height: VR_HUD_GEOMETRY.RETICLE_OPTION_HEIGHT_M,
        borderColor: VR_HUD_COLORS.VOLUME_BAR_INACTIVE,
        fontSizePx: 30,
      });

      const fuseRowLabel = createCenteredRowLabel(
        VR_HUD_DICTIONARY.RETICLE_FUSE_LABEL,
        VR_HUD_GEOMETRY.RETICLE_FUSE_LABEL_Y_M,
      );
      const fuseFastBtn = createHudCompactButton({
        id: VR_HUD_ELEMENT_IDS.RETICLE_FUSE_FAST_BTN,
        action: "reticle-fuse-fast",
        label: VR_HUD_DICTIONARY.RETICLE_FUSE_FAST_LABEL,
        arcOffsetX: VR_HUD_GEOMETRY.RETICLE_OPTION_X_M[0],
        yPos: VR_HUD_GEOMETRY.RETICLE_FUSE_ROW_Y_M,
        width: VR_HUD_GEOMETRY.RETICLE_OPTION_WIDTH_M,
        height: VR_HUD_GEOMETRY.RETICLE_OPTION_HEIGHT_M,
        borderColor: VR_HUD_COLORS.VOLUME_BAR_INACTIVE,
        fontSizePx: 30,
      });
      const fuseNormalBtn = createHudCompactButton({
        id: VR_HUD_ELEMENT_IDS.RETICLE_FUSE_NORMAL_BTN,
        action: "reticle-fuse-normal",
        label: VR_HUD_DICTIONARY.RETICLE_FUSE_NORMAL_LABEL,
        arcOffsetX: VR_HUD_GEOMETRY.RETICLE_OPTION_X_M[1],
        yPos: VR_HUD_GEOMETRY.RETICLE_FUSE_ROW_Y_M,
        width: VR_HUD_GEOMETRY.RETICLE_OPTION_WIDTH_M,
        height: VR_HUD_GEOMETRY.RETICLE_OPTION_HEIGHT_M,
        borderColor: VR_HUD_COLORS.ACCENT_TURQUESA,
        fontSizePx: 30,
      });
      const fuseSlowBtn = createHudCompactButton({
        id: VR_HUD_ELEMENT_IDS.RETICLE_FUSE_SLOW_BTN,
        action: "reticle-fuse-slow",
        label: VR_HUD_DICTIONARY.RETICLE_FUSE_SLOW_LABEL,
        arcOffsetX: VR_HUD_GEOMETRY.RETICLE_OPTION_X_M[2],
        yPos: VR_HUD_GEOMETRY.RETICLE_FUSE_ROW_Y_M,
        width: VR_HUD_GEOMETRY.RETICLE_OPTION_WIDTH_M,
        height: VR_HUD_GEOMETRY.RETICLE_OPTION_HEIGHT_M,
        borderColor: VR_HUD_COLORS.VOLUME_BAR_INACTIVE,
        fontSizePx: 30,
      });

      const idleToggleBtn = createHudCompactButton({
        id: VR_HUD_ELEMENT_IDS.RETICLE_IDLE_TOGGLE_BTN,
        action: "reticle-idle-toggle",
        label: VR_HUD_DICTIONARY.RETICLE_IDLE_DIM_LABEL,
        arcOffsetX: 0,
        yPos: VR_HUD_GEOMETRY.RETICLE_IDLE_ROW_Y_M,
        width: VR_HUD_GEOMETRY.RETICLE_IDLE_BTN_WIDTH_M,
        height: VR_HUD_GEOMETRY.RETICLE_IDLE_BTN_HEIGHT_M,
        borderColor: VR_HUD_COLORS.ACCENT_TURQUESA,
        fontSizePx: 32,
      });

      reticleGroupEl.append(
        sizeRowLabel,
        sizeSmallBtn,
        sizeNormalBtn,
        sizeLargeBtn,
        fuseRowLabel,
        fuseFastBtn,
        fuseNormalBtn,
        fuseSlowBtn,
        idleToggleBtn,
      );

      const emitReticlePrefsUpdate = (): void => {
        getSharedSfxPlayer().play(SfxId.TOGGLE_CLICK);
        this.el.dispatchEvent?.(
          new CustomEvent(VR_HUD_RETICLE_PREFS_EVENT, {
            bubbles: true,
            detail: resolveReticlePrefs().getPreferences(),
          }),
        );
      };

      const sizeButtons: Record<ReticleSizePreset, HTMLElement> = {
        SMALL: sizeSmallBtn,
        NORMAL: sizeNormalBtn,
        LARGE: sizeLargeBtn,
      };
      for (const [preset, btn] of Object.entries(sizeButtons) as Array<
        [ReticleSizePreset, HTMLElement]
      >) {
        btn.addEventListener?.("click", (evt) => {
          evt?.stopPropagation?.();
          resolveReticlePrefs().setSizePreset(preset);
          emitReticlePrefsUpdate();
        });
      }

      const fuseButtons: Record<ReticleFusePreset, HTMLElement> = {
        FAST: fuseFastBtn,
        NORMAL: fuseNormalBtn,
        SLOW: fuseSlowBtn,
      };
      for (const [preset, btn] of Object.entries(fuseButtons) as Array<
        [ReticleFusePreset, HTMLElement]
      >) {
        btn.addEventListener?.("click", (evt) => {
          evt?.stopPropagation?.();
          resolveReticlePrefs().setFusePreset(preset);
          emitReticlePrefsUpdate();
        });
      }

      idleToggleBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        resolveReticlePrefs().toggleIdleBehavior();
        emitReticlePrefsUpdate();
      });

      this.unsubscribeReticlePrefs?.();
      this.unsubscribeReticlePrefs = resolveReticlePrefs().subscribe((prefs) => {
        for (const [preset, btn] of Object.entries(sizeButtons) as Array<
          [ReticleSizePreset, HTMLElement]
        >) {
          setCompactButtonSelected(
            btn,
            prefs.sizePreset === preset,
            VR_HUD_COLORS.ACCENT_TURQUESA,
          );
        }
        for (const [preset, btn] of Object.entries(fuseButtons) as Array<
          [ReticleFusePreset, HTMLElement]
        >) {
          setCompactButtonSelected(
            btn,
            prefs.fusePreset === preset,
            VR_HUD_COLORS.ACCENT_TURQUESA,
          );
        }
        const isDimMode = prefs.idleBehavior === RETICLE_IDLE_BEHAVIOR.DIM;
        setCompactButtonSelected(
          idleToggleBtn,
          isDimMode,
          VR_HUD_COLORS.ACCENT_TURQUESA,
          VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
        );
        setCompactButtonLabel(
          idleToggleBtn,
          isDimMode
            ? VR_HUD_DICTIONARY.RETICLE_IDLE_DIM_LABEL
            : VR_HUD_DICTIONARY.RETICLE_IDLE_HIDE_LABEL,
          32,
        );
      });

      // Conditional Return to Lobby button (hidden when activeRoomId === LOBBY)
      const returnLobbyBtn = createHudButtonEntity({
        id: VR_HUD_ELEMENT_IDS.RETURN_LOBBY_BTN,
        action: "return-lobby",
        iconId: "lobby",
        label: VR_HUD_DICTIONARY.RETURN_LOBBY_LABEL,
        position: `0 -0.40 ${VR_HUD_GEOMETRY.RETURN_LOBBY_Z_M}`,
        width: VR_HUD_GEOMETRY.LOBBY_BUTTON_WIDTH_M,
        height: VR_HUD_GEOMETRY.LOBBY_BUTTON_HEIGHT_M,
        backgroundColor: VR_HUD_COLORS.BUTTON_SURFACE,
        borderColor: VR_HUD_COLORS.ACCENT_CEMPASUCHIL,
        ownedTextures: this.ownedTextures ?? [],
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

      // Top-right circular dismiss medallion
      const dismissArc = computeCurvedHudElementTransform(0.6, 0.4, 0.065);
      const dismissBtn = document.createElement("a-entity");
      dismissBtn.setAttribute("id", VR_HUD_ELEMENT_IDS.DISMISS_BTN);
      dismissBtn.setAttribute("class", "cv-hud-control");
      dismissBtn.setAttribute("cv-interactive-feedback", "");
      dismissBtn.setAttribute("data-action", "dismiss-hud");
      dismissBtn.setAttribute("position", dismissArc.position);
      dismissBtn.setAttribute("rotation", dismissArc.rotation);
      dismissBtn.setAttribute(
        "geometry",
        `primitive: circle; radius: ${VR_HUD_GEOMETRY.DISMISS_RADIUS_M}; segments: ${VR_HUD_GEOMETRY.DISMISS_SEGMENTS}`,
      );
      dismissBtn.setAttribute(
        "material",
        `shader: flat; color: ${VR_HUD_COLORS.ACCENT_COCHINILLA}`,
      );

      const dismissOuterRing = document.createElement("a-ring");
      dismissOuterRing.setAttribute(
        "radius-inner",
        String(VR_HUD_GEOMETRY.DISMISS_RADIUS_M + 0.002),
      );
      dismissOuterRing.setAttribute(
        "radius-outer",
        String(VR_HUD_GEOMETRY.DISMISS_RADIUS_M + 0.01),
      );
      dismissOuterRing.setAttribute(
        "segments-theta",
        String(VR_HUD_GEOMETRY.DISMISS_SEGMENTS),
      );
      dismissOuterRing.setAttribute("position", "0 0 -0.002");
      dismissOuterRing.setAttribute("color", VR_HUD_COLORS.ACCENT_CEMPASUCHIL);
      dismissOuterRing.setAttribute("material", "shader: flat");

      const dismissLabel = createCanvasTextPlane({
        value: VR_HUD_DICTIONARY.DISMISS_LABEL,
        align: "center",
        baseline: "middle",
        color: VR_HUD_COLORS.TEXT_BONE,
        width: 0.12,
        height: 0.12,
        fontSizePx: 64,
        fontWeight: "700",
        canvasWidth: 128,
        canvasHeight: 128,
        maxLines: 1,
        position: "0 0 0.01",
      });
      dismissBtn.append(dismissOuterRing, dismissLabel);

      dismissBtn.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        this.dismiss();
      });

      this.sharedInteractiveEls = [
        backdrop,
        audioTabBtn,
        reticleTabBtn,
        returnLobbyBtn,
        dismissBtn,
      ];
      this.audioInteractiveEls = [
        soundToggleBtn,
        musicBars.downBtn,
        ...musicBars.barEls,
        musicBars.upBtn,
        effectsBars.downBtn,
        ...effectsBars.barEls,
        effectsBars.upBtn,
      ];
      this.reticleInteractiveEls = [
        sizeSmallBtn,
        sizeNormalBtn,
        sizeLargeBtn,
        fuseFastBtn,
        fuseNormalBtn,
        fuseSlowBtn,
        idleToggleBtn,
      ];
      this.interactiveEls = [
        ...this.sharedInteractiveEls,
        ...this.audioInteractiveEls,
        ...this.reticleInteractiveEls,
      ];
      this.el.append(
        backdrop,
        topFajaTrim,
        bottomFajaTrim,
        leftRail,
        rightRail,
        roomChip,
        audioTabBtn,
        reticleTabBtn,
        tabTrackDivider,
        audioGroupEl,
        reticleGroupEl,
        returnLobbyBtn,
        dismissBtn,
      );
      applyActiveTabState(this, "AUDIO");

      this.unsubscribeAudioPrefs?.();
      this.unsubscribeAudioPrefs = resolveAudioPrefs().subscribe((prefs) => {
        updateSoundButtonVisual(this, prefs.masterEnabled);
        musicBars.updateVisual(prefs.musicVolume);
        effectsBars.updateVisual(prefs.effectsVolume);
      });

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
      const accentColor =
        ROOM_PORTAL_ACCENTS[roomId] ?? VR_HUD_COLORS.ACCENT_CEMPASUCHIL;
      if (this.roomChipEl) {
        setCanvasTextElement(this.roomChipEl, {
          mode: "label",
          value: roomDef.title,
          color: accentColor,
          align: "center",
          baseline: "middle",
          fontSizePx: 46,
          fontWeight: "700",
          canvasWidth: 1024,
          canvasHeight: 128,
          maxLines: 1,
        });
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

    setSoundEnabled: function (
      this: VrHologramHudComponentInstance,
      enabled: boolean,
    ) {
      updateSoundButtonVisual(this, enabled);
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
      this.lastTransform = transform;

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
      this.el.removeAttribute("animation__hud_sink");
      this.el.setAttribute("visible", "true");
      if (this.el.object3D) {
        this.el.object3D.visible = true;
      }
      this.isOpen = true;
      setHudInteractiveClickable(this, true);
      getSharedSfxPlayer().play(SfxId.HUD_OPEN);

      const hasAFrame =
        typeof globalThis !== "undefined" &&
        Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

      if (!hasAFrame) {
        this.el.setAttribute("scale", VR_HUD_VISIBLE_SCALE);
      } else {
        const startY = Number(
          (transform.position.y - VR_HUD_GEOMETRY.ELEVATION_DELTA_M).toFixed(4),
        );
        const startPosAttr = `${transform.position.x} ${startY} ${transform.position.z}`;
        this.el.setAttribute("scale", VR_HUD_HIDDEN_SCALE);
        this.el.setAttribute(
          "animation__hud_in",
          `property: scale; from: ${VR_HUD_HIDDEN_SCALE}; to: ${VR_HUD_VISIBLE_SCALE}; dur: ${VR_HUD_ANIMATION_DURATION_MS}; easing: easeOutCubic`,
        );
        this.el.setAttribute(
          "animation__hud_rise",
          `property: position; from: ${startPosAttr}; to: ${posAttr}; dur: ${VR_HUD_ANIMATION_DURATION_MS}; easing: easeOutCubic`,
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
      getSharedSfxPlayer().play(SfxId.HUD_CLOSE);
      this.el.removeAttribute("animation__hud_in");
      this.el.removeAttribute("animation__hud_rise");

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
        if (this.lastTransform) {
          const sinkY = Number(
            (
              this.lastTransform.position.y - VR_HUD_GEOMETRY.ELEVATION_DELTA_M
            ).toFixed(4),
          );
          const sinkPos = `${this.lastTransform.position.x} ${sinkY} ${this.lastTransform.position.z}`;
          this.el.setAttribute(
            "animation__hud_sink",
            `property: position; to: ${sinkPos}; dur: ${VR_HUD_ANIMATION_DURATION_MS}; easing: easeInCubic`,
          );
        }
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
      this.unsubscribeAudioPrefs?.();
      this.unsubscribeAudioPrefs = null;
      this.unsubscribeReticlePrefs?.();
      this.unsubscribeReticlePrefs = null;
      setHudInteractiveClickable(this, false);
      if (this.ownedTextures) {
        for (const tex of this.ownedTextures) {
          tex.dispose();
        }
        this.ownedTextures = [];
      }
      this.lastTransform = null;
      this.isOpen = false;
      this.roomChipEl = null;
      this.returnLobbyBtnEl = null;
      this.soundBtnEl = null;
      this.audioGroupEl = null;
      this.reticleGroupEl = null;
      this.audioTabBtnEl = null;
      this.reticleTabBtnEl = null;
      this.interactiveEls = [];
      this.audioInteractiveEls = [];
      this.reticleInteractiveEls = [];
      this.sharedInteractiveEls = [];
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
