import { describe, it, expect } from "vitest";
import { ExperienceScreenView } from "../../src/screens/screen-experience";
import { RoomId, RoomTransitionState } from "../../src/experience/types";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import {
  PORTAL_ACTIVATED_EVENT,
  type PortalActivatedEventDetail,
} from "../../src/experience/components/portal-waypoint";
import { getSharedInspectionController } from "../../src/experience/components/inspectable";
import { InspectionState } from "../../src/experience/constants";

describe("ScreenExperience Room Transition", () => {
  it("mounts screen, aborts active inspection, and transitions room on portal trigger", () => {
    // Setup Happy-DOM scene elements
    const scene = document.createElement("a-scene");
    const camera = document.createElement("a-camera");
    const cursor = document.createElement("a-cursor");
    cursor.setAttribute("raycaster", "objects: .clickable");
    const sky = document.createElement("a-sky");

    camera.appendChild(cursor);
    scene.appendChild(camera);
    scene.appendChild(sky);
    document.body.appendChild(scene);

    const dispatchHistory: string[] = [];
    const screen = new ExperienceScreenView((action) => {
      dispatchHistory.push(action);
    });

    const stateMachine = screen.getTransitionStateMachine();
    expect(stateMachine.getState()).toBe(RoomTransitionState.IDLE);
    expect(stateMachine.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);

    const container = document.createElement("div");
    document.body.appendChild(container);
    screen.mount(container);
    screen.show();

    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);

    // Focus an exhibit
    const inspectionController = getSharedInspectionController();
    inspectionController.focus("exhibit-statue-3d");
    expect(inspectionController.getState()).toBe(InspectionState.FOCUSING);

    // Trigger portal activation to Textiles
    const portalEvent = new CustomEvent<PortalActivatedEventDetail>(
      PORTAL_ACTIVATED_EVENT,
      {
        detail: {
          portalId: "portal-archaeology-to-textiles",
          targetRoomId: RoomId.TEXTILES,
        },
        bubbles: true,
      },
    );
    scene.dispatchEvent(portalEvent);

    // Active inspection must be aborted
    expect(inspectionController.getState()).toBe(InspectionState.IDLE);
    expect(inspectionController.getActiveExhibit()).toBeNull();

    // Active room must be Textiles
    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.TEXTILES);
    expect(stateMachine.getActiveRoomId()).toBe(RoomId.TEXTILES);
    expect(stateMachine.getState()).toBe(RoomTransitionState.IDLE);
    expect(cursor.getAttribute("raycaster")).toBe("objects: .clickable");

    // Return to Archaeology
    const returnEvent = new CustomEvent<PortalActivatedEventDetail>(
      PORTAL_ACTIVATED_EVENT,
      {
        detail: {
          portalId: "portal-textiles-to-archaeology",
          targetRoomId: RoomId.ARCHAEOLOGY,
        },
        bubbles: true,
      },
    );
    scene.dispatchEvent(returnEvent);

    expect(ExhibitRoomBuilder.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);
    expect(stateMachine.getActiveRoomId()).toBe(RoomId.ARCHAEOLOGY);

    screen.unmount();
    scene.remove();
    container.remove();
  });
});
