import { ViewMode } from "../../navigation/types";
import {
  DEFAULT_RETICLE_PREFERENCES,
  INSPECTION_TIMINGS,
  InspectionState,
  RENDERER_QUALITY_TOKENS,
  RETICLE_TOKENS,
  type ReticleIdleBehavior,
} from "../constants";
import {
  computeReticleDepthTransform,
  computeReticleProgress,
  computeThetaLengthDeg,
  createInitialGazeReticleState,
  evaluateReticleVisibilityMode,
  resetGazeReticleFuse,
  startGazeReticleFuse,
  type GazeReticleState,
  type ReticleVisibilityMode,
} from "../gaze-reticle-state";
import {
  getSharedReticlePreferencesStore,
  type ReticlePreferencesStore,
} from "../reticle-preferences-store";
import { getSharedInspectionController } from "./inspectable";
import { SfxId } from "../audio/audio-constants";
import { getSharedSfxPlayer } from "../audio/sfx-player";
import { StereoTextureMapper } from "../stereo-mapper";

const RAYCASTER_COMPONENT_NAME = "raycaster";
const COMPONENT_CHANGED_EVENT = "componentchanged";

export interface GazeReticleDependencies {
  readonly nowMs?: () => number;
  readonly getViewMode?: () => string;
  readonly getInspectionState?: () => InspectionState;
  readonly getRaycasterIntersection?: () => number | null;
  readonly getWakeIntersection?: () => number | null;
  readonly reticlePreferencesStore?: ReticlePreferencesStore;
}

export interface GazeReticleComponentData {
  fuseTimeout: number;
  accentColor: string;
}

interface RaycasterComponentLike {
  intersections?: Array<{ distance?: number }>;
  raycaster?: {
    layers?: {
      enable?: (channel: number) => void;
    };
    intersectObjects?: (
      objects: unknown[],
      recursive?: boolean,
    ) => Array<{ distance?: number }>;
  };
}

export interface GazeReticleEntity extends HTMLElement {
  object3D?: {
    renderOrder?: number;
    traverse?: (cb: (node: unknown) => void) => void;
  };
  sceneEl?: HTMLElement | null;
  components?: {
    raycaster?: RaycasterComponentLike;
  };
}

export interface GazeReticleComponentInstance {
  el: GazeReticleEntity;
  data: GazeReticleComponentData;
  reticleState: GazeReticleState;
  accentColor: string;
  viewMode: string;
  visibilityMode: ReticleVisibilityMode;
  sizeMultiplier: number;
  idleBehavior: ReticleIdleBehavior;
  nonInteractiveSinceMs: number | null;
  containerEl: HTMLElement | null;
  idleDotEl: HTMLElement | null;
  idleHaloEl: HTMLElement | null;
  progressRingEl: HTMLElement | null;
  confirmRingEl: HTMLElement | null;
  confirmResetTimer: ReturnType<typeof setTimeout> | null;
  unsubscribeReticlePrefs: (() => void) | null;
  cleanupListeners: Array<() => void>;
  init: () => void;
  tick: () => void;
  setViewMode: (viewMode: string) => void;
  setAccentColor: (color: string) => void;
  resetFuse: () => void;
  remove: () => void;
}

/**
 * Ensures the VR gaze raycaster tests left-eye stereo meshes placed on WebXR layer 1.
 */
function syncRaycasterStereoLayer(el: GazeReticleEntity): void {
  el.components?.raycaster?.raycaster?.layers?.enable?.(
    StereoTextureMapper.THREE_LAYER_LEFT,
  );
}

function applyRenderOrderToEntity(el: GazeReticleEntity): void {
  if (!el.object3D) {
    return;
  }
  el.object3D.renderOrder = RETICLE_TOKENS.RENDER_ORDER;
  if (typeof el.object3D.traverse === "function") {
    el.object3D.traverse((node: unknown) => {
      if (node && typeof node === "object") {
        (node as { renderOrder?: number }).renderOrder =
          RETICLE_TOKENS.RENDER_ORDER;
      }
    });
  }
}

function buildProgressGeometryAttr(thetaLengthDeg: number): string {
  return `primitive: ring; radiusInner: ${RETICLE_TOKENS.PROGRESS_RING_RADIUS_INNER}; radiusOuter: ${RETICLE_TOKENS.PROGRESS_RING_RADIUS_OUTER}; segmentsTheta: ${RENDERER_QUALITY_TOKENS.CIRCLE_SEGMENTS}; thetaStart: ${RETICLE_TOKENS.PROGRESS_THETA_START_DEG}; thetaLength: ${thetaLengthDeg}`;
}

function isElementAncestorVisible(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current) {
    if (current.getAttribute("visible") === "false") {
      return false;
    }
    const obj = (current as unknown as { object3D?: { visible?: boolean } }).object3D;
    if (obj && obj.visible === false) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function readDefaultClickableDistance(el: GazeReticleEntity): number | null {
  const dist = el.components?.raycaster?.intersections?.[0]?.distance;
  return typeof dist === "number" && Number.isFinite(dist) && dist > 0 ? dist : null;
}

function readDefaultWakeDistance(el: GazeReticleEntity): number | null {
  const threeRaycaster = el.components?.raycaster?.raycaster;
  const root: ParentNode | null = el.sceneEl ?? (typeof document !== "undefined" ? document : null);
  if (
    !threeRaycaster ||
    typeof threeRaycaster.intersectObjects !== "function" ||
    !root
  ) {
    return null;
  }
  const wakeNodes = Array.from(
    root.querySelectorAll("[data-reticle-wake='true']"),
  ) as GazeReticleEntity[];
  const wakeObjects: unknown[] = [];
  for (const node of wakeNodes) {
    if (node.object3D && isElementAncestorVisible(node)) {
      wakeObjects.push(node.object3D);
    }
  }
  if (wakeObjects.length === 0) {
    return null;
  }
  const hits = threeRaycaster.intersectObjects(wakeObjects, true);
  const dist = hits?.[0]?.distance;
  return typeof dist === "number" && Number.isFinite(dist) && dist > 0 ? dist : null;
}

function applyVisibilityStyle(
  instance: GazeReticleComponentInstance,
  mode: ReticleVisibilityMode,
): void {
  const isVisible =
    mode === "ACTIVE" || mode === "GUIDE" || mode === "CINEMA_DIM";
  instance.containerEl?.setAttribute("visible", isVisible ? "true" : "false");
  if (!isVisible) {
    return;
  }
  const opacityFactor =
    mode === "GUIDE"
      ? RETICLE_TOKENS.GUIDE_OPACITY
      : mode === "CINEMA_DIM"
        ? RETICLE_TOKENS.DIM_OPACITY
        : null;
  const dotOpacity = opacityFactor !== null ? opacityFactor : 0.95;
  const haloOpacity =
    opacityFactor !== null
      ? Number((RETICLE_TOKENS.IDLE_HALO_OPACITY * opacityFactor).toFixed(2))
      : RETICLE_TOKENS.IDLE_HALO_OPACITY;
  instance.idleDotEl?.setAttribute(
    "material",
    `shader: flat; color: ${RETICLE_TOKENS.IDLE_DOT_COLOR}; opacity: ${dotOpacity}; transparent: true; depthTest: false`,
  );
  instance.idleHaloEl?.setAttribute(
    "material",
    `shader: flat; color: ${RETICLE_TOKENS.IDLE_HALO_COLOR}; opacity: ${haloOpacity}; transparent: true; depthTest: false`,
  );
}

export function createGazeReticleComponentDefinition(
  deps: GazeReticleDependencies = {},
) {
  const resolveNowMs = deps.nowMs ?? (() => Date.now());
  const resolveInspectionState =
    deps.getInspectionState ?? (() => getSharedInspectionController().getState());
  const resolveReticlePrefs = () =>
    deps.reticlePreferencesStore ?? getSharedReticlePreferencesStore();

  return {
    schema: {
      fuseTimeout: {
        type: "number",
        default: INSPECTION_TIMINGS.FUSE_TIMEOUT_MS,
      },
      accentColor: {
        type: "string",
        default: RETICLE_TOKENS.DEFAULT_ACCENT_COLOR,
      },
    },

    init: function (this: GazeReticleComponentInstance) {
      this.reticleState = createInitialGazeReticleState();
      this.accentColor =
        this.data?.accentColor || RETICLE_TOKENS.DEFAULT_ACCENT_COLOR;
      this.viewMode = deps.getViewMode ? deps.getViewMode() : ViewMode.VR;
      this.visibilityMode =
        this.viewMode === ViewMode.VR ? "GUIDE" : "HIDDEN";
      const reticleStore = resolveReticlePrefs();
      const initialResolved = reticleStore.getResolvedConfig();
      this.sizeMultiplier = initialResolved.sizeMultiplier;
      this.idleBehavior = initialResolved.idleBehavior ?? DEFAULT_RETICLE_PREFERENCES.idleBehavior;
      this.nonInteractiveSinceMs =
        this.viewMode === ViewMode.VR ? resolveNowMs() : null;
      this.confirmResetTimer = null;
      this.unsubscribeReticlePrefs = null;
      this.cleanupListeners = [];

      const initialTransform = computeReticleDepthTransform(
        null,
        this.sizeMultiplier,
      );
      const container = document.createElement("a-entity") as GazeReticleEntity;
      container.setAttribute("class", "cv-gaze-reticle-group");
      container.setAttribute("position", `0 0 ${initialTransform.z}`);
      container.setAttribute(
        "scale",
        `${initialTransform.scale} ${initialTransform.scale} ${initialTransform.scale}`,
      );
      container.setAttribute(
        "visible",
        this.visibilityMode === "ACTIVE" ? "true" : "false",
      );

      const idleHalo = document.createElement("a-entity") as GazeReticleEntity;
      idleHalo.setAttribute("class", "cv-reticle-halo");
      idleHalo.setAttribute(
        "geometry",
        `primitive: ring; radiusInner: ${RETICLE_TOKENS.IDLE_HALO_RADIUS_INNER}; radiusOuter: ${RETICLE_TOKENS.IDLE_HALO_RADIUS_OUTER}; segmentsTheta: ${RENDERER_QUALITY_TOKENS.CIRCLE_SEGMENTS}`,
      );
      idleHalo.setAttribute(
        "material",
        `shader: flat; color: ${RETICLE_TOKENS.IDLE_HALO_COLOR}; opacity: ${RETICLE_TOKENS.IDLE_HALO_OPACITY}; transparent: true; depthTest: false`,
      );

      const idleDot = document.createElement("a-entity") as GazeReticleEntity;
      idleDot.setAttribute("class", "cv-reticle-dot");
      idleDot.setAttribute(
        "geometry",
        `primitive: circle; radius: ${RETICLE_TOKENS.IDLE_DOT_RADIUS}; segments: ${RENDERER_QUALITY_TOKENS.CIRCLE_SEGMENTS}`,
      );
      idleDot.setAttribute(
        "material",
        `shader: flat; color: ${RETICLE_TOKENS.IDLE_DOT_COLOR}; opacity: 0.95; transparent: true; depthTest: false`,
      );

      const progressRing = document.createElement("a-entity") as GazeReticleEntity;
      progressRing.setAttribute("class", "cv-reticle-progress");
      progressRing.setAttribute("visible", "false");
      progressRing.setAttribute("geometry", buildProgressGeometryAttr(0));
      progressRing.setAttribute(
        "material",
        `shader: flat; color: ${this.accentColor}; opacity: 0.95; transparent: true; depthTest: false; side: double`,
      );

      const confirmRing = document.createElement("a-entity") as GazeReticleEntity;
      confirmRing.setAttribute("class", "cv-reticle-confirm");
      confirmRing.setAttribute("visible", "false");
      confirmRing.setAttribute("scale", RETICLE_TOKENS.BASE_SCALE);
      confirmRing.setAttribute(
        "geometry",
        `primitive: ring; radiusInner: ${RETICLE_TOKENS.CONFIRM_RING_RADIUS_INNER}; radiusOuter: ${RETICLE_TOKENS.CONFIRM_RING_RADIUS_OUTER}; segmentsTheta: ${RENDERER_QUALITY_TOKENS.CIRCLE_SEGMENTS}`,
      );
      confirmRing.setAttribute(
        "material",
        `shader: flat; color: ${this.accentColor}; opacity: 0.9; transparent: true; depthTest: false`,
      );

      container.append(idleHalo, idleDot, progressRing, confirmRing);
      this.el.appendChild(container);

      this.containerEl = container;
      this.idleHaloEl = idleHalo;
      this.idleDotEl = idleDot;
      this.progressRingEl = progressRing;
      this.confirmRingEl = confirmRing;
      applyVisibilityStyle(this, this.visibilityMode);

      const enforceOrder = () => {
        applyRenderOrderToEntity(this.el);
        applyRenderOrderToEntity(container);
        applyRenderOrderToEntity(idleHalo);
        applyRenderOrderToEntity(idleDot);
        applyRenderOrderToEntity(progressRing);
        applyRenderOrderToEntity(confirmRing);
        syncRaycasterStereoLayer(this.el);
      };
      enforceOrder();

      const bind = (
        target: EventTarget,
        eventName: string,
        handler: EventListener,
      ) => {
        target.addEventListener(eventName, handler);
        this.cleanupListeners.push(() =>
          target.removeEventListener(eventName, handler),
        );
      };

      bind(this.el, "object3dset", enforceOrder);
      bind(container, "object3dset", enforceOrder);
      bind(this.el, COMPONENT_CHANGED_EVENT, (evt: Event) => {
        const changedName = (evt as CustomEvent<{ name?: string }>).detail?.name;
        if (changedName === RAYCASTER_COMPONENT_NAME) {
          syncRaycasterStereoLayer(this.el);
        }
      });

      bind(this.el, "fusing", () => {
        this.reticleState = startGazeReticleFuse(resolveNowMs());
        this.progressRingEl?.setAttribute("geometry", buildProgressGeometryAttr(0));
        this.progressRingEl?.setAttribute("visible", "true");
      });

      bind(this.el, "mouseleave", () => {
        this.resetFuse();
      });

      bind(this.el, "state-removed", (evt: Event) => {
        const detail = (evt as CustomEvent<{ state?: string } | string>).detail;
        const removedState =
          typeof detail === "string" ? detail : detail?.state;
        if (removedState === "cursor-fusing") {
          this.resetFuse();
        }
      });

      bind(this.el, "click", () => {
        getSharedSfxPlayer().play(SfxId.RETICLE_FUSE);
        this.resetFuse();
        if (this.confirmResetTimer !== null) {
          clearTimeout(this.confirmResetTimer);
          this.confirmResetTimer = null;
        }
        if (this.confirmRingEl) {
          this.confirmRingEl.setAttribute("visible", "true");
          this.confirmRingEl.removeAttribute("animation__reticle_pulse");
          this.confirmRingEl.setAttribute(
            "animation__reticle_pulse",
            `property: scale; from: ${RETICLE_TOKENS.BASE_SCALE}; to: ${RETICLE_TOKENS.CONFIRM_PULSE_SCALE}; dur: ${RETICLE_TOKENS.CONFIRM_PULSE_MS}; easing: easeOutCubic`,
          );
          this.confirmResetTimer = setTimeout(() => {
            this.confirmResetTimer = null;
            this.confirmRingEl?.setAttribute("visible", "false");
            this.confirmRingEl?.setAttribute("scale", RETICLE_TOKENS.BASE_SCALE);
          }, RETICLE_TOKENS.CONFIRM_PULSE_MS + 10);
        }
      });

      this.unsubscribeReticlePrefs = reticleStore.subscribe((_prefs, resolved) => {
        const fuseChanged = this.data?.fuseTimeout !== resolved.fuseTimeoutMs;
        this.sizeMultiplier = resolved.sizeMultiplier;
        this.idleBehavior = resolved.idleBehavior;
        if (this.data) {
          this.data.fuseTimeout = resolved.fuseTimeoutMs;
        }
        this.el.setAttribute("fuse-timeout", String(resolved.fuseTimeoutMs));
        if (fuseChanged && this.reticleState.isFusing) {
          this.resetFuse();
        }
      });
    },

    resetFuse: function (this: GazeReticleComponentInstance) {
      if (!this.reticleState.isFusing && this.reticleState.lastProgress === 0) {
        this.progressRingEl?.setAttribute("visible", "false");
        return;
      }
      this.reticleState = resetGazeReticleFuse();
      this.progressRingEl?.setAttribute("geometry", buildProgressGeometryAttr(0));
      this.progressRingEl?.setAttribute("visible", "false");
    },

    setAccentColor: function (
      this: GazeReticleComponentInstance,
      color: string,
    ) {
      const resolvedColor = color || RETICLE_TOKENS.DEFAULT_ACCENT_COLOR;
      this.accentColor = resolvedColor;
      this.progressRingEl?.setAttribute(
        "material",
        `shader: flat; color: ${resolvedColor}; opacity: 0.95; transparent: true; depthTest: false; side: double`,
      );
      this.confirmRingEl?.setAttribute(
        "material",
        `shader: flat; color: ${resolvedColor}; opacity: 0.9; transparent: true; depthTest: false`,
      );
    },

    setViewMode: function (
      this: GazeReticleComponentInstance,
      viewMode: string,
    ) {
      this.viewMode = viewMode;
      if (viewMode !== ViewMode.VR) {
        this.nonInteractiveSinceMs = null;
        this.resetFuse();
        this.visibilityMode = "HIDDEN";
        applyVisibilityStyle(this, "HIDDEN");
        return;
      }
      this.nonInteractiveSinceMs = resolveNowMs();
      this.visibilityMode = "GUIDE";
      applyVisibilityStyle(this, "GUIDE");
    },

    tick: function (this: GazeReticleComponentInstance) {
      syncRaycasterStereoLayer(this.el);
      const now = resolveNowMs();
      const activeViewMode = deps.getViewMode ? deps.getViewMode() : this.viewMode;
      const isInspecting =
        resolveInspectionState() === InspectionState.INSPECTING;

      const clickableDist = deps.getRaycasterIntersection
        ? deps.getRaycasterIntersection()
        : readDefaultClickableDistance(this.el);
      const hasClickableHit = clickableDist !== null;

      let wakeDist: number | null = null;
      if (activeViewMode === ViewMode.VR && !hasClickableHit) {
        wakeDist = deps.getWakeIntersection
          ? deps.getWakeIntersection()
          : readDefaultWakeDistance(this.el);
      }
      const hasWakeZoneHit = wakeDist !== null;

      if (
        activeViewMode === ViewMode.VR &&
        !hasClickableHit &&
        !hasWakeZoneHit &&
        !this.reticleState.isFusing
      ) {
        if (this.nonInteractiveSinceMs === null) {
          this.nonInteractiveSinceMs = now;
        }
      } else {
        this.nonInteractiveSinceMs = null;
      }

      const nextVisibilityMode = evaluateReticleVisibilityMode({
        viewMode: activeViewMode,
        isInspecting,
        hasClickableHit,
        hasWakeZoneHit,
        isFusing: this.reticleState.isFusing,
        nonInteractiveSinceMs: this.nonInteractiveSinceMs,
        nowMs: now,
        idleBehavior: this.idleBehavior,
      });

      if (nextVisibilityMode !== this.visibilityMode) {
        this.visibilityMode = nextVisibilityMode;
        applyVisibilityStyle(this, nextVisibilityMode);
      }

      if (this.containerEl) {
        const hitDist = hasClickableHit ? clickableDist : wakeDist;
        const depthTransform = computeReticleDepthTransform(
          hitDist,
          this.sizeMultiplier,
        );
        this.containerEl.setAttribute("position", `0 0 ${depthTransform.z}`);
        this.containerEl.setAttribute(
          "scale",
          `${depthTransform.scale} ${depthTransform.scale} ${depthTransform.scale}`,
        );
      }

      if (!this.reticleState.isFusing || !this.progressRingEl) {
        return;
      }
      const fuseTimeoutMs =
        this.data?.fuseTimeout || INSPECTION_TIMINGS.FUSE_TIMEOUT_MS;
      const elapsedMs = now - this.reticleState.fuseStartMs;
      const progress = computeReticleProgress(elapsedMs, fuseTimeoutMs);
      if (
        Math.abs(progress - this.reticleState.lastProgress) <
          RETICLE_TOKENS.MIN_PROGRESS_EPSILON &&
        progress < 1
      ) {
        return;
      }
      this.reticleState = {
        ...this.reticleState,
        lastProgress: progress,
      };
      this.progressRingEl.setAttribute(
        "geometry",
        buildProgressGeometryAttr(computeThetaLengthDeg(progress)),
      );
    },

    remove: function (this: GazeReticleComponentInstance) {
      if (this.confirmResetTimer !== null) {
        clearTimeout(this.confirmResetTimer);
        this.confirmResetTimer = null;
      }
      this.unsubscribeReticlePrefs?.();
      this.unsubscribeReticlePrefs = null;
      for (const cleanup of this.cleanupListeners) {
        cleanup();
      }
      this.cleanupListeners = [];
      this.containerEl?.remove();
      this.containerEl = null;
      this.idleDotEl = null;
      this.idleHaloEl = null;
      this.progressRingEl = null;
      this.confirmRingEl = null;
    },
  };
}

export function registerGazeReticleComponent(
  deps?: GazeReticleDependencies,
): void {
  const globalAFrame = (
    globalThis as unknown as {
      AFRAME?: {
        components?: Record<string, unknown>;
        registerComponent: (name: string, def: unknown) => void;
      };
    }
  ).AFRAME;

  if (
    globalAFrame &&
    typeof globalAFrame.registerComponent === "function" &&
    !globalAFrame.components?.["cv-gaze-reticle"]
  ) {
    globalAFrame.registerComponent(
      "cv-gaze-reticle",
      createGazeReticleComponentDefinition(deps),
    );
  }
}

if (typeof globalThis !== "undefined") {
  registerGazeReticleComponent();
}
