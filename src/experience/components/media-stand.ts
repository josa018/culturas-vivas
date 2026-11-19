import { computeContainDimensions } from "../aspect-ratio";
import {
  EXHIBIT_DICTIONARY,
  EXHIBIT_DIMENSIONS,
  INSPECTION_TIMINGS,
  InspectionState,
  SHARED_VIDEO_ELEMENT_ID,
  STAND_DICTIONARY,
  STAND_DIMENSIONS,
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
import { getSharedInspectionController } from "./inspectable";

const STAND_VISUAL_TOKENS = {
  SURFACE_COLOR: "#0f172a",
  HEADER_BG_COLOR: "#1e293b",
  TEXT_PRIMARY: "#EDE8DF",
  TEXT_MUTED: "#94a3b8",
  CLOSE_BG_COLOR: "#ef4444",
  CONTROL_BG_COLOR: "#1e293b",
  CONTROL_TEXT_COLOR: "#f8fafc",
  COUNTER_TEXT_COLOR: "#cbd5e1",
  HEADER_OFFSET_Y: 0.62,
  CONTROL_BTN_STEP_X: 0.24,
  PREV_BTN_X: -0.42,
  COUNTER_X: -0.18,
  NEXT_BTN_X: 0.06,
  PLAY_BTN_X: 0.3,
  MUTE_BTN_X: 0.5,
  CLOSE_BTN_X: 0.72,
  VIDEO_BADGE_POS: "0.52 0.38 0.03",
  COUNT_BADGE_POS: "0.48 0.62 0.03",
  HEADER_TEXT_POS: "-0.16 0.62 0.03",
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
  btn.setAttribute("position", `${x} 0 0.02`);
  btn.setAttribute("visible", "false");

  const bg = document.createElement("a-plane");
  bg.setAttribute("width", String(STAND_DIMENSIONS.CONTROL_BTN_SIZE_M));
  bg.setAttribute("height", String(STAND_DIMENSIONS.CONTROL_BTN_SIZE_M));
  bg.setAttribute("color", bgColor);
  bg.setAttribute("material", "shader: flat");

  const label = document.createElement("a-text");
  label.setAttribute("class", `${className}-label`);
  label.setAttribute("value", iconText);
  label.setAttribute("align", "center");
  label.setAttribute("color", textColor);
  label.setAttribute("width", "1.4");
  label.setAttribute("position", "0 0 0.01");

  btn.append(bg, label);
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

  const headerBg = document.createElement("a-plane");
  headerBg.setAttribute("class", "cv-stand-header-bg");
  headerBg.setAttribute("width", String(frameWidth));
  headerBg.setAttribute("height", String(STAND_DIMENSIONS.HEADER_HEIGHT_M));
  headerBg.setAttribute("position", `0 ${STAND_VISUAL_TOKENS.HEADER_OFFSET_Y} 0`);
  headerBg.setAttribute("color", STAND_VISUAL_TOKENS.HEADER_BG_COLOR);
  headerBg.setAttribute("material", "shader: flat");

  const headerText = document.createElement("a-text");
  headerText.setAttribute("class", "cv-stand-header");
  headerText.setAttribute("value", categoryLabel);
  headerText.setAttribute("align", "left");
  headerText.setAttribute("color", accentColor);
  headerText.setAttribute("width", "1.8");
  headerText.setAttribute("position", STAND_VISUAL_TOKENS.HEADER_TEXT_POS);

  const countBadge = document.createElement("a-text");
  countBadge.setAttribute("class", "cv-stand-count-badge");
  countBadge.setAttribute("value", "");
  countBadge.setAttribute("align", "right");
  countBadge.setAttribute("color", STAND_VISUAL_TOKENS.TEXT_MUTED);
  countBadge.setAttribute("width", "1.2");
  countBadge.setAttribute("position", STAND_VISUAL_TOKENS.COUNT_BADGE_POS);

  const videoBadge = document.createElement("a-text");
  videoBadge.setAttribute("class", "cv-stand-video-badge");
  videoBadge.setAttribute("value", STAND_DICTIONARY.VIDEO_BADGE);
  videoBadge.setAttribute("align", "right");
  videoBadge.setAttribute("color", accentColor);
  videoBadge.setAttribute("width", "1.1");
  videoBadge.setAttribute("position", STAND_VISUAL_TOKENS.VIDEO_BADGE_POS);
  videoBadge.setAttribute("visible", "false");

  const emptyPlaceholder = document.createElement("a-text");
  emptyPlaceholder.setAttribute("class", "cv-stand-empty-placeholder");
  emptyPlaceholder.setAttribute("value", STAND_DICTIONARY.EMPTY_PLACEHOLDER);
  emptyPlaceholder.setAttribute("align", "center");
  emptyPlaceholder.setAttribute("color", STAND_VISUAL_TOKENS.TEXT_PRIMARY);
  emptyPlaceholder.setAttribute("width", "1.8");
  emptyPlaceholder.setAttribute("position", "0 0 0.03");
  emptyPlaceholder.setAttribute("visible", "false");

  const leftPlane = document.createElement("a-plane");
  leftPlane.setAttribute("class", "cv-stand-left-plane");
  leftPlane.setAttribute("width", String(STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M));
  leftPlane.setAttribute("height", String(STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M));
  leftPlane.setAttribute("position", "0 0 0.01");
  leftPlane.setAttribute("material", "shader: flat");
  leftPlane.setAttribute("visible", "false");

  const rightPlane = document.createElement("a-plane");
  rightPlane.setAttribute("class", "cv-stand-right-plane");
  rightPlane.setAttribute("width", String(STAND_DIMENSIONS.MAX_MEDIA_WIDTH_M));
  rightPlane.setAttribute("height", String(STAND_DIMENSIONS.MAX_MEDIA_HEIGHT_M));
  rightPlane.setAttribute("position", "0 0 0.01");
  rightPlane.setAttribute("material", "shader: flat");
  rightPlane.setAttribute("visible", "false");

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
  const counterText = document.createElement("a-text");
  counterText.setAttribute("class", "cv-stand-counter");
  counterText.setAttribute("value", "0 / 0");
  counterText.setAttribute("align", "center");
  counterText.setAttribute("color", STAND_VISUAL_TOKENS.COUNTER_TEXT_COLOR);
  counterText.setAttribute("width", "1.3");
  counterText.setAttribute("position", `${STAND_VISUAL_TOKENS.COUNTER_X} 0 0.02`);

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

  controlBar.append(prevBtn, counterText, nextBtn, playBtn, muteBtn, closeBtn);

  const billboard = document.createElement("a-entity");
  billboard.setAttribute("class", "cv-stand-billboard");
  billboard.setAttribute("position", `0 ${STAND_DIMENSIONS.BILLBOARD_OFFSET_Y} 0.02`);
  billboard.setAttribute("visible", "false");

  const billboardBg = document.createElement("a-plane");
  billboardBg.setAttribute("width", String(EXHIBIT_DIMENSIONS.BILLBOARD_WIDTH));
  billboardBg.setAttribute("height", String(EXHIBIT_DIMENSIONS.BILLBOARD_HEIGHT));
  billboardBg.setAttribute("color", STAND_VISUAL_TOKENS.SURFACE_COLOR);
  billboardBg.setAttribute("material", "shader: flat; opacity: 0.92; transparent: true");

  const billboardTitle = document.createElement("a-text");
  billboardTitle.setAttribute("class", "cv-stand-billboard-title");
  billboardTitle.setAttribute("value", "");
  billboardTitle.setAttribute("align", "left");
  billboardTitle.setAttribute("color", accentColor);
  billboardTitle.setAttribute("width", "1.45");
  billboardTitle.setAttribute("position", "-0.7 0.16 0.02");

  const billboardCreator = document.createElement("a-text");
  billboardCreator.setAttribute("class", "cv-stand-billboard-creator");
  billboardCreator.setAttribute("value", "");
  billboardCreator.setAttribute("align", "left");
  billboardCreator.setAttribute("color", STAND_VISUAL_TOKENS.TEXT_MUTED);
  billboardCreator.setAttribute("width", "1.2");
  billboardCreator.setAttribute("position", "-0.7 0.02 0.02");
  billboardCreator.setAttribute("visible", "false");

  const billboardDesc = document.createElement("a-text");
  billboardDesc.setAttribute("class", "cv-stand-billboard-desc");
  billboardDesc.setAttribute("value", "");
  billboardDesc.setAttribute("align", "left");
  billboardDesc.setAttribute("color", STAND_VISUAL_TOKENS.TEXT_PRIMARY);
  billboardDesc.setAttribute("width", "1.35");
  billboardDesc.setAttribute("wrap-count", "38");
  billboardDesc.setAttribute("position", "-0.7 -0.14 0.02");

  billboard.append(billboardBg, billboardTitle, billboardCreator, billboardDesc);

  root.replaceChildren(
    frame,
    headerBg,
    headerText,
    countBadge,
    videoBadge,
    emptyPlaceholder,
    leftPlane,
    rightPlane,
    controlBar,
    billboard,
  );

  return {
    frame,
    headerBg,
    headerText,
    countBadge,
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
    els.countBadge.setAttribute("value", formatItemCount(instance.carousel.getCount()));

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
    els.counterText.setAttribute("value", instance.carousel.getCounterLabel());
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

    els.playBtn
      .querySelector(".cv-stand-play-btn-label")
      ?.setAttribute(
        "value",
        instance.carousel.isPlaying()
          ? STAND_DICTIONARY.PAUSE_ICON
          : STAND_DICTIONARY.PLAY_ICON,
      );
    els.muteBtn
      .querySelector(".cv-stand-mute-btn-label")
      ?.setAttribute(
        "value",
        instance.carousel.isMuted()
          ? STAND_DICTIONARY.MUTE_ICON
          : STAND_DICTIONARY.UNMUTE_ICON,
      );

    els.billboard.setAttribute("visible", String(isInspecting));
    els.billboardTitle.setAttribute("value", item.title);
    els.billboardDesc.setAttribute("value", item.description);

    const cleanCreator = item.creatorName.trim();
    if (cleanCreator.length > 0) {
      els.billboardCreator.setAttribute(
        "value",
        `${EXHIBIT_DICTIONARY.CREATOR_PREFIX}${cleanCreator}`,
      );
      els.billboardCreator.setAttribute("visible", "true");
    } else {
      els.billboardCreator.setAttribute("value", "");
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
    const target = controller.calculateRadialTargetPosition(
      instance.data.galleryPosition,
    );
    const dx = -target.x;
    const dz = -target.z;
    const yawDeg =
      Math.atan2(dx, dz) * STAND_VISUAL_TOKENS.ROTATION_RAD_TO_DEG;

    applyTransform(instance.el, target, {
      x: 0,
      y: yawDeg,
      z: 0,
    });
  }

  function restoreGalleryTransform(instance: MediaStandComponentInstance): void {
    applyTransform(
      instance.el,
      instance.data.galleryPosition,
      instance.data.galleryRotation,
    );
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
          if (this.ownsActiveVideo) {
            resolveVideoController().stopAndRelease();
            this.ownsActiveVideo = false;
          }
          this.carousel.reset();
          this.localState = InspectionState.IDLE;
          restoreGalleryTransform(this);
          renderCarouselSlide(this);
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

      this.localState = InspectionState.INSPECTING;
      controller.completeFocus();
      moveStandToInspectionCenter(this, controller);
      renderCarouselSlide(this);
      prefetchNextSlideAsset(this);
      await syncSlideMediaPlayback(this);
    },

    returnToGallery: function (this: MediaStandComponentInstance) {
      if (this.localState === InspectionState.IDLE) {
        return;
      }

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
    },

    nextSlide: async function (this: MediaStandComponentInstance) {
      if (this.carousel.isEmpty() || this.localState !== InspectionState.INSPECTING) {
        return;
      }
      this.carousel.next();
      renderCarouselSlide(this);
      prefetchNextSlideAsset(this);
      await syncSlideMediaPlayback(this);
    },

    prevSlide: async function (this: MediaStandComponentInstance) {
      if (this.carousel.isEmpty() || this.localState !== InspectionState.INSPECTING) {
        return;
      }
      this.carousel.prev();
      renderCarouselSlide(this);
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
