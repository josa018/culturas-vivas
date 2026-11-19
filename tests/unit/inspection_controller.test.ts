import { describe, it, expect, afterEach, vi } from "vitest";
import { ExhibitInspectionController } from "../../src/experience/inspection-controller";
import {
  ExhibitMediaType,
  InspectionState,
  PROTOTYPE_EXHIBITS,
} from "../../src/experience/constants";

describe("ExhibitInspectionController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with default exhibit registry in IDLE state", () => {
    const controller = new ExhibitInspectionController();
    expect(controller.getState()).toBe(InspectionState.IDLE);
    expect(controller.getActiveExhibit()).toBeNull();
    expect(controller.getAllExhibits()).toHaveLength(PROTOTYPE_EXHIBITS.length);

    const statue = controller.getExhibit("exhibit-statue-3d");
    expect(statue?.mediaType).toBe(ExhibitMediaType.MODEL_3D);
    expect(statue?.autoRotate).toBe(true);
  });

  it("completes standard inspection lifecycle and preempts active exhibit on another focus", () => {
    const controller = new ExhibitInspectionController();
    expect(controller.canFocus("unknown-id")).toBe(false);
    expect(controller.focus("unknown-id")).toBe(false);

    expect(controller.focus("exhibit-statue-3d")).toBe(true);
    expect(controller.getState()).toBe(InspectionState.FOCUSING);
    expect(controller.getActiveExhibit()?.id).toBe("exhibit-statue-3d");
    expect(controller.canFocus("exhibit-statue-3d")).toBe(false);

    // Preempt with another exhibit
    expect(controller.canFocus("exhibit-painting-2d")).toBe(true);
    expect(controller.focus("exhibit-painting-2d")).toBe(true);
    expect(controller.getActiveExhibit()?.id).toBe("exhibit-painting-2d");
    expect(controller.getPreviousExhibit()?.id).toBe("exhibit-statue-3d");

    controller.clearPreviousExhibit();
    expect(controller.getPreviousExhibit()).toBeNull();

    expect(controller.completeFocus()).toBe(true);
    expect(controller.getState()).toBe(InspectionState.INSPECTING);

    expect(controller.canReturn()).toBe(true);
    expect(controller.return()).toBe(true);
    expect(controller.getState()).toBe(InspectionState.RETURNING);

    expect(controller.completeReturn()).toBe(true);
    expect(controller.getState()).toBe(InspectionState.IDLE);
    expect(controller.getActiveExhibit()).toBeNull();
  });

  it("rejects out-of-order lifecycle transitions cleanly", () => {
    const controller = new ExhibitInspectionController();

    expect(controller.completeFocus()).toBe(false);
    expect(controller.canReturn()).toBe(false);
    expect(controller.return()).toBe(false);
    expect(controller.completeReturn()).toBe(false);

    controller.focus("exhibit-statue-3d");
    expect(controller.completeReturn()).toBe(false);
    expect(controller.getState()).toBe(InspectionState.FOCUSING);
  });

  it("enables auto-rotation only while INSPECTING an autoRotate exhibit", () => {
    const controller = new ExhibitInspectionController();

    controller.focus("exhibit-statue-3d");
    expect(controller.isAutoRotateActive()).toBe(false);
    controller.completeFocus();
    expect(controller.isAutoRotateActive()).toBe(true);
    controller.return();
    expect(controller.isAutoRotateActive()).toBe(false);
    controller.completeReturn();

    controller.focus("exhibit-painting-2d");
    controller.completeFocus();
    expect(controller.isAutoRotateActive()).toBe(false);
  });

  it("enables video playback only while INSPECTING a video exhibit", () => {
    const controller = new ExhibitInspectionController();

    controller.focus("exhibit-video-2d");
    expect(controller.isVideoPlaybackActive()).toBe(false);
    controller.completeFocus();
    expect(controller.isVideoPlaybackActive()).toBe(true);
    controller.return();
    expect(controller.isVideoPlaybackActive()).toBe(false);
    controller.completeReturn();

    controller.focus("exhibit-painting-2d");
    controller.completeFocus();
    expect(controller.isVideoPlaybackActive()).toBe(false);
  });

  it("computes radial target position along camera-to-gallery ray and handles zero-distance edge case", () => {
    const controller = new ExhibitInspectionController();

    // Worked example: origin (0, 1.6, 0), gallery (0, 1.4, -2.8), focalDistance = 1.3
    // vector = (0, 0.2, 2.8), len = sqrt(7.88) = 2.8071338
    // target = (0, 1.6 - 0.0926, 0 - 1.2967) = (0, 1.507, -1.297)
    const radial = controller.calculateRadialTargetPosition(
      { x: 0, y: 1.4, z: -2.8 },
      { x: 0, y: 1.6, z: 0 },
      1.3,
    );
    expect(radial).toEqual({ x: 0, y: 1.507, z: -1.297 });

    // Coincident camera and gallery coordinate returns galleryPos directly
    const coincident = controller.calculateRadialTargetPosition(
      { x: 1, y: 2, z: 3 },
      { x: 1, y: 2, z: 3 },
      1.3,
    );
    expect(coincident).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("computes calculateFocalTargetPosition relative to camera origin", () => {
    const controller = new ExhibitInspectionController();
    expect(
      controller.calculateFocalTargetPosition({ x: 1, y: 1.6, z: 2 }),
    ).toEqual({ x: 1, y: 1.5, z: 0.8 });
  });

  it("notifies subscribers, respects unsubscribe, and isolates throwing listeners", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const controller = new ExhibitInspectionController();
    const calls: InspectionState[] = [];

    controller.subscribe((state) => {
      if (state !== InspectionState.IDLE) {
        throw new Error("bad subscriber");
      }
    });
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
    expect(errorSpy).toHaveBeenCalled();
  });

  it("clears previousExhibitId on completeReturn and when focusing from IDLE after prior preemption", () => {
    const controller = new ExhibitInspectionController();

    // Preempt A with B so previousExhibit becomes A
    controller.focus("exhibit-statue-3d");
    controller.focus("exhibit-painting-2d");
    expect(controller.getPreviousExhibit()?.id).toBe("exhibit-statue-3d");

    // Completing B's return must clear previousExhibitId
    controller.completeFocus();
    controller.return();
    controller.completeReturn();
    expect(controller.getPreviousExhibit()).toBeNull();

    // Even if aborted into IDLE, focusing from IDLE clears stale previousExhibitId before notifying
    controller.focus("exhibit-statue-3d");
    controller.abortActiveInspection();
    expect(controller.getPreviousExhibit()?.id).toBe("exhibit-statue-3d");

    const observedPrevOnFocus: Array<string | null> = [];
    const unsubscribe = controller.subscribe((state, _active, prev) => {
      if (state === InspectionState.FOCUSING) {
        observedPrevOnFocus.push(prev?.id ?? null);
      }
    });

    controller.focus("exhibit-statue-3d");
    unsubscribe();

    expect(observedPrevOnFocus).toEqual([null]);
    expect(controller.getPreviousExhibit()).toBeNull();
  });
});
