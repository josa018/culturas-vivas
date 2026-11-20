import {
  INSPECTION_TIMINGS,
  RENDERER_QUALITY_TOKENS,
  RETICLE_TOKENS,
} from "../constants";
import {
  computeReticleProgress,
  computeThetaLengthDeg,
  createInitialGazeReticleState,
  resetGazeReticleFuse,
  startGazeReticleFuse,
  type GazeReticleState,
} from "../gaze-reticle-state";

export interface GazeReticleDependencies {
  readonly nowMs?: () => number;
}

export interface GazeReticleComponentData {
  fuseTimeout: number;
  accentColor: string;
}

export interface GazeReticleEntity extends HTMLElement {
  object3D?: {
    renderOrder?: number;
    traverse?: (cb: (node: unknown) => void) => void;
  };
}

export interface GazeReticleComponentInstance {
  el: GazeReticleEntity;
  data: GazeReticleComponentData;
  reticleState: GazeReticleState;
  accentColor: string;
  containerEl: HTMLElement | null;
  idleDotEl: HTMLElement | null;
  idleHaloEl: HTMLElement | null;
  progressRingEl: HTMLElement | null;
  confirmRingEl: HTMLElement | null;
  confirmResetTimer: ReturnType<typeof setTimeout> | null;
  cleanupListeners: Array<() => void>;
  init: () => void;
  tick: () => void;
  setAccentColor: (color: string) => void;
  resetFuse: () => void;
  remove: () => void;
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

export function createGazeReticleComponentDefinition(
  deps: GazeReticleDependencies = {},
) {
  const resolveNowMs = deps.nowMs ?? (() => Date.now());

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
      this.confirmResetTimer = null;
      this.cleanupListeners = [];

      const container = document.createElement("a-entity") as GazeReticleEntity;
      container.setAttribute("class", "cv-gaze-reticle-group");
      container.setAttribute("position", `0 0 ${RETICLE_TOKENS.RING_Z_OFFSET}`);

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

      const enforceOrder = () => {
        applyRenderOrderToEntity(this.el);
        applyRenderOrderToEntity(container);
        applyRenderOrderToEntity(idleHalo);
        applyRenderOrderToEntity(idleDot);
        applyRenderOrderToEntity(progressRing);
        applyRenderOrderToEntity(confirmRing);
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

    tick: function (this: GazeReticleComponentInstance) {
      if (!this.reticleState.isFusing || !this.progressRingEl) {
        return;
      }
      const fuseTimeoutMs =
        this.data?.fuseTimeout || INSPECTION_TIMINGS.FUSE_TIMEOUT_MS;
      const elapsedMs = resolveNowMs() - this.reticleState.fuseStartMs;
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
