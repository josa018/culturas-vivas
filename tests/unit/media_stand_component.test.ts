import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMediaStandComponentDefinition,
  type MediaStandComponentInstance,
  type MediaStandEntity,
} from "../../src/experience/components/media-stand";
import {
  ExhibitMediaType,
  InspectionState,
  STAND_DICTIONARY,
} from "../../src/experience/constants";
import { ExhibitInspectionController } from "../../src/experience/inspection-controller";
import type { StandMediaItem } from "../../src/experience/media-types";
import {
  SharedVideoController,
  type DisposableVideoTexture,
  type VideoElementLike,
} from "../../src/experience/shared-video-controller";
import { RoomId, StandId } from "../../src/shared/room-catalog";

function createMockVideoController() {
  const attributes = new Map<string, string>();
  const video: VideoElementLike = {
    id: "",
    src: "",
    muted: false,
    paused: true,
    loop: false,
    playsInline: false,
    crossOrigin: null,
    preload: "",
    style: {},
    setAttribute: vi.fn((k: string, v: string) => {
      attributes.set(k, v);
    }),
    removeAttribute: vi.fn((k: string) => {
      attributes.delete(k);
      if (k === "src") {
        video.src = "";
      }
    }),
    play: vi.fn(async () => {
      video.paused = false;
    }),
    pause: vi.fn(() => {
      video.paused = true;
    }),
    load: vi.fn(),
  };

  const texture: DisposableVideoTexture = {
    needsUpdate: false,
    dispose: vi.fn(),
  };

  const controller = new SharedVideoController({
    createVideoElement: () => video,
    createVideoTexture: () => texture,
  });

  vi.spyOn(controller, "playVideo");
  vi.spyOn(controller, "stopAndRelease");
  vi.spyOn(controller, "togglePause");
  vi.spyOn(controller, "toggleMute");

  return { controller, video, texture };
}

function createStandHost(
  items: readonly StandMediaItem[],
  standId: StandId = StandId.ARTE,
  roomId: RoomId = RoomId.WIXARIKA,
  options: {
    inspectionController?: ExhibitInspectionController;
    videoController?: SharedVideoController;
    prefetchUrl?: (url: string) => void;
  } = {},
) {
  const def = createMediaStandComponentDefinition({
    getInspectionController: options.inspectionController
      ? () => options.inspectionController!
      : undefined,
    getVideoController: options.videoController
      ? () => options.videoController!
      : undefined,
    prefetchImage: options.prefetchUrl,
  });

  const el = document.createElement("a-entity") as unknown as MediaStandEntity;
  el.standItems = [...items];

  const instance: MediaStandComponentInstance = Object.create(def);
  instance.el = el;
  instance.data = {
    roomId,
    standId,
    label: "Arte",
    accentColor: "#D99B26",
    viewMode: "vr",
    galleryPosition: { x: 0, y: 1.6, z: -3.2 },
    galleryRotation: { x: 0, y: 0, z: 0 },
    itemsJson: "[]",
  };
  instance.init();

  return { el, instance };
}

describe("cv-media-stand A-Frame Component", () => {
  let inspectionController: ExhibitInspectionController;

  beforeEach(() => {
    inspectionController = new ExhibitInspectionController();
  });

  it("renders 'Contenido próximamente' with hidden non-clickable controls for empty stands", async () => {
    const { controller: videoController } = createMockVideoController();
    const { el, instance } = createStandHost([], StandId.VESTIMENTA, RoomId.ODAM, {
      inspectionController,
      videoController,
    });

    const placeholder = el.querySelector(".cv-stand-empty-placeholder");
    const countBadge = el.querySelector(".cv-stand-count-badge");
    const prevBtn = el.querySelector(".cv-stand-prev-btn");
    const nextBtn = el.querySelector(".cv-stand-next-btn");
    const playBtn = el.querySelector(".cv-stand-play-btn");
    const muteBtn = el.querySelector(".cv-stand-mute-btn");

    expect(placeholder?.getAttribute("visible")).toBe("true");
    expect(placeholder?.getAttribute("value")).toBe(STAND_DICTIONARY.EMPTY_PLACEHOLDER);
    expect(countBadge?.getAttribute("visible")).toBe("false");
    expect(prevBtn?.getAttribute("visible")).toBe("false");
    expect(prevBtn?.classList.contains("clickable")).toBe(false);
    expect(nextBtn?.getAttribute("visible")).toBe("false");
    expect(nextBtn?.classList.contains("clickable")).toBe(false);
    expect(playBtn?.getAttribute("visible")).toBe("false");
    expect(playBtn?.classList.contains("clickable")).toBe(false);
    expect(muteBtn?.getAttribute("visible")).toBe("false");
    expect(muteBtn?.classList.contains("clickable")).toBe(false);

    // Attempting to inspect an empty stand must remain a no-op
    await instance.inspect();
    expect(instance.getLocalState()).toBe(InspectionState.IDLE);
    expect(videoController.playVideo).not.toHaveBeenCalled();
  });

  it("reveals inspection-scoped carousel controls, video actions, creator credit, and prefetches next asset", async () => {
    const items: StandMediaItem[] = [
      {
        id: "art-1",
        roomId: RoomId.WIXARIKA,
        standId: StandId.ARTE,
        mediaType: ExhibitMediaType.IMAGE_2D,
        title: "Cuadro de Estambre",
        creatorName: "María López",
        description: "Obra artesanal con estambre.",
        mediaUrl: "https://cdn.example.com/art-1.jpg",
        width: 1920,
        height: 1080,
        sortOrder: 0,
      },
      {
        id: "art-2",
        roomId: RoomId.WIXARIKA,
        standId: StandId.ARTE,
        mediaType: ExhibitMediaType.VIDEO_2D,
        title: "Tejido Ceremonial",
        creatorName: "",
        description: "Proceso textil tradicional.",
        mediaUrl: "https://cdn.example.com/art-2.mp4",
        posterUrl: "https://cdn.example.com/art-2-poster.jpg",
        width: 1080,
        height: 1920,
        sortOrder: 1,
      },
    ];

    inspectionController.setExhibits([
      {
        id: `${RoomId.WIXARIKA}:${StandId.ARTE}`,
        title: "Arte",
        description: "Colección Arte",
        mediaType: ExhibitMediaType.IMAGE_2D,
        galleryPosition: { x: 0, y: 1.6, z: -3.2 },
        galleryRotation: { x: 0, y: 0, z: 0 },
        autoRotate: false,
        rotationSpeed: 0,
      },
    ]);

    const { controller: videoController } = createMockVideoController();
    const prefetched: string[] = [];
    const { el, instance } = createStandHost(items, StandId.ARTE, RoomId.WIXARIKA, {
      inspectionController,
      videoController,
      prefetchUrl: (url) => prefetched.push(url),
    });

    const leftPlane = el.querySelector(".cv-stand-left-plane")!;
    const rightPlane = el.querySelector(".cv-stand-right-plane")!;
    const prevBtn = el.querySelector(".cv-stand-prev-btn")!;
    const nextBtn = el.querySelector(".cv-stand-next-btn")!;
    const playBtn = el.querySelector(".cv-stand-play-btn")!;
    const muteBtn = el.querySelector(".cv-stand-mute-btn")!;
    const closeBtn = el.querySelector(".cv-stand-close-btn")!;
    const counter = el.querySelector(".cv-stand-counter")!;
    const creator = el.querySelector(".cv-stand-billboard-creator")!;
    const countBadge = el.querySelector(".cv-stand-count-badge")!;

    // IDLE assertions
    expect(countBadge.getAttribute("value")).toBe("2 elementos");
    expect(leftPlane.getAttribute("width")).toBe("1.5");
    expect(leftPlane.getAttribute("height")).toBe("0.844");
    expect(rightPlane.getAttribute("visible")).toBe("false");
    expect(prevBtn.getAttribute("visible")).toBe("false");
    expect(prevBtn.classList.contains("clickable")).toBe(false);
    expect(nextBtn.getAttribute("visible")).toBe("false");
    expect(nextBtn.classList.contains("clickable")).toBe(false);
    expect(videoController.playVideo).not.toHaveBeenCalled();

    // Enter INSPECTING on image item 0
    await instance.inspect();
    expect(instance.getLocalState()).toBe(InspectionState.INSPECTING);
    expect(prevBtn.getAttribute("visible")).toBe("true");
    expect(prevBtn.classList.contains("clickable")).toBe(true);
    expect(nextBtn.getAttribute("visible")).toBe("true");
    expect(nextBtn.classList.contains("clickable")).toBe(true);
    expect(closeBtn.getAttribute("visible")).toBe("true");
    expect(closeBtn.classList.contains("clickable")).toBe(true);
    expect(playBtn.getAttribute("visible")).toBe("false");
    expect(muteBtn.getAttribute("visible")).toBe("false");
    expect(counter.getAttribute("value")).toBe("1 / 2");
    expect(creator.getAttribute("visible")).toBe("true");
    expect(creator.getAttribute("value")).toBe("Crédito: María López");
    expect(prefetched).toEqual(["https://cdn.example.com/art-2-poster.jpg"]);

    // Advance to item 1 (VIDEO_2D with empty creatorName)
    await instance.nextSlide();
    expect(counter.getAttribute("value")).toBe("2 / 2");
    expect(playBtn.getAttribute("visible")).toBe("true");
    expect(playBtn.classList.contains("clickable")).toBe(true);
    expect(muteBtn.getAttribute("visible")).toBe("true");
    expect(muteBtn.classList.contains("clickable")).toBe(true);
    expect(creator.getAttribute("visible")).toBe("false");
    expect(creator.getAttribute("value")).toBe("");
    expect(leftPlane.getAttribute("width")).toBe("0.534");
    expect(leftPlane.getAttribute("height")).toBe("0.95");
    expect(videoController.playVideo).toHaveBeenCalledWith("https://cdn.example.com/art-2.mp4");
    expect(prefetched).toEqual([
      "https://cdn.example.com/art-2-poster.jpg",
      "https://cdn.example.com/art-1.jpg",
    ]);

    // Toggle play/mute via controller seam
    await instance.togglePlay();
    expect(videoController.togglePause).toHaveBeenCalledTimes(1);
    instance.toggleMute();
    expect(videoController.toggleMute).toHaveBeenCalledTimes(1);

    // Return to gallery stops video and hides controls
    instance.returnToGallery();
    expect(instance.getLocalState()).toBe(InspectionState.IDLE);
    expect(videoController.stopAndRelease).toHaveBeenCalled();
    expect(prevBtn.getAttribute("visible")).toBe("false");
    expect(prevBtn.classList.contains("clickable")).toBe(false);
    expect(playBtn.getAttribute("visible")).toBe("false");
    expect(playBtn.classList.contains("clickable")).toBe(false);
  });

  it("stops video cleanly when switching from a video item back to an image item", async () => {
    const items: StandMediaItem[] = [
      {
        id: "vid-1",
        roomId: RoomId.WIXARIKA,
        standId: StandId.ARTE,
        mediaType: ExhibitMediaType.VIDEO_STEREO_SBS,
        title: "Danza SBS",
        creatorName: "Pedro",
        description: "Video Half-SBS.",
        mediaUrl: "https://cdn.example.com/dance-sbs.mp4",
        posterUrl: "https://cdn.example.com/dance-poster.jpg",
        sortOrder: 0,
      },
      {
        id: "img-2",
        roomId: RoomId.WIXARIKA,
        standId: StandId.ARTE,
        mediaType: ExhibitMediaType.IMAGE_2D,
        title: "Mapa Cultural",
        creatorName: "Ana",
        description: "Mapa plano 2D.",
        mediaUrl: "https://cdn.example.com/map.jpg",
        sortOrder: 1,
      },
    ];

    inspectionController.setExhibits([
      {
        id: `${RoomId.WIXARIKA}:${StandId.ARTE}`,
        title: "Arte",
        description: "Colección Arte",
        mediaType: ExhibitMediaType.VIDEO_STEREO_SBS,
        galleryPosition: { x: 0, y: 1.6, z: -3.2 },
        galleryRotation: { x: 0, y: 0, z: 0 },
        autoRotate: false,
        rotationSpeed: 0,
      },
    ]);

    const { controller: videoController } = createMockVideoController();
    const { el, instance } = createStandHost(items, StandId.ARTE, RoomId.WIXARIKA, {
      inspectionController,
      videoController,
    });

    await instance.inspect();
    expect(videoController.playVideo).toHaveBeenCalledWith(
      "https://cdn.example.com/dance-sbs.mp4",
    );
    expect(el.querySelector(".cv-stand-left-plane")?.getAttribute("cv-stereo-media")).toContain(
      "isHalfSBS: true",
    );
    expect(el.querySelector(".cv-stand-right-plane")?.getAttribute("visible")).toBe("true");

    await instance.nextSlide();
    expect(videoController.stopAndRelease).toHaveBeenCalledTimes(1);
    expect(el.querySelector(".cv-stand-left-plane")?.getAttribute("cv-stereo-media")).toContain(
      "isHalfSBS: false",
    );
    expect(el.querySelector(".cv-stand-right-plane")?.getAttribute("visible")).toBe("false");
  });

  it("renders centered two-row header, dark anti-flash media surfaces, Unicode cv-canvas-text, and direct-mesh clickable buttons", () => {
    const items: StandMediaItem[] = [
      {
        id: "img-1",
        roomId: RoomId.NAAYERI,
        standId: StandId.COSMOVISION,
        mediaType: ExhibitMediaType.IMAGE_2D,
        title: "Cosmovisión y Tradición",
        creatorName: "Artesana Náayeri",
        description: "Texto con diacrí­ticos.",
        mediaUrl: "https://cdn.example.com/cosmo.jpg",
        sortOrder: 0,
      },
    ];

    const { el } = createStandHost(items, StandId.COSMOVISION, RoomId.NAAYERI, {
      inspectionController,
    });

    // Zero ASCII <a-text> nodes remain anywhere inside the stand
    expect(el.querySelector("a-text")).toBeNull();
    expect(el.querySelectorAll("[cv-canvas-text]").length).toBeGreaterThanOrEqual(10);

    // Two-row centered header: category title sits strictly above count badge
    const header = el.querySelector(".cv-stand-header");
    const countBadge = el.querySelector(".cv-stand-count-badge");
    const parseY = (pos: string | null | undefined) => Number((pos ?? "0 0 0").split(/\s+/)[1]);
    const parseX = (pos: string | null | undefined) => Number((pos ?? "0 0 0").split(/\s+/)[0]);

    expect(header?.hasAttribute("cv-canvas-text")).toBe(true);
    expect(parseX(header?.getAttribute("position"))).toBe(0);
    expect(parseX(countBadge?.getAttribute("position"))).toBe(0);
    expect(parseY(header?.getAttribute("position"))).toBeGreaterThan(
      parseY(countBadge?.getAttribute("position")),
    );

    // Planes initialize with dark surface color (#0f172a) so they never flash white
    const leftPlane = el.querySelector(".cv-stand-left-plane");
    const rightPlane = el.querySelector(".cv-stand-right-plane");
    expect(leftPlane?.getAttribute("color")).toBe("#0f172a");
    expect(leftPlane?.getAttribute("material")).toContain("#0f172a");
    expect(rightPlane?.getAttribute("color")).toBe("#0f172a");
    expect(rightPlane?.getAttribute("material")).toContain("#0f172a");

    // Control buttons must own direct geometry + material for A-Frame cursor raycaster hit-testing
    for (const selector of [
      ".cv-stand-prev-btn",
      ".cv-stand-next-btn",
      ".cv-stand-play-btn",
      ".cv-stand-mute-btn",
      ".cv-stand-close-btn",
    ]) {
      const btn = el.querySelector(selector);
      expect(btn).not.toBeNull();
      expect(btn?.getAttribute("geometry")).toContain("primitive: plane");
      expect(btn?.getAttribute("material")).toContain("shader: flat");
      expect(btn?.querySelector("[cv-canvas-text]")?.getAttribute("value")).toBeTruthy();
    }
  });

  it("keeps billboard title, credits, and description well-spaced inside card bounds even on maximum-length entries", async () => {
    const items: StandMediaItem[] = [
      {
        id: "long-item",
        roomId: RoomId.WIXARIKA,
        standId: StandId.ARTE,
        mediaType: ExhibitMediaType.IMAGE_2D,
        title: "Título extenso de dos líneas para verificar separación vertical en el visor VR",
        creatorName: "Colectivo de Maestras y Maestros Artesanos de Santa Catarina Nayarit",
        description:
          "Descripción larga de prueba para comprobar que el texto completo cabe cómodamente dentro de la tarjeta sin encimarse con los créditos ni salirse del borde inferior del card.",
        mediaUrl: "https://cdn.example.com/long.jpg",
        sortOrder: 0,
      },
    ];

    inspectionController.setExhibits([
      {
        id: `${RoomId.WIXARIKA}:${StandId.ARTE}`,
        title: "Arte",
        description: "Colección Arte",
        mediaType: ExhibitMediaType.IMAGE_2D,
        galleryPosition: { x: 0, y: 1.6, z: -3.2 },
        galleryRotation: { x: 0, y: 0, z: 0 },
        autoRotate: false,
        rotationSpeed: 0,
      },
    ]);

    const { el, instance } = createStandHost(items, StandId.ARTE, RoomId.WIXARIKA, {
      inspectionController,
    });
    await instance.inspect();

    const billboard = el.querySelector(".cv-stand-billboard")!;
    const bgPlane = billboard.querySelector("a-plane")!;
    const titlePlane = billboard.querySelector(".cv-stand-billboard-title")!;
    const creatorPlane = billboard.querySelector(".cv-stand-billboard-creator")!;
    const descPlane = billboard.querySelector(".cv-stand-billboard-desc")!;

    const parseY = (node: Element) =>
      Number((node.getAttribute("position") ?? "0 0 0").split(/\s+/)[1]);
    const parseH = (node: Element) => Number(node.getAttribute("height") ?? 0);

    const bgHalf = parseH(bgPlane) / 2;
    const creatorCenterY = parseY(creatorPlane);
    const descCenterY = parseY(descPlane);
    const creatorTop = creatorCenterY + parseH(creatorPlane) / 2;
    const descTop = descCenterY + parseH(descPlane) / 2;
    const descBottom = descCenterY - parseH(descPlane) / 2;

    // Header & count badge must be legible size
    expect(el.querySelector(".cv-stand-header")?.getAttribute("cv-canvas-text")).toContain(
      "fontSizePx: 66",
    );
    expect(descPlane.getAttribute("cv-canvas-text")).toContain("fontSizePx: 34");

    // Distinct vertical separation between title, creator, and description inside card bounds
    expect(parseY(titlePlane)).toBeGreaterThan(creatorTop);
    expect(creatorCenterY).toBeGreaterThan(descTop);
    expect(descBottom).toBeGreaterThanOrEqual(-bgHalf);
  });
});
