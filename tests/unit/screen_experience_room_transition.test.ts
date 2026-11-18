import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExperienceScreenView } from "../../src/screens/screen-experience";
import { RoomId, RoomTransitionState } from "../../src/experience/types";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import {
  PORTAL_ACTIVATED_EVENT,
  type PortalActivatedEventDetail,
} from "../../src/experience/components/portal-waypoint";
import { CAMERA_CURTAIN_ID } from "../../src/experience/components/camera-curtain";
import { setSharedInspectionController, getSharedInspectionController } from "../../src/experience/components/inspectable";
import {
  InspectionState,
  VR_HUD_ELEMENT_IDS,
} from "../../src/experience/constants";

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
    ExhibitRoomBuilder.mountRoom(scene, RoomId.ARCHAEOLOGY);
    setSharedInspectionController(null);
    document.body.innerHTML = "";
  });

  it("aborts active inspection, swaps room, and updates HUD on portal activation", () => {
    const stateMachine = screen.getTransitionStateMachine();
    expect(stateMachine.getState()).toBe(RoomTransitionState.IDLE);
    expect(stateMachine.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);

    screen.mount(container);
    screen.show();

    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);
    expect(container.querySelector(".cv-badge")?.textContent).toBe("Sala de Arqueologia");
    expect(scene.querySelector(`#${VR_HUD_ELEMENT_IDS.HUD_ROOT}`)).toBeTruthy();
    expect(scene.querySelector(`#${VR_HUD_ELEMENT_IDS.TAP_TRIGGER}`)).toBeTruthy();

    const inspectionController = getSharedInspectionController();
    inspectionController.focus("exhibit-statue-3d");
    expect(inspectionController.getState()).toBe(InspectionState.FOCUSING);

    scene.dispatchEvent(
      new CustomEvent<PortalActivatedEventDetail>(PORTAL_ACTIVATED_EVENT, {
        detail: {
          portalId: "portal-archaeology-to-textiles",
          targetRoomId: RoomId.TEXTILES,
        },
        bubbles: true,
      }),
    );

    expect(inspectionController.getState()).toBe(InspectionState.IDLE);
    expect(inspectionController.getActiveExhibit()).toBeNull();
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.TEXTILES);
    expect(stateMachine.getActiveRoomId()).toBe(RoomId.TEXTILES);
    expect(stateMachine.getState()).toBe(RoomTransitionState.IDLE);
    expect(container.querySelector(".cv-badge")?.textContent).toBe("Sala de Textiles");
    expect(cursor.getAttribute("raycaster")).toBe("objects: .clickable");

    scene.dispatchEvent(
      new CustomEvent<PortalActivatedEventDetail>(PORTAL_ACTIVATED_EVENT, {
        detail: {
          portalId: "portal-textiles-to-archaeology",
          targetRoomId: RoomId.ARCHAEOLOGY,
        },
        bubbles: true,
      }),
    );

    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);
    expect(container.querySelector(".cv-badge")?.textContent).toBe("Sala de Arqueologia");
  });

  it("returns false when <a-scene> is absent from the document", () => {
    scene.remove();
    expect(screen.transitionToRoom(RoomId.TEXTILES)).toBe(false);
  });

  it("locks cursor & tap trigger during animated curtain transition and rejects concurrent triggers", () => {
    screen.mount(container);
    screen.show();

    const curtainEl = camera.querySelector(`#${CAMERA_CURTAIN_ID}`) as HTMLElement & {
      components?: Record<string, { fadeOut: (cb?: () => void) => void; fadeIn: (cb?: () => void) => void }>;
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

    expect(screen.transitionToRoom(RoomId.TEXTILES)).toBe(true);
    expect(cursor.getAttribute("raycaster")).toBe("objects: none");
    expect(screen.getTransitionStateMachine().getState()).toBe(
      RoomTransitionState.FADING_OUT,
    );

    // Concurrent trigger while transition is in flight must be rejected
    expect(screen.transitionToRoom(RoomId.ARCHAEOLOGY)).toBe(false);

    finishFadeOut();
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.TEXTILES);
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

    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);
    expect(screen.getTransitionStateMachine().getState()).toBe(
      RoomTransitionState.IDLE,
    );
  });
});
