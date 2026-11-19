import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppRouter } from "../../src/app";
import {
  NavigationAction,
  NavigationStateMachine,
  ScreenId,
  SessionStore,
  type StorageAdapter,
} from "../../src/navigation/index";
import { UI_CLASSES } from "../../src/screens/constants";
import { AccessModeTracker } from "../../src/session/access-mode-tracker";
import { SESSION_CONSTANTS } from "../../src/session/constants";
import type {
  SessionNetworkFetcher,
  SessionStorageAdapter,
} from "../../src/session/visitor-session-manager";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import { RoomId } from "../../src/experience/types";
import { setSharedInspectionController } from "../../src/experience/components/inspectable";

class InMemoryNavStorage implements StorageAdapter {
  private readonly store = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  public removeItem(key: string): void {
    this.store.delete(key);
  }
}

class InMemorySessionStorage implements SessionStorageAdapter {
  private readonly store = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  public removeItem(key: string): void {
    this.store.delete(key);
  }
}

class SpyFetcher implements SessionNetworkFetcher {
  public readonly calls: Array<{ url: string; body?: unknown }> = [];
  public async post<T = unknown>(url: string, body?: unknown): Promise<T> {
    this.calls.push({ url, body });
    return { ok: true } as T;
  }
}

describe("AppRouter", () => {
  let root: HTMLElement;
  let scene: HTMLElement & {
    play?: () => void;
    pause?: () => void;
    enterVR?: () => Promise<void>;
    exitVR?: () => Promise<void>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    root = document.createElement("div");
    root.id = "app";
    scene = document.createElement("a-scene") as typeof scene;
    scene.play = vi.fn();
    scene.pause = vi.fn();
    scene.enterVR = vi.fn(async () => {});
    scene.exitVR = vi.fn(async () => {});
    document.body.append(scene, root);
  });

  afterEach(() => {
    vi.useRealTimers();
    ExhibitRoomBuilder.mountRoom(scene, RoomId.LOBBY);
    setSharedInspectionController(null);
    document.body.innerHTML = "";
  });

  function createRouter() {
    const fsm = new NavigationStateMachine(
      new SessionStore(new InMemoryNavStorage()),
    );
    const sessionStorage = new InMemorySessionStorage();
    sessionStorage.setItem(
      SESSION_CONSTANTS.STORAGE_KEY,
      "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
    );
    const fetcher = new SpyFetcher();
    const tracker = new AccessModeTracker(sessionStorage, fetcher, () => "mobile");
    const router = new AppRouter(root, fsm, tracker);
    return { router, fsm, fetcher };
  }

  it("mounts all 6 screens with only SPLASH active initially", () => {
    const { router } = createRouter();

    const screens = root.querySelectorAll("[data-screen-id]");
    expect(screens).toHaveLength(6);

    const splash = root.querySelector(`[data-screen-id="${ScreenId.SPLASH}"]`)!;
    const welcome = root.querySelector(`[data-screen-id="${ScreenId.WELCOME}"]`)!;
    expect(splash.classList.contains(UI_CLASSES.SCREEN_ACTIVE)).toBe(true);
    expect(welcome.classList.contains(UI_CLASSES.SCREEN_HIDDEN)).toBe(true);

    router.destroy();
  });

  it("retains 3D scene visible in background while EXIT_MODAL is active", () => {
    const { router } = createRouter();

    (root.querySelector('[data-action="enter"]') as HTMLElement).click();
    (root.querySelector('[data-action="2d"]') as HTMLElement).click();
    (root.querySelector('[data-action="request-exit"]') as HTMLElement).click();

    const exitModal = root.querySelector(`[data-screen-id="${ScreenId.EXIT_MODAL}"]`)!;
    const experience = root.querySelector(`[data-screen-id="${ScreenId.EXPERIENCE_3D}"]`)!;

    expect(exitModal.classList.contains(UI_CLASSES.SCREEN_ACTIVE)).toBe(true);
    expect(experience.classList.contains(UI_CLASSES.SCREEN_HIDDEN)).toBe(true);
    expect(scene.style.display).toBe("block");

    router.destroy();
  });

  it("tracks viewing mode transitions via AccessModeTracker for SELECT_VR, SELECT_2D, and SWITCH_TO_TOUCH", () => {
    const { router, fetcher } = createRouter();

    (root.querySelector('[data-action="enter"]') as HTMLElement).click();
    (root.querySelector('[data-action="vr"]') as HTMLElement).click();
    (root.querySelector('[data-action="confirm-insertion"]') as HTMLElement).click();
    (root.querySelector('[data-action="request-exit"]') as HTMLElement).click();
    (root.querySelector('[data-action="switch-to-touch"]') as HTMLElement).click();

    expect(fetcher.calls.map((c) => c.body)).toEqual([
      {
        sessionId: "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
        deviceType: "mobile",
        mode: "vr",
      },
      {
        sessionId: "3f2b8c1e-5a4d-4e7b-9c12-8d6f0a1b2c3d",
        deviceType: "mobile",
        mode: "2d",
      },
    ]);

    router.destroy();
  });

  it("unmounts all screens and unsubscribes from state machine on destroy()", () => {
    const { router, fsm } = createRouter();

    router.destroy();
    expect(root.querySelectorAll("[data-screen-id]")).toHaveLength(0);

    // Subsequent dispatches do not throw or remount screens
    fsm.dispatch(NavigationAction.FINISH_LOADING);
    expect(root.querySelectorAll("[data-screen-id]")).toHaveLength(0);
  });
});
