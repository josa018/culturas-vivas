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
  RATING_GROUP: "cv-rating-group",
  RATING_BUTTON: "cv-rating-btn",
  RATING_ACTIVE: "cv-rating-btn--active",
} as const;

export const UI_TEXT = {
  SPLASH_TITLE: "Culturas Vivas",
  SPLASH_SUBTITLE: "Experiencia Web Inmersiva 360°",
  SPLASH_LOADING: "Cargando entorno interactivo...",
  SPLASH_TAP_PROMPT: "Toca en cualquier parte para continuar",
  SPLASH_BTN_ENTER: "Entrar",
  SPLASH_READY: "Todo listo",

  WELCOME_TITLE: "Bienvenido",
  WELCOME_DESCRIPTION: "Selecciona la modalidad",
  WELCOME_BTN_VR: "Visor VR",
  WELCOME_BTN_2D: "Táctil sin visor",

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
