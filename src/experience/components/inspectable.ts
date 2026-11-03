import type { Vector3D } from "../constants";
import {
  EXHIBIT_DICTIONARY,
  EXHIBIT_DIMENSIONS,
  FOCAL_INSPECTION_DISTANCE,
  INSPECTION_TIMINGS,
  InspectionState,
  METADATA_BILLBOARD_OFFSET,
  ExhibitMediaType,
  ROOM_CENTER_COORDINATE,
} from "../constants";
import { ExhibitInspectionController } from "../inspection-controller";

let sharedInspectionController: ExhibitInspectionController | null = null;

export function getSharedInspectionController(): ExhibitInspectionController {
  if (!sharedInspectionController) {
    sharedInspectionController = new ExhibitInspectionController();
  }
  return sharedInspectionController;
}

export function setSharedInspectionController(
  controller: ExhibitInspectionController | null,
): void {
  sharedInspectionController = controller;
}

export interface InspectableComponentData {
  id: string;
  focalDistance: number;
  autoRotate: boolean;
  rotationSpeed: number;
  title: string;
  description: string;
  mediaType: string;
}

export interface InspectableEntity extends HTMLElement {
  object3D: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  };
  sceneEl?: HTMLElement;
  querySelector: <T extends HTMLElement = HTMLElement>(
    selector: string,
  ) => T | null;
}

export interface InspectableComponentInstance {
  el: InspectableEntity;
  data: InspectableComponentData;
  state: InspectionState;
  galleryPosition: Vector3D;
  galleryRotation: Vector3D;
  billboardEl: HTMLElement | null;
  unsubscribeController: (() => void) | null;
  init: () => void;
  inspect: () => void;
  returnToGallery: () => void;
  tick: (time: number, timeDelta: number) => void;
  remove: () => void;
}

export function createInspectableComponentDefinition() {
  return {
    schema: {
      id: { type: "string", default: "" },
      focalDistance: { type: "number", default: FOCAL_INSPECTION_DISTANCE },
      autoRotate: { type: "boolean", default: false },
      rotationSpeed: {
        type: "number",
        default: INSPECTION_TIMINGS.DEFAULT_ROTATION_SPEED,
      },
      title: { type: "string", default: "" },
      description: { type: "string", default: "" },
      mediaType: { type: "string", default: ExhibitMediaType.IMAGE_2D },
    },

    init: function (this: InspectableComponentInstance) {
      this.state = InspectionState.IDLE;
      this.unsubscribeController = null;
      const initialPos = this.el.getAttribute("position");
      const initialRot = this.el.getAttribute("rotation");

      const parseCoord = (attr: unknown): Vector3D => {
        if (typeof attr === "string") {
          const parts = attr.trim().split(/\s+/).map(Number);
          return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
        }
        if (attr && typeof attr === "object") {
          const obj = attr as Record<string, number>;
          return { x: obj.x || 0, y: obj.y || 0, z: obj.z || 0 };
        }
        return { x: 0, y: 0, z: 0 };
      };

      this.galleryPosition = parseCoord(initialPos);
      this.galleryRotation = parseCoord(initialRot);

      // Create sub-exhibit in-world 3D billboard entity
      const billboard = document.createElement("a-entity");
      billboard.setAttribute("class", "cv-billboard");
      billboard.setAttribute(
        "position",
        `${METADATA_BILLBOARD_OFFSET.x} ${METADATA_BILLBOARD_OFFSET.y} ${METADATA_BILLBOARD_OFFSET.z}`,
      );
      billboard.setAttribute("scale", "0.001 0.001 0.001");
      billboard.setAttribute("visible", "false");

      const plane = document.createElement("a-plane");
      plane.setAttribute("width", String(EXHIBIT_DIMENSIONS.BILLBOARD_WIDTH));
      plane.setAttribute("height", String(EXHIBIT_DIMENSIONS.BILLBOARD_HEIGHT));
      plane.setAttribute("color", "#0f172a");
      plane.setAttribute("opacity", "0.95");
      plane.setAttribute("material", "shader: flat; side: double");

      const titleEl = document.createElement("a-text");
      titleEl.setAttribute("value", this.data.title);
      titleEl.setAttribute("color", "#38bdf8");
      titleEl.setAttribute("align", "left");
      titleEl.setAttribute("baseline", "top");
      titleEl.setAttribute("position", "-0.70 0.20 0.02");
      titleEl.setAttribute(
        "width",
        String(EXHIBIT_DIMENSIONS.BILLBOARD_TITLE_WIDTH),
      );
      titleEl.setAttribute(
        "wrap-count",
        String(EXHIBIT_DIMENSIONS.BILLBOARD_TITLE_WRAP_COUNT),
      );

      const descEl = document.createElement("a-text");
      descEl.setAttribute("value", this.data.description);
      descEl.setAttribute("color", "#f1f5f9");
      descEl.setAttribute("align", "left");
      descEl.setAttribute("baseline", "top");
      descEl.setAttribute("position", "-0.70 0.02 0.02");
      descEl.setAttribute("width", "1.45");
      descEl.setAttribute("wrap-count", "44");

      // Top-right circular close button
      const returnBtn = document.createElement("a-entity");
      returnBtn.setAttribute("class", "cv-return-btn clickable");
      returnBtn.setAttribute(
        "geometry",
        `primitive: circle; radius: ${EXHIBIT_DIMENSIONS.CLOSE_BUTTON_RADIUS}`,
      );
      returnBtn.setAttribute("material", "color: #e11d48; shader: flat");
      returnBtn.setAttribute("position", "0.68 0.18 0.03");
      returnBtn.setAttribute("data-action", "return-exhibit");

      const returnText = document.createElement("a-text");
      returnText.setAttribute("value", EXHIBIT_DICTIONARY.CLOSE_ICON);
      returnText.setAttribute("align", "center");
      returnText.setAttribute("color", "#ffffff");
      returnText.setAttribute("width", "1.5");
      returnText.setAttribute("position", "0 0 0.01");
      returnBtn.appendChild(returnText);

      returnBtn.addEventListener?.("click", (evt) => {
        if (
          evt &&
          typeof (evt as { stopPropagation?: () => void }).stopPropagation ===
            "function"
        ) {
          (evt as { stopPropagation: () => void }).stopPropagation();
        }
        this.returnToGallery();
      });

      plane.appendChild(titleEl);
      plane.appendChild(descEl);
      plane.appendChild(returnBtn);
      billboard.appendChild(plane);

      this.el.appendChild(billboard);
      this.billboardEl = billboard;

      // Subscribe to controller for mutual exclusivity / auto-return
      this.unsubscribeController = getSharedInspectionController().subscribe(
        (_state, _active, prev) => {
          if (
            prev &&
            prev.id === this.data.id &&
            (this.state === InspectionState.INSPECTING ||
              this.state === InspectionState.FOCUSING)
          ) {
            this.returnToGallery();
          }
        },
      );

      // Handle focus trigger on exhibit click
      this.el.addEventListener?.("click", () => {
        if (this.state === InspectionState.IDLE) {
          this.inspect();
        }
      });
    },

    inspect: function (this: InspectableComponentInstance) {
      if (this.state !== InspectionState.IDLE) {
        return;
      }
      this.state = InspectionState.FOCUSING;

      const controller = getSharedInspectionController();
      controller.focus(this.data.id);

      // Compute dynamic radial target position
      const targetPos = controller.calculateRadialTargetPosition(
        this.galleryPosition,
        ROOM_CENTER_COORDINATE,
        this.data.focalDistance || FOCAL_INSPECTION_DISTANCE,
      );

      const curX = this.el.object3D?.position?.x ?? this.galleryPosition.x;
      const curY = this.el.object3D?.position?.y ?? this.galleryPosition.y;
      const curZ = this.el.object3D?.position?.z ?? this.galleryPosition.z;
      const fromPos = `${Number(curX.toFixed(3))} ${Number(curY.toFixed(3))} ${Number(curZ.toFixed(3))}`;
      const toPos = `${targetPos.x} ${targetPos.y} ${targetPos.z}`;

      // Smooth A-Frame animation without synchronous position snapping to prevent flicker
      this.el.removeAttribute("animation__return");
      this.el.setAttribute(
        "animation__inspect",
        `property: position; from: ${fromPos}; to: ${toPos}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
      );

      const hasAFrame =
        typeof globalThis !== "undefined" &&
        Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

      if (!hasAFrame) {
        // Direct attribute update for headless test runners where anime.js RAF does not run
        this.el.setAttribute("position", toPos);
      } else if (typeof this.el.addEventListener === "function") {
        const onComplete = () => {
          this.el.setAttribute("position", toPos);
          this.el.removeEventListener?.("animationcomplete__inspect", onComplete);
        };
        this.el.addEventListener("animationcomplete__inspect", onComplete);
      }

      // Counter-translate pedestal if present so it remains grounded at gallery coords
      const pedestal = this.el.querySelector("a-cylinder");
      if (pedestal) {
        const dx = targetPos.x - this.galleryPosition.x;
        const dy = targetPos.y - this.galleryPosition.y;
        const dz = targetPos.z - this.galleryPosition.z;
        const pedX = Number((-dx).toFixed(3));
        const pedY = Number((-0.4 - dy).toFixed(3));
        const pedZ = Number((-dz).toFixed(3));
        pedestal.removeAttribute("animation__pedestal_return");
        pedestal.setAttribute(
          "animation__pedestal",
          `property: position; from: 0 -0.4 0; to: ${pedX} ${pedY} ${pedZ}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
        );
        pedestal.setAttribute("position", `${pedX} ${pedY} ${pedZ}`);
      }

      // Sub-exhibit billboard animated entrance (flicker-free scale interpolation)
      if (this.billboardEl) {
        this.billboardEl.removeAttribute("animation__panel_out");
        this.billboardEl.setAttribute("scale", "0.001 0.001 0.001");
        this.billboardEl.setAttribute("visible", "true");
        this.billboardEl.setAttribute(
          "animation__panel_in",
          `property: scale; from: 0.001 0.001 0.001; to: 1 1 1; dur: ${INSPECTION_TIMINGS.PANEL_ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.PANEL_ANIMATION_EASING}; delay: 150`,
        );

        const hasAFrame =
          typeof globalThis !== "undefined" &&
          Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

        if (!hasAFrame) {
          // Synchronous fallback for headless test runners
          this.billboardEl.setAttribute("scale", "1 1 1");
        } else if (typeof this.billboardEl.addEventListener === "function") {
          this.billboardEl.addEventListener(
            "animationcomplete__panel_in",
            () => {
              if (this.state === InspectionState.INSPECTING) {
                this.billboardEl?.setAttribute("scale", "1 1 1");
              }
            },
            { once: true },
          );
        }
      }

      // If exhibit has a video element, trigger play
      if (
        this.data.mediaType === ExhibitMediaType.VIDEO_2D ||
        this.data.mediaType === ExhibitMediaType.VIDEO_STEREO_SBS
      ) {
        const video = this.el.querySelector("video") as
          | (HTMLVideoElement & { play?: () => void })
          | null;
        if (video && typeof video.play === "function") {
          video.play();
        }
      }

      this.state = InspectionState.INSPECTING;
      controller.completeFocus();
    },

    returnToGallery: function (this: InspectableComponentInstance) {
      if (this.state === InspectionState.IDLE) {
        return;
      }
      this.state = InspectionState.RETURNING;

      // Animate billboard panel scale out with deferred visibility teardown
      if (this.billboardEl) {
        this.billboardEl.removeAttribute("animation__panel_in");
        this.billboardEl.setAttribute(
          "animation__panel_out",
          `property: scale; from: 1 1 1; to: 0.001 0.001 0.001; dur: 250; easing: easeInCubic`,
        );

        const hasAFrame =
          typeof globalThis !== "undefined" &&
          Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

        if (!hasAFrame) {
          this.billboardEl.setAttribute("scale", "0.001 0.001 0.001");
          this.billboardEl.setAttribute("visible", "false");
        } else {
          const hideBillboard = () => {
            if (this.billboardEl) {
              this.billboardEl.setAttribute("scale", "0.001 0.001 0.001");
              this.billboardEl.setAttribute("visible", "false");
            }
          };
          if (typeof this.billboardEl.addEventListener === "function") {
            this.billboardEl.addEventListener(
              "animationcomplete__panel_out",
              hideBillboard,
              { once: true },
            );
          }
          setTimeout(hideBillboard, 260);
        }
      }

      // If video, pause
      if (
        this.data.mediaType === ExhibitMediaType.VIDEO_2D ||
        this.data.mediaType === ExhibitMediaType.VIDEO_STEREO_SBS
      ) {
        const video = this.el.querySelector("video") as
          | (HTMLVideoElement & { pause?: () => void })
          | null;
        if (video && typeof video.pause === "function") {
          video.pause();
        }
      }

      // Restore pedestal grounded position
      const pedestal = this.el.querySelector("a-cylinder");
      if (pedestal) {
        const currentPedPos = pedestal.getAttribute("position");
        const pedFrom =
          typeof currentPedPos === "string" ? currentPedPos : "0 -0.4 0";
        pedestal.removeAttribute("animation__pedestal");
        pedestal.setAttribute(
          "animation__pedestal_return",
          `property: position; from: ${pedFrom}; to: 0 -0.4 0; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
        );
        pedestal.setAttribute("position", "0 -0.4 0");
      }

      // Smooth A-Frame animation back to gallery position sampling live 3D coordinates
      const curX = this.el.object3D?.position?.x;
      const curY = this.el.object3D?.position?.y;
      const curZ = this.el.object3D?.position?.z;
      const fromPos =
        curX !== undefined && curY !== undefined && curZ !== undefined
          ? `${Number(curX.toFixed(3))} ${Number(curY.toFixed(3))} ${Number(curZ.toFixed(3))}`
          : this.el.getAttribute("position") ||
            `${this.galleryPosition.x} ${this.galleryPosition.y} ${this.galleryPosition.z}`;
      const toPos = `${this.galleryPosition.x} ${this.galleryPosition.y} ${this.galleryPosition.z}`;

      this.el.removeAttribute("animation__inspect");
      this.el.setAttribute(
        "animation__return",
        `property: position; from: ${fromPos}; to: ${toPos}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
      );

      const hasAFrame =
        typeof globalThis !== "undefined" &&
        Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME);

      if (!hasAFrame) {
        this.el.setAttribute("position", toPos);
      } else if (typeof this.el.addEventListener === "function") {
        const onReturnComplete = () => {
          this.el.setAttribute("position", toPos);
          this.el.removeEventListener?.(
            "animationcomplete__return",
            onReturnComplete,
          );
        };
        this.el.addEventListener("animationcomplete__return", onReturnComplete);
      }

      this.el.setAttribute(
        "rotation",
        `${this.galleryRotation.x} ${this.galleryRotation.y} ${this.galleryRotation.z}`,
      );

      this.state = InspectionState.IDLE;
      const controller = getSharedInspectionController();
      if (controller.getActiveExhibit()?.id === this.data.id) {
        controller.return();
        controller.completeReturn();
      }
    },

    tick: function (this: InspectableComponentInstance) {
      if (this.state === InspectionState.INSPECTING && this.data.autoRotate) {
        if (this.el.object3D && this.el.object3D.rotation) {
          this.el.object3D.rotation.y += this.data.rotationSpeed;
        }
      }
    },

    remove: function (this: InspectableComponentInstance) {
      if (this.unsubscribeController) {
        this.unsubscribeController();
        this.unsubscribeController = null;
      }
      if (this.billboardEl) {
        this.billboardEl.remove();
        this.billboardEl = null;
      }
    },
  };
}

export function registerInspectableComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-inspectable",
      createInspectableComponentDefinition(),
    );
  }
}

// Auto-register if AFRAME is already loaded in the environment
if (typeof globalThis !== "undefined") {
  registerInspectableComponent();
}
