import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AUDIO_TOKENS } from "../../src/experience/audio/audio-constants";
import { AudioPreferencesStore } from "../../src/experience/audio/audio-preferences-store";
import { AudioEngine } from "../../src/experience/audio/audio-engine";
import { ExperienceScreenView } from "../../src/screens/screen-experience";
import { UI_CLASSES, UI_TEXT } from "../../src/screens/constants";
import { RoomId } from "../../src/shared/room-catalog";

function createInMemoryStore(): AudioPreferencesStore {
  const map = new Map<string, string>();
  return new AudioPreferencesStore({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  });
}

function createMockScene(): HTMLElement {
  const scene = document.createElement("a-scene") as HTMLElement & {
    play?: () => void;
    pause?: () => void;
    resize?: () => void;
    enterVR?: () => Promise<void>;
    exitVR?: () => Promise<void>;
  };
  scene.play = vi.fn();
  scene.pause = vi.fn();
  scene.resize = vi.fn();
  scene.enterVR = vi.fn(async () => {});
  scene.exitVR = vi.fn(async () => {});
  const camera = document.createElement("a-camera");
  const cursor = document.createElement("a-cursor");
  camera.appendChild(cursor);
  scene.appendChild(camera);
  return scene;
}

describe("ExperienceScreenView 2D Topbar Sound Popover", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
    document.body.appendChild(createMockScene());
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens sound popover in 2D Touch mode, toggles Music/Effects/Master, unlocks AudioEngine, and closes on outside click", async () => {
    const prefs = createInMemoryStore();
    const audioEngine = new AudioEngine({
      preferencesStore: prefs,
      createAudioContext: () => null,
    });
    const unlockSpy = vi
      .spyOn(audioEngine, "unlockFromUserGesture")
      .mockResolvedValue(true);
    const activateSpy = vi.spyOn(audioEngine, "activateExperience");
    const deactivateSpy = vi.spyOn(audioEngine, "deactivateExperience");

    const view = new ExperienceScreenView(
      vi.fn(),
      "2d",
      undefined,
      undefined,
      undefined,
      prefs,
      audioEngine,
    );
    view.mount(root);
    view.show();

    expect(activateSpy).toHaveBeenCalledWith(RoomId.LOBBY);

    const el = view.getElement()!;
    const triggerBtn = el.querySelector(
      '[data-action="toggle-sound-menu"]',
    ) as HTMLButtonElement;
    const popover = el.querySelector(
      `[data-sound-popover="true"]`,
    ) as HTMLElement;
    expect(triggerBtn).toBeTruthy();
    expect(popover).toBeTruthy();
    expect(popover.hidden).toBe(true);

    // Open popover
    triggerBtn.click();
    expect(popover.hidden).toBe(false);
    expect(popover.classList.contains(UI_CLASSES.HUD_SOUND_POPOVER_OPEN)).toBe(
      true,
    );

    const checkboxes = popover.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(1);

    const masterInput = popover.querySelector(
      '[data-sound-toggle="master"]',
    ) as HTMLInputElement;
    const musicSlider = popover.querySelector(
      '[data-sound-slider="music"]',
    ) as HTMLInputElement;
    const effectsSlider = popover.querySelector(
      '[data-sound-slider="effects"]',
    ) as HTMLInputElement;
    const musicValue = popover.querySelector(
      '[data-sound-value="music"]',
    ) as HTMLElement;
    const effectsValue = popover.querySelector(
      '[data-sound-value="effects"]',
    ) as HTMLElement;

    expect(masterInput).toBeTruthy();
    expect(musicSlider?.type).toBe("range");
    expect(effectsSlider?.type).toBe("range");
    expect(popover.textContent).toContain(UI_TEXT.EXPERIENCE_SOUND_MASTER);
    expect(popover.textContent).toContain(UI_TEXT.EXPERIENCE_SOUND_MUSIC);
    expect(popover.textContent).toContain(UI_TEXT.EXPERIENCE_SOUND_EFFECTS);

    // Defaults: Master OFF, Music & Effects sliders at default volume
    expect(masterInput.checked).toBe(false);
    expect(Number(musicSlider.value)).toBeCloseTo(
      AUDIO_TOKENS.DEFAULT_MUSIC_VOLUME,
    );
    expect(Number(effectsSlider.value)).toBeCloseTo(
      AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
    );
    expect(musicValue.textContent).toBe("70%");
    expect(effectsValue.textContent).toBe("80%");

    // Toggle Master ON -> unlocks AudioEngine & unmutes media
    masterInput.click();
    expect(prefs.getPreferences()).toEqual({
      masterEnabled: true,
      musicVolume: AUDIO_TOKENS.DEFAULT_MUSIC_VOLUME,
      effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
      mediaMuted: false,
    });
    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(masterInput.checked).toBe(true);

    // Drag Music slider up to 100% -> updates musicVolume & percentage label without touching effectsVolume
    musicSlider.value = "1";
    musicSlider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(prefs.getPreferences()).toEqual({
      masterEnabled: true,
      musicVolume: 1,
      effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
      mediaMuted: false,
    });
    expect(musicValue.textContent).toBe("100%");

    // External update (e.g. store mutation) reflects immediately in slider & percentage
    prefs.setEffectsVolume(0.35);
    expect(Number(effectsSlider.value)).toBeCloseTo(0.35);
    expect(effectsValue.textContent).toBe("35%");

    // Toggling Master OFF preserves slider positions while muting audio
    masterInput.click();
    expect(prefs.getPreferences()).toEqual({
      masterEnabled: false,
      musicVolume: 1,
      effectsVolume: 0.35,
      mediaMuted: true,
    });
    expect(Number(musicSlider.value)).toBeCloseTo(1);
    expect(Number(effectsSlider.value)).toBeCloseTo(0.35);

    // Outside click dismisses popover
    document.body.click();
    expect(popover.hidden).toBe(true);
    expect(popover.classList.contains(UI_CLASSES.HUD_SOUND_POPOVER_OPEN)).toBe(
      false,
    );

    // Switching to VR closes popover & hides topbar; hide() deactivates AudioEngine
    triggerBtn.click();
    expect(popover.hidden).toBe(false);
    view.setViewMode("vr");
    expect(popover.hidden).toBe(true);
    expect(
      el.querySelector(".cv-hud-topbar")?.classList.contains("cv-hud-topbar--hidden"),
    ).toBe(true);

    view.hide();
    expect(deactivateSpy).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
