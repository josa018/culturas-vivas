import { PORTAL_COLORS, PORTAL_DIMENSIONS } from "../constants";
import type { RoomId, RoomPortalConfig } from "../types";

export const PORTAL_ACTIVATED_EVENT = "cv-portal-activated";

export interface PortalActivatedEventDetail {
  readonly portalId: string;
  readonly targetRoomId: RoomId;
}

export interface PortalComponentData {
  readonly id: string;
  readonly targetRoomId: string;
  readonly title: string;
}

export interface PortalComponentInstance {
  el: HTMLElement;
  data: PortalComponentData;
  init: () => void;
  trigger: () => void;
  remove: () => void;
}

export function createPortalComponentDefinition() {
  return {
    schema: {
      id: { type: "string", default: "" },
      targetRoomId: { type: "string", default: "" },
      title: { type: "string", default: "" },
    },

    init: function (this: PortalComponentInstance) {
      const clickHandler = (evt?: Event) => {
        if (
          evt &&
          typeof (evt as unknown as { stopPropagation?: () => void })
            .stopPropagation === "function"
        ) {
          (evt as unknown as { stopPropagation: () => void }).stopPropagation();
        }
        this.trigger();
      };

      this.el.addEventListener("click", clickHandler);
    },

    trigger: function (this: PortalComponentInstance) {
      const target = this.data.targetRoomId as RoomId;
      if (!target) {
        return;
      }

      const event =
        typeof CustomEvent !== "undefined"
          ? new CustomEvent<PortalActivatedEventDetail>(
              PORTAL_ACTIVATED_EVENT,
              {
                detail: {
                  portalId: this.data.id,
                  targetRoomId: target,
                },
                bubbles: true,
              },
            )
          : ({
              type: PORTAL_ACTIVATED_EVENT,
              detail: {
                portalId: this.data.id,
                targetRoomId: target,
              },
              bubbles: true,
            } as unknown as CustomEvent<PortalActivatedEventDetail>);

      this.el.dispatchEvent(event);
    },

    remove: function (this: PortalComponentInstance) {
      // Cleanup
    },
  };
}

export function registerPortalComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-portal",
      createPortalComponentDefinition(),
    );
  }
}

export function createPortalEntity(config: RoomPortalConfig): HTMLElement {
  const portalRoot = document.createElement("a-entity");
  portalRoot.setAttribute("id", config.id);
  portalRoot.setAttribute("class", "cv-portal clickable");
  portalRoot.setAttribute(
    "position",
    `${config.position.x} ${config.position.y} ${config.position.z}`,
  );
  portalRoot.setAttribute(
    "rotation",
    `${config.rotation.x} ${config.rotation.y} ${config.rotation.z}`,
  );
  portalRoot.setAttribute(
    "cv-portal",
    `id: ${config.id}; targetRoomId: ${config.targetRoomId}; title: ${config.title}`,
  );

  // Archway frame left pillar
  const leftPillar = document.createElement("a-box");
  leftPillar.setAttribute("width", String(PORTAL_DIMENSIONS.BORDER_THICKNESS));
  leftPillar.setAttribute("height", String(PORTAL_DIMENSIONS.FRAME_HEIGHT));
  leftPillar.setAttribute("depth", "0.08");
  leftPillar.setAttribute(
    "position",
    `${-(PORTAL_DIMENSIONS.FRAME_WIDTH / 2)} 0 0`,
  );
  leftPillar.setAttribute("color", PORTAL_COLORS.FRAME);
  leftPillar.setAttribute("material", "shader: flat");

  // Archway frame right pillar
  const rightPillar = document.createElement("a-box");
  rightPillar.setAttribute("width", String(PORTAL_DIMENSIONS.BORDER_THICKNESS));
  rightPillar.setAttribute("height", String(PORTAL_DIMENSIONS.FRAME_HEIGHT));
  rightPillar.setAttribute("depth", "0.08");
  rightPillar.setAttribute(
    "position",
    `${PORTAL_DIMENSIONS.FRAME_WIDTH / 2} 0 0`,
  );
  rightPillar.setAttribute("color", PORTAL_COLORS.FRAME);
  rightPillar.setAttribute("material", "shader: flat");

  // Archway top lintel
  const lintel = document.createElement("a-box");
  lintel.setAttribute(
    "width",
    String(PORTAL_DIMENSIONS.FRAME_WIDTH + PORTAL_DIMENSIONS.BORDER_THICKNESS),
  );
  lintel.setAttribute("height", String(PORTAL_DIMENSIONS.BORDER_THICKNESS));
  lintel.setAttribute("depth", "0.08");
  lintel.setAttribute("position", `0 ${PORTAL_DIMENSIONS.FRAME_HEIGHT / 2} 0`);
  lintel.setAttribute("color", PORTAL_COLORS.FRAME);
  lintel.setAttribute("material", "shader: flat");

  // Portal gateway aperture plane (interactive target)
  const aperture = document.createElement("a-plane");
  aperture.setAttribute("class", "clickable");
  aperture.setAttribute("width", String(PORTAL_DIMENSIONS.FRAME_WIDTH));
  aperture.setAttribute("height", String(PORTAL_DIMENSIONS.FRAME_HEIGHT));
  aperture.setAttribute("color", PORTAL_COLORS.PORTAL_INNER);
  aperture.setAttribute("opacity", "0.85");
  aperture.setAttribute("material", "shader: flat; side: double");

  // Floating room title billboard
  const labelText = document.createElement("a-text");
  labelText.setAttribute("value", config.title);
  labelText.setAttribute("align", "center");
  labelText.setAttribute("color", PORTAL_COLORS.TEXT);
  labelText.setAttribute("width", String(PORTAL_DIMENSIONS.LABEL_WIDTH));
  labelText.setAttribute(
    "position",
    `0 ${PORTAL_DIMENSIONS.LABEL_OFFSET_Y} 0.02`,
  );

  portalRoot.append(leftPillar, rightPillar, lintel, aperture, labelText);
  return portalRoot;
}

if (typeof globalThis !== "undefined") {
  registerPortalComponent();
}
