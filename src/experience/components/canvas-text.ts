import {
  measureAndDrawBillboard,
  renderCanvasTextBlock,
  type CanvasContext2DLike,
} from "../canvas-text-renderer";
import {
  CANVAS_TEXT_DEFAULTS,
  RENDERER_QUALITY_TOKENS,
} from "../constants";

export interface CanvasTextComponentData {
  mode: "label" | "billboard";
  value: string;
  creatorName: string;
  description: string;
  color: string;
  align: "left" | "center" | "right";
  baseline: "top" | "middle" | "bottom";
  fontSizePx: number;
  fontWeight: string;
  canvasWidth: number;
  canvasHeight: number;
  maxLines: number;
  backgroundColor: string;
  paddingX: number;
  paddingY: number;
}

export interface DisposableCanvasTextureLike {
  needsUpdate: boolean;
  colorSpace?: string;
  anisotropy?: number;
  generateMipmaps?: boolean;
  minFilter?: number;
  magFilter?: number;
  dispose: () => void;
}

export interface CanvasTextComponentDependencies {
  readonly createCanvas?: (
    width: number,
    height: number,
  ) => HTMLCanvasElement | null;
  readonly createTexture?: (
    canvas: HTMLCanvasElement,
  ) => DisposableCanvasTextureLike | null;
}

export interface CanvasTextElement extends HTMLElement {
  getObject3D?: (type: string) => {
    material?: {
      map?: unknown;
      transparent?: boolean;
      needsUpdate?: boolean;
    };
  } | null;
}

export interface CanvasTextComponentInstance {
  el: CanvasTextElement;
  data: CanvasTextComponentData;
  currentTexture: DisposableCanvasTextureLike | null;
  init: () => void;
  update: () => void;
  remove: () => void;
}

function defaultCreateCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function defaultCreateTexture(
  canvas: HTMLCanvasElement,
): DisposableCanvasTextureLike | null {
  const threeGlobal = (
    globalThis as unknown as {
      THREE?: {
        CanvasTexture?: new (c: HTMLCanvasElement) => DisposableCanvasTextureLike;
        SRGBColorSpace?: string;
      };
    }
  ).THREE;

  if (!threeGlobal?.CanvasTexture) {
    return null;
  }

  const texture = new threeGlobal.CanvasTexture(canvas);
  if (threeGlobal.SRGBColorSpace && "colorSpace" in texture) {
    texture.colorSpace = threeGlobal.SRGBColorSpace;
  }
  return texture;
}

function disposeActiveTexture(instance: CanvasTextComponentInstance): void {
  if (instance.currentTexture) {
    instance.currentTexture.dispose();
    instance.currentTexture = null;
  }
  const mesh = instance.el.getObject3D?.("mesh");
  if (mesh?.material) {
    mesh.material.map = null;
    mesh.material.needsUpdate = true;
  }
}

function serializeComponentAttr(
  options: Partial<CanvasTextComponentData>,
): string {
  const entries: string[] = [];
  for (const [key, val] of Object.entries(options)) {
    if (val === undefined) {
      continue;
    }
    const sanitized = String(val).replace(/;/g, ",").replace(/:/g, " ");
    if (key === "value" || key === "creatorName" || key === "description") {
      entries.push(`${key}: ${String(val).replace(/;/g, ",")}`);
    } else {
      entries.push(`${key}: ${sanitized}`);
    }
  }
  return entries.join("; ");
}

export function setCanvasTextElement(
  el: HTMLElement,
  options: Partial<CanvasTextComponentData>,
): void {
  if (typeof options.value === "string") {
    el.setAttribute("value", options.value);
  }
  const serialized = serializeComponentAttr(options);
  if (serialized.length > 0) {
    el.setAttribute("cv-canvas-text", serialized);
  }
}

export interface CreateCanvasTextPlaneOptions
  extends Partial<CanvasTextComponentData> {
  readonly width: number;
  readonly height: number;
  readonly position?: string;
  readonly className?: string;
  readonly id?: string;
  readonly visible?: string;
}

export function createCanvasTextPlane(
  options: CreateCanvasTextPlaneOptions,
): HTMLElement {
  const plane = document.createElement("a-plane");
  plane.setAttribute("width", String(options.width));
  plane.setAttribute("height", String(options.height));
  plane.setAttribute("material", "shader: flat; transparent: true; side: double");
  if (options.position) {
    plane.setAttribute("position", options.position);
  }
  if (options.className) {
    plane.setAttribute("class", options.className);
  }
  if (options.id) {
    plane.setAttribute("id", options.id);
  }
  if (options.visible) {
    plane.setAttribute("visible", options.visible);
  }

  const componentOptions: Partial<CanvasTextComponentData> = {
    mode: options.mode ?? "label",
    value: options.value ?? "",
    creatorName: options.creatorName ?? "",
    description: options.description ?? "",
    color: options.color ?? "#ffffff",
    align: options.align ?? "center",
    baseline: options.baseline ?? "middle",
    fontSizePx: options.fontSizePx ?? CANVAS_TEXT_DEFAULTS.DEFAULT_FONT_SIZE_PX,
    fontWeight: options.fontWeight ?? CANVAS_TEXT_DEFAULTS.DEFAULT_FONT_WEIGHT,
    canvasWidth: options.canvasWidth ?? CANVAS_TEXT_DEFAULTS.DEFAULT_CANVAS_WIDTH,
    canvasHeight:
      options.canvasHeight ?? CANVAS_TEXT_DEFAULTS.DEFAULT_CANVAS_HEIGHT,
    maxLines: options.maxLines ?? 2,
    backgroundColor: options.backgroundColor ?? "",
    paddingX: options.paddingX ?? CANVAS_TEXT_DEFAULTS.DEFAULT_PADDING_X_PX,
    paddingY: options.paddingY ?? CANVAS_TEXT_DEFAULTS.DEFAULT_PADDING_Y_PX,
  };

  setCanvasTextElement(plane, componentOptions);
  return plane;
}

export function createCanvasTextComponentDefinition(
  deps: CanvasTextComponentDependencies = {},
) {
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
  const createTexture = deps.createTexture ?? defaultCreateTexture;

  return {
    schema: {
      mode: { type: "string", default: "label" },
      value: { type: "string", default: "" },
      creatorName: { type: "string", default: "" },
      description: { type: "string", default: "" },
      color: { type: "string", default: "#ffffff" },
      align: { type: "string", default: "center" },
      baseline: { type: "string", default: "middle" },
      fontSizePx: {
        type: "number",
        default: CANVAS_TEXT_DEFAULTS.DEFAULT_FONT_SIZE_PX,
      },
      fontWeight: {
        type: "string",
        default: CANVAS_TEXT_DEFAULTS.DEFAULT_FONT_WEIGHT,
      },
      canvasWidth: {
        type: "number",
        default: CANVAS_TEXT_DEFAULTS.DEFAULT_CANVAS_WIDTH,
      },
      canvasHeight: {
        type: "number",
        default: CANVAS_TEXT_DEFAULTS.DEFAULT_CANVAS_HEIGHT,
      },
      maxLines: { type: "number", default: 2 },
      backgroundColor: { type: "string", default: "" },
      paddingX: {
        type: "number",
        default: CANVAS_TEXT_DEFAULTS.DEFAULT_PADDING_X_PX,
      },
      paddingY: {
        type: "number",
        default: CANVAS_TEXT_DEFAULTS.DEFAULT_PADDING_Y_PX,
      },
    },

    init: function (this: CanvasTextComponentInstance) {
      this.currentTexture = null;
      this.update();
    },

    update: function (this: CanvasTextComponentInstance) {
      const value = this.data.value ?? "";
      this.el.setAttribute("value", value);

      disposeActiveTexture(this);

      const width = Math.max(
        64,
        Math.round(
          this.data.canvasWidth || CANVAS_TEXT_DEFAULTS.DEFAULT_CANVAS_WIDTH,
        ),
      );
      const height = Math.max(
        32,
        Math.round(
          this.data.canvasHeight || CANVAS_TEXT_DEFAULTS.DEFAULT_CANVAS_HEIGHT,
        ),
      );

      const canvas = createCanvas(width, height);
      if (!canvas) {
        return;
      }
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d") as unknown as CanvasContext2DLike | null;
      if (!ctx) {
        return;
      }

      if (this.data.mode === "billboard") {
        measureAndDrawBillboard({
          ctx,
          canvasWidth: width,
          canvasHeight: height,
          title: value,
          creatorName: this.data.creatorName ?? "",
          description: this.data.description ?? "",
          titleColor: this.data.color || "#38bdf8",
          backgroundColor: this.data.backgroundColor ?? "",
          paddingX: this.data.paddingX,
          paddingY: this.data.paddingY,
        });
      } else {
        renderCanvasTextBlock({
          ctx,
          canvasWidth: width,
          canvasHeight: height,
          value,
          color: this.data.color || "#ffffff",
          align: this.data.align || "center",
          baseline: this.data.baseline || "middle",
          fontSizePx:
            this.data.fontSizePx || CANVAS_TEXT_DEFAULTS.DEFAULT_FONT_SIZE_PX,
          fontWeight:
            this.data.fontWeight || CANVAS_TEXT_DEFAULTS.DEFAULT_FONT_WEIGHT,
          maxLines: this.data.maxLines,
          backgroundColor: this.data.backgroundColor ?? "",
          paddingX: this.data.paddingX,
          paddingY: this.data.paddingY,
        });
      }

      const texture = createTexture(canvas);
      if (!texture) {
        return;
      }
      const threeGlobal = (
        globalThis as unknown as {
          THREE?: {
            LinearMipmapLinearFilter?: number;
            LinearFilter?: number;
          };
        }
      ).THREE;
      texture.anisotropy = RENDERER_QUALITY_TOKENS.TEXTURE_ANISOTROPY;
      texture.generateMipmaps = true;
      if (typeof threeGlobal?.LinearMipmapLinearFilter === "number") {
        texture.minFilter = threeGlobal.LinearMipmapLinearFilter;
      }
      if (typeof threeGlobal?.LinearFilter === "number") {
        texture.magFilter = threeGlobal.LinearFilter;
      }
      texture.needsUpdate = true;
      this.currentTexture = texture;

      const mesh = this.el.getObject3D?.("mesh");
      if (mesh?.material) {
        mesh.material.map = texture;
        mesh.material.transparent = true;
        mesh.material.needsUpdate = true;
      }
    },

    remove: function (this: CanvasTextComponentInstance) {
      disposeActiveTexture(this);
    },
  };
}

export function registerCanvasTextComponent(
  deps?: CanvasTextComponentDependencies,
): void {
  const globalAFrame = (
    globalThis as unknown as {
      AFRAME?: {
        components: Record<string, unknown>;
        registerComponent: (name: string, def: unknown) => void;
      };
    }
  ).AFRAME;

  if (globalAFrame && !globalAFrame.components["cv-canvas-text"]) {
    globalAFrame.registerComponent(
      "cv-canvas-text",
      createCanvasTextComponentDefinition(deps),
    );
  }
}

registerCanvasTextComponent();
