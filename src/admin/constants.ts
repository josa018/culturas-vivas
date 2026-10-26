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

  // Dashboard Shell & Top App Bar
  DASHBOARD_CONTAINER: "cv-admin-dashboard",
  HEADER: "cv-admin-header",
  HEADER_BRAND: "cv-admin-header-brand",
  HEADER_TITLE_GROUP: "cv-admin-header-title-group",
  HEADER_APP_TITLE: "cv-admin-app-title",
  HEADER_APP_SUBTITLE: "cv-admin-app-subtitle",
  HEADER_ACTIONS: "cv-admin-header-actions",
  BUTTON_LOGOUT: "cv-btn cv-btn--outline cv-admin-btn-logout",

  // Grid Layout
  GRID_LAYOUT: "cv-admin-grid",
  CARD: "cv-card cv-admin-card",
  CARD_HEADER: "cv-admin-card-header",
  CARD_TITLE_GROUP: "cv-admin-card-title-group",
  CARD_TITLE: "cv-admin-card-title",
  CARD_SUBTITLE: "cv-admin-card-subtitle",
  CARD_BODY: "cv-admin-card-body",

  // Capacity Counter Widget
  COUNTER_WIDGET: "cv-admin-counter-widget",
  COUNTER_METRIC_CONTAINER: "cv-admin-counter-metric-container",
  COUNTER_VALUE: "cv-admin-counter-value",
  COUNTER_LABEL: "cv-admin-counter-label",

  // Attendance Chart Widget
  CHART_WIDGET: "cv-admin-chart-widget",
  CHART_CONTAINER: "cv-admin-chart-container",
  CHART_CANVAS: "cv-admin-chart-canvas",
  CHART_KPI_GROUP: "cv-admin-chart-kpi",
  CHART_PEAK_BADGE: "cv-admin-peak-badge",

  // Surveys Table Widget
  SURVEY_WIDGET: "cv-admin-survey-widget",
  SURVEY_TABLE_WRAPPER: "cv-admin-table-wrapper",
  SURVEY_TABLE: "cv-admin-table",
  SURVEY_AVG_BADGE: "cv-admin-avg-badge",
  TABLE_TH: "cv-admin-th",
  TABLE_TD: "cv-admin-td",
  TABLE_TD_TIME: "cv-admin-td--time",
  TABLE_TD_MODE: "cv-admin-td--mode",
  TABLE_TD_RATING: "cv-admin-td--rating",
  TABLE_TD_FEEDBACK: "cv-admin-td--feedback",
  TABLE_STARS: "cv-admin-stars",
  TABLE_MODE_CHIP: "cv-admin-mode-chip",
  TABLE_MODE_CHIP_VR: "cv-admin-mode-chip--vr",
  TABLE_MODE_CHIP_2D: "cv-admin-mode-chip--2d",
} as const;

export const ADMIN_UI_TEXT = {
  // Modal
  LOGIN_TITLE: "Acceso Administrativo",
  LOGIN_USER_LABEL: "Usuario",
  LOGIN_PASSWORD_LABEL: "Contraseña",
  LOGIN_SUBMIT_LABEL: "Iniciar Sesión",
  LOGIN_ERROR_MESSAGE:
    "Credenciales incorrectas. Verifica usuario y contraseña.",

  // Header
  HEADER_TITLE: "Culturas Vivas",
  HEADER_SUBTITLE: "Estadísticas",
  HEADER_LOGOUT_BTN: "Cerrar Sesión",

  // Capacity Counter
  COUNTER_TITLE: "Usuarios en Línea",
  COUNTER_SUBTITLE: "Sesiones concurrentes en la experiencia WebXR",

  // Attendance Chart
  CHART_TITLE: "Concurrencia de Visitantes",
  CHART_SUBTITLE: "Distribución de sesiones activas (Hoy)",
  CHART_DATASET_LABEL: "Usuarios conectados",
  COUNTER_LABEL: "Usuarios en Línea",
  PEAK_LABEL_PREFIX: "Pico de hoy: ",
  PEAK_LABEL_SUFFIX: " sesiones",

  // Survey Table
  SURVEY_TITLE: "Encuestas Recientes",
  SURVEY_AVG_PREFIX: "★",
  TABLE_COL_TIME: "Hora",
  TABLE_COL_MODE: "Modo",
  TABLE_COL_RATING: "Calificación",
  TABLE_COL_FEEDBACK: "Comentario",
  NO_SURVEYS: "Sin encuestas registradas en la jornada actual.",
} as const;

export const ADMIN_THRESHOLDS = {
  MAX_CAPACITY: 25,
  CAPACITY_OPTIMAL_MAX: 10,
  CAPACITY_MODERATE_MAX: 20,
} as const;
