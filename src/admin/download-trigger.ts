/**
 * Browser boundary seam for triggering native attachment downloads without buffering large files in JS memory.
 */
export type AdminDownloadTrigger = (url: string, filename: string) => void;

export function createDefaultAdminDownloadTrigger(): AdminDownloadTrigger {
  return (url: string, filename: string) => {
    if (typeof document === "undefined" || !url) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body?.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };
}
