export { ADMIN_AUTH_CONSTANTS, AdminAuthStore } from "./admin-auth-store";
export type {
  AdminUser,
  AdminAuthState,
  AdminAuthCredentials,
  AdminLoginResponse,
  AdminAuthErrorKind,
  AdminAuthListener,
} from "./admin-auth-store";

export { AdminHttpError, createDefaultAdminFetcher } from "./admin-http-client";
export type {
  AdminMediaFetcher,
  AdminNetworkFetcher,
} from "./admin-http-client";

export {
  ADMIN_MEDIA_ENDPOINTS,
  ADMIN_MEDIA_LIMITS,
  ADMIN_UI_CLASSES,
  ADMIN_UI_TEXT,
  ADMIN_THRESHOLDS,
} from "./constants";

export {
  AdminMediaProcessor,
  computeScaledDimensions,
} from "./media-processor";
export { AdminMediaStore } from "./media-store";
export type {
  AdminMediaItemRecord,
  AdminMediaState,
  AdminMediaStoreOptions,
  UploadMediaInput,
  UpdateMediaMetadataInput,
} from "./media-store";

export {
  ADMIN_DASHBOARD_CONSTANTS,
  AdminDashboardStore,
} from "./admin-dashboard-store";
export type {
  ViewModeKind,
  SurveyLogEntry,
  HourlyAttendanceDataset,
  DashboardState,
  DashboardListener,
  AdminDashboardStoreOptions,
} from "./admin-dashboard-store";

export { AdminLoginModalView } from "./views/admin-login-modal";
export type { AdminLoginModalOptions } from "./views/admin-login-modal";

export { AdminHeaderWidget } from "./views/admin-header";
export type { AdminHeaderOptions } from "./views/admin-header";

export { AttendanceChartWidget } from "./views/attendance-chart";

export { SurveysTableWidget } from "./views/surveys-table";

export { MediaManagerWidget } from "./views/media-manager-widget";

export { AdminDashboardView } from "./views/admin-dashboard-view";
export type {
  AdminDashboardTab,
  AdminDashboardViewOptions,
} from "./views/admin-dashboard-view";

export { AdminController } from "./admin-controller";
