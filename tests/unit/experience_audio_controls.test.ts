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

describe("ExperienceScreenView 2D Topbar & Nierika Settings Modal", () => {
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

  it("renders strictly 2 buttons in 2D topbar (Ajustes + Salir), opens centered Settings modal with 5 vertical bars, and syncs AudioPreferencesStore", async () => {
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
    const topbarActions = el.querySelectorAll(".cv-hud-topbar-actions button");
    expect(topbarActions).toHaveLength(2);
    expect(el.querySelector('[data-action="return-lobby"]')).toBeNull();

    const settingsBtn = el.querySelector(
      '[data-action="open-settings"]',
    ) as HTMLButtonElement;
    const exitBtn = el.querySelector(
      '[data-action="request-exit"]',
    ) as HTMLButtonElement;
    const settingsModal = el.querySelector(
      '[data-settings-modal="true"]',
    ) as HTMLElement;
    expect(settingsBtn).toBeTruthy();
    expect(exitBtn).toBeTruthy();
    expect(settingsBtn.textContent).toContain("Ajustes");
    expect(settingsModal).toBeTruthy();
    expect(settingsModal.hidden).toBe(true);
    expect(settingsModal.querySelector(`.${UI_CLASSES.NIERIKA_DIALOG}`)).toBeTruthy();

    // Open Settings modal
    settingsBtn.click();
    expect(settingsModal.hidden).toBe(false);

    const checkboxes = settingsModal.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(0);

    const masterBtn = settingsModal.querySelector(
      '[data-sound-toggle="master"]',
    ) as HTMLButtonElement;
    const musicChannel = settingsModal.querySelector(
      '[data-volume-channel="music"]',
    ) as HTMLElement;
    const effectsChannel = settingsModal.querySelector(
      '[data-volume-channel="effects"]',
    ) as HTMLElement;
    const musicBars = Array.from(
      musicChannel.querySelectorAll('[data-volume-bar]'),
    ) as HTMLButtonElement[];
    const effectsBars = Array.from(
      effectsChannel.querySelectorAll('[data-volume-bar]'),
    ) as HTMLButtonElement[];
    const musicValue = settingsModal.querySelector(
      '[data-sound-value="music"]',
    ) as HTMLElement;
    const effectsValue = settingsModal.querySelector(
      '[data-sound-value="effects"]',
    ) as HTMLElement;

    expect(masterBtn).toBeTruthy();
    expect(masterBtn.tagName).toBe("BUTTON");
    expect(musicBars).toHaveLength(5);
    expect(effectsBars).toHaveLength(5);
    expect(masterBtn.textContent).toBe("Sonido: Desactivado");
    expect(masterBtn.getAttribute("aria-pressed")).toBe("false");
    expect(settingsModal.textContent).toContain(UI_TEXT.EXPERIENCE_SOUND_MUSIC);
    expect(settingsModal.textContent).toContain(UI_TEXT.EXPERIENCE_SOUND_EFFECTS);

    // Defaults: Master OFF, 4 active bars for 0.7 (70%) and 0.8 (80%)
    expect(
      musicBars.map((b) => b.getAttribute("data-bar-active")),
    ).toEqual(["true", "true", "true", "true", "false"]);
    expect(
      effectsBars.map((b) => b.getAttribute("data-bar-active")),
    ).toEqual(["true", "true", "true", "true", "false"]);
    expect(musicValue.textContent).toBe("70%");
    expect(effectsValue.textContent).toBe("80%");

    // Toggle Master ON -> unlocks AudioEngine & unmutes media
    masterBtn.click();
    expect(prefs.getPreferences()).toEqual({
      masterEnabled: true,
      musicVolume: AUDIO_TOKENS.DEFAULT_MUSIC_VOLUME,
      effectsVolume: AUDIO_TOKENS.DEFAULT_EFFECTS_VOLUME,
      mediaMuted: false,
    });
    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(masterBtn.textContent).toBe("Sonido: Activado");
    expect(masterBtn.getAttribute("aria-pressed")).toBe("true");

    // Click Music bar 5 -> 100% (5 active bars); click Effects '-' -> 60% (3 active bars)
    musicBars[4].click();
    expect(prefs.getPreferences().musicVolume).toBe(1);
    expect(musicValue.textContent).toBe("100%");
    expect(
      musicBars.map((b) => b.getAttribute("data-bar-active")),
    ).toEqual(["true", "true", "true", "true", "true"]);

    const effectsDownBtn = effectsChannel.querySelector(
      '[data-volume-step="down"]',
    ) as HTMLButtonElement;
    effectsDownBtn.click();
    expect(prefs.getPreferences().effectsVolume).toBeCloseTo(0.6);
    expect(effectsValue.textContent).toBe("60%");
    expect(
      effectsBars.map((b) => b.getAttribute("data-bar-active")),
    ).toEqual(["true", "true", "true", "false", "false"]);

    // External update reflects immediately
    prefs.setEffectsVolume(0.4);
    expect(effectsValue.textContent).toBe("40%");
    expect(
      effectsBars.map((b) => b.getAttribute("data-bar-active")),
    ).toEqual(["true", "true", "false", "false", "false"]);

    // Close button dismisses modal; backdrop click also dismisses modal
    const closeBtn = settingsModal.querySelector(
      '[data-action="close-settings"]',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    expect(settingsModal.hidden).toBe(true);

    settingsBtn.click();
    expect(settingsModal.hidden).toBe(false);
    settingsModal.click();
    expect(settingsModal.hidden).toBe(true);

    // Switching to VR closes modal & hides topbar; hide() deactivates AudioEngine
    settingsBtn.click();
    expect(settingsModal.hidden).toBe(false);
    view.setViewMode("vr");
    expect(settingsModal.hidden).toBe(true);
    expect(
      el.querySelector(".cv-hud-topbar")?.classList.contains("cv-hud-topbar--hidden"),
    ).toBe(true);

    view.hide();
    expect(deactivateSpy).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

describe("Volume Bar Pure Seams", () => {
  it("maps volumes to 5 uniform bars and quantizes 0.2 steps within [0, 1]", async () => {
    const { computeVolumeBarState, quantizeVolumeStep } = await import(
      "../../src/experience/audio/volume-bars"
    );

    const musicDefault = computeVolumeBarState(0.7, 5);
    expect(musicDefault.activeCount).toBe(4);
    expect(musicDefault.percent).toBe(70);
    expect(musicDefault.bars).toHaveLength(5);
    expect(musicDefault.bars.map((b: { active: boolean }) => b.active)).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(
      musicDefault.bars.map((b: { targetVolume: number }) => b.targetVolume),
    ).toEqual([0.2, 0.4, 0.6, 0.8, 1]);

    expect(computeVolumeBarState(0, 5).activeCount).toBe(0);
    expect(computeVolumeBarState(1, 5).activeCount).toBe(5);

    expect(quantizeVolumeStep(0.8, -0.2, 0.2)).toBeCloseTo(0.6);
    expect(quantizeVolumeStep(0.2, -0.2, 0.2)).toBeCloseTo(0);
    expect(quantizeVolumeStep(0, -0.2, 0.2)).toBeCloseTo(0);
    expect(quantizeVolumeStep(0.8, 0.2, 0.2)).toBeCloseTo(1);
    expect(quantizeVolumeStep(1, 0.2, 0.2)).toBeCloseTo(1);
    expect(quantizeVolumeStep(0.7, 0.2, 0.2)).toBeCloseTo(1);
    expect(quantizeVolumeStep(0.7, -0.2, 0.2)).toBeCloseTo(0.6);
  });
});
