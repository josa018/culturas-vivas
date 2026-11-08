export const CULTURAL_ASSETS = {
  TSIKURI_MANDALA: "/assets/branding/tsikuri-mandala.svg",
  FAJA_BORDER_PATTERN: "/assets/branding/faja_wixarika_pattern.svg",
  KAUYUMARI_ICON: "/assets/icons/kauyumari-deer-icon.svg",
  TEXTILE_WARP_GRID: "/assets/backgrounds/textile-warp-grid.svg",
  MODE_VR_ICON: "/assets/icons/mode-vr-cardboard.svg",
  MODE_TOUCH_ICON: "/assets/icons/mode-touch-gyro.svg",
  HIKURI_FLOWER_ICON: "/assets/icons/hikuri-flower-rating.svg",
  EXHIBIT_MASK_PREVIEW: "/assets/exhibits/mascara-chaquira.webp",
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
  TRUST_BADGES: "cv-trust-badges",
  TRUST_BADGE: "cv-trust-badge",
  RATING_GROUP: "cv-rating-group",
  RATING_BUTTON: "cv-rating-btn",
  RATING_ACTIVE: "cv-rating-btn--active",
} as const;

export const UI_TEXT = {
  SPLASH_TITLE: "Culturas Vivas",
  SPLASH_SUBTITLE: "Experiencia Web Inmersiva 360°",
  SPLASH_TAGLINE: "El latido de nuestras raíces · 360°",
  SPLASH_LOADING: "Cargando entorno interactivo...",
  SPLASH_TAP_PROMPT: "Toca en cualquier parte para continuar",
  SPLASH_BTN_ENTER: "Entrar",
  SPLASH_READY: "Todo listo",

  WELCOME_TITLE: "Bienvenido",
  WELCOME_HERO: "¡Bienvenido!",
  WELCOME_DESCRIPTION: "Selecciona la modalidad",
  WELCOME_SUBTITLE: "Elige cómo deseas recorrer las salas culturales.",
  WELCOME_BTN_VR: "Visor VR",
  WELCOME_VR_BADGE: "✦ Recomendado",
  WELCOME_VR_DESC: "Coloca tu smartphone en un visor para explorar en 3D.",
  WELCOME_BTN_2D: "Táctil sin visor",
  WELCOME_TOUCH_TITLE: "Sin Visor",
  WELCOME_TOUCH_DESC: "Gira tu pantalla con el dedo o moviendo tu teléfono.",

  TRUST_NO_APPS: "Sin descargas",
  TRUST_NO_REGISTER: "Sin registro",
  TRUST_FREE: "100% Gratuito",

  TUTORIAL_TITLE: "Instrucciones",
  TUTORIAL_STEP_1:
    'Presiona el botón "Comenzar" y gira tu dispositivo a posición horizontal.',
  TUTORIAL_STEP_2:
    "Introduce el smartphone al visor. Aparecerá una linea blanca que debe quedar abajo y ajustada al centro del visor.",
  TUTORIAL_STEP_3: "Cierra la bandeja y colocate el visor.",
  TUTORIAL_BTN_START: "Comenzar",

  EXPERIENCE_EXIT_HUD: "Salir de la experiencia",
  EXPERIENCE_SCENE_LABEL: "Sala 1",

  EXIT_MODAL_TITLE: "¿Deseas salir?",
  EXIT_MODAL_DESCRIPTION:
    "Puedes regresar a la sala o concluir tu visita y calificar la experiencia.",
  EXIT_MODAL_BTN_RESUME: "Regresar a la experiencia",
  EXIT_MODAL_BTN_SWITCH_TOUCH: "Cambiar a modo táctil",
  EXIT_MODAL_BTN_CONFIRM: "Finalizar Experiencia",

  SURVEY_TITLE: "Encuesta de Satisfacción",
  SURVEY_QUESTION_RATING: "¿Cómo calificarías tu experiencia?",
  SURVEY_QUESTION_RECOMMEND:
    "¿Recomendarías este recorrido a otros visitantes?",
  SURVEY_QUESTION_FEEDBACK: "Comentarios o sugerencias (opcional):",
  SURVEY_FEEDBACK_PLACEHOLDER: "Escribe tu opinión aquí...",
  SURVEY_BTN_SUBMIT: "Enviar Encuesta",
  SURVEY_BTN_SKIP: "Omitir",
} as const;

export const SCREEN_TEXTS = UI_TEXT;
