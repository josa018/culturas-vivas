import type {
  ScreenId,
  NavigationAction,
  DispatchPayload,
} from "../navigation/index";

export type NavigationDispatcher = (
  action: NavigationAction,
  payload?: DispatchPayload,
) => void;

export interface ScreenView {
  readonly id: ScreenId;
  mount(container: HTMLElement): void;
  unmount(): void;
  show(): void;
  hide(): void;
  getElement(): HTMLElement | null;
}
