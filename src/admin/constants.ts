export const ADMIN_UI_CLASSES = {
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
} as const;

export const ADMIN_UI_TEXT = {
  LOGIN_TITLE: "Acceso Administrativo",
  LOGIN_SUBTITLE: "Panel de Recepción y Control de Aforo",
  LOGIN_USER_LABEL: "Usuario Administrativo",
  LOGIN_USER_PLACEHOLDER: "Ingresa tu usuario",
  LOGIN_PASSWORD_LABEL: "Contraseña",
  LOGIN_PASSWORD_PLACEHOLDER: "••••••••",
  LOGIN_SUBMIT_LABEL: "Iniciar Sesión",
  LOGIN_ERROR_MESSAGE:
    "Credenciales incorrectas. Verifica usuario y contraseña.",
} as const;
