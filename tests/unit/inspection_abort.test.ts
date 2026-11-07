import { describe, it, expect } from "vitest";
import { ExhibitInspectionController } from "../../src/experience/inspection-controller";
import { InspectionState } from "../../src/experience/constants";

describe("ExhibitInspectionController abortActiveInspection", () => {
  it("returns false on IDLE state without changing state", () => {
    const controller = new ExhibitInspectionController();
    expect(controller.getState()).toBe(InspectionState.IDLE);
    const aborted = controller.abortActiveInspection();
    expect(aborted).toBe(false);
    expect(controller.getState()).toBe(InspectionState.IDLE);
  });

  it("resets to IDLE and emits previous exhibit while FOCUSING", () => {
    const controller = new ExhibitInspectionController();
    controller.focus("exhibit-statue-3d");
    expect(controller.getState()).toBe(InspectionState.FOCUSING);

    let notifiedState: InspectionState | null = null;
    let notifiedActive: string | null = null;
    let notifiedPrev: string | null = null;

    controller.subscribe((state, active, prev) => {
      notifiedState = state;
      notifiedActive = active?.id ?? null;
      notifiedPrev = prev?.id ?? null;
    });

    const aborted = controller.abortActiveInspection();
    expect(aborted).toBe(true);
    expect(controller.getState()).toBe(InspectionState.IDLE);
    expect(controller.getActiveExhibit()).toBeNull();
    expect(controller.getPreviousExhibit()?.id).toBe("exhibit-statue-3d");
    expect(notifiedState).toBe(InspectionState.IDLE);
    expect(notifiedActive).toBeNull();
    expect(notifiedPrev).toBe("exhibit-statue-3d");
  });

  it("resets to IDLE while INSPECTING", () => {
    const controller = new ExhibitInspectionController();
    controller.focus("exhibit-painting-2d");
    controller.completeFocus();
    expect(controller.getState()).toBe(InspectionState.INSPECTING);

    const aborted = controller.abortActiveInspection();
    expect(aborted).toBe(true);
    expect(controller.getState()).toBe(InspectionState.IDLE);
    expect(controller.getActiveExhibit()).toBeNull();
    expect(controller.getPreviousExhibit()?.id).toBe("exhibit-painting-2d");
  });

  it("aborts active inspection and updates exhibits on setExhibits", () => {
    const controller = new ExhibitInspectionController();
    controller.focus("exhibit-statue-3d");
    controller.completeFocus();

    const newExhibits = [
      {
        id: "new-exhibit-1",
        title: "New Exhibit",
        description: "New Description",
        mediaType: "IMAGE_2D" as const,
        galleryPosition: { x: 0, y: 0, z: 0 },
        galleryRotation: { x: 0, y: 0, z: 0 },
        autoRotate: false,
        rotationSpeed: 0,
      },
    ];

    controller.setExhibits(newExhibits);
    expect(controller.getState()).toBe(InspectionState.IDLE);
    expect(controller.getActiveExhibit()).toBeNull();
    expect(controller.getAllExhibits()).toHaveLength(1);
    expect(controller.getExhibit("new-exhibit-1")?.title).toBe("New Exhibit");
  });
});
