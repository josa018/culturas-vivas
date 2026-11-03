import type { ExhibitItemConfig, Vector3D } from "./constants";
import {
  ExhibitMediaType,
  FOCAL_INSPECTION_OFFSET,
  InspectionState,
  PROTOTYPE_EXHIBITS,
} from "./constants";

export type InspectionListener = (
  state: InspectionState,
  activeExhibit: ExhibitItemConfig | null,
) => void;

export type Unsubscribe = () => void;

export class ExhibitInspectionController {
  private state: InspectionState = InspectionState.IDLE;
  private activeExhibitId: string | null = null;
  private readonly exhibits: Map<string, ExhibitItemConfig>;
  private readonly listeners = new Set<InspectionListener>();

  constructor(exhibits: readonly ExhibitItemConfig[] = PROTOTYPE_EXHIBITS) {
    this.exhibits = new Map(exhibits.map((e) => [e.id, e]));
  }

  public getState(): InspectionState {
    return this.state;
  }

  public getActiveExhibit(): ExhibitItemConfig | null {
    if (!this.activeExhibitId) {
      return null;
    }
    return this.exhibits.get(this.activeExhibitId) ?? null;
  }

  public getExhibit(id: string): ExhibitItemConfig | undefined {
    return this.exhibits.get(id);
  }

  public getAllExhibits(): ExhibitItemConfig[] {
    return Array.from(this.exhibits.values());
  }

  public canFocus(exhibitId: string): boolean {
    if (this.state !== InspectionState.IDLE) {
      return false;
    }
    return this.exhibits.has(exhibitId);
  }

  public focus(exhibitId: string): boolean {
    if (!this.canFocus(exhibitId)) {
      return false;
    }
    this.activeExhibitId = exhibitId;
    this.state = InspectionState.FOCUSING;
    this.notifyListeners();
    return true;
  }

  public completeFocus(): boolean {
    if (this.state !== InspectionState.FOCUSING) {
      return false;
    }
    this.state = InspectionState.INSPECTING;
    this.notifyListeners();
    return true;
  }

  public canReturn(): boolean {
    return (
      this.state === InspectionState.INSPECTING ||
      this.state === InspectionState.FOCUSING
    );
  }

  public return(): boolean {
    if (!this.canReturn()) {
      return false;
    }
    this.state = InspectionState.RETURNING;
    this.notifyListeners();
    return true;
  }

  public completeReturn(): boolean {
    if (this.state !== InspectionState.RETURNING) {
      return false;
    }
    this.activeExhibitId = null;
    this.state = InspectionState.IDLE;
    this.notifyListeners();
    return true;
  }

  public isAutoRotateActive(): boolean {
    if (this.state !== InspectionState.INSPECTING) {
      return false;
    }
    const current = this.getActiveExhibit();
    return Boolean(current?.autoRotate);
  }

  public isVideoPlaybackActive(): boolean {
    if (this.state !== InspectionState.INSPECTING) {
      return false;
    }
    const current = this.getActiveExhibit();
    if (!current) {
      return false;
    }
    return (
      current.mediaType === ExhibitMediaType.VIDEO_2D ||
      current.mediaType === ExhibitMediaType.VIDEO_STEREO_SBS
    );
  }

  public calculateFocalTargetPosition(cameraPos?: Vector3D): Vector3D {
    const origin = cameraPos ?? { x: 0, y: 1.6, z: 0 };
    return {
      x: origin.x + FOCAL_INSPECTION_OFFSET.x,
      y: origin.y + FOCAL_INSPECTION_OFFSET.y,
      z: origin.z + FOCAL_INSPECTION_OFFSET.z,
    };
  }

  public subscribe(listener: InspectionListener): Unsubscribe {
    this.listeners.add(listener);
    listener(this.state, this.getActiveExhibit());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const active = this.getActiveExhibit();
    for (const listener of this.listeners) {
      try {
        listener(this.state, active);
      } catch (error) {
        console.error(
          "[ExhibitInspectionController] Error during listener execution",
          error,
        );
      }
    }
  }
}
