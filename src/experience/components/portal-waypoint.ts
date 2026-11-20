import {
  PORTAL_ANIMATION_TOKENS,
  PORTAL_COLORS,
  PORTAL_DIMENSIONS,
} from "../constants";
import type { RoomEnvironmentPreset } from "../room-environment-presets";
import { createMonumentalPortalParts } from "../station-architecture";
import type { RoomId, RoomPortalConfig } from "../types";
import { createCanvasTextPlane } from "./canvas-text";

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

export function createPortalEntity(
  config: RoomPortalConfig,
  preset?: RoomEnvironmentPreset,
): HTMLElement {
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

  const frameColor = config.accentColor ?? PORTAL_COLORS.FRAME;
  const archwayParts = createMonumentalPortalParts(config, preset);

  // Portal gateway aperture plane (interactive target)
  const aperture = document.createElement("a-plane");
  aperture.setAttribute("class", "clickable");
  aperture.setAttribute("cv-interactive-feedback", "hoverScale: 1.04; hoverZLift: 0.03");
  aperture.setAttribute("width", String(PORTAL_DIMENSIONS.FRAME_WIDTH));
  aperture.setAttribute("height", String(PORTAL_DIMENSIONS.FRAME_HEIGHT));
  aperture.setAttribute("color", PORTAL_COLORS.PORTAL_INNER);
  aperture.setAttribute("opacity", "0.85");
  aperture.setAttribute("material", "shader: flat; side: double");

  // Inner ambient glowing portal aura (smooth energy veil without wireframe diagonals)
  const glowRing = document.createElement("a-plane");
  glowRing.setAttribute("class", "cv-portal-glow-ring");
  glowRing.setAttribute("width", String(PORTAL_DIMENSIONS.FRAME_WIDTH - 0.12));
  glowRing.setAttribute("height", String(PORTAL_DIMENSIONS.FRAME_HEIGHT - 0.12));
  glowRing.setAttribute("position", "0 0 0.015");
  glowRing.setAttribute(
    "material",
    `shader: flat; color: ${frameColor}; transparent: true; opacity: ${PORTAL_ANIMATION_TOKENS.INNER_RING_OPACITY_MIN}; side: double; depthWrite: false`,
  );
  glowRing.setAttribute(
    "animation__portal_pulse",
    `property: material.opacity; from: ${PORTAL_ANIMATION_TOKENS.INNER_RING_OPACITY_MIN}; to: ${PORTAL_ANIMATION_TOKENS.INNER_RING_OPACITY_MAX}; dir: alternate; loop: true; dur: ${PORTAL_ANIMATION_TOKENS.AMBIENT_PULSE_MS}; easing: easeInOutSine`,
  );

  // Architectural header nameplate backing & title above the carved lintel frieze
  const labelPlate = document.createElement("a-plane");
  labelPlate.setAttribute("class", "cv-portal-label-plate");
  labelPlate.setAttribute("width", String(PORTAL_DIMENSIONS.LABEL_WIDTH - 0.18));
  labelPlate.setAttribute("height", "0.32");
  labelPlate.setAttribute("position", `0 ${PORTAL_DIMENSIONS.LABEL_OFFSET_Y} 0.08`);
  labelPlate.setAttribute(
    "material",
    "shader: flat; color: #0B0F17; opacity: 0.92; transparent: true; side: double",
  );

  // Floating room title billboard
  const labelText = createCanvasTextPlane({
    value: config.title,
    color: PORTAL_COLORS.TEXT,
    align: "center",
    baseline: "middle",
    width: PORTAL_DIMENSIONS.LABEL_WIDTH,
    height: 0.36,
    fontSizePx: 52,
    fontWeight: "700",
    canvasWidth: 1024,
    canvasHeight: 160,
    maxLines: 2,
    position: `0 ${PORTAL_DIMENSIONS.LABEL_OFFSET_Y} 0.1`,
  });

  portalRoot.append(...archwayParts, aperture, glowRing, labelPlate, labelText);
  return portalRoot;
}

if (typeof globalThis !== "undefined") {
  registerPortalComponent();
}
