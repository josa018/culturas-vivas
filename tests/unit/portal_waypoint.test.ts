import { describe, it, expect } from "vitest";
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
      targetRoomId: RoomId.TEXTILES,
      title: "Ir a Sala de Textiles",
      position: { x: 0, y: 1.6, z: 2.8 },
      rotation: { x: 0, y: 180, z: 0 },
    };

    const portalEl = createPortalEntity(portalConfig);
    expect(portalEl.getAttribute("id")).toBe("portal-test");
    expect(portalEl.getAttribute("position")).toBe("0 1.6 2.8");
    expect(portalEl.getAttribute("rotation")).toBe("0 180 0");
    expect(portalEl.getAttribute("class")).toMatch(/clickable/);
    expect(portalEl.getAttribute("cv-portal")).toMatch(
      /targetRoomId:\s*TEXTILES/,
    );
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
      id: "portal-archaeology-to-textiles",
      targetRoomId: RoomId.TEXTILES,
      title: "Ir a Sala de Textiles",
    });

    instance.init();

    // Trigger synthetic click
    el.dispatchEvent(new Event("click"));

    expect(dispatchedEvent).not.toBeNull();
    expect(
      (dispatchedEvent as unknown as { detail: PortalActivatedEventDetail })
        .detail.portalId,
    ).toBe("portal-archaeology-to-textiles");
    expect(
      (dispatchedEvent as unknown as { detail: PortalActivatedEventDetail })
        .detail.targetRoomId,
    ).toBe(RoomId.TEXTILES);
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
