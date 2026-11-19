import {
  CANVAS_TEXT_DEFAULTS,
  EXHIBIT_DICTIONARY,
} from "./constants";

export interface CanvasContext2DLike {
  font: string;
  fillStyle: string;
  textAlign: "left" | "center" | "right" | "start" | "end";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic" | "hanging" | "ideographic";
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };
}

export interface WrapCanvasTextOptions {
  readonly ctx: CanvasContext2DLike;
  readonly text: string;
  readonly maxWidthPx: number;
  readonly maxLines?: number;
  readonly ellipsis?: string;
}

export interface WrapCanvasTextResult {
  readonly lines: string[];
  readonly truncated: boolean;
}

export interface SingleCanvasTextDrawOptions {
  readonly ctx: CanvasContext2DLike;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly value: string;
  readonly color: string;
  readonly align: "left" | "center" | "right";
  readonly baseline?: "top" | "middle" | "bottom";
  readonly fontSizePx: number;
  readonly fontWeight?: string;
  readonly fontFamily?: string;
  readonly maxLines?: number;
  readonly backgroundColor?: string;
  readonly paddingX?: number;
  readonly paddingY?: number;
}

export interface BillboardLayoutConfig {
  readonly ctx: CanvasContext2DLike;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly title: string;
  readonly creatorName?: string;
  readonly description: string;
  readonly fontFamily?: string;
  readonly titleColor?: string;
  readonly creatorColor?: string;
  readonly descriptionColor?: string;
  readonly backgroundColor?: string;
  readonly paddingX?: number;
  readonly paddingY?: number;
}

export interface BillboardLayoutResult {
  readonly titleY: number;
  readonly creatorY: number | null;
  readonly descriptionY: number;
  readonly titleLines: string[];
  readonly creatorLines: string[];
  readonly descriptionLines: string[];
  readonly truncated: boolean;
}

function appendEllipsisFit(
  ctx: CanvasContext2DLike,
  line: string,
  maxWidthPx: number,
  ellipsis: string,
): string {
  const cleaned = line.trimEnd();
  if (ctx.measureText(`${cleaned}${ellipsis}`).width <= maxWidthPx) {
    return `${cleaned}${ellipsis}`;
  }
  const chars = Array.from(cleaned);
  while (
    chars.length > 0 &&
    ctx.measureText(`${chars.join("")}${ellipsis}`).width > maxWidthPx
  ) {
    chars.pop();
  }
  return `${chars.join("").trimEnd()}${ellipsis}`;
}

function splitWordToFit(
  ctx: CanvasContext2DLike,
  word: string,
  maxWidthPx: number,
): string[] {
  const parts: string[] = [];
  let current = "";
  for (const ch of Array.from(word)) {
    const candidate = `${current}${ch}`;
    if (current.length > 0 && ctx.measureText(candidate).width > maxWidthPx) {
      parts.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) {
    parts.push(current);
  }
  return parts;
}

export function wrapCanvasTextLines(
  options: WrapCanvasTextOptions,
): WrapCanvasTextResult {
  const {
    ctx,
    text,
    maxWidthPx,
    maxLines,
    ellipsis = CANVAS_TEXT_DEFAULTS.ELLIPSIS,
  } = options;

  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return { lines: [], truncated: false };
  }

  const safeWidth = Math.max(20, maxWidthPx);
  const paragraphs = normalized.split("\n");
  const allLines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) {
      allLines.push("");
      continue;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate =
        currentLine.length === 0 ? word : `${currentLine} ${word}`;

      if (ctx.measureText(candidate).width <= safeWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine.length > 0) {
        allLines.push(currentLine);
        currentLine = "";
      }

      if (ctx.measureText(word).width <= safeWidth) {
        currentLine = word;
      } else {
        const fragments = splitWordToFit(ctx, word, safeWidth);
        for (let i = 0; i < fragments.length - 1; i++) {
          allLines.push(fragments[i]!);
        }
        currentLine = fragments[fragments.length - 1] ?? "";
      }
    }

    if (currentLine.length > 0) {
      allLines.push(currentLine);
    }
  }

  if (typeof maxLines === "number" && maxLines > 0 && allLines.length > maxLines) {
    const sliced = allLines.slice(0, maxLines);
    const lastIdx = sliced.length - 1;
    sliced[lastIdx] = appendEllipsisFit(
      ctx,
      sliced[lastIdx] ?? "",
      safeWidth,
      ellipsis,
    );
    return { lines: sliced, truncated: true };
  }

  return { lines: allLines, truncated: false };
}

function buildFontSpec(
  fontWeight: string,
  fontSizePx: number,
  fontFamily: string,
): string {
  return `${fontWeight} ${fontSizePx}px ${fontFamily}`;
}

export function renderCanvasTextBlock(
  options: SingleCanvasTextDrawOptions,
): WrapCanvasTextResult {
  const {
    ctx,
    canvasWidth,
    canvasHeight,
    value,
    color,
    align,
    baseline = "middle",
    fontSizePx,
    fontWeight = CANVAS_TEXT_DEFAULTS.DEFAULT_FONT_WEIGHT,
    fontFamily = CANVAS_TEXT_DEFAULTS.FONT_FAMILY,
    maxLines,
    backgroundColor = "",
    paddingX = CANVAS_TEXT_DEFAULTS.DEFAULT_PADDING_X_PX,
    paddingY = CANVAS_TEXT_DEFAULTS.DEFAULT_PADDING_Y_PX,
  } = options;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (backgroundColor.trim().length > 0) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  ctx.font = buildFontSpec(fontWeight, fontSizePx, fontFamily);
  const maxWidthPx = Math.max(20, canvasWidth - paddingX * 2);
  const lineHeight = Math.round(fontSizePx * 1.24);
  const budgetMaxLines = Math.max(
    1,
    maxLines ?? Math.floor(Math.max(lineHeight, canvasHeight - paddingY * 2) / lineHeight),
  );

  const wrapped = wrapCanvasTextLines({
    ctx,
    text: value,
    maxWidthPx,
    maxLines: budgetMaxLines,
  });

  if (wrapped.lines.length === 0) {
    return wrapped;
  }

  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";

  const drawX =
    align === "center"
      ? canvasWidth / 2
      : align === "right"
        ? canvasWidth - paddingX
        : paddingX;

  const totalTextHeight =
    wrapped.lines.length * fontSizePx +
    Math.max(0, wrapped.lines.length - 1) * (lineHeight - fontSizePx);

  let startY = paddingY;
  if (baseline === "middle") {
    startY = Math.max(paddingY, (canvasHeight - totalTextHeight) / 2);
  } else if (baseline === "bottom") {
    startY = Math.max(paddingY, canvasHeight - paddingY - totalTextHeight);
  }

  for (let i = 0; i < wrapped.lines.length; i++) {
    const lineY = startY + i * lineHeight;
    if (lineY + fontSizePx > canvasHeight - 2) {
      break;
    }
    ctx.fillText(wrapped.lines[i]!, drawX, lineY);
  }

  return wrapped;
}

export function measureAndDrawBillboard(
  config: BillboardLayoutConfig,
): BillboardLayoutResult {
  const {
    ctx,
    canvasWidth,
    canvasHeight,
    title,
    creatorName = "",
    description,
    fontFamily = CANVAS_TEXT_DEFAULTS.FONT_FAMILY,
    titleColor = "#38bdf8",
    creatorColor = "#D99B26",
    descriptionColor = "#f1f5f9",
    backgroundColor = "",
    paddingX = 36,
    paddingY = 26,
  } = config;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (backgroundColor.trim().length > 0) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  const maxWidthPx = Math.max(40, canvasWidth - paddingX * 2);
  const titleSize = CANVAS_TEXT_DEFAULTS.BILLBOARD_TITLE_FONT_PX;
  const creatorSize = CANVAS_TEXT_DEFAULTS.BILLBOARD_CREATOR_FONT_PX;
  const descSize = CANVAS_TEXT_DEFAULTS.BILLBOARD_DESCRIPTION_FONT_PX;
  const lineGap = CANVAS_TEXT_DEFAULTS.BILLBOARD_LINE_GAP_PX;
  const sectionGap = CANVAS_TEXT_DEFAULTS.BILLBOARD_SECTION_GAP_PX;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  let cursorY = paddingY;
  let truncated = false;

  // 1. Title section (max 2 lines so header leaves generous body space)
  ctx.font = buildFontSpec("700", titleSize, fontFamily);
  const titleWrapped = wrapCanvasTextLines({
    ctx,
    text: title,
    maxWidthPx,
    maxLines: 2,
  });
  truncated = truncated || titleWrapped.truncated;

  const titleY = cursorY;
  ctx.fillStyle = titleColor;
  for (let i = 0; i < titleWrapped.lines.length; i++) {
    ctx.fillText(titleWrapped.lines[i]!, paddingX, cursorY);
    cursorY += titleSize + (i < titleWrapped.lines.length - 1 ? lineGap : 0);
  }

  // 2. Creator section (optional, hidden when whitespace-only)
  const trimmedCreator = creatorName.trim();
  let creatorY: number | null = null;
  let creatorLines: string[] = [];

  if (trimmedCreator.length > 0) {
    cursorY += sectionGap;
    creatorY = cursorY;
    ctx.font = buildFontSpec("600", creatorSize, fontFamily);
    const creatorWrapped = wrapCanvasTextLines({
      ctx,
      text: `${EXHIBIT_DICTIONARY.CREATOR_PREFIX}${trimmedCreator}`,
      maxWidthPx,
      maxLines: 2,
    });
    truncated = truncated || creatorWrapped.truncated;
    creatorLines = creatorWrapped.lines;

    ctx.fillStyle = creatorColor;
    for (let i = 0; i < creatorLines.length; i++) {
      ctx.fillText(creatorLines[i]!, paddingX, cursorY);
      cursorY += creatorSize + (i < creatorLines.length - 1 ? lineGap : 0);
    }
  }

  // 3. Description section fills remaining vertical budget cleanly
  cursorY += sectionGap;
  const descriptionY = cursorY;
  const remainingHeight = Math.max(
    descSize + 4,
    canvasHeight - paddingY - descriptionY,
  );
  const descStep = descSize + lineGap;
  const maxDescLines = Math.max(
    1,
    Math.floor((remainingHeight + lineGap) / descStep),
  );

  ctx.font = buildFontSpec("400", descSize, fontFamily);
  const descWrapped = wrapCanvasTextLines({
    ctx,
    text: description,
    maxWidthPx,
    maxLines: maxDescLines,
  });
  truncated = truncated || descWrapped.truncated;

  ctx.fillStyle = descriptionColor;
  for (let i = 0; i < descWrapped.lines.length; i++) {
    ctx.fillText(descWrapped.lines[i]!, paddingX, cursorY);
    cursorY += descStep;
  }

  return {
    titleY,
    creatorY,
    descriptionY,
    titleLines: titleWrapped.lines,
    creatorLines,
    descriptionLines: descWrapped.lines,
    truncated,
  };
}
