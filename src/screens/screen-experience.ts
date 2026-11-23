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
  VR_HUD_EXIT_EVENT,
  VR_HUD_RETURN_LOBBY_EVENT,
  VR_HUD_SWITCH_2D_EVENT,
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
import { STAND_DICTIONARY } from "../experience/constants";

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
  private returnLobbyBtnEl: HTMLElement | null = null;
  private readonly dispatch: NavigationDispatcher;
  private viewMode: string = "vr";
  private hasVisitedLobby: boolean = false;
  private isProgrammaticExit: boolean = false;
  private exitVRHandler: (() => void) | null = null;
  private portalHandler: ((evt: Event) => void) | null = null;
  private tapHudToggleHandler: (() => void) | null = null;
  private tapOutsideHudHandler: (() => void) | null = null;
  private hudSwitch2dHandler: (() => void) | null = null;
  private hudReturnLobbyHandler: (() => void) | null = null;
  private hudExitHandler: (() => void) | null = null;
  private readonly transitionStateMachine: RoomTransitionStateMachine;
  private readonly roomAssetCache: RoomAssetCache;
  private readonly mediaProvider: RoomMediaProvider;
  private readonly audioPreferencesStore: AudioPreferencesStore;
  private readonly audioEngine: AudioEngine;
  private soundWrapperEl: HTMLElement | null = null;
  private soundMenuBtnEl: HTMLButtonElement | null = null;
  private soundPopoverEl: HTMLElement | null = null;
  private soundMusicInputEl: HTMLInputElement | null = null;
  private soundMusicValueEl: HTMLElement | null = null;
  private soundEffectsInputEl: HTMLInputElement | null = null;
  private soundEffectsValueEl: HTMLElement | null = null;
  private soundMasterInputEl: HTMLInputElement | null = null;
  private unsubscribeAudioPrefs: (() => void) | null = null;
  private outsideSoundClickHandler: ((evt: Event) => void) | null = null;

  constructor(
    dispatch: NavigationDispatcher,
    viewMode: string = "vr",
    transitionStateMachine?: RoomTransitionStateMachine,
    roomAssetCache?: RoomAssetCache,
    mediaProvider?: RoomMediaProvider,
    audioPreferencesStore?: AudioPreferencesStore,
    audioEngine?: AudioEngine,
  ) {
    this.dispatch = dispatch;
    this.viewMode = viewMode;
    this.transitionStateMachine =
      transitionStateMachine ?? new RoomTransitionStateMachine();
    this.roomAssetCache = roomAssetCache ?? new RoomAssetCache();
    this.mediaProvider = mediaProvider ?? getSharedMediaCatalogClient();
    this.audioPreferencesStore =
      audioPreferencesStore ?? getSharedAudioPreferencesStore();
    this.audioEngine = audioEngine ?? getSharedAudioEngine();
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
    if (this.returnLobbyBtnEl) {
      const showLobbyBtn = roomId !== RoomId.LOBBY;
      this.returnLobbyBtnEl.style.display = showLobbyBtn
        ? "inline-flex"
        : "none";
      this.returnLobbyBtnEl.hidden = !showLobbyBtn;
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

    const soundControl = this.buildSoundControl();

    const returnLobbyButton = document.createElement("button");
    returnLobbyButton.type = "button";
    returnLobbyButton.className = `${UI_CLASSES.BUTTON_OUTLINE} cv-hud-lobby-btn`;
    returnLobbyButton.setAttribute("data-action", "return-lobby");
    returnLobbyButton.textContent = UI_TEXT.EXPERIENCE_RETURN_LOBBY;
    returnLobbyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.transitionToRoom(RoomId.LOBBY);
    });
    this.returnLobbyBtnEl = returnLobbyButton;

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

    actionsGroup.append(soundControl, returnLobbyButton, exitButton);
    topBar.append(badge, actionsGroup);
    hudOverlay.appendChild(topBar);

    parent.appendChild(hudOverlay);
    this.container = hudOverlay;
    this.topBarEl = topBar;
    this.synchronizeDomHud();
    this.setupSceneListeners();
  }

  public unmount(): void {
    this.teardownSceneListeners();
    this.teardownSoundControl();
    this.hasVisitedLobby = false;
    this.topBarEl = null;
    this.roomBadgeEl = null;
    this.returnLobbyBtnEl = null;
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  public show(): void {
    this.isProgrammaticExit = false;
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
    this.closeSoundPopover();
    this.audioEngine.deactivateExperience();
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
    this.closeSoundPopover();
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

    if (!this.hudSwitch2dHandler) {
      this.hudSwitch2dHandler = () => {
        if (this.viewMode === "vr") {
          this.dispatch(NavigationAction.SWITCH_TO_TOUCH);
        }
      };
      scene.addEventListener(VR_HUD_SWITCH_2D_EVENT, this.hudSwitch2dHandler);
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

    if (!this.hudExitHandler) {
      this.hudExitHandler = () => {
        if (this.viewMode === "vr") {
          this.dispatch(NavigationAction.REQUEST_EXIT);
        }
      };
      scene.addEventListener(VR_HUD_EXIT_EVENT, this.hudExitHandler);
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

    if (this.hudSwitch2dHandler) {
      scene.removeEventListener(
        VR_HUD_SWITCH_2D_EVENT,
        this.hudSwitch2dHandler,
      );
      this.hudSwitch2dHandler = null;
    }

    if (this.hudReturnLobbyHandler) {
      scene.removeEventListener(
        VR_HUD_RETURN_LOBBY_EVENT,
        this.hudReturnLobbyHandler,
      );
      this.hudReturnLobbyHandler = null;
    }

    if (this.hudExitHandler) {
      scene.removeEventListener(VR_HUD_EXIT_EVENT, this.hudExitHandler);
      this.hudExitHandler = null;
    }
  }

  private synchronizeDomHud(): void {
    if (!this.topBarEl) {
      return;
    }
    if (this.viewMode === "vr") {
      this.closeSoundPopover();
      this.topBarEl.classList.add("cv-hud-topbar--hidden");
      this.topBarEl.setAttribute("aria-hidden", "true");
    } else {
      this.topBarEl.classList.remove("cv-hud-topbar--hidden");
      this.topBarEl.removeAttribute("aria-hidden");
    }
  }

  private buildSoundControl(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = UI_CLASSES.HUD_SOUND_WRAPPER;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${UI_CLASSES.BUTTON_OUTLINE} ${UI_CLASSES.HUD_SOUND_BTN}`;
    btn.setAttribute("data-action", "toggle-sound-menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", UI_TEXT.EXPERIENCE_SOUND_BTN_ARIA);

    const popover = document.createElement("div");
    popover.className = UI_CLASSES.HUD_SOUND_POPOVER;
    popover.setAttribute("data-sound-popover", "true");
    popover.hidden = true;

    const masterRow = document.createElement("label");
    masterRow.className = UI_CLASSES.HUD_SOUND_ROW;
    const masterInput = document.createElement("input");
    masterInput.type = "checkbox";
    masterInput.setAttribute("data-sound-toggle", "master");
    masterInput.addEventListener("change", (event) => {
      event.stopPropagation();
      void this.audioEngine.unlockFromUserGesture();
      this.audioPreferencesStore.toggleMaster();
      getSharedSfxPlayer().play(SfxId.TOGGLE_CLICK);
    });
    const masterText = document.createElement("span");
    masterText.textContent = UI_TEXT.EXPERIENCE_SOUND_MASTER;
    masterRow.append(masterInput, masterText);

    const makeSliderRow = (
      key: "music" | "effects",
      labelText: string,
      onInput: (volume: number) => void,
    ): { row: HTMLElement; input: HTMLInputElement; valueEl: HTMLElement } => {
      const row = document.createElement("label");
      row.className = UI_CLASSES.HUD_SOUND_SLIDER_ROW;

      const header = document.createElement("div");
      header.className = UI_CLASSES.HUD_SOUND_SLIDER_HEADER;

      const text = document.createElement("span");
      text.textContent = labelText;

      const valueEl = document.createElement("span");
      valueEl.className = UI_CLASSES.HUD_SOUND_SLIDER_VALUE;
      valueEl.setAttribute("data-sound-value", key);

      header.append(text, valueEl);

      const input = document.createElement("input");
      input.type = "range";
      input.className = UI_CLASSES.HUD_SOUND_SLIDER;
      input.min = String(AUDIO_TOKENS.VOLUME_MIN);
      input.max = String(AUDIO_TOKENS.VOLUME_MAX);
      input.step = String(AUDIO_TOKENS.VOLUME_STEP);
      input.setAttribute("data-sound-slider", key);
      input.setAttribute("aria-label", labelText);
      input.addEventListener("input", (event) => {
        event.stopPropagation();
        if (this.audioPreferencesStore.getPreferences().masterEnabled) {
          void this.audioEngine.unlockFromUserGesture();
        }
        onInput(Number(input.value));
      });

      row.append(header, input);
      return { row, input, valueEl };
    };

    const musicRow = makeSliderRow(
      "music",
      UI_TEXT.EXPERIENCE_SOUND_MUSIC,
      (volume) => this.audioPreferencesStore.setMusicVolume(volume),
    );
    const effectsRow = makeSliderRow(
      "effects",
      UI_TEXT.EXPERIENCE_SOUND_EFFECTS,
      (volume) => this.audioPreferencesStore.setEffectsVolume(volume),
    );

    popover.append(masterRow, musicRow.row, effectsRow.row);
    popover.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextOpen = popover.hidden;
      popover.hidden = !nextOpen;
      popover.classList.toggle(UI_CLASSES.HUD_SOUND_POPOVER_OPEN, nextOpen);
      btn.setAttribute("aria-expanded", String(nextOpen));
    });

    wrapper.append(btn, popover);

    this.soundWrapperEl = wrapper;
    this.soundMenuBtnEl = btn;
    this.soundPopoverEl = popover;
    this.soundMusicInputEl = musicRow.input;
    this.soundMusicValueEl = musicRow.valueEl;
    this.soundEffectsInputEl = effectsRow.input;
    this.soundEffectsValueEl = effectsRow.valueEl;
    this.soundMasterInputEl = masterInput;

    const formatPercent = (volume: number): string =>
      `${Math.round(volume * AUDIO_TOKENS.PERCENT_MULTIPLIER)}${UI_TEXT.EXPERIENCE_SOUND_PERCENT_SUFFIX}`;

    this.unsubscribeAudioPrefs = this.audioPreferencesStore.subscribe(
      (prefs) => {
        if (this.soundMusicInputEl) {
          this.soundMusicInputEl.value = String(prefs.musicVolume);
        }
        if (this.soundMusicValueEl) {
          this.soundMusicValueEl.textContent = formatPercent(prefs.musicVolume);
        }
        if (this.soundEffectsInputEl) {
          this.soundEffectsInputEl.value = String(prefs.effectsVolume);
        }
        if (this.soundEffectsValueEl) {
          this.soundEffectsValueEl.textContent = formatPercent(
            prefs.effectsVolume,
          );
        }
        if (this.soundMasterInputEl) {
          this.soundMasterInputEl.checked = prefs.masterEnabled;
        }
        if (this.soundMenuBtnEl) {
          const icon = prefs.masterEnabled
            ? STAND_DICTIONARY.UNMUTE_ICON
            : STAND_DICTIONARY.MUTE_ICON;
          this.soundMenuBtnEl.textContent = `${icon} ${UI_TEXT.EXPERIENCE_SOUND_BTN}`;
          this.soundMenuBtnEl.setAttribute(
            "data-sound-active",
            String(prefs.masterEnabled),
          );
        }
      },
    );

    if (typeof document !== "undefined") {
      this.outsideSoundClickHandler = (evt: Event) => {
        const target = evt.target as Node | null;
        if (
          this.soundPopoverEl &&
          !this.soundPopoverEl.hidden &&
          this.soundWrapperEl &&
          target &&
          !this.soundWrapperEl.contains(target)
        ) {
          this.closeSoundPopover();
        }
      };
      document.addEventListener("click", this.outsideSoundClickHandler);
    }

    return wrapper;
  }

  private closeSoundPopover(): void {
    if (this.soundPopoverEl) {
      this.soundPopoverEl.hidden = true;
      this.soundPopoverEl.classList.remove(UI_CLASSES.HUD_SOUND_POPOVER_OPEN);
    }
    if (this.soundMenuBtnEl) {
      this.soundMenuBtnEl.setAttribute("aria-expanded", "false");
    }
  }

  private teardownSoundControl(): void {
    this.unsubscribeAudioPrefs?.();
    this.unsubscribeAudioPrefs = null;
    if (typeof document !== "undefined" && this.outsideSoundClickHandler) {
      document.removeEventListener("click", this.outsideSoundClickHandler);
      this.outsideSoundClickHandler = null;
    }
    this.soundWrapperEl = null;
    this.soundMenuBtnEl = null;
    this.soundPopoverEl = null;
    this.soundMusicInputEl = null;
    this.soundMusicValueEl = null;
    this.soundEffectsInputEl = null;
    this.soundEffectsValueEl = null;
    this.soundMasterInputEl = null;
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
