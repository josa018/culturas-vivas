import {
  PORTAL_COLORS,
  PORTAL_DEPTH_TOKENS,
  PORTAL_DIMENSIONS,
  STATION_ARCHITECTURE_TOKENS,
} from "./constants";
import { registerLambertShaderAndSurface } from "./components/lambert-shader";
import {
  PROCEDURAL_TEXTURE_KIND,
  type ProceduralTextureKind,
} from "./procedural-textures";
import type { RoomEnvironmentPreset } from "./room-environment-presets";
import type { RoomPortalConfig, RoomStandSlotConfig } from "./types";

registerLambertShaderAndSurface();

function createLambertBox(opts: {
  className?: string;
  width: number;
  height: number;
  depth: number;
  position: string;
  color: string;
  textureKind?: ProceduralTextureKind;
  accentColor?: string;
}): HTMLElement {
  const box = document.createElement("a-box");
  if (opts.className) {
    box.setAttribute("class", opts.className);
  }
  box.setAttribute("width", String(opts.width));
  box.setAttribute("height", String(opts.height));
  box.setAttribute("depth", String(opts.depth));
  box.setAttribute("position", opts.position);
  const surfaceColor = opts.textureKind ? "#e2e8f0" : opts.color;
  box.setAttribute("color", opts.color);
  box.setAttribute("material", `shader: lambert; color: ${surfaceColor}`);
  box.setAttribute("shadow", "cast: true; receive: true");
  if (opts.textureKind) {
    box.setAttribute(
      "cv-procedural-surface",
      `kind: ${opts.textureKind}; accentColor: ${opts.accentColor ?? opts.color}; repeatCount: 2`,
    );
  }
  return box;
}

function createLambertCylinder(opts: {
  className?: string;
  radius: number;
  height: number;
  segmentsRadial: number;
  position: string;
  color: string;
  textureKind?: ProceduralTextureKind;
  accentColor?: string;
}): HTMLElement {
  const cyl = document.createElement("a-cylinder");
  if (opts.className) {
    cyl.setAttribute("class", opts.className);
  }
  cyl.setAttribute("radius", String(opts.radius));
  cyl.setAttribute("height", String(opts.height));
  cyl.setAttribute("segments-radial", String(opts.segmentsRadial));
  cyl.setAttribute("position", opts.position);
  const surfaceColor = opts.textureKind ? "#e2e8f0" : opts.color;
  cyl.setAttribute("color", opts.color);
  cyl.setAttribute("material", `shader: lambert; color: ${surfaceColor}`);
  cyl.setAttribute("shadow", "cast: true; receive: true");
  if (opts.textureKind) {
    cyl.setAttribute(
      "cv-procedural-surface",
      `kind: ${opts.textureKind}; accentColor: ${opts.accentColor ?? opts.color}; repeatCount: 2`,
    );
  }
  return cyl;
}

/**
 * Creates a grounded floor-mounted cultural plinth sibling for a stand slot at world y = 0.
 * Stays anchored at r = 3.2 m while the interactive media stand glides forward on inspection.
 */
export function createStandPlinthEntity(
  stand: RoomStandSlotConfig,
  preset: RoomEnvironmentPreset,
): HTMLElement {
  const plinth = document.createElement("a-entity");
  plinth.setAttribute("class", "cv-stand-plinth");
  plinth.setAttribute("data-stand-slot", `${stand.roomId}:${stand.standId}`);
  plinth.setAttribute("position", `${stand.position.x} 0 ${stand.position.z}`);
  plinth.setAttribute(
    "rotation",
    `${stand.rotation.x} ${stand.rotation.y} ${stand.rotation.z}`,
  );

  const baseH = STATION_ARCHITECTURE_TOKENS.PLINTH_BASE_HEIGHT_M;
  const capH = STATION_ARCHITECTURE_TOKENS.PLINTH_CAP_HEIGHT_M;
  const shaftH = Number(
    (STATION_ARCHITECTURE_TOKENS.PLINTH_HEIGHT_M - baseH - capH).toFixed(3),
  );

  const base = createLambertBox({
    className: "cv-stand-plinth-base",
    width: STATION_ARCHITECTURE_TOKENS.PLINTH_WIDTH_M + 0.2,
    height: baseH,
    depth: STATION_ARCHITECTURE_TOKENS.PLINTH_DEPTH_M + 0.14,
    position: `0 ${Number((baseH / 2).toFixed(3))} 0`,
    color: preset.floorColor,
    textureKind: preset.floorTexture,
    accentColor: preset.accentColor,
  });

  const shaft = createLambertBox({
    className: "cv-stand-plinth-shaft",
    width: STATION_ARCHITECTURE_TOKENS.PLINTH_WIDTH_M,
    height: shaftH,
    depth: STATION_ARCHITECTURE_TOKENS.PLINTH_DEPTH_M,
    position: `0 ${Number((baseH + shaftH / 2).toFixed(3))} 0`,
    color: preset.columnColor,
    textureKind: preset.columnTexture,
    accentColor: preset.accentColor,
  });

  const cap = createLambertBox({
    className: "cv-stand-plinth-cap",
    width: STATION_ARCHITECTURE_TOKENS.PLINTH_WIDTH_M + 0.12,
    height: capH,
    depth: STATION_ARCHITECTURE_TOKENS.PLINTH_DEPTH_M + 0.08,
    position: `0 ${Number((baseH + shaftH + capH / 2).toFixed(3))} 0`,
    color: preset.accentColor,
    textureKind: PROCEDURAL_TEXTURE_KIND.WOVEN_FAJA,
    accentColor: preset.accentColor,
  });

  plinth.append(base, shaft, cap);
  return plinth;
}

/**
 * Creates a stepped octagonal cultural pedestal spanning local y = -1.2 to 0 (world y = 0.0 to 1.2 m).
 */
export function createModelPedestalEntity(
  exhibitId: string,
  preset: RoomEnvironmentPreset,
): HTMLElement {
  const pedestal = document.createElement("a-entity");
  pedestal.setAttribute("id", `${exhibitId}-pedestal`);
  pedestal.setAttribute("class", "cv-model-pedestal");
  pedestal.setAttribute(
    "position",
    `0 ${STATION_ARCHITECTURE_TOKENS.PEDESTAL_REST_Y} 0`,
  );

  const base = createLambertCylinder({
    className: "cv-pedestal-base",
    radius: 0.48,
    height: 0.16,
    segmentsRadial: 8,
    position: "0 -1.12 0",
    color: preset.floorColor,
    textureKind: preset.floorTexture,
    accentColor: preset.accentColor,
  });

  const column = createLambertCylinder({
    className: "cv-pedestal-shaft",
    radius: 0.31,
    height: 0.92,
    segmentsRadial: STATION_ARCHITECTURE_TOKENS.PORTAL_FLUTED_SEGMENTS,
    position: "0 -0.58 0",
    color: preset.columnColor,
    textureKind: preset.columnTexture,
    accentColor: preset.accentColor,
  });

  const cap = createLambertCylinder({
    className: "cv-pedestal-cap",
    radius: 0.42,
    height: 0.12,
    segmentsRadial: 8,
    position: "0 -0.06 0",
    color: preset.accentColor,
    textureKind: PROCEDURAL_TEXTURE_KIND.WOVEN_FAJA,
    accentColor: preset.accentColor,
  });

  pedestal.append(base, column, cap);
  return pedestal;
}

/**
 * Creates monumental architectural stone/timber archway elements grounded flush at world y = 0.
 */
export function createMonumentalPortalParts(
  config: RoomPortalConfig,
  preset?: RoomEnvironmentPreset,
): HTMLElement[] {
  const frameColor = config.accentColor ?? PORTAL_COLORS.FRAME;
  const stoneColor = preset?.columnColor ?? "#475569";
  const floorColor = preset?.floorColor ?? "#334155";
  const textureKind = preset?.columnTexture ?? PROCEDURAL_TEXTURE_KIND.STONE_BASALT;

  const halfW = PORTAL_DIMENSIONS.FRAME_WIDTH / 2;
  const topY = PORTAL_DIMENSIONS.FRAME_HEIGHT / 2;
  const dropY = STATION_ARCHITECTURE_TOKENS.PORTAL_PILLAR_GROUND_DROP_Y;
  const fullPillarHeight = Number((topY - dropY).toFixed(3));
  const pillarCenterY = Number(((topY + dropY) / 2).toFixed(3));
  const threshH = STATION_ARCHITECTURE_TOKENS.PORTAL_THRESHOLD_HEIGHT_M;
  const threshY = Number((dropY + threshH / 2).toFixed(3));

  // Keep primary accent boxes first in subtree for room accent readability
  const leftPillar = createLambertBox({
    className: "cv-portal-pillar-left",
    width: PORTAL_DIMENSIONS.BORDER_THICKNESS,
    height: fullPillarHeight,
    depth: PORTAL_DEPTH_TOKENS.JAMB_DEPTH_M,
    position: `${-halfW} ${pillarCenterY} ${PORTAL_DEPTH_TOKENS.JAMB_CENTER_Z_M}`,
    color: frameColor,
  });

  const rightPillar = createLambertBox({
    className: "cv-portal-pillar-right",
    width: PORTAL_DIMENSIONS.BORDER_THICKNESS,
    height: fullPillarHeight,
    depth: PORTAL_DEPTH_TOKENS.JAMB_DEPTH_M,
    position: `${halfW} ${pillarCenterY} ${PORTAL_DEPTH_TOKENS.JAMB_CENTER_Z_M}`,
    color: frameColor,
  });

  const leftFlutedCol = createLambertCylinder({
    className: "cv-portal-fluted-left",
    radius: 0.11,
    height: fullPillarHeight - threshH,
    segmentsRadial: STATION_ARCHITECTURE_TOKENS.PORTAL_FLUTED_SEGMENTS,
    position: `${Number((-halfW - 0.12).toFixed(3))} ${Number((pillarCenterY + threshH / 2).toFixed(3))} 0`,
    color: stoneColor,
    textureKind,
    accentColor: frameColor,
  });

  const rightFlutedCol = createLambertCylinder({
    className: "cv-portal-fluted-right",
    radius: 0.11,
    height: fullPillarHeight - threshH,
    segmentsRadial: STATION_ARCHITECTURE_TOKENS.PORTAL_FLUTED_SEGMENTS,
    position: `${Number((halfW + 0.12).toFixed(3))} ${Number((pillarCenterY + threshH / 2).toFixed(3))} 0`,
    color: stoneColor,
    textureKind,
    accentColor: frameColor,
  });

  const frieze = createLambertBox({
    className: "cv-portal-frieze",
    width: PORTAL_DIMENSIONS.FRAME_WIDTH + PORTAL_DIMENSIONS.BORDER_THICKNESS + 0.42,
    height: 0.22,
    depth: PORTAL_DEPTH_TOKENS.FRIEZE_DEPTH_M,
    position: `0 ${Number((topY + 0.08).toFixed(3))} ${PORTAL_DEPTH_TOKENS.FRIEZE_CENTER_Z_M}`,
    color: frameColor,
    textureKind: PROCEDURAL_TEXTURE_KIND.WOVEN_FAJA,
    accentColor: frameColor,
  });

  const threshold = createLambertBox({
    className: "cv-portal-threshold",
    width: PORTAL_DIMENSIONS.FRAME_WIDTH + 0.56,
    height: threshH,
    depth: PORTAL_DEPTH_TOKENS.THRESHOLD_DEPTH_M,
    position: `0 ${threshY} ${PORTAL_DEPTH_TOKENS.THRESHOLD_CENTER_Z_M}`,
    color: floorColor,
    textureKind: preset?.floorTexture ?? PROCEDURAL_TEXTURE_KIND.STONE_BASALT,
    accentColor: frameColor,
  });

  return [
    leftPillar,
    rightPillar,
    leftFlutedCol,
    rightFlutedCol,
    frieze,
    threshold,
  ];
}
