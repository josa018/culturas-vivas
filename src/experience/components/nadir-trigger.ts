import {
  VR_HUD_COLORS,
  VR_HUD_DICTIONARY,
  VR_HUD_ELEMENT_IDS,
  VR_HUD_GEOMETRY,
  VR_HUD_SUMMON_PITCH_THRESHOLD_DEG,
  VR_HUD_SUMMON_TIMEOUT_MS,
} from "../constants";

export const NADIR_SUMMON_EVENT = "cv-nadir-summon";

export interface NadirTriggerEntity extends HTMLElement {
  object3D?: {
    visible?: boolean;
    position?: { x: number; y: number; z: number };
  };
  sceneEl?: HTMLElement;
}

export interface NadirTriggerComponentInstance {
  el: NadirTriggerEntity;
  data?: {
    enabled?: boolean;
  };
  enabled: boolean;
  isGlyphVisible: boolean;
  isGazingAtGlyph: boolean;
  dwellElapsedMs: number;
  hasSummonedInCurrentDwell: boolean;
  onSummon?: () => void;
  progressRingEl: HTMLElement | null;
  init: () => void;
  setEnabled: (enabled: boolean) => void;
  setSummonHandler: (handler?: () => void) => void;
  evaluatePitchAndDwell: (pitchDeg: number, timeDeltaMs: number) => void;
  triggerSummon: () => void;
  tick: (time: number, timeDelta: number) => void;
  remove: () => void;
}

/**
 * Pure boundary check verifying whether camera pitch meets or falls below
 * the nadir summon threshold.
 */
export function isNadirPitchReached(pitchDeg: number): boolean {
  return pitchDeg <= VR_HUD_SUMMON_PITCH_THRESHOLD_DEG;
}

/**
 * Extracts camera pitch in degrees from an A-Frame camera element.
 */
export function extractCameraPitchDeg(
  cameraEl: HTMLElement | null | undefined,
): number {
  if (!cameraEl) {
    return 0;
  }
  const obj3D = (
    cameraEl as unknown as {
      object3D?: { rotation?: { x?: number } };
    }
  ).object3D;
  const rotX = obj3D?.rotation?.x;
  if (typeof rotX !== "number" || Number.isNaN(rotX)) {
    return 0;
  }
  return (rotX * 180) / Math.PI;
}

export function createNadirTriggerComponentDefinition() {
  return {
    schema: {
      enabled: { type: "boolean", default: true },
    },

    init: function (this: NadirTriggerComponentInstance) {
      this.enabled = this.data?.enabled ?? true;
      this.isGlyphVisible = false;
      this.isGazingAtGlyph = false;
      this.dwellElapsedMs = 0;
      this.hasSummonedInCurrentDwell = false;
      this.progressRingEl = null;

      this.el.setAttribute(
        "position",
        `0 ${VR_HUD_GEOMETRY.RUNE_FLOOR_Y_OFFSET_M} 0`,
      );
      this.el.setAttribute("visible", "false");
      if (this.el.object3D) {
        this.el.object3D.visible = false;
      }

      // Ornamental Nierika floor glyph oriented horizontally
      const runeGroup = document.createElement("a-entity");
      runeGroup.setAttribute("id", VR_HUD_ELEMENT_IDS.NADIR_RUNE);
      runeGroup.setAttribute("rotation", "-90 0 0");

      const outerRing = document.createElement("a-ring");
      outerRing.setAttribute(
        "radius-inner",
        String(VR_HUD_GEOMETRY.RUNE_INNER_RADIUS_M),
      );
      outerRing.setAttribute(
        "radius-outer",
        String(VR_HUD_GEOMETRY.RUNE_RADIUS_M),
      );
      outerRing.setAttribute("color", VR_HUD_COLORS.ACCENT_CEMPASUCHIL);
      outerRing.setAttribute("material", "shader: flat; side: double");

      const hitDisc = document.createElement("a-circle");
      hitDisc.setAttribute("class", "cv-nadir-hit clickable");
      hitDisc.setAttribute("radius", String(VR_HUD_GEOMETRY.RUNE_RADIUS_M));
      hitDisc.setAttribute(
        "material",
        `shader: flat; color: ${VR_HUD_COLORS.SURFACE_OBSIDIAN}; opacity: 0.72; transparent: true`,
      );

      const progressRing = document.createElement("a-ring");
      progressRing.setAttribute("id", VR_HUD_ELEMENT_IDS.NADIR_PROGRESS_RING);
      progressRing.setAttribute(
        "radius-inner",
        String(VR_HUD_GEOMETRY.RUNE_INNER_RADIUS_M - 0.04),
      );
      progressRing.setAttribute(
        "radius-outer",
        String(VR_HUD_GEOMETRY.RUNE_INNER_RADIUS_M),
      );
      progressRing.setAttribute("theta-length", "0");
      progressRing.setAttribute("color", VR_HUD_COLORS.ACCENT_TURQUESA);
      progressRing.setAttribute("material", "shader: flat; side: double");
      progressRing.setAttribute("position", "0 0 0.004");
      this.progressRingEl = progressRing;

      const labelEl = document.createElement("a-text");
      labelEl.setAttribute("value", VR_HUD_DICTIONARY.SUMMON_HINT_LABEL);
      labelEl.setAttribute("align", "center");
      labelEl.setAttribute("color", VR_HUD_COLORS.TEXT_BONE);
      labelEl.setAttribute("width", "1.1");
      labelEl.setAttribute("position", "0 0 0.01");

      hitDisc.addEventListener?.("mouseenter", () => {
        if (this.enabled && this.isGlyphVisible) {
          this.isGazingAtGlyph = true;
        }
      });

      hitDisc.addEventListener?.("mouseleave", () => {
        this.isGazingAtGlyph = false;
        this.dwellElapsedMs = 0;
        this.hasSummonedInCurrentDwell = false;
        this.progressRingEl?.setAttribute("theta-length", "0");
      });

      hitDisc.addEventListener?.("click", (evt) => {
        evt?.stopPropagation?.();
        if (
          this.enabled &&
          this.isGlyphVisible &&
          !this.hasSummonedInCurrentDwell
        ) {
          this.hasSummonedInCurrentDwell = true;
          this.triggerSummon();
        }
      });

      runeGroup.append(outerRing, hitDisc, progressRing, labelEl);
      this.el.appendChild(runeGroup);
    },

    setEnabled: function (
      this: NadirTriggerComponentInstance,
      enabled: boolean,
    ) {
      this.enabled = enabled;
      if (!enabled) {
        this.isGlyphVisible = false;
        this.isGazingAtGlyph = false;
        this.dwellElapsedMs = 0;
        this.hasSummonedInCurrentDwell = false;
        this.el.setAttribute("visible", "false");
        if (this.el.object3D) {
          this.el.object3D.visible = false;
        }
        this.progressRingEl?.setAttribute("theta-length", "0");
      }
    },

    setSummonHandler: function (
      this: NadirTriggerComponentInstance,
      handler?: () => void,
    ) {
      this.onSummon = handler;
    },

    evaluatePitchAndDwell: function (
      this: NadirTriggerComponentInstance,
      pitchDeg: number,
      timeDeltaMs: number,
    ) {
      if (!this.enabled) {
        if (this.isGlyphVisible) {
          this.setEnabled(false);
        }
        return;
      }

      if (isNadirPitchReached(pitchDeg)) {
        if (!this.isGlyphVisible) {
          this.isGlyphVisible = true;
          this.el.setAttribute("visible", "true");
          if (this.el.object3D) {
            this.el.object3D.visible = true;
          }
        }

        if (this.isGazingAtGlyph && !this.hasSummonedInCurrentDwell) {
          this.dwellElapsedMs += Math.max(0, timeDeltaMs);
          const progressDeg = Math.min(
            360,
            Math.round((this.dwellElapsedMs / VR_HUD_SUMMON_TIMEOUT_MS) * 360),
          );
          this.progressRingEl?.setAttribute("theta-length", String(progressDeg));

          if (this.dwellElapsedMs >= VR_HUD_SUMMON_TIMEOUT_MS) {
            this.hasSummonedInCurrentDwell = true;
            this.triggerSummon();
          }
        }
      } else {
        if (this.isGlyphVisible) {
          this.isGlyphVisible = false;
          this.el.setAttribute("visible", "false");
          if (this.el.object3D) {
            this.el.object3D.visible = false;
          }
        }
        this.isGazingAtGlyph = false;
        this.dwellElapsedMs = 0;
        this.hasSummonedInCurrentDwell = false;
        this.progressRingEl?.setAttribute("theta-length", "0");
      }
    },

    triggerSummon: function (this: NadirTriggerComponentInstance) {
      if (!this.enabled) {
        return;
      }
      if (this.onSummon) {
        this.onSummon();
      }
      this.el.dispatchEvent?.(
        new CustomEvent(NADIR_SUMMON_EVENT, { bubbles: true }),
      );
    },

    tick: function (
      this: NadirTriggerComponentInstance,
      _time: number,
      timeDelta: number,
    ) {
      if (!this.enabled) {
        return;
      }
      const sceneEl =
        this.el.sceneEl ??
        (typeof document !== "undefined"
          ? document.querySelector<HTMLElement>("a-scene")
          : null);
      const cameraEl =
        sceneEl?.querySelector<HTMLElement>("a-camera") ??
        sceneEl?.querySelector<HTMLElement>("[camera]");

      if (cameraEl) {
        const camObj = (
          cameraEl as unknown as {
            object3D?: { position?: { x?: number; z?: number } };
          }
        ).object3D;
        if (camObj?.position) {
          const camX = camObj.position.x ?? 0;
          const camZ = camObj.position.z ?? 0;
          if (this.el.object3D?.position) {
            this.el.object3D.position.x = camX;
            this.el.object3D.position.y = VR_HUD_GEOMETRY.RUNE_FLOOR_Y_OFFSET_M;
            this.el.object3D.position.z = camZ;
          }
          this.el.setAttribute(
            "position",
            `${camX} ${VR_HUD_GEOMETRY.RUNE_FLOOR_Y_OFFSET_M} ${camZ}`,
          );
        }
      }

      const pitchDeg = extractCameraPitchDeg(cameraEl);
      this.evaluatePitchAndDwell(pitchDeg, timeDelta);
    },

    remove: function (this: NadirTriggerComponentInstance) {
      this.isGlyphVisible = false;
      this.isGazingAtGlyph = false;
      this.dwellElapsedMs = 0;
      this.hasSummonedInCurrentDwell = false;
      this.progressRingEl = null;
    },
  };
}

export function registerNadirTriggerComponent(): void {
  const globalAframe = (
    globalThis as unknown as {
      AFRAME?: { registerComponent: (name: string, def: unknown) => void };
    }
  ).AFRAME;
  if (globalAframe && typeof globalAframe.registerComponent === "function") {
    globalAframe.registerComponent(
      "cv-nadir-trigger",
      createNadirTriggerComponentDefinition(),
    );
  }
}

export function ensureNadirTrigger(sceneEl: HTMLElement): HTMLElement {
  let triggerEl = sceneEl.querySelector(
    `#${VR_HUD_ELEMENT_IDS.NADIR_TRIGGER}`,
  ) as HTMLElement | null;
  if (triggerEl) {
    return triggerEl;
  }

  triggerEl = document.createElement("a-entity");
  triggerEl.setAttribute("id", VR_HUD_ELEMENT_IDS.NADIR_TRIGGER);
  triggerEl.setAttribute("visible", "false");
  triggerEl.setAttribute("cv-nadir-trigger", "");
  sceneEl.appendChild(triggerEl);
  return triggerEl;
}

if (typeof globalThis !== "undefined") {
  registerNadirTriggerComponent();
}
