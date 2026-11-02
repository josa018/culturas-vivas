import {
  EXHIBIT_DIMENSIONS,
  ExhibitMediaType,
  PROTOTYPE_EXHIBITS,
} from "./constants";
import { PlaceholderAssetGenerator } from "./placeholders";

export class ExhibitRoomBuilder {
  public static readonly ROOM_CONTAINER_ID = "cv-prototype-room-group";

  public static ensureRoom(
    sceneEl: HTMLElement,
    viewMode: string = "vr",
  ): HTMLElement {
    let roomGroup = sceneEl.querySelector(`#${this.ROOM_CONTAINER_ID}`);
    if (roomGroup) {
      // Update viewMode attribute across all stereo components if changed
      const stereoEntities = roomGroup.querySelectorAll("[cv-stereo-media]");
      stereoEntities.forEach((el) => {
        const currentAttr = el.getAttribute("cv-stereo-media") || "";
        el.setAttribute(
          "cv-stereo-media",
          currentAttr.replace(/viewMode:\s*[^;]+/, `viewMode: ${viewMode}`),
        );
      });
      return roomGroup as HTMLElement;
    }

    roomGroup = document.createElement("a-entity");
    roomGroup.setAttribute("id", this.ROOM_CONTAINER_ID);

    const paintingTexture = PlaceholderAssetGenerator.createPaintingTexture();
    const stereoImageTexture =
      PlaceholderAssetGenerator.createStereoImageTexture();
    const videoThumbnail =
      PlaceholderAssetGenerator.createVideoThumbnailTexture();
    const stereoVideoThumbnail =
      PlaceholderAssetGenerator.createStereoVideoThumbnailTexture();

    for (const exhibit of PROTOTYPE_EXHIBITS) {
      const exhibitRoot = document.createElement("a-entity");
      exhibitRoot.setAttribute("id", exhibit.id);
      exhibitRoot.setAttribute(
        "position",
        `${exhibit.galleryPosition.x} ${exhibit.galleryPosition.y} ${exhibit.galleryPosition.z}`,
      );
      exhibitRoot.setAttribute(
        "rotation",
        `${exhibit.galleryRotation.x} ${exhibit.galleryRotation.y} ${exhibit.galleryRotation.z}`,
      );
      exhibitRoot.setAttribute(
        "cv-inspectable",
        `id: ${exhibit.id}; title: ${exhibit.title}; description: ${exhibit.description}; autoRotate: ${exhibit.autoRotate}; rotationSpeed: ${exhibit.rotationSpeed}; mediaType: ${exhibit.mediaType}`,
      );

      switch (exhibit.mediaType) {
        case ExhibitMediaType.MODEL_3D: {
          // Pedestal Base
          const pedestal = document.createElement("a-cylinder");
          pedestal.setAttribute(
            "radius",
            String(EXHIBIT_DIMENSIONS.PEDESTAL_RADIUS),
          );
          pedestal.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PEDESTAL_HEIGHT),
          );
          pedestal.setAttribute("position", "0 -0.4 0");
          pedestal.setAttribute("color", "#334155");
          pedestal.setAttribute("material", "shader: flat");

          // Sculpted Cultural Primitive Group (Interactive click target)
          const modelGroup = document.createElement("a-entity");
          modelGroup.setAttribute("class", "clickable");
          modelGroup.setAttribute("position", "0 0.1 0");

          const sphere = document.createElement("a-sphere");
          sphere.setAttribute("radius", "0.25");
          sphere.setAttribute("position", "0 0.25 0");
          sphere.setAttribute("color", "#f59e0b");
          sphere.setAttribute("material", "shader: flat");

          const cone = document.createElement("a-cone");
          cone.setAttribute("radius-bottom", "0.28");
          cone.setAttribute("radius-top", "0.1");
          cone.setAttribute("height", "0.4");
          cone.setAttribute("position", "0 -0.05 0");
          cone.setAttribute("color", "#d97706");
          cone.setAttribute("material", "shader: flat");

          const ring = document.createElement("a-ring");
          ring.setAttribute("radius-inner", "0.28");
          ring.setAttribute("radius-outer", "0.34");
          ring.setAttribute("position", "0 0.1 0");
          ring.setAttribute("rotation", "90 0 0");
          ring.setAttribute("color", "#fbbf24");
          ring.setAttribute("material", "shader: flat");

          modelGroup.append(sphere, cone, ring);
          exhibitRoot.append(pedestal, modelGroup);
          break;
        }

        case ExhibitMediaType.IMAGE_2D: {
          const plane = document.createElement("a-plane");
          plane.setAttribute("class", "clickable");
          plane.setAttribute("width", String(EXHIBIT_DIMENSIONS.PLANE_WIDTH));
          plane.setAttribute("height", String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT));
          plane.setAttribute("src", paintingTexture);
          plane.setAttribute("material", "shader: flat");

          const frame = document.createElement("a-plane");
          frame.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08),
          );
          frame.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08),
          );
          frame.setAttribute("position", "0 0 -0.01");
          frame.setAttribute("color", "#d4af37");
          frame.setAttribute("material", "shader: flat");

          exhibitRoot.append(frame, plane);
          break;
        }

        case ExhibitMediaType.IMAGE_STEREO_SBS: {
          const leftPlane = document.createElement("a-plane");
          leftPlane.setAttribute("class", "clickable");
          leftPlane.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH),
          );
          leftPlane.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT),
          );
          leftPlane.setAttribute("src", stereoImageTexture);
          leftPlane.setAttribute(
            "cv-stereo-media",
            `eye: LEFT; isHalfSBS: true; viewMode: ${viewMode}`,
          );
          leftPlane.setAttribute("material", "shader: flat");

          const rightPlane = document.createElement("a-plane");
          rightPlane.setAttribute("class", "clickable");
          rightPlane.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH),
          );
          rightPlane.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT),
          );
          rightPlane.setAttribute("src", stereoImageTexture);
          rightPlane.setAttribute(
            "cv-stereo-media",
            `eye: RIGHT; isHalfSBS: true; viewMode: ${viewMode}`,
          );
          rightPlane.setAttribute("material", "shader: flat");

          const frame = document.createElement("a-plane");
          frame.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08),
          );
          frame.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08),
          );
          frame.setAttribute("position", "0 0 -0.01");
          frame.setAttribute("color", "#38bdf8");
          frame.setAttribute("material", "shader: flat");

          exhibitRoot.append(frame, leftPlane, rightPlane);
          break;
        }

        case ExhibitMediaType.VIDEO_2D: {
          const plane = document.createElement("a-plane");
          plane.setAttribute("class", "clickable");
          plane.setAttribute("width", String(EXHIBIT_DIMENSIONS.PLANE_WIDTH));
          plane.setAttribute("height", String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT));
          plane.setAttribute("src", videoThumbnail);
          plane.setAttribute("material", "shader: flat");

          const frame = document.createElement("a-plane");
          frame.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08),
          );
          frame.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08),
          );
          frame.setAttribute("position", "0 0 -0.01");
          frame.setAttribute("color", "#2ec4b6");
          frame.setAttribute("material", "shader: flat");

          exhibitRoot.append(frame, plane);
          break;
        }

        case ExhibitMediaType.VIDEO_STEREO_SBS: {
          const leftPlane = document.createElement("a-plane");
          leftPlane.setAttribute("class", "clickable");
          leftPlane.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH),
          );
          leftPlane.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT),
          );
          leftPlane.setAttribute("src", stereoVideoThumbnail);
          leftPlane.setAttribute(
            "cv-stereo-media",
            `eye: LEFT; isHalfSBS: true; viewMode: ${viewMode}`,
          );
          leftPlane.setAttribute("material", "shader: flat");

          const rightPlane = document.createElement("a-plane");
          rightPlane.setAttribute("class", "clickable");
          rightPlane.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH),
          );
          rightPlane.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT),
          );
          rightPlane.setAttribute("src", stereoVideoThumbnail);
          rightPlane.setAttribute(
            "cv-stereo-media",
            `eye: RIGHT; isHalfSBS: true; viewMode: ${viewMode}`,
          );
          rightPlane.setAttribute("material", "shader: flat");

          const frame = document.createElement("a-plane");
          frame.setAttribute(
            "width",
            String(EXHIBIT_DIMENSIONS.PLANE_WIDTH + 0.08),
          );
          frame.setAttribute(
            "height",
            String(EXHIBIT_DIMENSIONS.PLANE_HEIGHT + 0.08),
          );
          frame.setAttribute("position", "0 0 -0.01");
          frame.setAttribute("color", "#e879f9");
          frame.setAttribute("material", "shader: flat");

          exhibitRoot.append(frame, leftPlane, rightPlane);
          break;
        }
      }

      roomGroup.appendChild(exhibitRoot);
    }

    sceneEl.appendChild(roomGroup);
    return roomGroup as HTMLElement;
  }
}
