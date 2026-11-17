import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { WIXARIKA_CATEGORIES, WIXARIKA_EXHIBITS } from "../../src/experience/wixarika";
import { ExhibitRoomBuilder } from "../../src/experience/room-builder";
import { RoomId } from "../../src/experience/types";
import { createWixarikaGuide } from "../../src/experience/wixarika-guide";
import { ExperienceScreenView } from "../../src/screens/screen-experience";
import { configureExperiencePointer } from "../../src/experience/pointer-controls";

describe("Sala Wixárika", () => {
  it("includes all 17 supplied images under their five categories", () => {
    expect(WIXARIKA_CATEGORIES.map((category) => category.count)).toEqual([3, 2, 3, 4, 5]);
    const urls = WIXARIKA_EXHIBITS.flatMap((exhibit) => exhibit.mediaUrls ?? []);
    expect(urls).toHaveLength(17);
    expect(new Set(urls).size).toBe(17);
    for (const url of urls) expect(existsSync(`public${url}`)).toBe(true);
    for (const exhibit of WIXARIKA_EXHIBITS) expect(exhibit.description.length).toBeLessThan(220);
  });

  it("cycles photos in-world without triggering exhibit inspection", () => {
    const scene = document.createElement("a-scene");
    const room = ExhibitRoomBuilder.mountRoom(scene, RoomId.WIXARIKA);
    const culture = room.querySelector<HTMLElement>("#exhibit-wixarika-cultura")!;
    const photo = culture.querySelector("a-plane.clickable")!;
    const next = culture.querySelector<HTMLElement>('[data-action="next-photo"]')!;
    const previous = culture.querySelector<HTMLElement>('[data-action="previous-photo"]')!;
    let propagated = false;
    culture.addEventListener("click", () => { propagated = true; });
    previous.click();
    expect(photo.getAttribute("src")).toBe("/assets/wixarika/cultura/3.webp");
    next.click();
    expect(photo.getAttribute("src")).toBe("/assets/wixarika/cultura/1.webp");
    expect(propagated).toBe(false);
    ExhibitRoomBuilder.teardownRoom(scene);
  });

  it("offers readable summaries, optional details and all photos in the 2D guide", () => {
    const guide = createWixarikaGuide();
    const categories = guide.querySelectorAll<HTMLButtonElement>(".cv-wixarika-categories button");
    for (const [index, category] of WIXARIKA_CATEGORIES.entries()) {
      categories[index]!.click();
      expect(guide.querySelector("h2")?.textContent).toBe(category.title);
      expect(guide.querySelector("section p")?.textContent).toBe(category.summary);
      expect(guide.querySelector("section details")?.hasAttribute("open")).toBe(false);
      const next = guide.querySelector<HTMLButtonElement>(".cv-wixarika-photo-controls button:last-child")!;
      for (let photo = 1; photo <= category.count; photo++) {
        expect(guide.querySelector("img")?.getAttribute("src")).toBe(`/assets/wixarika/${category.id}/${photo}.webp`);
        next.click();
      }
      expect(guide.querySelector("img")?.getAttribute("src")).toBe(`/assets/wixarika/${category.id}/1.webp`);
    }
  });

  it("shows the guide only in the Wixárika room in 2D", () => {
    const parent = document.createElement("div");
    const screen = new ExperienceScreenView(() => {}, "2d");
    screen.mount(parent);
    const guide = parent.querySelector<HTMLElement>(".cv-wixarika-guide")!;
    screen.updateRoomBadge(RoomId.WIXARIKA);
    expect(guide.hidden).toBe(false);
    screen.updateRoomBadge(RoomId.TEXTILES);
    expect(guide.hidden).toBe(true);
    screen.setViewMode("vr");
    screen.updateRoomBadge(RoomId.WIXARIKA);
    expect(guide.hidden).toBe(true);
    screen.unmount();
  });

  it("uses direct mouse/touch coordinates in 2D and gaze only in VR", () => {
    const scene = document.createElement("a-scene");
    const cursor = document.createElement("a-cursor");
    scene.appendChild(cursor);
    configureExperiencePointer(scene, "2d");
    expect(cursor.getAttribute("cursor")).toContain("rayOrigin: mouse; fuse: false");
    expect(cursor.getAttribute("visible")).toBe("false");
    configureExperiencePointer(scene, "vr");
    expect(cursor.getAttribute("cursor")).toContain("rayOrigin: entity; fuse: true");
    expect(cursor.getAttribute("visible")).toBe("true");
  });

  it("mounts the themed environment only in the Wixárika room and removes it on exit", () => {
    const scene = document.createElement("a-scene");
    scene.appendChild(document.createElement("a-sky"));
    ExhibitRoomBuilder.mountRoom(scene, RoomId.WIXARIKA, "2d");
    const environment = scene.querySelector("#cv-wixarika-environment")!;
    expect(environment).not.toBeNull();
    expect(environment.querySelectorAll('[src="/assets/branding/faja_wixarika_pattern.svg"]')).toHaveLength(24);
    expect(environment.querySelector(".clickable")).toBeNull();
    expect(scene.querySelector("a-sky")?.getAttribute("src")).toBe("/assets/backgrounds/wixarika-sky.svg");
    const button = scene.querySelector('[data-action="next-photo"]')!;
    expect(button.getAttribute("height")).toBe("0.28");
    ExhibitRoomBuilder.mountRoom(scene, RoomId.TEXTILES);
    expect(scene.querySelector("#cv-wixarika-environment")).toBeNull();
    ExhibitRoomBuilder.teardownRoom(scene);
  });
});
