import { computeContainDimensions } from "../aspect-ratio";
import { computeVideoBadgePosition } from "../media-stand-layout";
import {
  EXHIBIT_DICTIONARY,
  INSPECTION_TARGET_TOKENS,
  INSPECTION_TIMINGS,
  InspectionState,
  ROOM_CENTER_COORDINATE,
  ROOM_LAYOUT_TOKENS,
  SHARED_VIDEO_ELEMENT_ID,
  STAND_ANIMATION_TOKENS,
  STAND_DICTIONARY,
  STAND_DIMENSIONS,
  STATION_ARCHITECTURE_TOKENS,
  type Vector3D,
} from "../constants";
import { type ExhibitInspectionController } from "../inspection-controller";
import { MediaCarouselController } from "../media-carousel-controller";
import type { StandMediaItem } from "../media-types";
import {
  getSharedVideoController,
  type DisposableVideoTexture,
  type SharedVideoController,
} from "../shared-video-controller";
import { createCanvasTextPlane, setCanvasTextElement } from "./canvas-text";
import { getSharedInspectionController } from "./inspectable";
import { createContactShadowDecal } from "../shadow-baker";

const STAND_VISUAL_TOKENS = {
  SURFACE_COLOR: "#0f172a",
  HEADER_BG_COLOR: "#1e293b",
  TEXT_PRIMARY: "#EDE8DF",
  TEXT_MUTED: "#94a3b8",
  CLOSE_BG_COLOR: "#ef4444",
  CONTROL_BG_COLOR: "#1e293b",
  CONTROL_TEXT_COLOR: "#f8fafc",
  COUNTER_TEXT_COLOR: "#cbd5e1",
  HEADER_OFFSET_Y: 0.74,
  CONTROL_BTN_STEP_X: 0.24,
  PREV_BTN_X: -0.42,
  COUNTER_X: -0.18,
  NEXT_BTN_X: 0.06,
  PLAY_BTN_X: 0.3,
  MUTE_BTN_X: 0.5,
  CLOSE_BTN_X: 0.72,
  COUNT_BADGE_POS: "0 0.675 0.03",
  HEADER_TEXT_POS: "0 0.79 0.03",
  MEDIA_GROUP_POS: "0 0 0.01",
  ROTATION_RAD_TO_DEG: 180 / Math.PI,
} as const;

export interface MediaStandComponentData {
  roomId: string;
  standId: string;
  label: string;
  accentColor: string;
  viewMode: string;
  galleryPosition: Vector3D;
  galleryRotation: Vector3D;
  itemsJson: string;
}

export interface MediaStandEntity extends HTMLElement {
  standItems?: StandMediaItem[];
  setAttribute(name: string, value: unknown, ...rest: unknown[]): void;
}

export interface MediaStandDependencies {
  readonly getInspectionController?: () => ExhibitInspectionController;
  readonly getVideoController?: () => SharedVideoController;
  readonly prefetchImage?: (url: string) => void;
}

export interface MediaStandComponentInstance {
  el: MediaStandEntity;
  data: MediaStandComponentData;
  exhibitId: string;
  carousel: MediaCarouselController;
  localState: InspectionState;
  ownsActiveVideo: boolean;
  unsubscribeInspection: (() => void) | null;
  cleanupListeners: Array<() => void>;
  elements: StandDomElements | null;
  transitionEpoch: number;
  panelDelayTimer: ReturnType<typeof setTimeout> | null;
  panelSettleTimer: ReturnType<typeof setTimeout> | null;
  hidePanelTimer: ReturnType<typeof setTimeout> | null;
  panelInCompleteHandler: (() => void) | null;
  panelOutCompleteHandler: (() => void) | null;
  init: () => void;
  update: (oldData: Partial<MediaStandComponentData>) => void;
  remove: () => void;
  getLocalState: () => InspectionState;
  inspect: () => Promise<void>;
  returnToGallery: () => void;
  nextSlide: () => Promise<void>;
  prevSlide: () => Promise<void>;
  togglePlay: () => Promise<void>;
  toggleMute: () => void;
}

interface StandDomElements {
  frame: HTMLElement;
  headerBg: HTMLElement;
  headerText: HTMLElement;
  countBadge: HTMLElement;
  mediaGroup: HTMLElement;
  videoBadge: HTMLElement;
  emptyPlaceholder: HTMLElement;
  leftPlane: HTMLElement;
  rightPlane: HTMLElement;
  controlBar: HTMLElement;
  prevBtn: HTMLElement;
  counterText: HTMLElement;
  nextBtn: HTMLElement;
  playBtn: HTMLElement;
  muteBtn: HTMLElement;
  closeBtn: HTMLElement;
  billboard: HTMLElement;
  billboardTitle: HTMLElement;
  billboardCreator: HTMLElement;
  billboardDesc: HTMLElement;
}

function defaultPrefetchImage(url: string): void {
  if (typeof Image === "undefined" || !url) {
    return;
  }
  const preloader = new Image();
  preloader.crossOrigin = "anonymous";
  preloader.src = url;
}

function formatItemCount(count: number): string {
  const unit =
    count === 1
      ? STAND_DICTIONARY.ITEM_COUNT_SINGULAR
      : STAND_DICTIONARY.ITEM_COUNT_PLURAL;
  return `${count} ${unit}`;
}

function setToggleClass(el: Element, className: string, enabled: boolean): void {
  if (enabled) {
    el.classList.add(className);
  } else {
    el.classList.remove(className);
  }
}

function parseStandItems(el: MediaStandEntity, itemsJson: string): StandMediaItem[] {
  if (Array.isArray(el.standItems)) {
    return [...el.standItems];
  }
  if (!itemsJson || itemsJson === "[]") {
    return [];
  }
  try {
    const parsed = JSON.parse(itemsJson);
    return Array.isArray(parsed) ? (parsed as StandMediaItem[]) : [];
  } catch {
    return [];
  }
}

function createControlButton(
  className: string,
  iconText: string,
  x: number,
  bgColor: string,
  textColor: string,
): HTMLElement {
  const btn = document.createElement("a-entity");
  btn.setAttribute("class", className);
  btn.setAttribute("cv-interactive-feedback", "");
  btn.setAttribute("position", `${x} 0 0.02`);
  btn.setAttribute("visible", "false");
  btn.setAttribute(
    "geometry",
    `primitive: plane; width: ${STAND_DIMENSIONS.CONTROL_BTN_SIZE_M}; height: ${STAND_DIMENSIONS.CONTROL_BTN_SIZE_M}`,
  );
  btn.setAttribute("material", `shader: flat; color: ${bgColor}`);

  const label = createCanvasTextPlane({
    className: `${className}-label`,
    value: iconText,
    color: textColor,
    align: "center",
    baseline: "middle",
    width: STAND_DIMENSIONS.CONTROL_BTN_SIZE_M * 0.85,
    height: STAND_DIMENSIONS.CONTROL_BTN_SIZE_M * 0.85,
    fontSizePx: 64,
    fontWeight: "700",
    canvasWidth: 128,
    canvasHeight: 128,
    maxLines: 1,
    position: "0 0 0.01",
  });

  btn.appendChild(label);
  return btn;
}

function buildStandDom(
  root: HTMLElement,
  accentColor: string,
  categoryLabel: string,
): StandDomElements {
  const frameWidth = STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M + STAND_DIMENSIONS.FRAME_PADDING_M * 2;
  const frameHeight = STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M + STAND_DIMENSIONS.FRAME_PADDING_M * 2;

  const frame = document.createElement("a-plane");
  frame.setAttribute("class", "cv-stand-frame");
  frame.setAttribute("width", String(frameWidth));
  frame.setAttribute("height", String(frameHeight));
  frame.setAttribute("position", "0 0 -0.02");
  frame.setAttribute("color", STAND_VISUAL_TOKENS.SURFACE_COLOR);
  frame.setAttribute("material", "shader: flat");

  const railThickness = STAND_ANIMATION_TOKENS.RAIL_THICKNESS_M;
  const railDepth = STAND_ANIMATION_TOKENS.FRAME_DEPTH_M;
  const halfW = frameWidth / 2;
  const halfH = frameHeight / 2;

  const createBevelRail = (w: number, h: number, pos: string): HTMLElement => {
    const rail = document.createElement("a-box");
    rail.setAttribute("class", "cv-stand-bevel-rail");
    rail.setAttribute("width", String(Number(w.toFixed(3))));
    rail.setAttribute("height", String(Number(h.toFixed(3))));
    rail.setAttribute("depth", String(railDepth));
    rail.setAttribute("position", pos);
    rail.setAttribute("color", STAND_VISUAL_TOKENS.HEADER_BG_COLOR);
    rail.setAttribute("material", "shader: flat");
    return rail;
  };

  const topRail = createBevelRail(
    frameWidth + railThickness * 2,
    railThickness,
    `0 ${Number((halfH + railThickness / 2).toFixed(3))} -0.02`,
  );
  const bottomRail = createBevelRail(
    frameWidth + railThickness * 2,
    railThickness,
    `0 ${Number((-halfH - railThickness / 2).toFixed(3))} -0.02`,
  );
  const leftRail = createBevelRail(
    railThickness,
    frameHeight,
    `${Number((-halfW - railThickness / 2).toFixed(3))} 0 -0.02`,
  );
  const rightRail = createBevelRail(
    railThickness,
    frameHeight,
    `${Number((halfW + railThickness / 2).toFixed(3))} 0 -0.02`,
  );

  const cornerSize = STAND_ANIMATION_TOKENS.CORNER_ACCENT_SIZE_M;
  const cornerThick = STAND_ANIMATION_TOKENS.CORNER_ACCENT_THICKNESS_M;
  const cornerOffsets: Array<[number, number]> = [
    [-halfW - railThickness / 2, halfH + railThickness / 2],
    [halfW + railThickness / 2, halfH + railThickness / 2],
    [-halfW - railThickness / 2, -halfH - railThickness / 2],
    [halfW + railThickness / 2, -halfH - railThickness / 2],
  ];
  const cornerAccents = cornerOffsets.map(([cx, cy]) => {
    const accent = document.createElement("a-box");
    accent.setAttribute("class", "cv-stand-corner-accent");
    accent.setAttribute("width", String(cornerSize));
    accent.setAttribute("height", String(cornerThick));
    accent.setAttribute("depth", String(railDepth + 0.01));
    accent.setAttribute(
      "position",
      `${Number(cx.toFixed(3))} ${Number(cy.toFixed(3))} -0.015`,
    );
    accent.setAttribute("color", accentColor);
    accent.setAttribute("material", "shader: flat");
    return accent;
  });

  const headerBg = document.createElement("a-plane");
  headerBg.setAttribute("class", "cv-stand-header-bg");
  headerBg.setAttribute("width", String(frameWidth));
  headerBg.setAttribute("height", String(STAND_DIMENSIONS.HEADER_HEIGHT_M));
  headerBg.setAttribute("position", `0 ${STAND_VISUAL_TOKENS.HEADER_OFFSET_Y} 0`);
  headerBg.setAttribute("color", STAND_VISUAL_TOKENS.HEADER_BG_COLOR);
  headerBg.setAttribute("material", "shader: flat");

  const headerText = createCanvasTextPlane({
    className: "cv-stand-header",
    value: categoryLabel,
    align: "center",
    baseline: "middle",
    color: accentColor,
    width: 1.5,
    height: 0.13,
    fontSizePx: 66,
    fontWeight: "700",
    canvasWidth: 960,
    canvasHeight: 84,
    maxLines: 1,
    paddingY: 6,
    position: STAND_VISUAL_TOKENS.HEADER_TEXT_POS,
  });

  const countBadge = createCanvasTextPlane({
    className: "cv-stand-count-badge",
    value: "",
    align: "center",
    baseline: "middle",
    color: STAND_VISUAL_TOKENS.TEXT_MUTED,
    width: 1.1,
    height: 0.095,
    fontSizePx: 44,
    fontWeight: "600",
    canvasWidth: 704,
    canvasHeight: 60,
    maxLines: 1,
    paddingY: 4,
    position: STAND_VISUAL_TOKENS.COUNT_BADGE_POS,
  });

  const initialBadgePos = computeVideoBadgePosition(
    STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
    STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
  );
  const videoBadge = createCanvasTextPlane({
    className: "cv-stand-video-badge",
    value: STAND_DICTIONARY.VIDEO_BADGE,
    align: "center",
    baseline: "middle",
    color: accentColor,
    backgroundColor: STAND_VISUAL_TOKENS.SURFACE_COLOR,
    width: STAND_DIMENSIONS.VIDEO_BADGE_WIDTH_M,
    height: STAND_DIMENSIONS.VIDEO_BADGE_HEIGHT_M,
    fontSizePx: 40,
    fontWeight: "700",
    canvasWidth: 224,
    canvasHeight: 68,
    maxLines: 1,
    paddingY: 6,
    position: `${initialBadgePos.x} ${initialBadgePos.y} ${initialBadgePos.z}`,
    visible: "false",
  });

  const emptyPlaceholder = createCanvasTextPlane({
    className: "cv-stand-empty-placeholder",
    value: STAND_DICTIONARY.EMPTY_PLACEHOLDER,
    align: "center",
    baseline: "middle",
    color: STAND_VISUAL_TOKENS.TEXT_PRIMARY,
    width: 1.4,
    height: 0.26,
    fontSizePx: 64,
    fontWeight: "600",
    canvasWidth: 896,
    canvasHeight: 166,
    maxLines: 2,
    position: "0 0 0.03",
    visible: "false",
  });

  const mediaGroup = document.createElement("a-entity");
  mediaGroup.setAttribute("class", "cv-stand-media-group");
  mediaGroup.setAttribute("position", STAND_VISUAL_TOKENS.MEDIA_GROUP_POS);
  mediaGroup.setAttribute("cv-interactive-feedback", "hoverScale: 1.03; hoverZLift: 0.02");

  const leftPlane = document.createElement("a-plane");
  leftPlane.setAttribute("class", "cv-stand-left-plane");
  leftPlane.setAttribute("width", String(STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M));
  leftPlane.setAttribute("height", String(STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M));
  leftPlane.setAttribute("position", "0 0 0");
  leftPlane.setAttribute("color", STAND_VISUAL_TOKENS.SURFACE_COLOR);
  leftPlane.setAttribute(
    "material",
    `shader: flat; color: ${STAND_VISUAL_TOKENS.SURFACE_COLOR}`,
  );
  leftPlane.setAttribute("visible", "false");

  const rightPlane = document.createElement("a-plane");
  rightPlane.setAttribute("class", "cv-stand-right-plane");
  rightPlane.setAttribute("width", String(STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M));
  rightPlane.setAttribute("height", String(STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M));
  rightPlane.setAttribute("position", "0 0 0");
  rightPlane.setAttribute("color", STAND_VISUAL_TOKENS.SURFACE_COLOR);
  rightPlane.setAttribute(
    "material",
    `shader: flat; color: ${STAND_VISUAL_TOKENS.SURFACE_COLOR}`,
  );
  rightPlane.setAttribute("visible", "false");

  mediaGroup.append(leftPlane, rightPlane, videoBadge);

  const controlBar = document.createElement("a-entity");
  controlBar.setAttribute("class", "cv-stand-control-bar");
  controlBar.setAttribute("position", `0 ${STAND_DIMENSIONS.CONTROL_BAR_OFFSET_Y} 0.03`);
  controlBar.setAttribute("visible", "false");

  const prevBtn = createControlButton(
    "cv-stand-prev-btn",
    STAND_DICTIONARY.PREV_ICON,
    STAND_VISUAL_TOKENS.PREV_BTN_X,
    STAND_VISUAL_TOKENS.CONTROL_BG_COLOR,
    STAND_VISUAL_TOKENS.CONTROL_TEXT_COLOR,
  );
  const counterText = createCanvasTextPlane({
    className: "cv-stand-counter",
    value: "0 / 0",
    align: "center",
    baseline: "middle",
    color: STAND_VISUAL_TOKENS.COUNTER_TEXT_COLOR,
    width: 0.32,
    height: 0.12,
    fontSizePx: 54,
    fontWeight: "600",
    canvasWidth: 256,
    canvasHeight: 96,
    maxLines: 1,
    position: `${STAND_VISUAL_TOKENS.COUNTER_X} 0 0.02`,
  });

  const nextBtn = createControlButton(
    "cv-stand-next-btn",
    STAND_DICTIONARY.NEXT_ICON,
    STAND_VISUAL_TOKENS.NEXT_BTN_X,
    STAND_VISUAL_TOKENS.CONTROL_BG_COLOR,
    STAND_VISUAL_TOKENS.CONTROL_TEXT_COLOR,
  );
  const playBtn = createControlButton(
    "cv-stand-play-btn",
    STAND_DICTIONARY.PAUSE_ICON,
    STAND_VISUAL_TOKENS.PLAY_BTN_X,
    STAND_VISUAL_TOKENS.CONTROL_BG_COLOR,
    STAND_VISUAL_TOKENS.CONTROL_TEXT_COLOR,
  );
  const muteBtn = createControlButton(
    "cv-stand-mute-btn",
    STAND_DICTIONARY.UNMUTE_ICON,
    STAND_VISUAL_TOKENS.MUTE_BTN_X,
    STAND_VISUAL_TOKENS.CONTROL_BG_COLOR,
    STAND_VISUAL_TOKENS.CONTROL_TEXT_COLOR,
  );
  const closeBtn = createControlButton(
    "cv-stand-close-btn",
    EXHIBIT_DICTIONARY.CLOSE_ICON,
    STAND_VISUAL_TOKENS.CLOSE_BTN_X,
    STAND_VISUAL_TOKENS.CLOSE_BG_COLOR,
    STAND_VISUAL_TOKENS.CONTROL_TEXT_COLOR,
  );

  const reticleWakeBand = document.createElement("a-plane");
  reticleWakeBand.setAttribute("class", "cv-stand-reticle-wake");
  reticleWakeBand.setAttribute("data-reticle-wake", "true");
  reticleWakeBand.setAttribute(
    "width",
    String(
      STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M +
        STAND_DIMENSIONS.FRAME_PADDING_M * 2 +
        STAND_DIMENSIONS.RETICLE_WAKE_PAD_X_M,
    ),
  );
  reticleWakeBand.setAttribute(
    "height",
    String(STAND_DIMENSIONS.RETICLE_WAKE_HEIGHT_M),
  );
  reticleWakeBand.setAttribute(
    "position",
    `0 0 ${STAND_DIMENSIONS.RETICLE_WAKE_Z_OFFSET_M}`,
  );
  reticleWakeBand.setAttribute(
    "material",
    "shader: flat; opacity: 0; transparent: true; depthWrite: false",
  );

  controlBar.append(
    reticleWakeBand,
    prevBtn,
    counterText,
    nextBtn,
    playBtn,
    muteBtn,
    closeBtn,
  );

  const billboard = document.createElement("a-entity");
  billboard.setAttribute("class", "cv-stand-billboard");
  billboard.setAttribute("position", `0 ${STAND_DIMENSIONS.BILLBOARD_OFFSET_Y} 0.06`);
  billboard.setAttribute(
    "rotation",
    `${INSPECTION_TARGET_TOKENS.BILLBOARD_TILT_X_DEG} 0 0`,
  );
  billboard.setAttribute("visible", "false");

  const billboardBg = document.createElement("a-plane");
  billboardBg.setAttribute("width", String(frameWidth));
  billboardBg.setAttribute("height", String(STAND_DIMENSIONS.BILLBOARD_HEIGHT_M));
  billboardBg.setAttribute("color", STAND_VISUAL_TOKENS.SURFACE_COLOR);
  billboardBg.setAttribute("material", "shader: flat; side: double");

  const billboardTitle = createCanvasTextPlane({
    className: "cv-stand-billboard-title",
    value: "",
    align: "left",
    baseline: "top",
    color: accentColor,
    width: 1.5,
    height: 0.16,
    fontSizePx: 40,
    fontWeight: "700",
    canvasWidth: 960,
    canvasHeight: 112,
    maxLines: 2,
    paddingX: 20,
    paddingY: 12,
    position: "0 0.22 0.03",
  });

  const billboardCreator = createCanvasTextPlane({
    className: "cv-stand-billboard-creator",
    value: "",
    align: "left",
    baseline: "top",
    color: STAND_VISUAL_TOKENS.TEXT_MUTED,
    width: 1.5,
    height: 0.11,
    fontSizePx: 32,
    fontWeight: "600",
    canvasWidth: 960,
    canvasHeight: 84,
    maxLines: 2,
    paddingX: 20,
    paddingY: 8,
    position: "0 0.08 0.035",
    visible: "false",
  });

  const billboardDesc = createCanvasTextPlane({
    className: "cv-stand-billboard-desc",
    value: "",
    align: "left",
    baseline: "top",
    color: STAND_VISUAL_TOKENS.TEXT_PRIMARY,
    width: 1.5,
    height: 0.29,
    fontSizePx: 34,
    fontWeight: "400",
    canvasWidth: 960,
    canvasHeight: 212,
    maxLines: 5,
    paddingX: 20,
    paddingY: 10,
    position: "0 -0.15 0.04",
  });

  billboard.append(billboardBg, billboardTitle, billboardCreator, billboardDesc);

  const contactShadow = createContactShadowDecal({
    width: 1.35,
    depth: 0.72,
    yOffset: Number(
      (
        -(
          ROOM_LAYOUT_TOKENS.STAND_ELEVATION_M -
          STATION_ARCHITECTURE_TOKENS.CONTACT_SHADOW_CLEARANCE_M
        )
      ).toFixed(2),
    ),
  });

  root.replaceChildren(
    frame,
    topRail,
    bottomRail,
    leftRail,
    rightRail,
    ...cornerAccents,
    headerBg,
    headerText,
    countBadge,
    emptyPlaceholder,
    mediaGroup,
    controlBar,
    billboard,
    contactShadow,
  );

  return {
    frame,
    headerBg,
    headerText,
    countBadge,
    mediaGroup,
    videoBadge,
    emptyPlaceholder,
    leftPlane,
    rightPlane,
    controlBar,
    prevBtn,
    counterText,
    nextBtn,
    playBtn,
    muteBtn,
    closeBtn,
    billboard,
    billboardTitle,
    billboardCreator,
    billboardDesc,
  };
}

function applyMaterialTexture(
  plane: HTMLElement,
  texture: DisposableVideoTexture | null,
  fallbackSrc: string,
): void {
  const prevSrc = plane.getAttribute("src") ?? "";
  if (texture) {
    plane.setAttribute("color", "#ffffff");
    plane.setAttribute("material", "shader: flat; color: #ffffff");
  } else if (fallbackSrc.length === 0 || prevSrc !== fallbackSrc) {
    plane.setAttribute("color", STAND_VISUAL_TOKENS.SURFACE_COLOR);
    plane.setAttribute(
      "material",
      `shader: flat; color: ${STAND_VISUAL_TOKENS.SURFACE_COLOR}`,
    );
  }
  plane.setAttribute("src", fallbackSrc);
  const obj3D = (plane as unknown as {
    object3D?: {
      traverse?: (cb: (node: unknown) => void) => void;
    };
  }).object3D;

  if (texture && obj3D && typeof obj3D.traverse === "function") {
    obj3D.traverse((node: unknown) => {
      const material = (node as { material?: { map?: unknown; needsUpdate?: boolean } })
        ?.material;
      if (material) {
        material.map = texture;
        material.needsUpdate = true;
      }
    });
  }
}

export function createMediaStandComponentDefinition(
  deps: MediaStandDependencies = {},
) {
  const resolveInspectionController = () =>
    deps.getInspectionController?.() ?? getSharedInspectionController();
  const resolveVideoController = () =>
    deps.getVideoController?.() ?? getSharedVideoController();
  const prefetchImage = deps.prefetchImage ?? defaultPrefetchImage;

  function renderCarouselSlide(instance: MediaStandComponentInstance): void {
    const els = instance.elements;
    if (!els) {
      return;
    }

    const isEmpty = instance.carousel.isEmpty();
    const isInspecting = instance.localState === InspectionState.INSPECTING;
    const item = instance.carousel.getCurrentItem();

    if (isEmpty || !item) {
      els.emptyPlaceholder.setAttribute("visible", "true");
      els.countBadge.setAttribute("visible", "false");
      els.videoBadge.setAttribute("visible", "false");
      els.leftPlane.setAttribute("visible", "false");
      els.rightPlane.setAttribute("visible", "false");
      setToggleClass(els.leftPlane, "clickable", false);
      setToggleClass(els.controlBar, "clickable", false);
      els.controlBar.setAttribute("visible", "false");
      els.billboard.setAttribute("visible", "false");

      for (const btn of [
        els.prevBtn,
        els.nextBtn,
        els.playBtn,
        els.muteBtn,
        els.closeBtn,
      ]) {
        btn.setAttribute("visible", "false");
        setToggleClass(btn, "clickable", false);
      }
      return;
    }

    els.emptyPlaceholder.setAttribute("visible", "false");
    els.countBadge.setAttribute("visible", "true");
    setCanvasTextElement(els.countBadge, {
      mode: "label",
      value: formatItemCount(instance.carousel.getCount()),
      align: "center",
      baseline: "middle",
      color: STAND_VISUAL_TOKENS.TEXT_MUTED,
      fontSizePx: 44,
      fontWeight: "600",
      canvasWidth: 704,
      canvasHeight: 60,
      maxLines: 1,
      paddingY: 4,
    });

    const isVideo = instance.carousel.isCurrentVideo();
    const isHalfSBS = instance.carousel.isCurrentHalfSBS();
    const isVR = instance.data.viewMode.toLowerCase() === "vr";

    els.videoBadge.setAttribute("visible", String(!isInspecting && isVideo));

    const dims = computeContainDimensions(
      item.width ?? 0,
      item.height ?? 0,
      STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M,
      STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M,
    );

    const badgePos = computeVideoBadgePosition(dims.width, dims.height);
    els.videoBadge.setAttribute(
      "position",
      `${badgePos.x} ${badgePos.y} ${badgePos.z}`,
    );

    const stereoLeft = `eye: LEFT; isHalfSBS: ${isHalfSBS}; viewMode: ${instance.data.viewMode}`;
    const stereoRight = `eye: RIGHT; isHalfSBS: ${isHalfSBS}; viewMode: ${instance.data.viewMode}`;

    els.leftPlane.setAttribute("width", String(dims.width));
    els.leftPlane.setAttribute("height", String(dims.height));
    els.leftPlane.setAttribute("cv-stereo-media", stereoLeft);
    els.leftPlane.setAttribute("visible", "true");
    setToggleClass(els.leftPlane, "clickable", !isInspecting);

    const showRightPlane = isHalfSBS && isVR;
    els.rightPlane.setAttribute("width", String(dims.width));
    els.rightPlane.setAttribute("height", String(dims.height));
    els.rightPlane.setAttribute("cv-stereo-media", stereoRight);
    els.rightPlane.setAttribute("visible", String(showRightPlane));

    if (!isInspecting || !isVideo) {
      const staticSrc = isVideo ? (item.posterUrl ?? "") : item.mediaUrl;
      applyMaterialTexture(els.leftPlane, null, staticSrc);
      applyMaterialTexture(els.rightPlane, null, staticSrc);
    }

    els.controlBar.setAttribute("visible", String(isInspecting));
    setCanvasTextElement(els.counterText, {
      mode: "label",
      value: instance.carousel.getCounterLabel(),
      align: "center",
      baseline: "middle",
      color: STAND_VISUAL_TOKENS.COUNTER_TEXT_COLOR,
      fontSizePx: 54,
      fontWeight: "600",
      canvasWidth: 256,
      canvasHeight: 96,
      maxLines: 1,
    });
    els.prevBtn.setAttribute("visible", String(isInspecting));
    els.nextBtn.setAttribute("visible", String(isInspecting));
    els.closeBtn.setAttribute("visible", String(isInspecting));
    setToggleClass(els.prevBtn, "clickable", isInspecting);
    setToggleClass(els.nextBtn, "clickable", isInspecting);
    setToggleClass(els.closeBtn, "clickable", isInspecting);

    const showVideoControls = isInspecting && isVideo;
    els.playBtn.setAttribute("visible", String(showVideoControls));
    els.muteBtn.setAttribute("visible", String(showVideoControls));
    setToggleClass(els.playBtn, "clickable", showVideoControls);
    setToggleClass(els.muteBtn, "clickable", showVideoControls);

    const playLabelEl = els.playBtn.querySelector<HTMLElement>(
      ".cv-stand-play-btn-label",
    );
    if (playLabelEl) {
      setCanvasTextElement(playLabelEl, {
        mode: "label",
        value: instance.carousel.isPlaying()
          ? STAND_DICTIONARY.PAUSE_ICON
          : STAND_DICTIONARY.PLAY_ICON,
        align: "center",
        baseline: "middle",
        color: STAND_VISUAL_TOKENS.CONTROL_TEXT_COLOR,
        fontSizePx: 64,
        fontWeight: "700",
        canvasWidth: 128,
        canvasHeight: 128,
        maxLines: 1,
      });
    }
    const muteLabelEl = els.muteBtn.querySelector<HTMLElement>(
      ".cv-stand-mute-btn-label",
    );
    if (muteLabelEl) {
      setCanvasTextElement(muteLabelEl, {
        mode: "label",
        value: instance.carousel.isMuted()
          ? STAND_DICTIONARY.MUTE_ICON
          : STAND_DICTIONARY.UNMUTE_ICON,
        align: "center",
        baseline: "middle",
        color: STAND_VISUAL_TOKENS.CONTROL_TEXT_COLOR,
        fontSizePx: 64,
        fontWeight: "700",
        canvasWidth: 128,
        canvasHeight: 128,
        maxLines: 1,
      });
    }

    const cleanCreator = item.creatorName.trim();
    const hasCreator = cleanCreator.length > 0;
    const isLongTitle = item.title.trim().length > 34;
    const isLongCreator =
      hasCreator &&
      `${EXHIBIT_DICTIONARY.CREATOR_PREFIX}${cleanCreator}`.length > 42;

    const creatorTop = isLongTitle ? 0.12 : 0.175;
    const creatorCenterY = creatorTop - 0.055;
    const descTop = hasCreator
      ? creatorTop - (isLongCreator ? 0.125 : 0.085)
      : isLongTitle
        ? 0.115
        : 0.17;
    const descCenterY = descTop - 0.145;

    els.billboard.setAttribute("visible", String(isInspecting));
    setCanvasTextElement(els.billboardTitle, {
      mode: "label",
      value: item.title,
      align: "left",
      baseline: "top",
      color: instance.data.accentColor,
      fontSizePx: 40,
      fontWeight: "700",
      canvasWidth: 960,
      canvasHeight: 112,
      maxLines: 2,
      paddingX: 20,
      paddingY: 12,
    });
    els.billboardCreator.setAttribute("position", `0 ${creatorCenterY} 0.035`);
    els.billboardDesc.setAttribute("position", `0 ${descCenterY} 0.04`);
    setCanvasTextElement(els.billboardDesc, {
      mode: "label",
      value: item.description,
      align: "left",
      baseline: "top",
      color: STAND_VISUAL_TOKENS.TEXT_PRIMARY,
      fontSizePx: 34,
      fontWeight: "400",
      canvasWidth: 960,
      canvasHeight: 212,
      maxLines: 5,
      paddingX: 20,
      paddingY: 10,
    });

    if (hasCreator) {
      setCanvasTextElement(els.billboardCreator, {
        mode: "label",
        value: `${EXHIBIT_DICTIONARY.CREATOR_PREFIX}${cleanCreator}`,
        align: "left",
        baseline: "top",
        color: STAND_VISUAL_TOKENS.TEXT_MUTED,
        fontSizePx: 32,
        fontWeight: "600",
        canvasWidth: 960,
        canvasHeight: 84,
        maxLines: 2,
        paddingX: 20,
        paddingY: 8,
      });
      els.billboardCreator.setAttribute("visible", "true");
    } else {
      setCanvasTextElement(els.billboardCreator, {
        mode: "label",
        value: "",
        align: "left",
        baseline: "top",
        color: STAND_VISUAL_TOKENS.TEXT_MUTED,
        fontSizePx: 32,
        fontWeight: "600",
        canvasWidth: 960,
        canvasHeight: 84,
        maxLines: 2,
        paddingX: 20,
        paddingY: 8,
      });
      els.billboardCreator.setAttribute("visible", "false");
    }
  }

  async function syncSlideMediaPlayback(
    instance: MediaStandComponentInstance,
  ): Promise<void> {
    const videoController = resolveVideoController();
    const item = instance.carousel.getCurrentItem();

    if (
      instance.localState !== InspectionState.INSPECTING ||
      !item ||
      !instance.carousel.isCurrentVideo()
    ) {
      if (instance.ownsActiveVideo) {
        videoController.stopAndRelease();
        instance.ownsActiveVideo = false;
      }
      instance.carousel.setPlaying(false);
      renderCarouselSlide(instance);
      return;
    }

    const activeSlideId = item.id;
    instance.ownsActiveVideo = true;
    const texture = await videoController.playVideo(item.mediaUrl);

    if (
      instance.localState !== InspectionState.INSPECTING ||
      instance.carousel.getCurrentItem()?.id !== activeSlideId
    ) {
      return;
    }

    instance.carousel.setPlaying(videoController.isPlaying());
    instance.carousel.setMuted(videoController.isMuted());

    if (instance.elements) {
      const videoSrcToken = `#${SHARED_VIDEO_ELEMENT_ID}`;
      applyMaterialTexture(instance.elements.leftPlane, texture, videoSrcToken);
      applyMaterialTexture(instance.elements.rightPlane, texture, videoSrcToken);
    }
    renderCarouselSlide(instance);
  }

  function prefetchNextSlideAsset(instance: MediaStandComponentInstance): void {
    const nextUrl = instance.carousel.getNextPrefetchUrl();
    if (nextUrl) {
      prefetchImage(nextUrl);
    }
  }

  function isAFrameActive(): boolean {
    return (
      typeof globalThis !== "undefined" &&
      Boolean((globalThis as unknown as { AFRAME?: unknown }).AFRAME)
    );
  }

  function clearPendingStandTransitions(
    instance: MediaStandComponentInstance,
  ): void {
    if (instance.panelDelayTimer !== null) {
      clearTimeout(instance.panelDelayTimer);
      instance.panelDelayTimer = null;
    }
    if (instance.panelSettleTimer !== null) {
      clearTimeout(instance.panelSettleTimer);
      instance.panelSettleTimer = null;
    }
    if (instance.hidePanelTimer !== null) {
      clearTimeout(instance.hidePanelTimer);
      instance.hidePanelTimer = null;
    }
    if (instance.elements && instance.panelInCompleteHandler) {
      instance.elements.billboard.removeEventListener?.(
        "animationcomplete__panel_in",
        instance.panelInCompleteHandler,
      );
      instance.panelInCompleteHandler = null;
    }
    if (instance.elements && instance.panelOutCompleteHandler) {
      instance.elements.billboard.removeEventListener?.(
        "animationcomplete__panel_out",
        instance.panelOutCompleteHandler,
      );
      instance.panelOutCompleteHandler = null;
    }
  }

  function applyTransform(
    el: HTMLElement,
    pos: Vector3D,
    rot: Vector3D,
  ): void {
    el.setAttribute("position", `${pos.x} ${pos.y} ${pos.z}`);
    el.setAttribute("rotation", `${rot.x} ${rot.y} ${rot.z}`);
  }

  function moveStandToInspectionCenter(
    instance: MediaStandComponentInstance,
    controller: ExhibitInspectionController,
  ): void {
    const target = controller.calculateErgonomicInspectionTarget(
      instance.data.galleryPosition,
      ROOM_CENTER_COORDINATE,
      INSPECTION_TARGET_TOKENS.STAND_FOCAL_DISTANCE_M,
      INSPECTION_TARGET_TOKENS.STAND_INSPECTION_Y_M,
    );
    const dx = -target.x;
    const dz = -target.z;
    const yawDeg = Number(
      (Math.atan2(dx, dz) * STAND_VISUAL_TOKENS.ROTATION_RAD_TO_DEG).toFixed(3),
    );
    const targetRot: Vector3D = { x: 0, y: yawDeg, z: 0 };

    if (!isAFrameActive()) {
      applyTransform(instance.el, target, targetRot);
      return;
    }

    const fromPos = `${instance.data.galleryPosition.x} ${instance.data.galleryPosition.y} ${instance.data.galleryPosition.z}`;
    const toPos = `${target.x} ${target.y} ${target.z}`;
    const fromRot = `${instance.data.galleryRotation.x} ${instance.data.galleryRotation.y} ${instance.data.galleryRotation.z}`;
    const toRot = `${targetRot.x} ${targetRot.y} ${targetRot.z}`;

    instance.el.removeAttribute("animation__stand_return");
    instance.el.removeAttribute("animation__stand_rot_return");
    instance.el.setAttribute(
      "animation__stand_inspect",
      `property: position; from: ${fromPos}; to: ${toPos}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
    );
    instance.el.setAttribute(
      "animation__stand_rot_inspect",
      `property: rotation; from: ${fromRot}; to: ${toRot}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
    );
  }

  function restoreGalleryTransform(instance: MediaStandComponentInstance): void {
    if (!isAFrameActive()) {
      applyTransform(
        instance.el,
        instance.data.galleryPosition,
        instance.data.galleryRotation,
      );
      return;
    }

    const toPos = `${instance.data.galleryPosition.x} ${instance.data.galleryPosition.y} ${instance.data.galleryPosition.z}`;
    const toRot = `${instance.data.galleryRotation.x} ${instance.data.galleryRotation.y} ${instance.data.galleryRotation.z}`;
    instance.el.removeAttribute("animation__stand_inspect");
    instance.el.removeAttribute("animation__stand_rot_inspect");
    instance.el.setAttribute(
      "animation__stand_return",
      `property: position; to: ${toPos}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
    );
    instance.el.setAttribute(
      "animation__stand_rot_return",
      `property: rotation; to: ${toRot}; dur: ${INSPECTION_TIMINGS.ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.ANIMATION_EASING}`,
    );
  }

  function animatePanelsEntrance(
    instance: MediaStandComponentInstance,
    epoch: number,
  ): void {
    const els = instance.elements;
    if (!els) {
      return;
    }
    if (!isAFrameActive()) {
      els.controlBar.setAttribute("scale", INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE);
      els.billboard.setAttribute("scale", INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE);
      return;
    }

    const panelInAttr = `property: scale; from: ${INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE}; to: ${INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE}; dur: ${INSPECTION_TIMINGS.PANEL_ANIMATION_DURATION_MS}; easing: ${INSPECTION_TIMINGS.PANEL_ANIMATION_EASING}`;
    for (const panel of [els.controlBar, els.billboard]) {
      panel.removeAttribute("animation__panel_out");
      panel.setAttribute("scale", INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE);
      panel.setAttribute("visible", "true");
    }

    const settleVisible = () => {
      if (
        instance.transitionEpoch !== epoch ||
        instance.localState !== InspectionState.INSPECTING ||
        !instance.elements
      ) {
        return;
      }
      if (instance.panelSettleTimer !== null) {
        clearTimeout(instance.panelSettleTimer);
        instance.panelSettleTimer = null;
      }
      instance.panelInCompleteHandler = null;
      instance.elements.controlBar.setAttribute(
        "scale",
        INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE,
      );
      instance.elements.billboard.setAttribute(
        "scale",
        INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE,
      );
    };

    instance.panelInCompleteHandler = settleVisible;
    els.billboard.addEventListener?.("animationcomplete__panel_in", settleVisible, {
      once: true,
    });

    instance.panelDelayTimer = setTimeout(() => {
      instance.panelDelayTimer = null;
      if (
        instance.transitionEpoch !== epoch ||
        instance.localState !== InspectionState.INSPECTING ||
        !instance.elements
      ) {
        return;
      }
      instance.elements.controlBar.setAttribute("animation__panel_in", panelInAttr);
      instance.elements.billboard.setAttribute("animation__panel_in", panelInAttr);

      instance.panelSettleTimer = setTimeout(
        settleVisible,
        INSPECTION_TIMINGS.PANEL_ANIMATION_DURATION_MS +
          INSPECTION_TIMINGS.PANEL_EXIT_TIMEOUT_BUFFER_MS,
      );
    }, INSPECTION_TIMINGS.PANEL_ENTRANCE_DELAY_MS);
  }

  function animatePanelsExit(
    instance: MediaStandComponentInstance,
    epoch: number,
  ): void {
    const els = instance.elements;
    if (!els || !isAFrameActive()) {
      return;
    }

    const panelOutAttr = `property: scale; from: ${INSPECTION_TIMINGS.PANEL_VISIBLE_SCALE}; to: ${INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE}; dur: ${INSPECTION_TIMINGS.PANEL_EXIT_DURATION_MS}; easing: ${INSPECTION_TIMINGS.PANEL_EXIT_EASING}`;
    for (const panel of [els.controlBar, els.billboard]) {
      panel.removeAttribute("animation__panel_in");
      panel.setAttribute("visible", "true");
      panel.setAttribute("animation__panel_out", panelOutAttr);
    }

    const hidePanels = () => {
      if (
        instance.transitionEpoch !== epoch ||
        instance.localState === InspectionState.INSPECTING ||
        !instance.elements
      ) {
        return;
      }
      if (instance.hidePanelTimer !== null) {
        clearTimeout(instance.hidePanelTimer);
        instance.hidePanelTimer = null;
      }
      if (instance.panelOutCompleteHandler) {
        instance.elements.billboard.removeEventListener?.(
          "animationcomplete__panel_out",
          instance.panelOutCompleteHandler,
        );
        instance.panelOutCompleteHandler = null;
      }
      for (const panel of [
        instance.elements.controlBar,
        instance.elements.billboard,
      ]) {
        panel.setAttribute("scale", INSPECTION_TIMINGS.PANEL_HIDDEN_SCALE);
        panel.setAttribute("visible", "false");
      }
    };

    instance.panelOutCompleteHandler = hidePanels;
    els.billboard.addEventListener?.("animationcomplete__panel_out", hidePanels, {
      once: true,
    });
    instance.hidePanelTimer = setTimeout(
      hidePanels,
      INSPECTION_TIMINGS.PANEL_EXIT_DURATION_MS +
        INSPECTION_TIMINGS.PANEL_EXIT_TIMEOUT_BUFFER_MS,
    );
  }

  function triggerSlidePulse(instance: MediaStandComponentInstance): void {
    if (!isAFrameActive() || !instance.elements) {
      return;
    }
    const pulseAttr = `property: scale; from: ${STAND_ANIMATION_TOKENS.SLIDE_PULSE_FROM_SCALE}; to: ${STAND_ANIMATION_TOKENS.SLIDE_PULSE_TO_SCALE}; dur: ${STAND_ANIMATION_TOKENS.SLIDE_PULSE_MS}; easing: easeOutCubic`;
    instance.elements.leftPlane.removeAttribute("animation__slide_pulse");
    instance.elements.leftPlane.setAttribute("animation__slide_pulse", pulseAttr);
    if (instance.elements.rightPlane.getAttribute("visible") === "true") {
      instance.elements.rightPlane.removeAttribute("animation__slide_pulse");
      instance.elements.rightPlane.setAttribute("animation__slide_pulse", pulseAttr);
    }
  }

  return {
    schema: {
      roomId: { type: "string", default: "" },
      standId: { type: "string", default: "" },
      label: { type: "string", default: "" },
      accentColor: { type: "string", default: "#D99B26" },
      viewMode: { type: "string", default: "vr" },
      galleryPosition: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
      galleryRotation: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
      itemsJson: { type: "string", default: "[]" },
    },

    init: function (this: MediaStandComponentInstance) {
      this.exhibitId = `${this.data.roomId}:${this.data.standId}`;
      this.carousel = new MediaCarouselController(
        parseStandItems(this.el, this.data.itemsJson),
      );
      this.localState = InspectionState.IDLE;
      this.ownsActiveVideo = false;
      this.cleanupListeners = [];
      this.transitionEpoch = 0;
      this.panelDelayTimer = null;
      this.panelSettleTimer = null;
      this.hidePanelTimer = null;
      this.panelInCompleteHandler = null;
      this.panelOutCompleteHandler = null;

      this.elements = buildStandDom(
        this.el,
        this.data.accentColor,
        this.data.label,
      );

      const bindClick = (el: HTMLElement, handler: () => void) => {
        const listener = (evt: Event) => {
          evt.stopPropagation();
          handler();
        };
        el.addEventListener("click", listener);
        this.cleanupListeners.push(() => el.removeEventListener("click", listener));
      };

      const bindTextureReady = (plane: HTMLElement) => {
        const readyListener = () => {
          plane.setAttribute("color", "#ffffff");
          plane.setAttribute("material", "shader: flat; color: #ffffff");
        };
        plane.addEventListener("materialtextureloaded", readyListener);
        this.cleanupListeners.push(() =>
          plane.removeEventListener("materialtextureloaded", readyListener),
        );
      };

      bindTextureReady(this.elements.leftPlane);
      bindTextureReady(this.elements.rightPlane);

      bindClick(this.elements.leftPlane, () => {
        if (this.localState === InspectionState.IDLE && !this.carousel.isEmpty()) {
          void this.inspect();
        }
      });
      bindClick(this.elements.prevBtn, () => {
        if (this.localState === InspectionState.INSPECTING) {
          void this.prevSlide();
        }
      });
      bindClick(this.elements.nextBtn, () => {
        if (this.localState === InspectionState.INSPECTING) {
          void this.nextSlide();
        }
      });
      bindClick(this.elements.playBtn, () => {
        if (this.localState === InspectionState.INSPECTING) {
          void this.togglePlay();
        }
      });
      bindClick(this.elements.muteBtn, () => {
        if (this.localState === InspectionState.INSPECTING) {
          this.toggleMute();
        }
      });
      bindClick(this.elements.closeBtn, () => {
        if (this.localState === InspectionState.INSPECTING) {
          this.returnToGallery();
        }
      });

      const controller = resolveInspectionController();
      this.unsubscribeInspection = controller.subscribe((_state, activeExhibit) => {
        if (
          activeExhibit?.id !== this.exhibitId &&
          this.localState !== InspectionState.IDLE
        ) {
          clearPendingStandTransitions(this);
          const epoch = ++this.transitionEpoch;
          if (this.ownsActiveVideo) {
            resolveVideoController().stopAndRelease();
            this.ownsActiveVideo = false;
          }
          this.carousel.reset();
          this.localState = InspectionState.IDLE;
          restoreGalleryTransform(this);
          renderCarouselSlide(this);
          animatePanelsExit(this, epoch);
        }
      });

      renderCarouselSlide(this);
    },

    update: function (
      this: MediaStandComponentInstance,
      oldData: Partial<MediaStandComponentData>,
    ) {
      if (oldData.viewMode !== undefined && oldData.viewMode !== this.data.viewMode) {
        renderCarouselSlide(this);
      }
      if (oldData.itemsJson !== undefined && oldData.itemsJson !== this.data.itemsJson) {
        this.carousel = new MediaCarouselController(
          parseStandItems(this.el, this.data.itemsJson),
        );
        renderCarouselSlide(this);
      }
    },

    remove: function (this: MediaStandComponentInstance) {
      this.transitionEpoch++;
      clearPendingStandTransitions(this);
      for (const cleanup of this.cleanupListeners) {
        cleanup();
      }
      this.cleanupListeners = [];
      this.unsubscribeInspection?.();
      this.unsubscribeInspection = null;

      if (this.ownsActiveVideo) {
        resolveVideoController().stopAndRelease();
        this.ownsActiveVideo = false;
      }
    },

    getLocalState: function (this: MediaStandComponentInstance) {
      return this.localState;
    },

    inspect: async function (this: MediaStandComponentInstance) {
      if (this.carousel.isEmpty() || this.localState === InspectionState.INSPECTING) {
        return;
      }

      const controller = resolveInspectionController();
      if (!controller.focus(this.exhibitId)) {
        return;
      }

      clearPendingStandTransitions(this);
      const epoch = ++this.transitionEpoch;
      this.localState = InspectionState.INSPECTING;
      controller.completeFocus();
      moveStandToInspectionCenter(this, controller);
      renderCarouselSlide(this);
      animatePanelsEntrance(this, epoch);
      prefetchNextSlideAsset(this);
      await syncSlideMediaPlayback(this);
    },

    returnToGallery: function (this: MediaStandComponentInstance) {
      if (this.localState === InspectionState.IDLE) {
        return;
      }

      clearPendingStandTransitions(this);
      const epoch = ++this.transitionEpoch;
      const controller = resolveInspectionController();
      controller.return();
      controller.completeReturn();

      if (this.ownsActiveVideo) {
        resolveVideoController().stopAndRelease();
        this.ownsActiveVideo = false;
      }

      this.carousel.reset();
      this.localState = InspectionState.IDLE;
      restoreGalleryTransform(this);
      renderCarouselSlide(this);
      animatePanelsExit(this, epoch);
    },

    nextSlide: async function (this: MediaStandComponentInstance) {
      if (this.carousel.isEmpty() || this.localState !== InspectionState.INSPECTING) {
        return;
      }
      this.carousel.next();
      renderCarouselSlide(this);
      triggerSlidePulse(this);
      prefetchNextSlideAsset(this);
      await syncSlideMediaPlayback(this);
    },

    prevSlide: async function (this: MediaStandComponentInstance) {
      if (this.carousel.isEmpty() || this.localState !== InspectionState.INSPECTING) {
        return;
      }
      this.carousel.prev();
      renderCarouselSlide(this);
      triggerSlidePulse(this);
      prefetchNextSlideAsset(this);
      await syncSlideMediaPlayback(this);
    },

    togglePlay: async function (this: MediaStandComponentInstance) {
      if (!this.carousel.isCurrentVideo() || this.localState !== InspectionState.INSPECTING) {
        return;
      }
      const videoController = resolveVideoController();
      const nowPlaying = await videoController.togglePause();
      this.carousel.setPlaying(nowPlaying);
      this.carousel.setMuted(videoController.isMuted());
      renderCarouselSlide(this);
    },

    toggleMute: function (this: MediaStandComponentInstance) {
      if (!this.carousel.isCurrentVideo() || this.localState !== InspectionState.INSPECTING) {
        return;
      }
      const videoController = resolveVideoController();
      const nowMuted = videoController.toggleMute();
      this.carousel.setMuted(nowMuted);
      renderCarouselSlide(this);
    },
  };
}

export function registerMediaStandComponent(): void {
  const globalAframe = (
    globalThis as {
      AFRAME?: {
        registerComponent: (name: string, def: unknown) => void;
        components?: Record<string, unknown>;
      };
    }
  ).AFRAME;

  if (globalAframe && !globalAframe.components?.["cv-media-stand"]) {
    globalAframe.registerComponent(
      "cv-media-stand",
      createMediaStandComponentDefinition(),
    );
  }
}

registerMediaStandComponent();
export { INSPECTION_TIMINGS };
