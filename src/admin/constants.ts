export const ADMIN_UI_CLASSES = {
  // Modal & Auth
  MODAL_BACKDROP: "cv-admin-modal-backdrop",
  MODAL_CARD: "cv-admin-modal-card",
  FORM: "cv-admin-form",
  FORM_GROUP: "cv-admin-form-group",
  INPUT_LABEL: "cv-admin-label",
  INPUT_TEXT: "cv-admin-input",
  ERROR_CONTAINER: "cv-admin-error-container",
  ERROR_TEXT: "cv-admin-error-text",
  ERROR_HIDDEN: "cv-admin-error-text--hidden",
  BUTTON_SUBMIT: "cv-btn cv-btn--primary cv-admin-btn-submit",
  MODAL_HEADER: "cv-admin-modal-header",
  TITLE: "cv-title",
  SUBTITLE: "cv-description",

  // Dashboard Shell
  DASHBOARD_CONTAINER: "cv-admin-dashboard",
  HEADER: "cv-admin-header",
  HEADER_BRAND: "cv-admin-header-brand",
  HEADER_ACTIONS: "cv-admin-header-actions",
  HEADER_BADGE: "cv-admin-badge cv-admin-badge--online",
  HEADER_USER: "cv-admin-header-user",
  BUTTON_LOGOUT: "cv-btn cv-btn--outline cv-admin-btn-logout",

  // Grid Layout
  GRID_LAYOUT: "cv-admin-grid",
  CARD: "cv-card cv-admin-card",
  CARD_HEADER: "cv-admin-card-header",
  CARD_TITLE: "cv-admin-card-title",
  CARD_BODY: "cv-admin-card-body",

  // Capacity Counter Widget
  COUNTER_WIDGET: "cv-admin-counter-widget",
  COUNTER_VALUE: "cv-admin-counter-value",
  COUNTER_STATUS: "cv-admin-counter-status",
  COUNTER_STATUS_OPTIMAL: "cv-admin-badge cv-admin-badge--optimal",
  COUNTER_STATUS_MODERATE: "cv-admin-badge cv-admin-badge--moderate",
  COUNTER_STATUS_HIGH: "cv-admin-badge cv-admin-badge--high",
  COUNTER_CONTROLS: "cv-admin-counter-controls",
  COUNTER_BTN_INC: "cv-btn cv-btn--primary cv-admin-btn-step",
  COUNTER_BTN_DEC: "cv-btn cv-btn--secondary cv-admin-btn-step",
  SIMULATION_TOGGLE: "cv-admin-sim-toggle",
  SIMULATION_CHECKBOX: "cv-admin-sim-checkbox",

  // Attendance Chart Widget
  CHART_WIDGET: "cv-admin-chart-widget",
  CHART_CONTAINER: "cv-admin-chart-container",
  CHART_CANVAS: "cv-admin-chart-canvas",

  // Surveys Table Widget
  SURVEY_WIDGET: "cv-admin-survey-widget",
  SURVEY_TABLE_WRAPPER: "cv-admin-table-wrapper",
  SURVEY_TABLE: "cv-admin-table",
  SURVEY_AVG_BADGE: "cv-admin-avg-badge",
  TABLE_TH: "cv-admin-th",
  TABLE_TD: "cv-admin-td",
  TABLE_STARS: "cv-admin-stars",
  TABLE_MODE_BADGE: "cv-admin-mode-badge",
} as const;

export const ADMIN_UI_TEXT = {
  // Modal
  LOGIN_TITLE: "Acceso Administrativo",
  LOGIN_SUBTITLE: "Panel de Recepción y Control de Aforo",
  LOGIN_USER_LABEL: "Usuario Administrativo",
  LOGIN_USER_PLACEHOLDER: "Ingresa tu usuario",
  LOGIN_PASSWORD_LABEL: "Contraseña",
  LOGIN_PASSWORD_PLACEHOLDER: "••••••••",
  LOGIN_SUBMIT_LABEL: "Iniciar Sesión",
  LOGIN_ERROR_MESSAGE:
    "Credenciales incorrectas. Verifica usuario y contraseña.",

  // Header
  HEADER_TITLE: "Culturas Vivas — Panel del Bibliotecario",
  HEADER_STATUS_ONLINE: "En Turno (Recepción)",
  HEADER_LOGOUT_BTN: "Cerrar Sesión",

  // Capacity Counter
  COUNTER_TITLE: "Aforo Actual en Sala",
  COUNTER_UNIT: "visitantes activos",
  COUNTER_BTN_INC: "+ Entrar",
  COUNTER_BTN_DEC: "− Salir",
  COUNTER_AUTO_SIM_LABEL: "Simular fluctuación en tiempo real (5s)",
  STATUS_OPTIMAL: "Aforo Óptimo",
  STATUS_MODERATE: "Aforo Moderado",
  STATUS_HIGH: "Aforo Máximo",

  // Attendance Chart
  CHART_TITLE: "Aforo Histórico por Horario",
  CHART_DATASET_LABEL: "Visitantes por hora",

  // Survey Table
  SURVEY_TITLE: "Encuestas de Satisfacción Recientes",
  SURVEY_AVG_PREFIX: "Promedio:",
  TABLE_COL_TIME: "Hora",
  TABLE_COL_MODE: "Modo",
  TABLE_COL_RATING: "Calificación",
  TABLE_COL_FEEDBACK: "Comentarios",
  NO_SURVEYS: "Sin encuestas registradas en la jornada actual.",
} as const;

export const ADMIN_THRESHOLDS = {
  CAPACITY_OPTIMAL_MAX: 10,
  CAPACITY_MODERATE_MAX: 20,
  AUTO_SIMULATION_INTERVAL_MS: 5000,
} as const;
