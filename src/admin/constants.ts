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
  BUTTON_RETURN_LINK: "cv-btn cv-btn--outline cv-admin-btn-return-link",
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
  BUTTON_EXIT: "cv-btn cv-btn--outline cv-admin-btn-exit",

  // Grid Layout
  GRID_LAYOUT: "cv-admin-grid",
  CARD: "cv-card cv-admin-card",
  CARD_HEADER: "cv-admin-card-header",
  CARD_TITLE_GROUP: "cv-admin-card-title-group",
  CARD_TITLE: "cv-admin-card-title",
  CARD_SUBTITLE: "cv-admin-card-subtitle",
  CARD_BODY: "cv-admin-card-body",

  // Attendance Chart Widget
  CHART_WIDGET: "cv-admin-chart-widget",
  CHART_CONTAINER: "cv-admin-chart-container",
  CHART_CANVAS: "cv-admin-chart-canvas",
  CHART_KPI_GROUP: "cv-admin-chart-kpi",
  CHART_PEAK_BADGE: "cv-admin-peak-badge",
  COUNTER_VALUE: "cv-admin-counter-value",
  COUNTER_LABEL: "cv-admin-counter-label",
  CONNECTION_STATUS: "cv-admin-connection-status",
  CONNECTION_ONLINE: "cv-admin-connection-status--online",
  CONNECTION_OFFLINE: "cv-admin-connection-status--offline",
  CONNECTION_DOT: "cv-admin-connection-dot",
  CONNECTION_TEXT: "cv-admin-connection-text",

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
  TABLE_MODE_CHIP_UNKNOWN: "cv-admin-mode-chip--unknown",

  // Dashboard Tabs & Multimedia CMS
  TAB_BAR: "cv-admin-tabs",
  TAB_BTN: "cv-admin-tab-btn",
  TAB_BTN_ACTIVE: "cv-admin-tab-btn--active",
  TAB_PANEL: "cv-admin-tab-panel",
  TAB_PANEL_HIDDEN: "cv-admin-tab-panel--hidden",
  MEDIA_WIDGET: "cv-admin-media-widget",
  MEDIA_QUOTA_BAR: "cv-admin-media-quota",
  MEDIA_QUOTA_FILL: "cv-admin-media-quota-fill",
  MEDIA_QUOTA_LABEL: "cv-admin-media-quota-label",
  MEDIA_FILTERS: "cv-admin-media-filters",
  MEDIA_FORM: "cv-admin-media-form",
  MEDIA_LIST: "cv-admin-media-list",
  MEDIA_ITEM_CARD: "cv-admin-media-item",
  MEDIA_ITEM_THUMB: "cv-admin-media-thumb",
  MEDIA_ITEM_ACTIONS: "cv-admin-media-item-actions",
  MEDIA_FORMAT_CHIP: "cv-admin-media-format-chip",
  MEDIA_EDIT_FORM: "cv-admin-media-edit-form",
} as const;

export const ADMIN_UI_TEXT = {
  // Modal
  LOGIN_TITLE: "Acceso Administrativo",
  LOGIN_USER_LABEL: "Usuario",
  LOGIN_PASSWORD_LABEL: "Contraseña",
  LOGIN_SUBMIT_LABEL: "Iniciar Sesión",
  LOGIN_SUBMITTING_LABEL: "Verificando...",
  LOGIN_RETURN_LINK: "← Regresar al recorrido público",
  LOGIN_ERROR_MESSAGE:
    "Credenciales incorrectas. Verifica usuario y contraseña.",
  LOGIN_SERVICE_ERROR_MESSAGE:
    "No se pudo conectar con el servidor de autenticación (/api/admin/login).",

  // Header
  HEADER_TITLE: "Culturas Vivas",
  HEADER_SUBTITLE: "Estadísticas",
  HEADER_LOGOUT_BTN: "Cerrar Sesión",
  HEADER_EXIT_BTN: "Volver al Recorrido",
  DEFAULT_HEADER_USERNAME: "admin",
  DEFAULT_HEADER_ROLE: "librarian",

  // Attendance & Concurrency
  CHART_TITLE: "Concurrencia de Visitantes",
  CHART_DATASET_LABEL: "Sesiones iniciadas",
  COUNTER_LABEL: "Usuarios en Línea",
  PEAK_LABEL_PREFIX: "Pico de hoy: ",
  PEAK_LABEL_SUFFIX: " sesiones",
  CONNECTION_ONLINE: "Conectado",
  CONNECTION_OFFLINE: "Sin conexión",

  // Survey Table & Formatting Tokens
  SURVEY_TITLE: "Encuestas Recientes",
  SURVEY_AVG_PREFIX: "★",
  TABLE_COL_TIME: "Hora",
  TABLE_COL_MODE: "Modo",
  TABLE_COL_RATING: "Calificación",
  TABLE_COL_FEEDBACK: "Comentario",
  NO_SURVEYS: "Sin encuestas registradas en la jornada actual.",
  VIEW_MODE_VR: "WebXR VR",
  VIEW_MODE_2D: "Pantalla 2D",
  VIEW_MODE_UNKNOWN: "—",
  STAR_FILLED: "★",
  STAR_EMPTY: "☆",
  FEEDBACK_EMPTY: "—",
  RATING_SCALE_SUFFIX: " / 5.0",

  // Tabs & Multimedia CMS
  TAB_TELEMETRY: "Telemetría y Encuestas",
  TAB_MEDIA: "Gestión Multimedia",
  MEDIA_SECTION_TITLE: "Multimedia por Sala y Stand",
  MEDIA_ROOM_LABEL: "Sala / Cultura",
  MEDIA_STAND_LABEL: "Categoría (Stand)",
  MEDIA_FILE_LABEL: "Archivo (Foto JPG/PNG/WebP o Video MP4)",
  MEDIA_TITLE_LABEL: "Título",
  MEDIA_CREATOR_LABEL: "Autor / Artista / Fotógrafo (opcional)",
  MEDIA_DESC_LABEL: "Descripción breve",
  MEDIA_FORMAT_LABEL: "Formato visual",
  MEDIA_FORMAT_2D: "Estándar 2D",
  MEDIA_FORMAT_HALF_SBS: "Estereoscópico Half-SBS (VR)",
  MEDIA_UPLOAD_BTN: "Subir al Stand",
  MEDIA_UPLOADING_BTN: "Optimizando y subiendo...",
  MEDIA_EMPTY_STAND: "No hay elementos multimedia en este stand.",
  MEDIA_MOVE_UP: "↑",
  MEDIA_MOVE_DOWN: "↓",
  MEDIA_EDIT_BTN: "Editar",
  MEDIA_SAVE_BTN: "Guardar",
  MEDIA_CANCEL_BTN: "Cancelar",
  MEDIA_DELETE_BTN: "Eliminar",
  MEDIA_CREATOR_PREFIX: "Crédito: ",
} as const;

export const ADMIN_MEDIA_ENDPOINTS = {
  MEDIA: "/api/admin/media",
  PRESIGN: "/api/admin/media/presign",
} as const;

export const ADMIN_MEDIA_LIMITS = {
  MAX_TOTAL_BYTES: 8_589_934_592,
  MAX_IMAGE_BYTES: 5_242_880,
  MAX_VIDEO_BYTES: 52_428_800,
  MAX_IMAGE_EDGE_PX: 2048,
  IMAGE_WEBP_QUALITY: 0.85,
  POSTER_MAX_WIDTH_PX: 1024,
  POSTER_SEEK_SECONDS: 0.5,
  OUTPUT_IMAGE_MIME: "image/webp",
} as const;

export const ADMIN_THRESHOLDS = {
  MAX_CAPACITY: 25,
  CAPACITY_OPTIMAL_MAX: 10,
  CAPACITY_MODERATE_MAX: 20,
} as const;
