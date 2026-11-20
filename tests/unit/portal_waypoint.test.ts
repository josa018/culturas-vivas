import { describe, it, expect } from "vitest";
import {
  PORTAL_ANIMATION_TOKENS,
} from "../../src/experience/constants";
import {
  createPortalComponentDefinition,
  createPortalEntity,
  PORTAL_ACTIVATED_EVENT,
  type PortalActivatedEventDetail,
  type PortalComponentInstance,
} from "../../src/experience/components/portal-waypoint";
import { RoomId } from "../../src/experience/types";

function createMockPortalInstance(
  el: HTMLElement,
  data: { id: string; targetRoomId: string; title: string },
): PortalComponentInstance {
  const def = createPortalComponentDefinition();
  const instance: PortalComponentInstance = {
    el,
    data,
    init: function (this: PortalComponentInstance) {
      def.init.call(this);
    },
    trigger: function (this: PortalComponentInstance) {
      def.trigger.call(this);
    },
    remove: function (this: PortalComponentInstance) {
      def.remove.call(this);
    },
  };
  return instance;
}

describe("PortalWaypoint Component", () => {
  it("createPortalEntity constructs correct 3D entity tree and attributes", () => {
    const portalConfig = {
      id: "portal-test",
      targetRoomId: RoomId.WIXARIKA,
      title: "Cultura Wixárika",
      position: { x: 0, y: 1.6, z: 3.2 },
      rotation: { x: 0, y: 180, z: 0 },
      accentColor: "#D99B26",
    };

    const portalEl = createPortalEntity(portalConfig);
    expect(portalEl.getAttribute("id")).toBe("portal-test");
    expect(portalEl.getAttribute("position")).toBe("0 1.6 3.2");
    expect(portalEl.getAttribute("rotation")).toBe("0 180 0");
    expect(portalEl.getAttribute("class")).toMatch(/clickable/);
    expect(portalEl.getAttribute("cv-portal")).toMatch(
      /targetRoomId:\s*WIXARIKA/,
    );
    expect(portalEl.querySelector("a-box")?.getAttribute("color")).toBe(
      "#D99B26",
    );
    const labelPlane = portalEl.querySelector("[cv-canvas-text]");
    expect(labelPlane).not.toBeNull();
    expect(labelPlane?.getAttribute("value")).toBe("Cultura Wixárika");
    expect(labelPlane?.getAttribute("position")).toBe("0 1.38 0.1");
    expect(portalEl.querySelector(".cv-portal-label-plate")).not.toBeNull();
    expect(portalEl.querySelector("a-text")).toBeNull();

    const glowRing = portalEl.querySelector(".cv-portal-glow-ring");
    expect(glowRing).not.toBeNull();
    expect(glowRing?.getAttribute("material")).not.toContain("wireframe: true");
    expect(glowRing?.getAttribute("animation__portal_pulse")).toContain(
      `dur: ${PORTAL_ANIMATION_TOKENS.AMBIENT_PULSE_MS}`,
    );

    const aperture = portalEl.querySelector("a-plane.clickable");
    expect(aperture).not.toBeNull();
    expect(aperture?.hasAttribute("cv-interactive-feedback")).toBe(true);
    expect(portalEl.querySelector(".cv-portal-threshold")).not.toBeNull();
    expect(portalEl.querySelector(".cv-portal-frieze")).not.toBeNull();
  });

  it("triggers cv-portal-activated event on click", () => {
    const el = document.createElement("a-entity");
    let dispatchedEvent: CustomEvent<PortalActivatedEventDetail> | null = null;

    el.addEventListener(PORTAL_ACTIVATED_EVENT, ((
      evt: CustomEvent<PortalActivatedEventDetail>,
    ) => {
      dispatchedEvent = evt;
    }) as EventListener);

    const instance = createMockPortalInstance(el, {
      id: "portal-lobby-to-wixarika",
      targetRoomId: RoomId.WIXARIKA,
      title: "Cultura Wixárika",
    });

    instance.init();

    // Trigger synthetic click and verify propagation is stopped
    const clickEvent = new Event("click", { bubbles: true, cancelable: true });
    let propagatedToParent = false;
    const parent = document.createElement("a-entity");
    parent.appendChild(el);
    parent.addEventListener("click", () => {
      propagatedToParent = true;
    });
    el.dispatchEvent(clickEvent);
    expect(propagatedToParent).toBe(false);

    expect(dispatchedEvent).not.toBeNull();
    expect(
      (dispatchedEvent as unknown as { detail: PortalActivatedEventDetail })
        .detail.portalId,
    ).toBe("portal-lobby-to-wixarika");
    expect(
      (dispatchedEvent as unknown as { detail: PortalActivatedEventDetail })
        .detail.targetRoomId,
    ).toBe(RoomId.WIXARIKA);
  });

  it("does not dispatch event when targetRoomId is empty", () => {
    const el = document.createElement("a-entity");
    let dispatched = false;
    el.addEventListener(PORTAL_ACTIVATED_EVENT, () => {
      dispatched = true;
    });

    const instance = createMockPortalInstance(el, {
      id: "portal-empty",
      targetRoomId: "",
      title: "",
    });

    instance.trigger();
    expect(dispatched).toBe(false);
  });
});
