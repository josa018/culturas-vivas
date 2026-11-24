import { ScreenId, NavigationAction } from "../navigation/index";
import { ViewMode } from "../navigation/types";
import type { ScreenView, NavigationDispatcher } from "./base-screen";
import { UI_CLASSES, UI_TEXT } from "./constants";
import { ExhibitRoomBuilder } from "../experience/room-builder";
import { RoomTransitionStateMachine } from "../experience/room-transition-state-machine";
import { RoomId, RoomTransitionState } from "../experience/types";
import {
  ensureCameraCurtain,
  type CameraCurtainComponentInstance,
} from "../experience/components/camera-curtain";
import {
  PORTAL_ACTIVATED_EVENT,
  type PortalActivatedEventDetail,
} from "../experience/components/portal-waypoint";
import {
  DEFAULT_ROOM_ID,
  PLAYER_RIG_TOKENS,
  RETICLE_TOKENS,
  ROOM_DEFINITIONS,
  ROOM_PORTAL_ACCENTS,
  VR_HUD_ELEMENT_IDS,
} from "../experience/constants";
import { computeRigTargetYawRad } from "../experience/camera-orientation";
import type { GazeReticleComponentInstance } from "../experience/components/gaze-reticle";
import {
  ensureTouchRaycaster,
  type TouchRaycasterComponentInstance,
} from "../experience/components/touch-raycaster";
import { ensureSpatialAudioListener } from "../experience/components/spatial-audio-listener";
import { getSharedInspectionController } from "../experience/components/inspectable";
import {
  ensureVrHologramHud,
  VR_HUD_RETURN_LOBBY_EVENT,
  type VrHologramHudComponentInstance,
} from "../experience/components/vr-hologram-hud";
import {
  ensureVrTapTrigger,
  VR_TAP_HUD_TOGGLE_EVENT,
  VR_TAP_OUTSIDE_HUD_EVENT,
  type VrTapTriggerComponentInstance,
} from "../experience/components/vr-tap-trigger";
import { RoomAssetCache } from "../experience/room-asset-cache";
import { getSharedMediaCatalogClient } from "../experience/media-catalog-client";
import type { RoomMediaProvider } from "../experience/media-types";
import {
  AudioPreferencesStore,
  getSharedAudioPreferencesStore,
} from "../experience/audio/audio-preferences-store";
import {
  AudioEngine,
  getSharedAudioEngine,
} from "../experience/audio/audio-engine";
import {
  AUDIO_TOKENS,
  SfxId,
} from "../experience/audio/audio-constants";
import { getSharedSfxPlayer } from "../experience/audio/sfx-player";
import { getSharedAmbiencePlayer } from "../experience/audio/ambience-player";
import { getSharedMusicPlayer } from "../experience/audio/music-player";
import {
  getSharedVideoController,
  type SharedVideoController,
} from "../experience/shared-video-controller";
import {
  ReticlePreferencesStore,
  getSharedReticlePreferencesStore,
} from "../experience/reticle-preferences-store";
import {
  computeVolumeBarState,
  quantizeVolumeStep,
} from "../experience/audio/volume-bars";

const ZERO_ROTATION_ATTR = "0 0 0";

export type ExperienceVideoControllerPort = Pick<
  SharedVideoController,
  "pauseIfPlaying" | "stopAndRelease"
>;

interface AFrameSceneElement extends HTMLElement {
  play?: () => void;
  pause?: () => void;
  resize?: () => void;
  enterVR?: () => Promise<void> | void;
  exitVR?: () => Promise<void> | void;
  is?: (state: string) => boolean;
  removeState?: (state: string) => void;
  renderer?: {
    xr?: {
      enabled?: boolean;
    };
  };
  camera?: {
    el?: HTMLElement;
    matrixAutoUpdate?: boolean;
    updateMatrixWorld?: (force?: boolean) => void;
    updateProjectionMatrix?: () => void;
  };
}

export class ExperienceScreenView implements ScreenView {
  public readonly id = ScreenId.EXPERIENCE_3D;
  private container: HTMLElement | null = null;
  private topBarEl: HTMLElement | null = null;
  private roomBadgeEl: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private viewMode: string = "vr";
  private hasVisitedLobby: boolean = false;
  private isProgrammaticExit: boolean = false;
  private exitVRHandler: (() => void) | null = null;
  private portalHandler: ((evt: Event) => void) | null = null;
  private tapHudToggleHandler: (() => void) | null = null;
  private tapOutsideHudHandler: (() => void) | null = null;
  private hudReturnLobbyHandler: (() => void) | null = null;
  private readonly transitionStateMachine: RoomTransitionStateMachine;
  private readonly roomAssetCache: RoomAssetCache;
  private readonly mediaProvider: RoomMediaProvider;
  private readonly audioPreferencesStore: AudioPreferencesStore;
  private readonly reticlePreferencesStore: ReticlePreferencesStore;
  private readonly audioEngine: AudioEngine;
  private readonly videoController: ExperienceVideoControllerPort;
  private hasActiveExperienceSession: boolean = false;
  private settingsBtnEl: HTMLButtonElement | null = null;
  private settingsModalEl: HTMLElement | null = null;
  private settingsMusicBars: HTMLButtonElement[] = [];
  private settingsMusicValueEl: HTMLElement | null = null;
  private settingsEffectsBars: HTMLButtonElement[] = [];
  private settingsEffectsValueEl: HTMLElement | null = null;
  private settingsMasterBtnEl: HTMLButtonElement | null = null;
  private unsubscribeAudioPrefs: (() => void) | null = null;

  constructor(
    dispatch: NavigationDispatcher,
    viewMode: string = "vr",
    transitionStateMachine?: RoomTransitionStateMachine,
    roomAssetCache?: RoomAssetCache,
    mediaProvider?: RoomMediaProvider,
    audioPreferencesStore?: AudioPreferencesStore,
    audioEngine?: AudioEngine,
    videoController?: ExperienceVideoControllerPort,
    reticlePreferencesStore?: ReticlePreferencesStore,
  ) {
    this.dispatch = dispatch;
    this.viewMode = viewMode;
    this.transitionStateMachine =
      transitionStateMachine ?? new RoomTransitionStateMachine();
    this.roomAssetCache = roomAssetCache ?? new RoomAssetCache();
    this.mediaProvider = mediaProvider ?? getSharedMediaCatalogClient();
    this.audioPreferencesStore =
      audioPreferencesStore ?? getSharedAudioPreferencesStore();
    this.reticlePreferencesStore =
      reticlePreferencesStore ?? getSharedReticlePreferencesStore();
    this.audioEngine = audioEngine ?? getSharedAudioEngine();
    this.videoController = videoController ?? getSharedVideoController();
  }

  public getTransitionStateMachine(): RoomTransitionStateMachine {
    return this.transitionStateMachine;
  }

  public setViewMode(viewMode: string): void {
    this.viewMode = viewMode;
    this.synchronizeDomHud();
    if (
      typeof document !== "undefined" &&
      this.container?.classList.contains(UI_CLASSES.SCREEN_ACTIVE)
    ) {
      const scene = document.querySelector<AFrameSceneElement>("a-scene");
      if (scene) {
        this.synchronizeSpatialHud(scene);
      }
    }
  }

  public updateRoomBadge(roomId: RoomId): void {
    const roomDef =
      ROOM_DEFINITIONS[roomId] ?? ROOM_DEFINITIONS[DEFAULT_ROOM_ID];
    if (this.roomBadgeEl) {
      this.roomBadgeEl.textContent = roomDef.title;
    }
    if (typeof document !== "undefined") {
      const hudEl = document.getElementById(VR_HUD_ELEMENT_IDS.HUD_ROOT);
      if (hudEl) {
        const hudComp = (
          hudEl as unknown as {
            components?: Record<string, VrHologramHudComponentInstance>;
          }
        ).components?.["cv-vr-hologram-hud"];
        if (hudComp && typeof hudComp.setRoomTitle === "function") {
          hudComp.setRoomTitle(roomId);
        }
        const roomChip = hudEl.querySelector(
          `#${VR_HUD_ELEMENT_IDS.ROOM_CHIP}`,
        );
        if (roomChip) {
          roomChip.setAttribute("value", roomDef.title);
        }
      }

      const cursorEl = document.querySelector("a-cursor");
      const reticleComp = (
        cursorEl as unknown as {
          components?: Record<
            string,
            { setAccentColor?: (color: string) => void }
          >;
        } | null
      )?.components?.["cv-gaze-reticle"];
      const accentColor =
        ROOM_PORTAL_ACCENTS[roomId] ?? ROOM_PORTAL_ACCENTS[DEFAULT_ROOM_ID];
      if (reticleComp && typeof reticleComp.setAccentColor === "function") {
        reticleComp.setAccentColor(accentColor);
      }
    }
  }

  public mount(parent: HTMLElement): void {
    if (this.container) {
      return;
    }

    const hudOverlay = document.createElement("div");
    hudOverlay.className = `${UI_CLASSES.SCREEN_CONTAINER} cv-screen--experience`;
    hudOverlay.setAttribute("data-screen-id", this.id);

    const topBar = document.createElement("div");
    topBar.className = "cv-hud-topbar";

    const badge = document.createElement("span");
    badge.className = "cv-badge";
    this.roomBadgeEl = badge;

    const actionsGroup = document.createElement("div");
    actionsGroup.className = "cv-hud-topbar-actions";

    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = `${UI_CLASSES.BUTTON_OUTLINE} ${UI_CLASSES.HUD_SETTINGS_BTN}`;
    settingsButton.setAttribute("data-action", "open-settings");
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.setAttribute("aria-label", UI_TEXT.EXPERIENCE_SETTINGS_BTN_ARIA);
    settingsButton.textContent = UI_TEXT.EXPERIENCE_SETTINGS_BTN;
    settingsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openSettingsModal();
    });
    this.settingsBtnEl = settingsButton;

    this.updateRoomBadge(
      ExhibitRoomBuilder.getActiveRoomId() ?? DEFAULT_ROOM_ID,
    );

    const exitButton = document.createElement("button");
    exitButton.type = "button";
    exitButton.className = `${UI_CLASSES.BUTTON_OUTLINE} cv-hud-exit-btn`;
    exitButton.setAttribute("data-action", "request-exit");

    const exitLabel = document.createElement("span");
    exitLabel.textContent = `✕ ${UI_TEXT.EXPERIENCE_EXIT_HUD}`;
    exitButton.appendChild(exitLabel);

    exitButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.dispatch(NavigationAction.REQUEST_EXIT);
    });

    actionsGroup.append(settingsButton, exitButton);
    topBar.append(badge, actionsGroup);

    const settingsModal = this.buildSettingsModal();
    hudOverlay.append(topBar, settingsModal);

    parent.appendChild(hudOverlay);
    this.container = hudOverlay;
    this.topBarEl = topBar;
    this.synchronizeDomHud();
    this.setupSceneListeners();
  }

  public unmount(): void {
    this.teardownSceneListeners();
    this.teardownSettingsModal();
    this.hasVisitedLobby = false;
    this.topBarEl = null;
    this.roomBadgeEl = null;
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    this.isProgrammaticExit = false;
    this.hasActiveExperienceSession = true;
    if (this.container) {
      this.container.classList.add(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.remove(UI_CLASSES.SCREEN_HIDDEN);
    }
    const activeRoomId =
      ExhibitRoomBuilder.getActiveRoomId() ?? DEFAULT_ROOM_ID;
    this.updateRoomBadge(activeRoomId);
    this.synchronizeDomHud();
    this.setupSceneListeners();
    this.toggleSceneLifecycle(true);
    if (this.audioEngine === getSharedAudioEngine()) {
      getSharedAmbiencePlayer();
      getSharedMusicPlayer();
    }
    this.audioEngine.activateExperience(activeRoomId);
    void getSharedSfxPlayer().preloadAll();
    if (typeof document !== "undefined") {
      const scene = document.querySelector<AFrameSceneElement>("a-scene");
      if (scene) {
        ensureSpatialAudioListener(scene);
        this.synchronizeSpatialHud(scene);
      }
    }
  }

  public retainBackground(): void {
    this.closeSettingsModal();
    this.audioEngine.deactivateExperience();
    this.videoController.pauseIfPlaying();
    if (this.container) {
      this.container.classList.remove(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.add(UI_CLASSES.SCREEN_HIDDEN);
    }
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene) {
      return;
    }

    this.disableSpatialHud(scene);
    scene.style.display = "block";
    if (scene.classList && typeof scene.classList.add === "function") {
      scene.classList.add(UI_CLASSES.SCENE_ACTIVE);
    }
    ExhibitRoomBuilder.ensureRoom(scene, this.viewMode, this.mediaProvider);
    this.safeProgrammaticExitVR(scene, () => {
      this.sanitize2DViewport(scene);
      if (typeof scene.pause === "function") {
        scene.pause();
      }
    });
  }

  public hide(): void {
    if (this.hasActiveExperienceSession) {
      this.resetExperience();
      return;
    }
    this.closeSettingsModal();
    this.audioEngine.deactivateExperience();
    if (this.container) {
      this.container.classList.remove(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.add(UI_CLASSES.SCREEN_HIDDEN);
    }
    if (typeof document !== "undefined") {
      const scene = document.querySelector<AFrameSceneElement>("a-scene");
      if (scene) {
        this.disableSpatialHud(scene);
      }
    }
    this.toggleSceneLifecycle(false);
  }

  /**
   * Fully tears down the active experience session, restoring default room, camera/rig orientation,
   * media decoder release, audio suspension, and default audio preferences before next entry.
   */
  public resetExperience(): void {
    this.hasActiveExperienceSession = false;
    this.closeSettingsModal();
    this.audioEngine.deactivateExperience();
    this.videoController.stopAndRelease();
    this.audioPreferencesStore.reset();
    this.reticlePreferencesStore.reset();
    this.teardownSceneListeners();

    if (this.container) {
      this.container.classList.remove(UI_CLASSES.SCREEN_ACTIVE);
      this.container.classList.add(UI_CLASSES.SCREEN_HIDDEN);
    }

    const scene =
      typeof document !== "undefined"
        ? document.querySelector<AFrameSceneElement>("a-scene")
        : null;
    if (scene) {
      this.disableSpatialHud(scene);
      ExhibitRoomBuilder.resetToDefaultRoom(scene);
      this.resetCameraAndRigOrientation(scene);
    } else {
      ExhibitRoomBuilder.resetToDefaultRoom(null);
    }

    this.transitionStateMachine.reset(DEFAULT_ROOM_ID);
    this.hasVisitedLobby = false;
    this.updateRoomBadge(DEFAULT_ROOM_ID);
    this.toggleSceneLifecycle(false);
  }

  public getElement(): HTMLElement | null {
    return this.container;
  }

  public transitionToRoom(targetRoomId: RoomId): boolean {
    if (typeof document === "undefined") {
      return false;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene) {
      return false;
    }

    const sourceRoomId = this.transitionStateMachine.getActiveRoomId();
    const started = this.transitionStateMachine.triggerTransition(targetRoomId);
    if (!started) {
      return false;
    }
    getSharedSfxPlayer().play(SfxId.PORTAL_WHOOSH);

    // 1. Abort any active exhibit inspection and dismiss any open 3D HUD
    getSharedInspectionController().abortActiveInspection();
    const hudEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`);
    if (hudEl) {
      const hudComp = (
        hudEl as unknown as {
          components?: Record<string, VrHologramHudComponentInstance>;
        }
      ).components?.["cv-vr-hologram-hud"];
      hudComp?.dismiss();
    }
    const tapEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`);
    const tapComp = (
      tapEl as unknown as {
        components?: Record<string, VrTapTriggerComponentInstance>;
      } | null
    )?.components?.["cv-vr-tap-trigger"];
    tapComp?.setTransitionIdle(false);

    // 2. Lock gaze & touch raycasters during transition to prevent interaction glitches
    const cursor = scene.querySelector("a-cursor");
    if (cursor) {
      cursor.setAttribute("raycaster", "objects: none");
    }
    const touchEl = scene.querySelector(`#${RETICLE_TOKENS.TOUCH_RAYCASTER_ID}`);
    if (touchEl) {
      touchEl.setAttribute("cv-touch-raycaster", "enabled: false");
      const touchComp = (
        touchEl as unknown as {
          components?: Record<string, TouchRaycasterComponentInstance>;
        }
      ).components?.["cv-touch-raycaster"];
      touchComp?.setEnabled(false);
    }

    // 3. Ensure camera curtain exists on active camera
    const cameraEl =
      scene.querySelector("a-camera") || scene.querySelector("[camera]");
    const curtainEl = cameraEl ? ensureCameraCurtain(cameraEl) : null;
    const aframeCurtain = curtainEl as unknown as {
      components?: Record<string, CameraCurtainComponentInstance>;
    };
    const curtain = aframeCurtain?.components?.["cv-camera-curtain"];

    if (curtain && typeof curtain.fadeOut === "function") {
      this.audioEngine.notifyCurtainFadeOut();
      const finishSwap = () => {
        this.updateRoomBadge(targetRoomId);
        this.transitionStateMachine.notifyRoomReady();
        this.audioEngine.notifyCurtainFadeIn(targetRoomId);

        // 5. Fade curtain back in to reveal target room
        curtain.fadeIn(() => {
          this.transitionStateMachine.notifyFadeInComplete();
          tapComp?.setTransitionIdle(true);
          this.synchronizePointerMode(scene);
        });
      };

      curtain.fadeOut(() => {
        this.transitionStateMachine.notifyFadeOutComplete();

        const performSwap = () => {
          // 4. Mount target room and orient camera rig under blackout before curtain opens
          const roomGroup = ExhibitRoomBuilder.mountRoom(
            scene,
            targetRoomId,
            this.viewMode,
            this.mediaProvider,
          );
          this.applyContextualCameraOrientation(
            scene,
            targetRoomId,
            sourceRoomId,
          );
          const skyEl = scene.querySelector("a-sky");

          const hasAFrame =
            typeof globalThis !== "undefined" &&
            Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

          if (hasAFrame) {
            void ExhibitRoomBuilder.waitForRoomReady(roomGroup, skyEl).then(
              finishSwap,
            );
          } else {
            finishSwap();
          }
        };

        void this.roomAssetCache
          .ensureRoomAssets(targetRoomId, this.mediaProvider)
          .finally(performSwap);
      });
    } else {
      // Direct synchronous execution fallback (headless or no animation support)
      this.audioEngine.notifyCurtainFadeOut();
      this.transitionStateMachine.notifyFadeOutComplete();
      ExhibitRoomBuilder.mountRoom(
        scene,
        targetRoomId,
        this.viewMode,
        this.mediaProvider,
      );
      this.applyContextualCameraOrientation(scene, targetRoomId, sourceRoomId);
      this.updateRoomBadge(targetRoomId);
      this.transitionStateMachine.notifyRoomReady();
      this.audioEngine.notifyCurtainFadeIn(targetRoomId);
      this.transitionStateMachine.notifyFadeInComplete();
      tapComp?.setTransitionIdle(true);
      this.synchronizePointerMode(scene);
    }

    return true;
  }

  private toggleSceneLifecycle(active: boolean): void {
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene) {
      return;
    }

    if (active) {
      scene.style.display = "block";
      if (scene.classList && typeof scene.classList.add === "function") {
        scene.classList.add(UI_CLASSES.SCENE_ACTIVE);
      }
      const roomGroup = ExhibitRoomBuilder.ensureRoom(
        scene,
        this.viewMode,
        this.mediaProvider,
      );
      const activeRoomId = ExhibitRoomBuilder.getActiveRoomId() ?? DEFAULT_ROOM_ID;
      if (!this.hasVisitedLobby && activeRoomId === RoomId.LOBBY) {
        this.applyContextualCameraOrientation(scene, RoomId.LOBBY, null);
      }

      // Attach curtain to camera on scene activation and fade in smoothly
      const cameraEl =
        scene.querySelector("a-camera") || scene.querySelector("[camera]");
      if (cameraEl) {
        const curtainEl = ensureCameraCurtain(cameraEl);
        const aframeCurtain = curtainEl as unknown as {
          components?: Record<string, CameraCurtainComponentInstance>;
        };
        const curtain = aframeCurtain?.components?.["cv-camera-curtain"];
        if (curtain && typeof curtain.fadeIn === "function") {
          curtain.setOpacity(1);
          curtainEl.setAttribute("visible", "true");
          const skyEl = scene.querySelector("a-sky");
          const hasAFrame =
            typeof globalThis !== "undefined" &&
            Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

          if (hasAFrame) {
            void ExhibitRoomBuilder.waitForRoomReady(roomGroup, skyEl).then(
              () => {
                curtain.fadeIn();
              },
            );
          } else {
            curtain.fadeIn();
          }
        }
      }

      if (typeof scene.play === "function") {
        scene.play();
      }
      if (this.viewMode === "vr") {
        if (typeof scene.enterVR === "function") {
          try {
            const result = scene.enterVR();
            if (
              result &&
              typeof (result as Promise<void>).catch === "function"
            ) {
              (result as Promise<void>).catch((err: unknown) => {
                console.warn("[ExperienceScreenView] enterVR rejected:", err);
              });
            }
          } catch (err: unknown) {
            console.warn("[ExperienceScreenView] enterVR error:", err);
          }
        }
      } else {
        this.safeProgrammaticExitVR(scene, () => {
          this.sanitize2DViewport(scene);
        });
      }
      if (this.viewMode === "2d") {
        this.synchronizeViewport(scene);
      }
    } else {
      this.safeProgrammaticExitVR(scene);
      scene.style.display = "none";
      if (scene.classList && typeof scene.classList.remove === "function") {
        scene.classList.remove(UI_CLASSES.SCENE_ACTIVE);
      }
      if (typeof scene.pause === "function") {
        scene.pause();
      }
    }
  }

  private safeProgrammaticExitVR(
    scene: AFrameSceneElement,
    onComplete?: () => void,
  ): void {
    if (
      typeof scene.exitVR !== "function" ||
      (typeof scene.is === "function" && !scene.is("vr-mode"))
    ) {
      if (onComplete) {
        onComplete();
      }
      return;
    }
    this.isProgrammaticExit = true;
    try {
      const result = scene.exitVR();
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>)
          .catch((err: unknown) => {
            console.warn("[ExperienceScreenView] exitVR rejected:", err);
          })
          .finally(() => {
            this.isProgrammaticExit = false;
            if (onComplete) {
              onComplete();
            }
          });
      } else {
        this.isProgrammaticExit = false;
        if (onComplete) {
          onComplete();
        }
      }
    } catch {
      this.isProgrammaticExit = false;
      if (onComplete) {
        onComplete();
      }
    }
  }

  private setupSceneListeners(): void {
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene || typeof scene.addEventListener !== "function") {
      return;
    }

    if (!this.exitVRHandler) {
      this.exitVRHandler = () => {
        if (this.isProgrammaticExit) {
          return;
        }
        if (this.viewMode === "vr") {
          this.dispatch(NavigationAction.REQUEST_EXIT);
        }
      };
      scene.addEventListener("exit-vr", this.exitVRHandler);
    }

    if (!this.portalHandler) {
      this.portalHandler = (evt: Event) => {
        const detail = (evt as CustomEvent<PortalActivatedEventDetail>).detail;
        if (detail?.targetRoomId) {
          this.transitionToRoom(detail.targetRoomId);
        }
      };
      scene.addEventListener(PORTAL_ACTIVATED_EVENT, this.portalHandler);
    }

    if (!this.tapHudToggleHandler) {
      this.tapHudToggleHandler = () => {
        if (
          this.viewMode !== "vr" ||
          this.transitionStateMachine.getState() !== RoomTransitionState.IDLE
        ) {
          return;
        }
        const hudEl = ensureVrHologramHud(scene);
        const hudComp = (
          hudEl as unknown as {
            components?: Record<string, VrHologramHudComponentInstance>;
          }
        ).components?.["cv-vr-hologram-hud"];
        if (hudComp) {
          if (hudComp.isOpen) {
            hudComp.dismiss();
          } else {
            hudComp.summon();
          }
        } else {
          const isVisible = hudEl.getAttribute("visible") === "true";
          hudEl.setAttribute("visible", isVisible ? "false" : "true");
        }
      };
      scene.addEventListener(VR_TAP_HUD_TOGGLE_EVENT, this.tapHudToggleHandler);
    }

    if (!this.tapOutsideHudHandler) {
      this.tapOutsideHudHandler = () => {
        if (this.viewMode !== "vr") {
          return;
        }
        const hudEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`);
        const hudComp = (
          hudEl as unknown as {
            components?: Record<string, VrHologramHudComponentInstance>;
          } | null
        )?.components?.["cv-vr-hologram-hud"];
        if (hudComp?.isOpen) {
          hudComp.dismiss();
        }
      };
      scene.addEventListener(
        VR_TAP_OUTSIDE_HUD_EVENT,
        this.tapOutsideHudHandler,
      );
    }

    if (!this.hudReturnLobbyHandler) {
      this.hudReturnLobbyHandler = () => {
        if (
          this.viewMode === "vr" &&
          ExhibitRoomBuilder.getActiveRoomId() !== RoomId.LOBBY
        ) {
          this.transitionToRoom(RoomId.LOBBY);
        }
      };
      scene.addEventListener(
        VR_HUD_RETURN_LOBBY_EVENT,
        this.hudReturnLobbyHandler,
      );
    }
  }

  private teardownSceneListeners(): void {
    if (typeof document === "undefined") {
      return;
    }
    const scene = document.querySelector<AFrameSceneElement>("a-scene");
    if (!scene || typeof scene.removeEventListener !== "function") {
      return;
    }

    if (this.exitVRHandler) {
      scene.removeEventListener("exit-vr", this.exitVRHandler);
      this.exitVRHandler = null;
    }

    if (this.portalHandler) {
      scene.removeEventListener(PORTAL_ACTIVATED_EVENT, this.portalHandler);
      this.portalHandler = null;
    }

    if (this.tapHudToggleHandler) {
      scene.removeEventListener(
        VR_TAP_HUD_TOGGLE_EVENT,
        this.tapHudToggleHandler,
      );
      this.tapHudToggleHandler = null;
    }

    if (this.tapOutsideHudHandler) {
      scene.removeEventListener(
        VR_TAP_OUTSIDE_HUD_EVENT,
        this.tapOutsideHudHandler,
      );
      this.tapOutsideHudHandler = null;
    }

    if (this.hudReturnLobbyHandler) {
      scene.removeEventListener(
        VR_HUD_RETURN_LOBBY_EVENT,
        this.hudReturnLobbyHandler,
      );
      this.hudReturnLobbyHandler = null;
    }
  }

  private synchronizeDomHud(): void {
    if (!this.topBarEl) {
      return;
    }
    if (this.viewMode === "vr") {
      this.closeSettingsModal();
      this.topBarEl.classList.add("cv-hud-topbar--hidden");
      this.topBarEl.setAttribute("aria-hidden", "true");
    } else {
      this.topBarEl.classList.remove("cv-hud-topbar--hidden");
      this.topBarEl.removeAttribute("aria-hidden");
    }
  }

  private buildSettingsModal(): HTMLElement {
    const backdrop = document.createElement("div");
    backdrop.className = `${UI_CLASSES.MODAL_BACKDROP} ${UI_CLASSES.SETTINGS_MODAL_BACKDROP}`;
    backdrop.setAttribute("data-settings-modal", "true");
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.hidden = true;

    const card = document.createElement("div");
    card.className = `${UI_CLASSES.MODAL_CARD} ${UI_CLASSES.NIERIKA_DIALOG} ${UI_CLASSES.SETTINGS_MODAL_CARD}`;
    card.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const header = document.createElement("div");
    header.className = UI_CLASSES.SETTINGS_MODAL_HEADER;

    const title = document.createElement("h2");
    title.className = "cv-title";
    title.textContent = UI_TEXT.SETTINGS_MODAL_TITLE;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = `${UI_CLASSES.BUTTON_OUTLINE} ${UI_CLASSES.SETTINGS_MODAL_CLOSE_BTN}`;
    closeBtn.setAttribute("data-action", "close-settings");
    closeBtn.setAttribute("aria-label", UI_TEXT.SETTINGS_MODAL_CLOSE_ARIA);
    closeBtn.textContent = UI_TEXT.SETTINGS_MODAL_CLOSE_GLYPH;
    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      this.closeSettingsModal();
    });

    header.append(title, closeBtn);

    const masterBtn = document.createElement("button");
    masterBtn.type = "button";
    masterBtn.className = `${UI_CLASSES.BUTTON_OUTLINE} ${UI_CLASSES.SETTINGS_SOUND_BTN}`;
    masterBtn.setAttribute("data-sound-toggle", "master");
    masterBtn.setAttribute("aria-pressed", "false");
    masterBtn.textContent = UI_TEXT.SETTINGS_SOUND_OFF_LABEL;
    masterBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = this.audioPreferencesStore.toggleMaster();
      if (next.masterEnabled) {
        void this.audioEngine.unlockFromUserGesture().then((unlocked) => {
          if (unlocked && this.audioPreferencesStore.getPreferences().masterEnabled) {
            void getSharedSfxPlayer()
              .preloadAll()
              .then(() => {
                getSharedSfxPlayer().play(SfxId.TOGGLE_CLICK);
              });
          }
        });
      }
    });

    const applyChannelVolume = (
      channel: "music" | "effects",
      nextVolume: number,
    ): void => {
      if (this.audioPreferencesStore.getPreferences().masterEnabled) {
        void this.audioEngine.unlockFromUserGesture();
      }
      if (channel === "music") {
        this.audioPreferencesStore.setMusicVolume(nextVolume);
      } else {
        this.audioPreferencesStore.setEffectsVolume(nextVolume);
      }
      getSharedSfxPlayer().play(SfxId.TOGGLE_CLICK);
    };

    const makeVolumeBarsGroup = (
      channel: "music" | "effects",
      labelText: string,
    ): {
      groupEl: HTMLElement;
      valueEl: HTMLElement;
      barEls: HTMLButtonElement[];
    } => {
      const groupEl = document.createElement("div");
      groupEl.className = UI_CLASSES.SETTINGS_VOLUME_GROUP;
      groupEl.setAttribute("data-volume-channel", channel);

      const rowHeader = document.createElement("div");
      rowHeader.className = UI_CLASSES.SETTINGS_VOLUME_HEADER;

      const labelEl = document.createElement("span");
      labelEl.textContent = labelText;

      const valueEl = document.createElement("span");
      valueEl.className = UI_CLASSES.SETTINGS_VOLUME_VALUE;
      valueEl.setAttribute("data-sound-value", channel);

      rowHeader.append(labelEl, valueEl);

      const controlsRow = document.createElement("div");
      controlsRow.className = UI_CLASSES.VOLUME_BARS_ROW;

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = `${UI_CLASSES.BUTTON_OUTLINE} ${UI_CLASSES.VOLUME_STEP_BTN}`;
      downBtn.setAttribute("data-volume-step", "down");
      downBtn.setAttribute("aria-label", `${labelText} -`);
      downBtn.textContent = UI_TEXT.SETTINGS_VOLUME_DECREASE;
      downBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const current = this.audioPreferencesStore.getPreferences();
        const base =
          channel === "music" ? current.musicVolume : current.effectsVolume;
        const next = quantizeVolumeStep(
          base,
          -AUDIO_TOKENS.VOLUME_BAR_STEP,
          AUDIO_TOKENS.VOLUME_BAR_STEP,
        );
        applyChannelVolume(channel, next);
      });

      const barsTrack = document.createElement("div");
      barsTrack.className = UI_CLASSES.VOLUME_BARS_TRACK;

      const barEls: HTMLButtonElement[] = [];
      const initialBars = computeVolumeBarState(
        0,
        AUDIO_TOKENS.VOLUME_BAR_COUNT,
      ).bars;
      for (const item of initialBars) {
        const barBtn = document.createElement("button");
        barBtn.type = "button";
        barBtn.className = UI_CLASSES.VOLUME_BAR_BTN;
        barBtn.setAttribute("data-volume-bar", String(item.index));
        barBtn.setAttribute("data-bar-active", "false");
        barBtn.setAttribute(
          "aria-label",
          `${labelText} ${Math.round(item.targetVolume * AUDIO_TOKENS.PERCENT_MULTIPLIER)}${UI_TEXT.EXPERIENCE_SOUND_PERCENT_SUFFIX}`,
        );
        barBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          applyChannelVolume(channel, item.targetVolume);
        });
        barsTrack.appendChild(barBtn);
        barEls.push(barBtn);
      }

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = `${UI_CLASSES.BUTTON_OUTLINE} ${UI_CLASSES.VOLUME_STEP_BTN}`;
      upBtn.setAttribute("data-volume-step", "up");
      upBtn.setAttribute("aria-label", `${labelText} +`);
      upBtn.textContent = UI_TEXT.SETTINGS_VOLUME_INCREASE;
      upBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const current = this.audioPreferencesStore.getPreferences();
        const base =
          channel === "music" ? current.musicVolume : current.effectsVolume;
        const next = quantizeVolumeStep(
          base,
          AUDIO_TOKENS.VOLUME_BAR_STEP,
          AUDIO_TOKENS.VOLUME_BAR_STEP,
        );
        applyChannelVolume(channel, next);
      });

      controlsRow.append(downBtn, barsTrack, upBtn);
      groupEl.append(rowHeader, controlsRow);
      return { groupEl, valueEl, barEls };
    };

    const musicGroup = makeVolumeBarsGroup(
      "music",
      UI_TEXT.EXPERIENCE_SOUND_MUSIC,
    );
    const effectsGroup = makeVolumeBarsGroup(
      "effects",
      UI_TEXT.EXPERIENCE_SOUND_EFFECTS,
    );

    card.append(header, masterBtn, musicGroup.groupEl, effectsGroup.groupEl);
    backdrop.appendChild(card);

    backdrop.addEventListener("click", () => {
      this.closeSettingsModal();
    });

    this.settingsModalEl = backdrop;
    this.settingsMusicBars = musicGroup.barEls;
    this.settingsMusicValueEl = musicGroup.valueEl;
    this.settingsEffectsBars = effectsGroup.barEls;
    this.settingsEffectsValueEl = effectsGroup.valueEl;
    this.settingsMasterBtnEl = masterBtn;

    const syncChannelBars = (
      barEls: readonly HTMLButtonElement[],
      valueEl: HTMLElement | null,
      volume: number,
    ): void => {
      const state = computeVolumeBarState(
        volume,
        AUDIO_TOKENS.VOLUME_BAR_COUNT,
      );
      if (valueEl) {
        valueEl.textContent = `${state.percent}${UI_TEXT.EXPERIENCE_SOUND_PERCENT_SUFFIX}`;
      }
      for (let idx = 0; idx < barEls.length; idx += 1) {
        const barBtn = barEls[idx]!;
        const active = state.bars[idx]?.active ?? false;
        barBtn.setAttribute("data-bar-active", String(active));
        barBtn.classList.toggle(UI_CLASSES.VOLUME_BAR_ACTIVE, active);
      }
    };

    this.unsubscribeAudioPrefs = this.audioPreferencesStore.subscribe(
      (prefs) => {
        syncChannelBars(
          this.settingsMusicBars,
          this.settingsMusicValueEl,
          prefs.musicVolume,
        );
        syncChannelBars(
          this.settingsEffectsBars,
          this.settingsEffectsValueEl,
          prefs.effectsVolume,
        );
        if (this.settingsMasterBtnEl) {
          this.settingsMasterBtnEl.textContent = prefs.masterEnabled
            ? UI_TEXT.SETTINGS_SOUND_ON_LABEL
            : UI_TEXT.SETTINGS_SOUND_OFF_LABEL;
          this.settingsMasterBtnEl.setAttribute(
            "aria-pressed",
            String(prefs.masterEnabled),
          );
          this.settingsMasterBtnEl.classList.toggle(
            UI_CLASSES.SETTINGS_SOUND_BTN_ACTIVE,
            prefs.masterEnabled,
          );
        }
      },
    );

    return backdrop;
  }

  private openSettingsModal(): void {
    if (this.settingsModalEl) {
      this.settingsModalEl.hidden = false;
    }
    if (this.settingsBtnEl) {
      this.settingsBtnEl.setAttribute("aria-expanded", "true");
    }
  }

  private closeSettingsModal(): void {
    if (this.settingsModalEl) {
      this.settingsModalEl.hidden = true;
    }
    if (this.settingsBtnEl) {
      this.settingsBtnEl.setAttribute("aria-expanded", "false");
    }
  }

  private teardownSettingsModal(): void {
    this.unsubscribeAudioPrefs?.();
    this.unsubscribeAudioPrefs = null;
    this.settingsBtnEl = null;
    this.settingsModalEl = null;
    this.settingsMusicBars = [];
    this.settingsMusicValueEl = null;
    this.settingsEffectsBars = [];
    this.settingsEffectsValueEl = null;
    this.settingsMasterBtnEl = null;
  }

  private synchronizeSpatialHud(scene: AFrameSceneElement): void {
    const isVr = this.viewMode === "vr";
    const activeRoomId =
      ExhibitRoomBuilder.getActiveRoomId() ?? DEFAULT_ROOM_ID;

    const hudEl = ensureVrHologramHud(scene);
    hudEl.setAttribute(
      "cv-vr-hologram-hud",
      `enabled: ${isVr}; roomId: ${activeRoomId}`,
    );
    const hudComp = (
      hudEl as unknown as {
        components?: Record<string, VrHologramHudComponentInstance>;
      }
    ).components?.["cv-vr-hologram-hud"];
    if (hudComp) {
      hudComp.setEnabled(isVr);
      hudComp.setRoomTitle(activeRoomId);
      hudComp.setCallbacks({
        ...(hudComp.callbacks ?? {}),
        onToggleSound: () => {
          void this.audioEngine.unlockFromUserGesture();
          this.audioPreferencesStore.toggleMaster();
        },
      });
      hudComp.setSoundEnabled?.(
        this.audioPreferencesStore.getPreferences().masterEnabled,
      );
    } else if (!isVr) {
      hudEl.setAttribute("visible", "false");
    }

    const tapEl = ensureVrTapTrigger(scene);
    tapEl.setAttribute("cv-vr-tap-trigger", `hudToggleEnabled: ${isVr}`);
    const tapComp = (
      tapEl as unknown as {
        components?: Record<string, VrTapTriggerComponentInstance>;
      }
    ).components?.["cv-vr-tap-trigger"];
    if (tapComp) {
      tapComp.setHudToggleEnabled(isVr);
      tapComp.setTransitionIdle(
        this.transitionStateMachine.getState() === RoomTransitionState.IDLE,
      );
    }

    this.synchronizePointerMode(scene);
  }

  private synchronizePointerMode(scene: AFrameSceneElement): void {
    const isVr = this.viewMode === ViewMode.VR;
    const isTransitionIdle =
      this.transitionStateMachine.getState() === RoomTransitionState.IDLE;

    const cursor = scene.querySelector("a-cursor");
    if (cursor) {
      cursor.setAttribute(
        "raycaster",
        isVr && isTransitionIdle ? "objects: .clickable" : "objects: none",
      );
      cursor.setAttribute("fuse", isVr ? "true" : "false");
      const reticleComp = (
        cursor as unknown as {
          components?: Record<string, GazeReticleComponentInstance>;
        }
      ).components?.["cv-gaze-reticle"];
      reticleComp?.setViewMode?.(this.viewMode);
    }

    const touchEl = ensureTouchRaycaster(scene);
    if (touchEl) {
      const enableTouch = !isVr && isTransitionIdle;
      touchEl.setAttribute("cv-touch-raycaster", `enabled: ${enableTouch}`);
      const touchComp = (
        touchEl as unknown as {
          components?: Record<string, TouchRaycasterComponentInstance>;
        }
      ).components?.["cv-touch-raycaster"];
      touchComp?.setEnabled(enableTouch);
    }
  }

  private disablePointerMode(scene: AFrameSceneElement): void {
    const cursor = scene.querySelector("a-cursor");
    if (cursor) {
      cursor.setAttribute("raycaster", "objects: none");
      cursor.setAttribute("fuse", "false");
      const reticleComp = (
        cursor as unknown as {
          components?: Record<string, GazeReticleComponentInstance>;
        }
      ).components?.["cv-gaze-reticle"];
      reticleComp?.setViewMode?.(ViewMode.TOUCH_2D);
    }

    const touchEl = scene.querySelector(`#${RETICLE_TOKENS.TOUCH_RAYCASTER_ID}`);
    if (touchEl) {
      touchEl.setAttribute("cv-touch-raycaster", "enabled: false");
      const touchComp = (
        touchEl as unknown as {
          components?: Record<string, TouchRaycasterComponentInstance>;
        }
      ).components?.["cv-touch-raycaster"];
      touchComp?.setEnabled(false);
    }
  }

  private disableSpatialHud(scene: AFrameSceneElement): void {
    const hudEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`);
    if (hudEl) {
      hudEl.setAttribute("cv-vr-hologram-hud", "enabled: false");
      const hudComp = (
        hudEl as unknown as {
          components?: Record<string, VrHologramHudComponentInstance>;
        }
      ).components?.["cv-vr-hologram-hud"];
      if (hudComp) {
        hudComp.setEnabled(false);
      } else {
        hudEl.setAttribute("visible", "false");
      }
    }

    const tapEl = scene.querySelector(`#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`);
    if (tapEl) {
      tapEl.setAttribute("cv-vr-tap-trigger", "hudToggleEnabled: false");
      const tapComp = (
        tapEl as unknown as {
          components?: Record<string, VrTapTriggerComponentInstance>;
        }
      ).components?.["cv-vr-tap-trigger"];
      tapComp?.setHudToggleEnabled(false);
    }

    this.disablePointerMode(scene);
  }

  private applyContextualCameraOrientation(
    scene: AFrameSceneElement,
    targetRoomId: RoomId,
    sourceRoomId: RoomId | null,
  ): void {
    const cameraEl =
      scene.querySelector("a-camera") || scene.querySelector("[camera]");
    const cameraObj = (
      cameraEl as unknown as {
        object3D?: {
          rotation?: { x?: number; y?: number };
          updateMatrix?: () => void;
        };
      } | null
    )?.object3D;
    const lookControls = (
      cameraEl as unknown as {
        components?: Record<
          string,
          {
            yawObject?: { rotation?: { y?: number } };
            pitchObject?: { rotation?: { x?: number } };
          }
        >;
      } | null
    )?.components?.["look-controls"];

    const localObjYaw =
      cameraObj?.rotation && Number.isFinite(cameraObj.rotation.y)
        ? Number(cameraObj.rotation.y)
        : 0;
    const localLookYaw =
      lookControls?.yawObject?.rotation &&
      Number.isFinite(lookControls.yawObject.rotation.y)
        ? Number(lookControls.yawObject.rotation.y)
        : 0;
    const currentCameraLocalYawRad =
      localObjYaw !== 0 ? localObjYaw : localLookYaw;

    const orientation = computeRigTargetYawRad({
      targetRoomId,
      sourceRoomId,
      hasVisitedLobby: this.hasVisitedLobby,
      viewMode: this.viewMode as ViewMode,
      currentCameraLocalYawRad,
    });

    if (orientation.resetLocalLookControls && cameraEl) {
      if (lookControls?.yawObject?.rotation) {
        lookControls.yawObject.rotation.y = 0;
      }
      if (lookControls?.pitchObject?.rotation) {
        lookControls.pitchObject.rotation.x = 0;
      }
      if (cameraObj?.rotation) {
        cameraObj.rotation.y = 0;
        cameraObj.updateMatrix?.();
      }
      cameraEl.setAttribute("rotation", "0 0 0");
    }

    if (orientation.rigYawRad !== null) {
      const rigEl = scene.querySelector(`#${PLAYER_RIG_TOKENS.CAMERA_RIG_ID}`);
      if (rigEl) {
        const rigYawDeg =
          Number((orientation.rigYawRad * (180 / Math.PI)).toFixed(4)) || 0;
        rigEl.setAttribute("rotation", `0 ${rigYawDeg} 0`);
        const rigObj = (
          rigEl as unknown as {
            object3D?: {
              rotation?: { y: number };
              updateMatrix?: () => void;
            };
          }
        ).object3D;
        if (rigObj?.rotation) {
          rigObj.rotation.y = orientation.rigYawRad;
          rigObj.updateMatrix?.();
        }
      }
    }

    if (targetRoomId === RoomId.LOBBY) {
      this.hasVisitedLobby = true;
    }
  }

  private resetCameraAndRigOrientation(scene: AFrameSceneElement): void {
    const cameraEl =
      scene.querySelector("a-camera") || scene.querySelector("[camera]");
    if (cameraEl) {
      const aframeCamera = cameraEl as unknown as {
        object3D?: {
          rotation?: { x?: number; y?: number; z?: number };
          updateMatrix?: () => void;
        };
        components?: Record<
          string,
          {
            yawObject?: { rotation?: { y?: number } };
            pitchObject?: { rotation?: { x?: number } };
          }
        >;
      };
      const lookControls = aframeCamera.components?.["look-controls"];
      if (lookControls?.yawObject?.rotation) {
        lookControls.yawObject.rotation.y = 0;
      }
      if (lookControls?.pitchObject?.rotation) {
        lookControls.pitchObject.rotation.x = 0;
      }
      if (aframeCamera.object3D?.rotation) {
        aframeCamera.object3D.rotation.x = 0;
        aframeCamera.object3D.rotation.y = 0;
        aframeCamera.object3D.rotation.z = 0;
        aframeCamera.object3D.updateMatrix?.();
      }
      cameraEl.setAttribute("rotation", ZERO_ROTATION_ATTR);
    }

    const rigEl = scene.querySelector(`#${PLAYER_RIG_TOKENS.CAMERA_RIG_ID}`);
    if (rigEl) {
      rigEl.setAttribute("rotation", ZERO_ROTATION_ATTR);
      const rigObj = (
        rigEl as unknown as {
          object3D?: {
            rotation?: { x?: number; y?: number; z?: number };
            updateMatrix?: () => void;
          };
        }
      ).object3D;
      if (rigObj?.rotation) {
        rigObj.rotation.x = 0;
        rigObj.rotation.y = 0;
        rigObj.rotation.z = 0;
        rigObj.updateMatrix?.();
      }
    }
  }

  private sanitize2DViewport(scene: AFrameSceneElement): void {
    if (typeof scene.removeState === "function") {
      if (typeof scene.is === "function" && scene.is("vr-mode")) {
        scene.removeState("vr-mode");
      }
      if (typeof scene.is === "function" && scene.is("ar-mode")) {
        scene.removeState("ar-mode");
      }
    }

    if (scene.renderer?.xr) {
      scene.renderer.xr.enabled = false;
    }

    const cameraEl =
      scene.querySelector("a-camera") || scene.querySelector("[camera]");
    if (cameraEl) {
      const obj3D = (
        cameraEl as unknown as {
          object3D?: {
            matrixAutoUpdate?: boolean;
            updateMatrix?: () => void;
          };
        }
      ).object3D;
      if (obj3D) {
        obj3D.matrixAutoUpdate = true;
        if (typeof obj3D.updateMatrix === "function") {
          obj3D.updateMatrix();
        }
      }

      const aframeEl = cameraEl as unknown as {
        components?: Record<
          string,
          {
            touchStarted?: boolean;
            mouseDown?: boolean;
            data?: { touchEnabled?: boolean; enabled?: boolean };
            addEventListeners?: () => void;
          }
        >;
      };
      const lookControls = aframeEl.components?.["look-controls"];
      if (lookControls) {
        lookControls.touchStarted = false;
        lookControls.mouseDown = false;
        if (lookControls.data) {
          lookControls.data.touchEnabled = true;
          lookControls.data.enabled = true;
        }
        if (typeof lookControls.addEventListeners === "function") {
          lookControls.addEventListeners();
        }
      }
    }

    if (scene.camera) {
      scene.camera.matrixAutoUpdate = true;
      if (typeof scene.camera.updateProjectionMatrix === "function") {
        scene.camera.updateProjectionMatrix();
      }
    }
  }

  private synchronizeViewport(scene: AFrameSceneElement): void {
    this.sanitize2DViewport(scene);
    const triggerResize = () => {
      if (typeof scene.resize === "function") {
        scene.resize();
      }
      if (
        typeof window !== "undefined" &&
        typeof window.dispatchEvent === "function"
      ) {
        try {
          window.dispatchEvent(new Event("resize"));
        } catch {
          // Gracefully ignore in non-browser testing contexts
        }
      }
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(triggerResize);
    } else {
      triggerResize();
    }
  }
}
