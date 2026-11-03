import type { Vector3D } from "../constants";
import {
  EXHIBIT_DIMENSIONS,
  FOCAL_INSPECTION_OFFSET,
  INSPECTION_TIMINGS,
  InspectionState,
  METADATA_BILLBOARD_OFFSET,
  ExhibitMediaType,
} from "../constants";

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
      focalDistance: { type: "number", default: 1.2 },
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

      // Create in-world 3D billboard entity
      const billboard = document.createElement("a-entity");
      billboard.setAttribute("class", "cv-billboard");
      billboard.setAttribute(
        "position",
        `${METADATA_BILLBOARD_OFFSET.x} ${METADATA_BILLBOARD_OFFSET.y} ${METADATA_BILLBOARD_OFFSET.z}`,
      );
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
      titleEl.setAttribute("align", "center");
      titleEl.setAttribute("position", "0 0.16 0.02");
      titleEl.setAttribute("width", "2.2");

      const descEl = document.createElement("a-text");
      descEl.setAttribute("value", this.data.description);
      descEl.setAttribute("color", "#f1f5f9");
      descEl.setAttribute("align", "center");
      descEl.setAttribute("position", "0 -0.02 0.02");
      descEl.setAttribute("width", "1.7");
      descEl.setAttribute("wrap-count", "32");

      const returnBtn = document.createElement("a-entity");
      returnBtn.setAttribute("class", "cv-return-btn clickable");
      returnBtn.setAttribute(
        "geometry",
        "primitive: plane; width: 0.7; height: 0.16",
      );
      returnBtn.setAttribute("material", "color: #e11d48; shader: flat");
      returnBtn.setAttribute("position", "0 -0.2 0.03");
      returnBtn.setAttribute("data-action", "return-exhibit");

      const returnText = document.createElement("a-text");
      returnText.setAttribute("value", "✕ Volver");
      returnText.setAttribute("align", "center");
      returnText.setAttribute("color", "#ffffff");
      returnText.setAttribute("width", "1.8");
      returnText.setAttribute("position", "0 0 0.01");
      returnBtn.appendChild(returnText);

      returnBtn.addEventListener("click", (evt) => {
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

      // Handle focus trigger on exhibit click
      this.el.addEventListener("click", () => {
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

      // Calculate camera focal coordinate
      const targetPos: Vector3D = {
        x: FOCAL_INSPECTION_OFFSET.x,
        y: 1.5,
        z: FOCAL_INSPECTION_OFFSET.z,
      };

      this.el.setAttribute(
        "position",
        `${targetPos.x} ${targetPos.y} ${targetPos.z}`,
      );
      this.el.setAttribute("rotation", "0 0 0");

      if (this.billboardEl) {
        this.billboardEl.setAttribute("visible", "true");
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
    },

    returnToGallery: function (this: InspectableComponentInstance) {
      if (this.state === InspectionState.IDLE) {
        return;
      }
      this.state = InspectionState.RETURNING;

      if (this.billboardEl) {
        this.billboardEl.setAttribute("visible", "false");
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

      // Restore initial gallery transform
      this.el.setAttribute(
        "position",
        `${this.galleryPosition.x} ${this.galleryPosition.y} ${this.galleryPosition.z}`,
      );
      this.el.setAttribute(
        "rotation",
        `${this.galleryRotation.x} ${this.galleryRotation.y} ${this.galleryRotation.z}`,
      );

      this.state = InspectionState.IDLE;
    },

    tick: function (this: InspectableComponentInstance) {
      if (this.state === InspectionState.INSPECTING && this.data.autoRotate) {
        if (this.el.object3D && this.el.object3D.rotation) {
          this.el.object3D.rotation.y += this.data.rotationSpeed;
        }
      }
    },

    remove: function (this: InspectableComponentInstance) {
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
