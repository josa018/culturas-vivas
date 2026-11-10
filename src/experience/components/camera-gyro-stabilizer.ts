import {
  CAMERA_STABILIZER_CONSTANTS,
  CAMERA_RECENTER_EVENT,
} from "../constants";
import {
  CameraStabilizerMath,
  type QuaternionLike,
} from "../services/camera-stabilizer-math";

export interface CameraGyroStabilizerData {
  enabled: boolean;
  lambda: number;
  rigSelector: string;
}

export interface CameraGyroStabilizerComponentInstance {
  el: HTMLElement & {
    object3D?: {
      quaternion: QuaternionLike & {
        copy?: (q: QuaternionLike) => void;
        set?: (x: number, y: number, z: number, w: number) => void;
      };
    };
    sceneEl?: HTMLElement;
  };
  data: CameraGyroStabilizerData;
  currentQuat: QuaternionLike;
  rawQuat: QuaternionLike;
  isInitialized: boolean;
  onRecenterEvent?: (evt: Event) => void;
  init: (this: CameraGyroStabilizerComponentInstance) => void;
  tick: (
    this: CameraGyroStabilizerComponentInstance,
    time: number,
    timeDelta: number,
  ) => void;
  remove: (this: CameraGyroStabilizerComponentInstance) => void;
}

export function createCameraGyroStabilizerDefinition() {
  return {
    schema: {
      enabled: { type: "boolean", default: true },
      lambda: { type: "number", default: CAMERA_STABILIZER_CONSTANTS.LAMBDA },
      rigSelector: { type: "string", default: "#camera-rig" },
    },

    init: function (this: CameraGyroStabilizerComponentInstance) {
      this.currentQuat = { x: 0, y: 0, z: 0, w: 1 };
      this.rawQuat = { x: 0, y: 0, z: 0, w: 1 };
      this.isInitialized = false;

      if (this.el.object3D?.quaternion) {
        const q = this.el.object3D.quaternion;
        this.currentQuat = { x: q.x, y: q.y, z: q.z, w: q.w };
        this.isInitialized = true;
      }

      this.onRecenterEvent = (evt: Event) => {
        const customEvt = evt as CustomEvent<{ yawOffsetRad?: number }>;
        const yawOffset = customEvt.detail?.yawOffsetRad ?? 0;
        const rig = document.querySelector(
          this.data.rigSelector,
        ) as unknown as {
          object3D?: { rotation: { y: number } };
        };
        if (rig?.object3D?.rotation) {
          rig.object3D.rotation.y = yawOffset;
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener(
          CAMERA_RECENTER_EVENT,
          this.onRecenterEvent,
        );
      }
    },

    tick: function (
      this: CameraGyroStabilizerComponentInstance,
      _time: number,
      timeDelta: number,
    ) {
      if (!this.data.enabled || !timeDelta || timeDelta <= 0) {
        return;
      }

      const q = this.el.object3D?.quaternion;
      if (!q) {
        return;
      }

      this.rawQuat = { x: q.x, y: q.y, z: q.z, w: q.w };

      if (!this.isInitialized) {
        this.currentQuat = { ...this.rawQuat };
        this.isInitialized = true;
        return;
      }

      const deltaSeconds = timeDelta / 1000;
      const filtered = CameraStabilizerMath.filterOrientation(
        this.currentQuat,
        this.rawQuat,
        deltaSeconds,
        this.data.lambda,
      );

      this.currentQuat = { ...filtered };

      if (typeof q.copy === "function") {
        q.copy(filtered);
      } else if (typeof q.set === "function") {
        q.set(filtered.x, filtered.y, filtered.z, filtered.w);
      } else {
        q.x = filtered.x;
        q.y = filtered.y;
        q.z = filtered.z;
        q.w = filtered.w;
      }
    },

    remove: function (this: CameraGyroStabilizerComponentInstance) {
      if (typeof window !== "undefined" && this.onRecenterEvent) {
        window.removeEventListener(
          CAMERA_RECENTER_EVENT,
          this.onRecenterEvent,
        );
      }
    },
  };
}

export function registerCameraGyroStabilizerComponent(): void {
  const globalAFrame =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as { AFRAME?: { registerComponent: (name: string, def: unknown) => void; components?: Record<string, unknown> } }).AFRAME
      : undefined;

  if (globalAFrame && typeof globalAFrame.registerComponent === "function") {
    if (!globalAFrame.components?.["cv-camera-gyro-stabilizer"]) {
      globalAFrame.registerComponent(
        "cv-camera-gyro-stabilizer",
        createCameraGyroStabilizerDefinition(),
      );
    }
  }
}

registerCameraGyroStabilizerComponent();
