import type { ExhibitItemConfig, Vector3D } from "./constants";
import {
  ExhibitMediaType,
  FOCAL_INSPECTION_DISTANCE,
  FOCAL_INSPECTION_OFFSET,
  InspectionState,
  PROTOTYPE_EXHIBITS,
  ROOM_CENTER_COORDINATE,
} from "./constants";

export type InspectionListener = (
  state: InspectionState,
  activeExhibit: ExhibitItemConfig | null,
  previousExhibit?: ExhibitItemConfig | null,
) => void;

export type Unsubscribe = () => void;

export class ExhibitInspectionController {
  private state: InspectionState = InspectionState.IDLE;
  private activeExhibitId: string | null = null;
  private previousExhibitId: string | null = null;
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

  public getPreviousExhibit(): ExhibitItemConfig | null {
    if (!this.previousExhibitId) {
      return null;
    }
    return this.exhibits.get(this.previousExhibitId) ?? null;
  }

  public clearPreviousExhibit(): void {
    this.previousExhibitId = null;
  }

  public getExhibit(id: string): ExhibitItemConfig | undefined {
    return this.exhibits.get(id);
  }

  public getAllExhibits(): ExhibitItemConfig[] {
    return Array.from(this.exhibits.values());
  }

  public canFocus(exhibitId: string): boolean {
    if (!this.exhibits.has(exhibitId)) {
      return false;
    }
    if (
      this.activeExhibitId === exhibitId &&
      this.state !== InspectionState.IDLE
    ) {
      return false;
    }
    return true;
  }

  public focus(exhibitId: string): boolean {
    if (!this.canFocus(exhibitId)) {
      return false;
    }
    if (this.activeExhibitId && this.activeExhibitId !== exhibitId) {
      this.previousExhibitId = this.activeExhibitId;
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

  public calculateRadialTargetPosition(
    galleryPos: Vector3D,
    cameraPos?: Vector3D,
    focalDistance: number = FOCAL_INSPECTION_DISTANCE,
  ): Vector3D {
    const origin = cameraPos ?? ROOM_CENTER_COORDINATE;
    const vx = origin.x - galleryPos.x;
    const vy = origin.y - galleryPos.y;
    const vz = origin.z - galleryPos.z;
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (len === 0) {
      return { x: galleryPos.x, y: galleryPos.y, z: galleryPos.z };
    }
    const ux = vx / len;
    const uy = vy / len;
    const uz = vz / len;
    return {
      x: Number((origin.x - ux * focalDistance).toFixed(3)),
      y: Number((origin.y - uy * focalDistance).toFixed(3)),
      z: Number((origin.z - uz * focalDistance).toFixed(3)),
    };
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
    listener(this.state, this.getActiveExhibit(), this.getPreviousExhibit());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const active = this.getActiveExhibit();
    const prev = this.getPreviousExhibit();
    for (const listener of this.listeners) {
      try {
        listener(this.state, active, prev);
      } catch (error) {
        console.error(
          "[ExhibitInspectionController] Error during listener execution",
          error,
        );
      }
    }
  }
}
