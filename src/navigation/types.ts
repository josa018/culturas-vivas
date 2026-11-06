export const SESSION_STORAGE_KEY = "culturas_vivas_session" as const;

export const ScreenId = {
  SPLASH: "SPLASH",
  WELCOME: "WELCOME",
  CULTURE_SELECT: "CULTURE_SELECT",
  MUSEUM_2D: "MUSEUM_2D",
  TUTORIAL: "TUTORIAL",
  EXPERIENCE_3D: "EXPERIENCE_3D",
  EXIT_MODAL: "EXIT_MODAL",
  SURVEY: "SURVEY",
} as const;
export type ScreenId = (typeof ScreenId)[keyof typeof ScreenId];

export const NavigationAction = {
  FINISH_LOADING: "FINISH_LOADING",
  SELECT_VR: "SELECT_VR",
  SELECT_2D: "SELECT_2D",
  CHOOSE_CULTURE: "CHOOSE_CULTURE",
  BACK_TO_SELECT: "BACK_TO_SELECT",
  BACK_TO_WELCOME: "BACK_TO_WELCOME",
  CONFIRM_INSERTION: "CONFIRM_INSERTION",
  REQUEST_EXIT: "REQUEST_EXIT",
  RESUME_TOUR: "RESUME_TOUR",
  SWITCH_TO_TOUCH: "SWITCH_TO_TOUCH",
  CONFIRM_EXIT: "CONFIRM_EXIT",
  COMPLETE_SURVEY: "COMPLETE_SURVEY",
  SKIP_SURVEY: "SKIP_SURVEY",
} as const;
export type NavigationAction =
  (typeof NavigationAction)[keyof typeof NavigationAction];

export const ViewMode = {
  VR: "vr",
  TOUCH_2D: "2d",
} as const;
export type ViewMode = (typeof ViewMode)[keyof typeof ViewMode];

export const CultureId = {
  WIXARIKA: "wixarika",
  NAAYERI: "naayeri",
  ODAM: "odam",
  MEXICANERO: "mexicanero",
} as const;
export type CultureId = (typeof CultureId)[keyof typeof CultureId];

export interface SurveyAnswers {
  readonly rating: number;
  readonly feedback?: string;
}

export interface NavigationSession {
  readonly sessionId: string;
  readonly currentScreen: ScreenId;
  readonly viewMode: ViewMode | null;
  readonly selectedCulture?: CultureId;
  readonly startedAt: number;
  readonly lastUpdatedAt: number;
  readonly surveyAnswers?: SurveyAnswers;
}

export type NavigationListener = (
  screenId: ScreenId,
  session: NavigationSession,
) => void;
export type Unsubscribe = () => void;