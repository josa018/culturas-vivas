import {
  HOTSPOT_STYLING,
  PROTOTYPE_EXHIBITS,
} from "./constants";

interface CulturalExhibitDetail {
  tag: string;
  title: string;
  whatIs: string;
  whyIs: string;
  assetFile: string;
  accentColor: string;
  width: number;
  height: number;
}

const EXHIBIT_MAP: CulturalExhibitDetail[] = [
  {
    tag: "VESTIMENTA TRADICIONAL",
    title: "Kutuni y Xikuri",
    whatIs: "Traje ceremonial confeccionado en manta blanca con bordados en punto de cruz.",
    whyIs: "Por que visten asi? Los bordados de venados y flores sagradas son rezos visuales que protegen y comunican con sus antepasados.",
    assetFile: "/assets/VESTIMENTA_WIXA.png",
    accentColor: "#e11d48",
    width: 1.3,
    height: 1.6,
  },
  {
    tag: "ALIMENTACION ANCESTRAL",
    title: "Maiz Sagrado y Quelites",
    whatIs: "Gorditas de comal cocidas a la lena, atole blanco y vegetales serranos.",
    whyIs: "Por que comen asi? El maiz es considerado su hermano sagrado; nutre el alma comunitaria y sustenta las ceremonias.",
    assetFile: "/assets/COMIDA_WIXARICA.png",
    accentColor: "#059669",
    width: 1.6,
    height: 1.2,
  },
  {
    tag: "TRADICION Y CEREMONIA",
    title: "El Marakame y Cantos",
    whatIs: "Ceremonias agrarias guiadas por rezos, sonajas rituales y cantos al amanecer.",
    whyIs: "Por que lo celebran? Para agradecer la lluvia a la naturaleza y renovar la armonia del cosmos.",
    assetFile: "/assets/SEÑOR.png",
    accentColor: "#d97706",
    width: 1.2,
    height: 1.5,
  },
  {
    tag: "ARTE SAGRADO",
    title: "Kauyumari (Venado Azul)",
    whatIs: "Pieza sagrada decorada con microchaquiras sobre cera de abeja natural.",
    whyIs: "Por que lo elaboran? Representa al mensajero espiritual que guia las visiones en Wirikuta.",
    assetFile: "/assets/venado-removebg-preview.png",
    accentColor: "#7c3aed",
    width: 1.3,
    height: 1.4,
  },
];

export class ExhibitRoomBuilder {
  public static readonly ROOM_CONTAINER_ID = "cv-prototype-room-group";

  private static createHotspotMarker(exhibitId: string): HTMLElement {
    const marker = document.createElement("a-entity");
    marker.setAttribute("id", `${exhibitId}-hotspot`);
    marker.setAttribute("class", "cv-hotspot-marker clickable");
    marker.setAttribute("position", "0 -0.85 0.15");

    const core = document.createElement("a-circle");
    core.setAttribute("radius", String(HOTSPOT_STYLING.HOTSPOT_RADIUS));
    core.setAttribute("color", HOTSPOT_STYLING.COLOR_PRIMARY);
    core.setAttribute("material", "shader: flat; opacity: 0.95; side: double");

    const ring = document.createElement("a-ring");
    ring.setAttribute("radius-inner", String(HOTSPOT_STYLING.HOTSPOT_RING_INNER));
    ring.setAttribute("radius-outer", String(HOTSPOT_STYLING.HOTSPOT_RING_OUTER));
    ring.setAttribute("color", HOTSPOT_STYLING.COLOR_SECONDARY);
    ring.setAttribute("material", "shader: flat; opacity: 0.9; side: double");
    ring.setAttribute(
      "animation__pulse",
      `property: scale; dir: alternate; dur: ${HOTSPOT_STYLING.PULSE_DURATION_MS}; easing: easeInOutSine; loop: true; to: ${HOTSPOT_STYLING.PULSE_SCALE_PEAK}`,
    );

    const plus = document.createElement("a-text");
    plus.setAttribute("value", "+");
    plus.setAttribute("align", "center");
    plus.setAttribute("color", "#ffffff");
    plus.setAttribute("scale", "0.6 0.6 0.6");
    plus.setAttribute("position", "0 0 0.01");

    marker.append(core, ring, plus);
    return marker;
  }

  public static ensureRoom(
    sceneEl: HTMLElement,
    _viewMode: string = "vr",
  ): HTMLElement {
    let roomGroup = sceneEl.querySelector(`#${this.ROOM_CONTAINER_ID}`);
    if (roomGroup) {
      return roomGroup as HTMLElement;
    }

    roomGroup = document.createElement("a-entity");
    roomGroup.setAttribute("id", this.ROOM_CONTAINER_ID);

    PROTOTYPE_EXHIBITS.forEach((exhibit, index) => {
      const config = EXHIBIT_MAP[index % EXHIBIT_MAP.length];

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

      // Pedestal inferior
      const pedestal = document.createElement("a-cylinder");
      pedestal.setAttribute("radius", "0.55");
      pedestal.setAttribute("height", "0.12");
      pedestal.setAttribute("position", "0 -0.85 0");
      pedestal.setAttribute("material", "color: #1e293b; shader: flat; opacity: 0.85");

      // Figura individual
      const itemFigure = document.createElement("a-plane");
      itemFigure.setAttribute("id", `${exhibit.id}-figure`);
      itemFigure.setAttribute("class", "clickable");
      itemFigure.setAttribute("width", String(config.width));
      itemFigure.setAttribute("height", String(config.height));
      itemFigure.setAttribute("position", "0 -0.05 0");
      itemFigure.setAttribute(
        "material",
        `src: ${config.assetFile}; transparent: true; alphaTest: 0.1; shader: flat; side: double`,
      );

      // Tarjeta informativa
      const card = document.createElement("a-entity");
      card.setAttribute("id", `${exhibit.id}-infocard`);
      card.setAttribute("position", "0 0.45 0.3");
      card.setAttribute("visible", "false");

      const cardBg = document.createElement("a-plane");
      cardBg.setAttribute("width", "1.9");
      cardBg.setAttribute("height", "1.25");
      cardBg.setAttribute("material", "color: #0b0f17; opacity: 0.96; shader: flat; side: double");

      const border = document.createElement("a-ring");
      border.setAttribute("radius-inner", "0.95");
      border.setAttribute("radius-outer", "0.98");
      border.setAttribute("material", "color: #f59e0b; shader: flat; side: double");

      const tagText = document.createElement("a-text");
      tagText.setAttribute("value", config.tag);
      tagText.setAttribute("color", config.accentColor);
      tagText.setAttribute("align", "center");
      tagText.setAttribute("position", "0 0.45 0.02");
      tagText.setAttribute("scale", "0.5 0.5 0.5");

      const titleText = document.createElement("a-text");
      titleText.setAttribute("value", config.title);
      titleText.setAttribute("color", "#ffffff");
      titleText.setAttribute("align", "center");
      titleText.setAttribute("position", "0 0.28 0.02");
      titleText.setAttribute("scale", "0.65 0.65 0.65");

      const whatText = document.createElement("a-text");
      whatText.setAttribute("value", config.whatIs);
      whatText.setAttribute("color", "#cbd5e1");
      whatText.setAttribute("align", "center");
      whatText.setAttribute("position", "0 0.05 0.02");
      whatText.setAttribute("width", "1.7");
      whatText.setAttribute("wrap-count", "28");
      whatText.setAttribute("scale", "0.45 0.45 0.45");

      const whyBox = document.createElement("a-plane");
      whyBox.setAttribute("width", "1.7");
      whyBox.setAttribute("height", "0.4");
      whyBox.setAttribute("position", "0 -0.32 0.01");
      whyBox.setAttribute("material", "color: #1e293b; opacity: 0.95; shader: flat; side: double");

      const whyText = document.createElement("a-text");
      whyText.setAttribute("value", config.whyIs);
      whyText.setAttribute("color", "#fef08a");
      whyText.setAttribute("align", "center");
      whyText.setAttribute("position", "0 0 0.02");
      whyText.setAttribute("width", "1.6");
      whyText.setAttribute("wrap-count", "30");
      whyText.setAttribute("scale", "0.42 0.42 0.42");

      whyBox.appendChild(whyText);
      card.append(cardBg, border, tagText, titleText, whatText, whyBox);

      // Marcador (+)
      const hotspot = this.createHotspotMarker(exhibit.id);

      let isOpen = false;
      const toggle = () => {
        isOpen = !isOpen;
        card.setAttribute("visible", String(isOpen));
      };

      hotspot.addEventListener("click", toggle);
      itemFigure.addEventListener("click", toggle);
      card.addEventListener("click", toggle);

      exhibitRoot.append(pedestal, itemFigure, card, hotspot);
      roomGroup.appendChild(exhibitRoot);
    });

    sceneEl.appendChild(roomGroup);
    return roomGroup as HTMLElement;
  }
}