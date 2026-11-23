export const CULTURAL_ASSETS = {
  LOGO: "/assets/branding/culturas-vivas-logo.svg",
  TSIKURI_MANDALA: "/assets/branding/culturas-vivas-logo.svg",
  FAJA_BORDER_PATTERN: "/assets/branding/faja_wixarika_pattern.svg",
  TEXTILE_WARP_GRID: "/assets/backgrounds/textile-warp-grid.svg",
  BG_WIXARIKA_CONSTELLATION:
    "/assets/backgrounds/bg-wixarika-constellation.svg",
  BG_NAAYERI_GRECA: "/assets/backgrounds/bg-naayeri-greca.svg",
  BG_ODAM_MITOTE: "/assets/backgrounds/bg-odam-mitote.svg",
  BG_MEXICANERO_SPIRAL: "/assets/backgrounds/bg-mexicanero-spiral.svg",
  MODE_VR_ICON: "/assets/icons/mode-vr-cardboard.svg",
  MODE_TOUCH_ICON: "/assets/icons/mode-touch-gyro.svg",
  HIKURI_FLOWER_ICON: "/assets/icons/hikuri-flower-rating.svg",
} as const;

export function syncCulturalAssetsToCSS(): void {
  if (typeof document === "undefined" || !document.documentElement) {
    return;
  }
  const root = document.documentElement;
  for (const [key, path] of Object.entries(CULTURAL_ASSETS)) {
    const cssVarName = `--cv-asset-${key.toLowerCase().replace(/_/g, "-")}`;
    root.style.setProperty(cssVarName, `url("${path}")`);
  }
  root.style.setProperty(
    "--cv-asset-faja-pattern",
    `url("${CULTURAL_ASSETS.FAJA_BORDER_PATTERN}")`,
  );
}

if (typeof document !== "undefined") {
  syncCulturalAssetsToCSS();
}

export const UI_CLASSES = {
  SCREEN_CONTAINER: "cv-screen",
  SCREEN_ACTIVE: "cv-screen--active",
  SCREEN_HIDDEN: "cv-screen--hidden",
  SCENE_ACTIVE: "cv-scene--active",
  BUTTON_PRIMARY: "cv-btn cv-btn--primary",
  BUTTON_SECONDARY: "cv-btn cv-btn--secondary",
  BUTTON_OUTLINE: "cv-btn cv-btn--outline",
  MODAL_BACKDROP: "cv-modal-backdrop",
  MODAL_CARD: "cv-modal-card",
  CARD: "cv-card",
  NIERIKA_CARD: "cv-nierika-card",
  NIERIKA_DIALOG: "cv-nierika-dialog",
  MODE_CARD: "cv-mode-card",
  MODE_CARD_VR: "cv-mode-card cv-mode-card--vr",
  MODE_CARD_TOUCH: "cv-mode-card cv-mode-card--touch",
  RATING_GROUP: "cv-rating-group",
  RATING_BUTTON: "cv-rating-btn",
  RATING_ACTIVE: "cv-rating-btn--active",
  SPLASH_SHELL: "cv-splash-shell",
  SPLASH_HERO: "cv-splash-hero",
  SPLASH_HEADER_GROUP: "cv-splash-header-group",
  SPLASH_ACTION_SLOT: "cv-splash-action-slot",
  SPLASH_FOOTER: "cv-splash-footer",
  SPLASH_PARTNERS: "cv-splash-partners",
  SPLASH_PARTNER_LOGO: "cv-splash-partner-logo",
  SPLASH_PARTNER_EMBLEM: "cv-splash-partner-logo--emblem",
  SPLASH_CREDITS: "cv-splash-credits",
  SPLASH_CREDITS_LABEL: "cv-splash-credits-label",
  SPLASH_CREDITS_LIST: "cv-splash-credits-list",
  SPLASH_CREDITS_ITEM: "cv-splash-credits-item",
  TUTORIAL_SOUND_CARD: "cv-tutorial-sound-card",
  TUTORIAL_SOUND_ACTIONS: "cv-tutorial-sound-actions",
  TUTORIAL_SOUND_STATUS: "cv-tutorial-sound-status",
  HUD_SOUND_WRAPPER: "cv-hud-sound-wrapper",
  HUD_SOUND_BTN: "cv-hud-sound-btn",
  HUD_SOUND_POPOVER: "cv-hud-sound-popover",
  HUD_SOUND_POPOVER_OPEN: "cv-hud-sound-popover--open",
  HUD_SOUND_ROW: "cv-hud-sound-row",
  HUD_SOUND_SLIDER_ROW: "cv-hud-sound-slider-row",
  HUD_SOUND_SLIDER_HEADER: "cv-hud-sound-slider-header",
  HUD_SOUND_SLIDER_VALUE: "cv-hud-sound-slider-value",
  HUD_SOUND_SLIDER: "cv-hud-sound-slider",
} as const;

export type PartnerLogoVariant = "wide" | "horizontal" | "emblem";

export interface PartnerLogoAsset {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly variant: PartnerLogoVariant;
}

export const PARTNER_LOGOS: readonly PartnerLogoAsset[] = [
  {
    id: "cecan-nayarit",
    src: "/assets/partners/cecan-nayarit-horizontal-white.webp",
    alt: "Consejo Estatal para la Cultura y las Artes de Nayarit",
    variant: "wide",
  },
  {
    id: "solon-arguello",
    src: "/assets/partners/solon-arguello-horizontal-white.webp",
    alt: "Biblioteca Pública Central Estatal Solón Argüello",
    variant: "horizontal",
  },
  {
    id: "ittepic",
    src: "/assets/partners/ittepic-emblem.webp",
    alt: "Instituto Tecnológico de Tepic",
    variant: "emblem",
  },
] as const;

export const SPLASH_TIMING = {
  SCENE_LOADED_TIMEOUT_MS: 3000,
  POST_LOAD_REVEAL_DELAY_MS: 1400,
} as const;

export const SPLASH_DEVELOPERS: readonly string[] = [
  "José Alfredo Camarena Martínez",
  "Rodolfo Humberto Covarrubias García",
  "Saúl Miguel González Ayala",
  "Nelly Esmeralda González Nonato",
  "Josadet Pérez Guerra",
] as const;

export const UI_TEXT = {
  SPLASH_TITLE: "Culturas Vivas",
  SPLASH_TAGLINE: "El latido de nuestras raíces",
  SPLASH_LOADING: "Cargando entorno interactivo...",
  SPLASH_CREDITS_LABEL: "Desarrolladores",
  SPLASH_BTN_ENTER: "Entrar",

  WELCOME_HERO: "¡Bienvenido!",
  WELCOME_SUBTITLE: "Elige cómo deseas recorrer las salas culturales.",
  WELCOME_BTN_VR: "Visor VR",
  WELCOME_VR_BADGE: "✦ Recomendado",
  WELCOME_VR_DESC: "Colocate los lentes para explorar en 3D",
  WELCOME_TOUCH_TITLE: "Sin Visor",
  WELCOME_TOUCH_DESC: "Gira tu pantalla con el dedo y moviendo tu teléfono",

  TUTORIAL_TITLE: "Instrucciones",
  TUTORIAL_STEP_1:
    'Presiona el botón "Comenzar" y gira tu dispositivo a posición horizontal.',
  TUTORIAL_STEP_2:
    "Introduce el smartphone al visor. Aparecerá una linea blanca que debe quedar abajo y ajustada al centro del visor.",
  TUTORIAL_STEP_3: "Cierra la bandeja y colocate el visor.",
  TUTORIAL_BTN_START: "Comenzar",
  TUTORIAL_SOUND_TITLE: "🎧 Activa el sonido — recomendado con audífonos",
  TUTORIAL_SOUND_ACTIVATE: "Activar",
  TUTORIAL_SOUND_SKIP: "Ahora no",
  TUTORIAL_SOUND_ACTIVE: "Sonido activado ✓",

  EXPERIENCE_RETURN_LOBBY: "Volver al Lobby",
  EXPERIENCE_EXIT_HUD: "Salir de la experiencia",
  EXPERIENCE_SOUND_BTN: "Sonido",
  EXPERIENCE_SOUND_BTN_ARIA: "Configurar sonido",
  EXPERIENCE_SOUND_MUSIC: "Música",
  EXPERIENCE_SOUND_EFFECTS: "Efectos",
  EXPERIENCE_SOUND_MASTER: "Todo",
  EXPERIENCE_SOUND_PERCENT_SUFFIX: "%",

  EXIT_MODAL_TITLE: "¿Deseas salir?",
  EXIT_MODAL_BTN_RESUME: "Regresar a la experiencia",
  EXIT_MODAL_BTN_SWITCH_TOUCH: "Cambiar a modo táctil",
  EXIT_MODAL_BTN_CONFIRM: "Finalizar Experiencia",

  SURVEY_TITLE: "Encuesta de Satisfacción",
  SURVEY_QUESTION_RATING: "¿Cómo calificarías tu experiencia?",
  SURVEY_QUESTION_FEEDBACK: "Comentarios o sugerencias (opcional):",
  SURVEY_FEEDBACK_PLACEHOLDER: "Escribe tu opinión aquí...",
  SURVEY_BTN_SUBMIT: "Enviar Encuesta",
  SURVEY_BTN_SKIP: "Omitir",
} as const;

export const SCREEN_TEXTS = UI_TEXT;
