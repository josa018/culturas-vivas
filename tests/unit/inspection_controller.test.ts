import { assert } from "../helpers/assert";
import { ExhibitInspectionController } from "../../src/experience/inspection-controller";
import {
  ExhibitMediaType,
  InspectionState,
  PROTOTYPE_EXHIBITS,
} from "../../src/experience/constants";

function runInspectionControllerUnitTests(): void {
  console.log("--- [UNIT TEST] Exhibit Inspection Controller ---");

  // Test 1: Initial state & Exhibit Registry
  {
    const controller = new ExhibitInspectionController();
    assert.equal(controller.getState(), InspectionState.IDLE);
    assert.equal(controller.getActiveExhibit(), null);
    assert.equal(controller.getAllExhibits().length, PROTOTYPE_EXHIBITS.length);

    const statue = controller.getExhibit("exhibit-statue-3d");
    assert.ok(statue !== undefined);
    assert.equal(statue?.mediaType, ExhibitMediaType.MODEL_3D);
    assert.equal(statue?.autoRotate, true);

    console.log(
      "✓ Test 1 Passed: Initial state and exhibit registration verified",
    );
  }

  // Test 2: Standard Inspection Lifecycle & Mutual Exclusivity Preemption
  {
    const controller = new ExhibitInspectionController();
    const canFocusUnknown = controller.canFocus("unknown-id");
    assert.equal(canFocusUnknown, false);

    const focusSuccess = controller.focus("exhibit-statue-3d");
    assert.equal(focusSuccess, true);
    assert.equal(controller.getState(), InspectionState.FOCUSING);
    assert.equal(controller.getActiveExhibit()?.id, "exhibit-statue-3d");

    // Cannot focus the SAME exhibit while already focusing/inspecting
    assert.equal(controller.canFocus("exhibit-statue-3d"), false);

    // Can focus another exhibit, which preempts the current one
    assert.equal(controller.canFocus("exhibit-painting-2d"), true);
    const preemptionSuccess = controller.focus("exhibit-painting-2d");
    assert.equal(preemptionSuccess, true);
    assert.equal(controller.getActiveExhibit()?.id, "exhibit-painting-2d");
    assert.equal(controller.getPreviousExhibit()?.id, "exhibit-statue-3d");

    // Complete focus animation
    const completeFocusResult = controller.completeFocus();
    assert.equal(completeFocusResult, true);
    assert.equal(controller.getState(), InspectionState.INSPECTING);

    // Initiate return
    assert.equal(controller.canReturn(), true);
    const returnSuccess = controller.return();
    assert.equal(returnSuccess, true);
    assert.equal(controller.getState(), InspectionState.RETURNING);

    // Complete return animation
    const completeReturnResult = controller.completeReturn();
    assert.equal(completeReturnResult, true);
    assert.equal(controller.getState(), InspectionState.IDLE);
    assert.equal(controller.getActiveExhibit(), null);

    console.log(
      "✓ Test 2 Passed: Full lifecycle with mutual exclusivity preemption verified",
    );
  }

  // Test 3: Auto-Rotation Query per Exhibit
  {
    const controller = new ExhibitInspectionController();

    // Statue with autoRotate = true
    controller.focus("exhibit-statue-3d");
    assert.equal(controller.isAutoRotateActive(), false); // Not active while focusing
    controller.completeFocus();
    assert.equal(controller.isAutoRotateActive(), true); // Active while inspecting

    controller.return();
    assert.equal(controller.isAutoRotateActive(), false);
    controller.completeReturn();

    // Painting with autoRotate = false
    controller.focus("exhibit-painting-2d");
    controller.completeFocus();
    assert.equal(controller.isAutoRotateActive(), false);

    console.log(
      "✓ Test 3 Passed: Auto-rotation policy verified per exhibit configuration",
    );
  }

  // Test 4: Focus-Driven Video Playback Query
  {
    const controller = new ExhibitInspectionController();

    // 2D Video Exhibit
    controller.focus("exhibit-video-2d");
    assert.equal(controller.isVideoPlaybackActive(), false);
    controller.completeFocus();
    assert.equal(controller.isVideoPlaybackActive(), true); // Playing on inspection
    controller.return();
    assert.equal(controller.isVideoPlaybackActive(), false); // Paused on return
    controller.completeReturn();

    // Stereo SBS Video Exhibit
    controller.focus("exhibit-video-stereo");
    controller.completeFocus();
    assert.equal(controller.isVideoPlaybackActive(), true);
    controller.return();
    controller.completeReturn();

    // Static Photo Exhibit
    controller.focus("exhibit-photo-stereo");
    controller.completeFocus();
    assert.equal(controller.isVideoPlaybackActive(), false);

    console.log(
      "✓ Test 4 Passed: Focus-driven video playback activation verified",
    );
  }

  // Test 5: Target Focal Position & Radial Target Mathematics
  {
    const controller = new ExhibitInspectionController();
    const focalPos = controller.calculateFocalTargetPosition({
      x: 0,
      y: 1.6,
      z: 0,
    });
    assert.equal(focalPos.x, 0);
    assert.equal(focalPos.y, 1.5); // 1.6 + (-0.1)
    assert.equal(focalPos.z, -1.2); // 0 + (-1.2)

    // Test Radial target position
    const cameraPivot = { x: 0, y: 1.6, z: 0 };
    const galleryPos = { x: 0, y: 1.4, z: -2.8 };
    const radialTarget = controller.calculateRadialTargetPosition(
      galleryPos,
      cameraPivot,
      1.3,
    );

    assert.equal(radialTarget.x, 0);
    assert.equal(radialTarget.y, 1.507);
    assert.equal(radialTarget.z, -1.297);

    // Verify distance from camera is 1.3m
    const dx = radialTarget.x - cameraPivot.x;
    const dy = radialTarget.y - cameraPivot.y;
    const dz = radialTarget.z - cameraPivot.z;
    const computedDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    assert.equal(Math.abs(computedDistance - 1.3) < 0.005, true);

    console.log(
      "✓ Test 5 Passed: Focal and radial target position mathematics verified",
    );
  }

  // Test 6: Listener Subscriptions
  {
    const controller = new ExhibitInspectionController();
    const emittedStates: InspectionState[] = [];

    const unsubscribe = controller.subscribe((state) => {
      emittedStates.push(state);
    });

    controller.focus("exhibit-painting-2d");
    controller.completeFocus();
    unsubscribe();
    controller.return();

    assert.deepEqual(emittedStates, [
      InspectionState.IDLE,
      InspectionState.FOCUSING,
      InspectionState.INSPECTING,
    ]);

    console.log("✓ Test 6 Passed: Subscription notification flow verified");
  }

  console.log(
    "All ExhibitInspectionController unit tests passed successfully.\n",
  );
}

runInspectionControllerUnitTests();
