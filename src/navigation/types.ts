export const SESSION_STORAGE_KEY = 'culturas_vivas_session' as const;

export const ScreenId = {
  SPLASH: 'SPLASH',
  WELCOME: 'WELCOME',
  TUTORIAL: 'TUTORIAL',
  EXPERIENCE_3D: 'EXPERIENCE_3D',
  EXIT_MODAL: 'EXIT_MODAL',
  SURVEY: 'SURVEY',
} as const;
export type ScreenId = (typeof ScreenId)[keyof typeof ScreenId];

export const NavigationAction = {
  FINISH_LOADING: 'FINISH_LOADING',
  SELECT_VR: 'SELECT_VR',
  SELECT_2D: 'SELECT_2D',
  CONFIRM_INSERTION: 'CONFIRM_INSERTION',
  REQUEST_EXIT: 'REQUEST_EXIT',
  RESUME_TOUR: 'RESUME_TOUR',
  CONFIRM_EXIT: 'CONFIRM_EXIT',
  COMPLETE_SURVEY: 'COMPLETE_SURVEY',
  SKIP_SURVEY: 'SKIP_SURVEY',
} as const;
export type NavigationAction = (typeof NavigationAction)[keyof typeof NavigationAction];

export const ViewMode = {
  VR: 'vr',
  TOUCH_2D: '2d',
} as const;
export type ViewMode = (typeof ViewMode)[keyof typeof ViewMode];

export interface SurveyAnswers {
  readonly rating: number;
  readonly feedback?: string;
}

export interface NavigationSession {
  readonly sessionId: string;
  readonly currentScreen: ScreenId;
  readonly viewMode: ViewMode | null;
  readonly startedAt: number;
  readonly lastUpdatedAt: number;
  readonly surveyAnswers?: SurveyAnswers;
}

export type NavigationListener = (screenId: ScreenId, session: NavigationSession) => void;
export type Unsubscribe = () => void;
