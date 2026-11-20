import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExperienceScreenView } from "../../src/screens/screen-experience";
import { RoomId, RoomTransitionState } from "../../src/experience/types";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import {
  PORTAL_ACTIVATED_EVENT,
  type PortalActivatedEventDetail,
} from "../../src/experience/components/portal-waypoint";
import { CAMERA_CURTAIN_ID } from "../../src/experience/components/camera-curtain";
import {
  setSharedInspectionController,
  getSharedInspectionController,
} from "../../src/experience/components/inspectable";
import {
  ExhibitMediaType,
  InspectionState,
  ROOM_DEFINITIONS,
  ROOM_PORTAL_ACCENTS,
  VR_HUD_ELEMENT_IDS,
} from "../../src/experience/constants";
import type { RoomMediaProvider } from "../../src/experience/media-types";
import { StandId } from "../../src/shared/room-catalog";
import { RoomAssetCache } from "../../src/experience/room-asset-cache";
import { UI_TEXT } from "../../src/screens/constants";

describe("ExperienceScreenView Room Transition", () => {
  let scene: HTMLElement;
  let camera: HTMLElement;
  let cursor: HTMLElement;
  let container: HTMLElement;
  let screen: ExperienceScreenView;

  beforeEach(() => {
    document.body.innerHTML = "";
    scene = document.createElement("a-scene");
    camera = document.createElement("a-camera");
    cursor = document.createElement("a-cursor");
    cursor.setAttribute("raycaster", "objects: .clickable");
    const sky = document.createElement("a-sky");

    camera.appendChild(cursor);
    scene.append(camera, sky);
    container = document.createElement("div");
    document.body.append(scene, container);

    screen = new ExperienceScreenView(() => {});
  });

  afterEach(() => {
    screen.unmount();
    ExhibitRoomBuilder.mountRoom(scene, RoomId.LOBBY);
    setSharedInspectionController(null);
    document.body.innerHTML = "";
  });

  it("initializes in LOBBY, swaps rooms via portal and Return to Lobby button, and aborts active inspection", () => {
    const setAccentColorSpy = vi.fn();
    (
      cursor as HTMLElement & {
        components?: Record<string, { setAccentColor?: (color: string) => void }>;
      }
    ).components = {
      "cv-gaze-reticle": { setAccentColor: setAccentColorSpy },
    };

    const stateMachine = screen.getTransitionStateMachine();
    expect(stateMachine.getState()).toBe(RoomTransitionState.IDLE);
    expect(stateMachine.getActiveRoomId()).toBe(RoomId.LOBBY);

    screen.mount(container);
    screen.show();

    const returnLobbyBtn = container.querySelector(
      '[data-action="return-lobby"]',
    ) as HTMLElement;
    expect(returnLobbyBtn).toBeTruthy();
    expect(returnLobbyBtn.style.display).toBe("none");

    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.LOBBY);
    expect(container.querySelector(".cv-badge")?.textContent).toBe(
      ROOM_DEFINITIONS[RoomId.LOBBY].title,
    );
    expect(scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`)).toBeTruthy();
    expect(
      scene.querySelector(`#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`),
    ).toBeTruthy();

    scene.dispatchEvent(
      new CustomEvent<PortalActivatedEventDetail>(PORTAL_ACTIVATED_EVENT, {
        detail: {
          portalId: "portal-lobby-to-wixarika",
          targetRoomId: RoomId.WIXARIKA,
        },
        bubbles: true,
      }),
    );

    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.WIXARIKA);
    expect(setAccentColorSpy).toHaveBeenCalledWith(
      ROOM_PORTAL_ACCENTS[RoomId.WIXARIKA],
    );
    expect(stateMachine.getActiveRoomId()).toBe(RoomId.WIXARIKA);
    expect(stateMachine.getState()).toBe(RoomTransitionState.IDLE);
    expect(container.querySelector(".cv-badge")?.textContent).toBe(
      ROOM_DEFINITIONS[RoomId.WIXARIKA].title,
    );
    expect(returnLobbyBtn.style.display).not.toBe("none");
    expect(returnLobbyBtn.textContent).toContain(
      UI_TEXT.EXPERIENCE_RETURN_LOBBY,
    );
    expect(cursor.getAttribute("raycaster")).toBe("objects: .clickable");

    const inspectionController = getSharedInspectionController();
    inspectionController.focus("exhibit-wixarika-artifact");
    expect(inspectionController.getState()).toBe(InspectionState.FOCUSING);

    returnLobbyBtn.click();

    expect(inspectionController.getState()).toBe(InspectionState.IDLE);
    expect(inspectionController.getActiveExhibit()).toBeNull();
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.LOBBY);
    expect(container.querySelector(".cv-badge")?.textContent).toBe(
      ROOM_DEFINITIONS[RoomId.LOBBY].title,
    );
    expect(returnLobbyBtn.style.display).toBe("none");
  });

  it("returns false when <a-scene> is absent from the document", () => {
    scene.remove();
    expect(screen.transitionToRoom(RoomId.WIXARIKA)).toBe(false);
  });

  it("locks cursor, awaits RoomAssetCache during blackout swap, and rejects concurrent triggers", async () => {
    const loadedUrls: string[] = [];
    const assetCache = new RoomAssetCache({
      preloadImage: async (url) => {
        loadedUrls.push(url);
        return true;
      },
    });
    const stubProvider: RoomMediaProvider = {
      getStandItems: vi.fn((roomId, standId) =>
        roomId === RoomId.WIXARIKA && standId === StandId.ARTE
          ? [
              {
                id: "wix-cover",
                roomId,
                standId,
                mediaType: ExhibitMediaType.IMAGE_2D,
                title: "Arte",
                creatorName: "Autor",
                description: "Desc",
                mediaUrl: "https://cdn.example.com/wix-stand-cover.jpg",
                sortOrder: 0,
              },
            ]
          : [],
      ),
    };
    screen.unmount();
    screen = new ExperienceScreenView(
      () => {},
      "vr",
      undefined,
      assetCache,
      stubProvider,
    );
    screen.mount(container);
    screen.show();

    const curtainEl = camera.querySelector(
      `#${CAMERA_CURTAIN_ID}`,
    ) as HTMLElement & {
      components?: Record<
        string,
        {
          fadeOut: (cb?: () => void) => void;
          fadeIn: (cb?: () => void) => void;
        }
      >;
    };
    let finishFadeOut!: () => void;
    let finishFadeIn!: () => void;
    curtainEl.components = {
      "cv-camera-curtain": {
        fadeOut: (cb) => {
          finishFadeOut = cb!;
        },
        fadeIn: (cb) => {
          finishFadeIn = cb!;
        },
      },
    };

    const finishFadeOut_reticleSpy = vi.fn();
    (cursor as unknown as {
      components?: Record<string, { setAccentColor?: (hex: string) => void }>;
    }).components = {
      "cv-gaze-reticle": {
        setAccentColor: finishFadeOut_reticleSpy,
      },
    };

    expect(screen.transitionToRoom(RoomId.WIXARIKA)).toBe(true);
    expect(cursor.getAttribute("raycaster")).toBe("objects: none");
    expect(screen.getTransitionStateMachine().getState()).toBe(
      RoomTransitionState.FADING_OUT,
    );

    // Concurrent trigger while transition is in flight must be rejected
    expect(screen.transitionToRoom(RoomId.NAAYERI)).toBe(false);

    finishFadeOut();
    await vi.waitFor(() => {
      expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.WIXARIKA);
    });
    expect(finishFadeOut_reticleSpy).toHaveBeenCalledWith("#D99B26");
    expect(loadedUrls).toEqual([
      "https://cdn.example.com/wix-stand-cover.jpg",
    ]);
    expect(screen.getTransitionStateMachine().getState()).toBe(
      RoomTransitionState.FADING_IN,
    );

    finishFadeIn();
    expect(screen.getTransitionStateMachine().getState()).toBe(
      RoomTransitionState.IDLE,
    );
    expect(cursor.getAttribute("raycaster")).toBe("objects: .clickable");
  });

  it("ignores cv-portal-activated events missing targetRoomId", () => {
    screen.mount(container);
    screen.show();

    scene.dispatchEvent(
      new CustomEvent(PORTAL_ACTIVATED_EVENT, {
        detail: { portalId: "broken-portal" },
        bubbles: true,
      }),
    );

    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.LOBBY);
    expect(screen.getTransitionStateMachine().getState()).toBe(
      RoomTransitionState.IDLE,
    );
  });
});
