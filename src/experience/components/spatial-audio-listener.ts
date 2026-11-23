import { PLAYER_RIG_TOKENS } from "../constants";
import {
  getSharedSpatialMediaAudio,
  type ListenerPose,
  type SpatialMediaAudio,
} from "../audio/spatial-media-audio";

export const SPATIAL_AUDIO_LISTENER_ID = "cv-spatial-audio-listener";
export const SPATIAL_AUDIO_LISTENER_COMPONENT = "cv-spatial-audio-listener";

interface MutableVec3 {
  x: number;
  y: number;
  z: number;
  set?: (x: number, y: number, z: number) => MutableVec3;
  clone?: () => MutableVec3 & {
    applyQuaternion?: (q: unknown) => MutableVec3;
    normalize?: () => MutableVec3;
  };
}

interface ThreeCameraLike {
  isCamera?: boolean;
  getWorldPosition?: (target: MutableVec3) => MutableVec3;
  getWorldDirection?: (target: MutableVec3) => MutableVec3;
  getWorldQuaternion?: (target: { x: number; y: number; z: number; w: number }) => unknown;
  up?: MutableVec3;
}

interface SceneCameraHost extends HTMLElement {
  renderer?: {
    xr?: {
      isPresenting?: boolean;
      getCamera?: () => ThreeCameraLike | undefined;
    };
  };
  camera?: ThreeCameraLike;
}

const DEFAULT_LISTENER_POSE: ListenerPose = {
  position: { x: 0, y: PLAYER_RIG_TOKENS.EYE_HEIGHT_M, z: 0 },
  forward: { x: 0, y: 0, z: -1 },
  up: { x: 0, y: 1, z: 0 },
};

interface MutableQuat {
  x: number;
  y: number;
  z: number;
  w: number;
  set?: (x: number, y: number, z: number, w: number) => MutableQuat;
}

interface ThreeGlobalLike {
  Vector3?: new (x?: number, y?: number, z?: number) => MutableVec3;
  Quaternion?: new () => MutableQuat;
}

function resolveThreeGlobal(): ThreeGlobalLike | undefined {
  const g = globalThis as unknown as {
    AFRAME?: { THREE?: ThreeGlobalLike };
    THREE?: ThreeGlobalLike;
  };
  return g.AFRAME?.THREE ?? g.THREE;
}

function makeScratchVec(x = 0, y = 0, z = 0): MutableVec3 {
  const ThreeVector3 = resolveThreeGlobal()?.Vector3;
  if (ThreeVector3) {
    return new ThreeVector3(x, y, z);
  }
  const v: MutableVec3 = {
    x,
    y,
    z,
    set(nx: number, ny: number, nz: number) {
      v.x = nx;
      v.y = ny;
      v.z = nz;
      return v;
    },
  };
  return v;
}

function makeScratchQuat(): MutableQuat {
  const ThreeQuat = resolveThreeGlobal()?.Quaternion;
  if (ThreeQuat) {
    return new ThreeQuat();
  }
  const q: MutableQuat = {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
    set(nx: number, ny: number, nz: number, nw: number) {
      q.x = nx;
      q.y = ny;
      q.z = nz;
      q.w = nw;
      return q;
    },
  };
  return q;
}

/**
 * Extracts world-space listener position, forward, and up vectors from active WebXR or scene camera.
 */
export function readCameraListenerPose(
  sceneEl: HTMLElement | null | undefined,
): ListenerPose {
  if (!sceneEl) {
    return DEFAULT_LISTENER_POSE;
  }

  const host = sceneEl as SceneCameraHost;
  let cam: ThreeCameraLike | undefined;
  let usedObject3DFallback = false;
  if (
    host.renderer?.xr?.isPresenting &&
    typeof host.renderer.xr.getCamera === "function"
  ) {
    cam = host.renderer.xr.getCamera();
  }
  if (!cam) {
    cam = host.camera;
  }
  if (!cam) {
    const camEl = sceneEl.querySelector("a-camera, [camera]") as
      | (HTMLElement & {
          object3D?: ThreeCameraLike;
          getObject3D?: (type: string) => ThreeCameraLike | undefined;
        })
      | null;
    const cameraObj = camEl?.getObject3D?.("camera");
    if (cameraObj) {
      cam = cameraObj;
    } else if (camEl?.object3D) {
      cam = camEl.object3D;
      // THREE.Object3D.getWorldDirection returns local +Z (backward); THREE.Camera overrides to -Z (gaze forward).
      usedObject3DFallback = !cam.isCamera;
    }
  }

  if (!cam) {
    return DEFAULT_LISTENER_POSE;
  }

  const posOut = makeScratchVec(
    DEFAULT_LISTENER_POSE.position.x,
    DEFAULT_LISTENER_POSE.position.y,
    DEFAULT_LISTENER_POSE.position.z,
  );
  if (typeof cam.getWorldPosition === "function") {
    cam.getWorldPosition(posOut);
  }

  const fwdOut = makeScratchVec(
    DEFAULT_LISTENER_POSE.forward.x,
    DEFAULT_LISTENER_POSE.forward.y,
    DEFAULT_LISTENER_POSE.forward.z,
  );
  if (typeof cam.getWorldDirection === "function") {
    cam.getWorldDirection(fwdOut);
    if (usedObject3DFallback) {
      fwdOut.x = -fwdOut.x || 0;
      fwdOut.y = -fwdOut.y || 0;
      fwdOut.z = -fwdOut.z || 0;
    }
  }

  let upVec = DEFAULT_LISTENER_POSE.up;
  if (
    cam.up &&
    typeof cam.up.clone === "function" &&
    typeof cam.getWorldQuaternion === "function"
  ) {
    const quat = makeScratchQuat();
    const worldQuat = cam.getWorldQuaternion(quat);
    const clonedUp = cam.up.clone();
    if (typeof clonedUp.applyQuaternion === "function") {
      clonedUp.applyQuaternion(worldQuat);
    }
    if (typeof clonedUp.normalize === "function") {
      clonedUp.normalize();
    }
    upVec = { x: clonedUp.x, y: clonedUp.y, z: clonedUp.z };
  }

  return {
    position: { x: posOut.x, y: posOut.y, z: posOut.z },
    forward: { x: fwdOut.x, y: fwdOut.y, z: fwdOut.z },
    up: upVec,
  };
}

export interface SpatialAudioListenerDeps {
  readonly getSpatialMediaAudio?: () => SpatialMediaAudio;
}

export interface SpatialAudioListenerInstance {
  el: HTMLElement & { sceneEl?: HTMLElement | null };
  tick: () => void;
}

export function createSpatialAudioListenerComponentDefinition(
  deps: SpatialAudioListenerDeps = {},
) {
  const resolveSpatial = () =>
    deps.getSpatialMediaAudio?.() ?? getSharedSpatialMediaAudio();

  return {
    tick: function (this: SpatialAudioListenerInstance) {
      const sceneEl = this.el.sceneEl ?? this.el.parentElement ?? this.el;
      const pose = readCameraListenerPose(sceneEl);
      resolveSpatial().updateListenerPose(pose);
    },
  };
}

export function ensureSpatialAudioListener(sceneEl: HTMLElement): HTMLElement {
  const existing = sceneEl.querySelector(`#${SPATIAL_AUDIO_LISTENER_ID}`);
  if (existing) {
    return existing as HTMLElement;
  }
  const el = document.createElement("a-entity");
  el.setAttribute("id", SPATIAL_AUDIO_LISTENER_ID);
  el.setAttribute(SPATIAL_AUDIO_LISTENER_COMPONENT, "");
  sceneEl.appendChild(el);
  return el;
}

export function registerSpatialAudioListenerComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: {
        registerComponent: (name: string, def: unknown) => void;
        components?: Record<string, unknown>;
      };
    }
  ).AFRAME;
  if (
    globalAframe &&
    typeof globalAframe.registerComponent === "function" &&
    !globalAframe.components?.[SPATIAL_AUDIO_LISTENER_COMPONENT]
  ) {
    globalAframe.registerComponent(
      SPATIAL_AUDIO_LISTENER_COMPONENT,
      createSpatialAudioListenerComponentDefinition(),
    );
  }
}

registerSpatialAudioListenerComponent();
