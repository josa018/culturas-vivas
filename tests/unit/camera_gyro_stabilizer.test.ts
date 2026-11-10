import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CameraStabilizerMath,
  type QuaternionLike,
} from "../../src/experience/services/camera-stabilizer-math";
import { CameraRecenterService } from "../../src/experience/services/camera-recenter-service";
import {
  CAMERA_STABILIZER_CONSTANTS,
  CAMERA_RECENTER_EVENT,
} from "../../src/experience/constants";
import { ExperienceScreenView } from "../../src/screens/screen-experience";
import { UI_IDS } from "../../src/screens/constants";

describe("CameraStabilizerMath", () => {
  it("computes alpha dynamically based on delta time using exponential decay", () => {
    const alpha60Hz = CameraStabilizerMath.computeAlpha(1 / 60, 15.0);
    const alpha120Hz = CameraStabilizerMath.computeAlpha(1 / 120, 15.0);

    expect(alpha60Hz).toBeGreaterThan(0);
    expect(alpha120Hz).toBeGreaterThan(0);
    expect(alpha60Hz).toBeGreaterThan(alpha120Hz);
    expect(CameraStabilizerMath.computeAlpha(0)).toBe(0);
  });

  it("calculates angular distance accurately between quaternions", () => {
    const qIdentity: QuaternionLike = { x: 0, y: 0, z: 0, w: 1 };
    expect(
      CameraStabilizerMath.computeAngularDistance(qIdentity, qIdentity),
    ).toBeCloseTo(0, 5);

    // 90 degree rotation around Y: [0, sin(45), 0, cos(45)]
    const q90Y: QuaternionLike = {
      x: 0,
      y: Math.SQRT1_2,
      z: 0,
      w: Math.SQRT1_2,
    };
    const dist = CameraStabilizerMath.computeAngularDistance(qIdentity, q90Y);
    expect(dist).toBeCloseTo(Math.PI / 2, 4);
  });

  it("handles antipodal quaternions taking the shortest path during slerp", () => {
    const q1: QuaternionLike = { x: 0, y: 0, z: 0, w: 1 };
    const qOpposite: QuaternionLike = { x: 0, y: 0, z: 0, w: -1 };

    const result = CameraStabilizerMath.slerp(q1, qOpposite, 0.5);
    expect(result.w).toBeCloseTo(1, 4);
    expect(result.x).toBeCloseTo(0, 4);
  });

  it("applies damping for micro-jitter below noise threshold", () => {
    const current: QuaternionLike = { x: 0, y: 0, z: 0, w: 1 };
    // Tiny rotation below 0.0052 rad
    const target: QuaternionLike = {
      x: 0,
      y: 0.001,
      z: 0,
      w: Math.sqrt(1 - 0.001 * 0.001),
    };

    const deltaSec = 1 / 60;
    const baseAlpha = CameraStabilizerMath.computeAlpha(deltaSec, 15.0);
    const filtered = CameraStabilizerMath.filterOrientation(
      current,
      target,
      deltaSec,
    );

    expect(filtered.y).toBeCloseTo(current.y + baseAlpha * (target.y - current.y), 4);
    expect(filtered.y).toBeLessThan(target.y);
  });

  it("bypasses damping for active head turns exceeding bypass threshold", () => {
    const current: QuaternionLike = { x: 0, y: 0, z: 0, w: 1 };
    // Large rotation exceeding 0.021 rad (~1.2 deg)
    const target: QuaternionLike = {
      x: 0,
      y: 0.1,
      z: 0,
      w: Math.sqrt(1 - 0.1 * 0.1),
    };

    const deltaSec = 1 / 60;
    const filtered = CameraStabilizerMath.filterOrientation(
      current,
      target,
      deltaSec,
    );

    expect(filtered.x).toBeCloseTo(target.x, 5);
    expect(filtered.y).toBeCloseTo(target.y, 5);
    expect(filtered.z).toBeCloseTo(target.z, 5);
    expect(filtered.w).toBeCloseTo(target.w, 5);
  });
});

describe("CameraRecenterService", () => {
  beforeEach(() => {
    CameraRecenterService.resetInstance();
  });

  it("calculates delta yaw and normalizes angles to [-PI, PI]", () => {
    const service = CameraRecenterService.getInstance();
    expect(service.calculateDeltaYaw(0, 0)).toBeCloseTo(0, 5);
    expect(service.calculateDeltaYaw(Math.PI / 2, 0)).toBeCloseTo(-Math.PI / 2, 5);
    expect(service.calculateDeltaYaw(-Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2, 5);
  });

  it("updates rig rotation and dispatches recenter event", () => {
    const service = CameraRecenterService.getInstance();
    const eventSpy = vi.fn();
    window.addEventListener(CAMERA_RECENTER_EVENT, eventSpy);

    const mockCamera = {
      object3D: {
        rotation: { y: 0.5 },
      },
    } as unknown as HTMLElement;

    const mockRig = {
      object3D: {
        rotation: { y: 0 },
      },
    } as unknown as HTMLElement;

    const offset = service.recenter(mockCamera, mockRig);
    expect(offset).toBeCloseTo(-0.5, 4);

    const rigRotY = (mockRig as unknown as { object3D: { rotation: { y: number } } })
      .object3D.rotation.y;
    expect(rigRotY).toBeCloseTo(-0.5, 4);
    expect(eventSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener(CAMERA_RECENTER_EVENT, eventSpy);
  });
});

describe("ExperienceScreenView - Recalibrate Button", () => {
  let container: HTMLElement;
  const dispatch = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("renders the floating recalibrate button in the experience HUD", () => {
    const screen = new ExperienceScreenView(dispatch, "touch");
    screen.mount(container);

    const btn = container.querySelector<HTMLButtonElement>(
      `#${UI_IDS.HUD_RECALIBRATE_BTN}`,
    );
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("data-action")).toBe("recalibrate-view");
    expect(btn?.textContent).toContain("Centrar vista");

    screen.unmount();
  });

  it("triggers recenter when recalibrate button is clicked", () => {
    const service = CameraRecenterService.getInstance();
    const recenterSpy = vi.spyOn(service, "recenter");

    const screen = new ExperienceScreenView(dispatch, "touch");
    screen.mount(container);

    const btn = container.querySelector<HTMLButtonElement>(
      `#${UI_IDS.HUD_RECALIBRATE_BTN}`,
    );
    btn?.click();

    expect(recenterSpy).toHaveBeenCalledTimes(1);
    screen.unmount();
  });
});


import {
  createCameraGyroStabilizerDefinition,
  type CameraGyroStabilizerComponentInstance,
} from "../../src/experience/components/camera-gyro-stabilizer";

describe("cv-camera-gyro-stabilizer Component", () => {
  it("initializes and stabilizes orientation during tick loop", () => {
    const def = createCameraGyroStabilizerDefinition();
    const quat = { x: 0, y: 0, z: 0, w: 1, copy: vi.fn(), set: vi.fn() };
    const mockEl = {
      object3D: { quaternion: quat },
    } as unknown as CameraGyroStabilizerComponentInstance["el"];

    const instance = {
      el: mockEl,
      data: {
        enabled: true,
        lambda: 15.0,
        rigSelector: "#camera-rig",
      },
      currentQuat: { x: 0, y: 0, z: 0, w: 1 },
      rawQuat: { x: 0, y: 0, z: 0, w: 1 },
      isInitialized: false,
      init: def.init,
      tick: def.tick,
      remove: def.remove,
    } as CameraGyroStabilizerComponentInstance;

    instance.init();
    expect(instance.isInitialized).toBe(true);

    // Simulate micro-jitter frame
    quat.y = 0.002;
    instance.tick(16, 16);

    expect(instance.currentQuat.y).toBeGreaterThan(0);
    expect(instance.currentQuat.y).toBeLessThan(0.002);

    instance.remove();
  });
});


import { ExhibitRoomBuilder } from "../../src/experience/room-builder";

describe("ExhibitRoomBuilder - Camera Rig Integration", () => {
  it("ensures camera rig hierarchy exists and moves camera under rig", () => {
    const scene = document.createElement("a-scene");
    const camera = document.createElement("a-camera");
    scene.appendChild(camera);

    const rig = ExhibitRoomBuilder.ensureCameraRig(scene);
    expect(rig.id).toBe("camera-rig");
    expect(camera.parentElement).toBe(rig);
    expect(camera.hasAttribute("cv-camera-gyro-stabilizer")).toBe(true);
  });
});
