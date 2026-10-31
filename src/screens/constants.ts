export const UI_CLASSES = {
  SCREEN_CONTAINER: "cv-screen",
  SCREEN_ACTIVE: "cv-screen--active",
  SCREEN_HIDDEN: "cv-screen--hidden",
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

  WELCOME_TITLE: "Bienvenido a Culturas Vivas",
  WELCOME_DESCRIPTION:
    "Selecciona la modalidad para iniciar el recorrido cultural.",
  WELCOME_BTN_VR: "Modo Visor VR (Cardboard)",
  WELCOME_BTN_2D: "Modo 2D Táctil (Pantalla)",

  TUTORIAL_TITLE: "Ajuste del Visor Pasivo",
  TUTORIAL_STEP_1: "1. Gira tu dispositivo a posición horizontal.",
  TUTORIAL_STEP_2:
    "2. Alinea la línea central con el divisor óptico de tu visor.",
  TUTORIAL_STEP_3:
    "3. Introduce el smartphone en la bandeja frontal y ajústala.",
  TUTORIAL_BTN_START: "Comenzar Recorrido",

  EXPERIENCE_EXIT_HUD: "Salir del Recorrido",
  EXPERIENCE_SCENE_LABEL: "Sala Virtual en Progreso",

  EXIT_MODAL_TITLE: "¿Deseas finalizar el recorrido?",
  EXIT_MODAL_DESCRIPTION:
    "Puedes regresar a la sala 3D o concluir tu visita y calificar la experiencia.",
  EXIT_MODAL_BTN_RESUME: "Continuar Recorrido",
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
