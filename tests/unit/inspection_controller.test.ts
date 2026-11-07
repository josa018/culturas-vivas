import { describe, it, expect } from "vitest";
import { ExhibitInspectionController } from "../../src/experience/inspection-controller";
import {
  ExhibitMediaType,
  InspectionState,
  PROTOTYPE_EXHIBITS,
} from "../../src/experience/constants";

describe("ExhibitInspectionController", () => {
  it("initializes with default exhibit registry and IDLE state", () => {
    const controller = new ExhibitInspectionController();
    expect(controller.getState()).toBe(InspectionState.IDLE);
    expect(controller.getActiveExhibit()).toBeNull();
    expect(controller.getAllExhibits()).toHaveLength(PROTOTYPE_EXHIBITS.length);

    const statue = controller.getExhibit("exhibit-statue-3d");
    expect(statue).toBeDefined();
    expect(statue?.mediaType).toBe(ExhibitMediaType.MODEL_3D);
    expect(statue?.autoRotate).toBe(true);
  });

  it("verifies standard inspection lifecycle and mutual exclusivity preemption", () => {
    const controller = new ExhibitInspectionController();
    expect(controller.canFocus("unknown-id")).toBe(false);

    expect(controller.focus("exhibit-statue-3d")).toBe(true);
    expect(controller.getState()).toBe(InspectionState.FOCUSING);
    expect(controller.getActiveExhibit()?.id).toBe("exhibit-statue-3d");

    // Cannot focus the SAME exhibit while already focusing/inspecting
    expect(controller.canFocus("exhibit-statue-3d")).toBe(false);

    // Can focus another exhibit, which preempts the current one
    expect(controller.canFocus("exhibit-painting-2d")).toBe(true);
    expect(controller.focus("exhibit-painting-2d")).toBe(true);
    expect(controller.getActiveExhibit()?.id).toBe("exhibit-painting-2d");
    expect(controller.getPreviousExhibit()?.id).toBe("exhibit-statue-3d");

    // Complete focus animation
    expect(controller.completeFocus()).toBe(true);
    expect(controller.getState()).toBe(InspectionState.INSPECTING);

    // Initiate return
    expect(controller.canReturn()).toBe(true);
    expect(controller.return()).toBe(true);
    expect(controller.getState()).toBe(InspectionState.RETURNING);

    // Complete return animation
    expect(controller.completeReturn()).toBe(true);
    expect(controller.getState()).toBe(InspectionState.IDLE);
    expect(controller.getActiveExhibit()).toBeNull();
  });

  it("queries auto-rotation policy per exhibit configuration", () => {
    const controller = new ExhibitInspectionController();

    // Statue with autoRotate = true
    controller.focus("exhibit-statue-3d");
    expect(controller.isAutoRotateActive()).toBe(false); // Not active while focusing
    controller.completeFocus();
    expect(controller.isAutoRotateActive()).toBe(true); // Active while inspecting

    controller.return();
    expect(controller.isAutoRotateActive()).toBe(false);
    controller.completeReturn();

    // Painting with autoRotate = false
    controller.focus("exhibit-painting-2d");
    controller.completeFocus();
    expect(controller.isAutoRotateActive()).toBe(false);
  });

  it("queries focus-driven video playback active state", () => {
    const controller = new ExhibitInspectionController();

    // 2D Video Exhibit
    controller.focus("exhibit-video-2d");
    expect(controller.isVideoPlaybackActive()).toBe(false);
    controller.completeFocus();
    expect(controller.isVideoPlaybackActive()).toBe(true);
    controller.return();
    expect(controller.isVideoPlaybackActive()).toBe(false);
    controller.completeReturn();

    // Non-video exhibit
    controller.focus("exhibit-painting-2d");
    controller.completeFocus();
    expect(controller.isVideoPlaybackActive()).toBe(false);
  });

  it("calculates radial target position correctly", () => {
    const controller = new ExhibitInspectionController();
    const statue = controller.getExhibit("exhibit-statue-3d");
    expect(statue).toBeDefined();

    const targetPos = controller.calculateRadialTargetPosition(
      statue!.galleryPosition,
      { x: 0, y: 1.6, z: 0 },
      1.3,
    );

    // Camera at (0, 1.6, 0), gallery at (0, 1.4, -2.8).
    expect(typeof targetPos.x).toBe("number");
    expect(typeof targetPos.y).toBe("number");
    expect(typeof targetPos.z).toBe("number");
    expect(targetPos.z).toBeGreaterThan(statue!.galleryPosition.z);
    expect(targetPos.z).toBeLessThan(0);
  });

  it("handles observer subscription lifecycle", () => {
    const controller = new ExhibitInspectionController();
    const calls: InspectionState[] = [];

    const unsubscribe = controller.subscribe((state) => {
      calls.push(state);
    });

    controller.focus("exhibit-statue-3d");
    controller.completeFocus();
    controller.return();
    controller.completeReturn();

    unsubscribe();
    controller.focus("exhibit-painting-2d");

    expect(calls).toEqual([
      InspectionState.IDLE,
      InspectionState.FOCUSING,
      InspectionState.INSPECTING,
      InspectionState.RETURNING,
      InspectionState.IDLE,
    ]);
  });
});
