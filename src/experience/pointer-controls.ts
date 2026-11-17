/** Use screen coordinates for mouse/touch; keep gaze selection for a VR viewer. */
export function configureExperiencePointer(scene: HTMLElement, viewMode: string): void {
  const cursor = scene.querySelector("a-cursor");
  if (!cursor) return;
  const gaze = viewMode === "vr";
  cursor.setAttribute("cursor", `rayOrigin: ${gaze ? "entity" : "mouse"}; fuse: ${gaze}; fuseTimeout: 1500; mouseCursorStylesEnabled: ${!gaze}`);
  cursor.setAttribute("visible", String(gaze));
  cursor.setAttribute("raycaster", "objects: .clickable; interval: 0");
}
