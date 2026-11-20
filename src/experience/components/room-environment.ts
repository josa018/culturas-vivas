import { ROOM_CATALOG, RoomId } from "../../shared/room-catalog";
import {
  buildRoomEnvironment,
  type BuiltRoomEnvironment,
  type RoomEnvironmentBuildDependencies,
  type RoomEnvironmentThreeLike,
} from "../room-environment-builder";

function normalizeRoomId(raw: string | undefined): RoomId {
  const candidate = (raw ?? RoomId.LOBBY) as RoomId;
  return candidate in ROOM_CATALOG ? candidate : RoomId.LOBBY;
}

interface RoomEnvironmentComponentContext {
  data: { roomId: string };
  el: {
    object3D?: {
      add?: (obj: unknown) => void;
      remove?: (obj: unknown) => void;
    };
    sceneEl?: {
      object3D?: { fog?: unknown };
    };
  };
  builtEnv?: BuiltRoomEnvironment | null;
  elapsedSeconds?: number;
  cleanup?: () => void;
}

/**
 * Pure A-Frame component factory creating `cv-room-environment` with DI seams for testing.
 */
export function createRoomEnvironmentComponentDefinition(
  deps: RoomEnvironmentBuildDependencies = {},
) {
  const resolveThree = (): RoomEnvironmentThreeLike | undefined =>
    deps.three ??
    (globalThis as unknown as {
      AFRAME?: { THREE?: RoomEnvironmentThreeLike };
      THREE?: RoomEnvironmentThreeLike;
    }).AFRAME?.THREE ??
    (globalThis as unknown as { THREE?: RoomEnvironmentThreeLike }).THREE;

  const mountOrRebuild = function (this: RoomEnvironmentComponentContext) {
    this.cleanup?.();
    const three = resolveThree();
    if (!three) {
      return;
    }
    const roomId = normalizeRoomId(this.data?.roomId);
    const built = buildRoomEnvironment(roomId, {
      three,
      createCanvas: deps.createCanvas,
    });
    this.builtEnv = built;
    this.elapsedSeconds = 0;
    this.el.object3D?.add?.(built.root);
    if (this.el.sceneEl?.object3D) {
      this.el.sceneEl.object3D.fog = built.fog;
    }
  };

  return {
    schema: {
      roomId: { type: "string", default: RoomId.LOBBY },
    },

    init(this: RoomEnvironmentComponentContext) {
      this.cleanup = () => {
        if (!this.builtEnv) {
          return;
        }
        this.el.object3D?.remove?.(this.builtEnv.root);
        this.builtEnv.dispose();
        this.builtEnv = null;
        if (this.el.sceneEl?.object3D) {
          this.el.sceneEl.object3D.fog = null;
        }
      };
      mountOrRebuild.call(this);
    },

    update(
      this: RoomEnvironmentComponentContext,
      oldData?: { roomId?: string },
    ) {
      if (oldData && oldData.roomId && oldData.roomId !== this.data.roomId) {
        mountOrRebuild.call(this);
      }
    },

    tick(
      this: RoomEnvironmentComponentContext,
      _time: number,
      timeDelta: number,
    ) {
      if (!this.builtEnv) {
        return;
      }
      this.elapsedSeconds = (this.elapsedSeconds ?? 0) + timeDelta / 1000;
      this.builtEnv.updateParticles(this.elapsedSeconds);
    },

    remove(this: RoomEnvironmentComponentContext) {
      this.cleanup?.();
    },
  };
}

const aframeGlobal = (
  globalThis as unknown as {
    AFRAME?: { registerComponent: (name: string, def: unknown) => void };
  }
).AFRAME;

if (aframeGlobal) {
  aframeGlobal.registerComponent(
    "cv-room-environment",
    createRoomEnvironmentComponentDefinition(),
  );
}
