import { describe, expect, it } from "vitest";
import { ExhibitMediaType } from "../../src/experience/constants";
import { MediaCarouselController } from "../../src/experience/media-carousel-controller";
import {
  EmptyRoomMediaProvider,
  type RoomMediaProvider,
  type StandMediaItem,
} from "../../src/experience/media-types";
import { RoomId, StandId } from "../../src/shared/room-catalog";

function createSampleItems(): StandMediaItem[] {
  return [
    {
      id: "item-1",
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaType: ExhibitMediaType.IMAGE_2D,
      title: "Cuadro de Estambre",
      creatorName: "María López",
      description: "Arte tradicional con estambre.",
      mediaUrl: "https://cdn.example.com/wixarika-1.jpg",
      width: 1920,
      height: 1080,
      sortOrder: 0,
    },
    {
      id: "item-2",
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaType: ExhibitMediaType.VIDEO_2D,
      title: "Proceso de Chaquiras",
      creatorName: "",
      description: "Demostración en video.",
      mediaUrl: "https://cdn.example.com/wixarika-2.mp4",
      posterUrl: "https://cdn.example.com/wixarika-2-poster.jpg",
      width: 1080,
      height: 1920,
      sortOrder: 1,
    },
    {
      id: "item-3",
      roomId: RoomId.WIXARIKA,
      standId: StandId.ARTE,
      mediaType: ExhibitMediaType.IMAGE_STEREO_SBS,
      title: "Altar Ceremonial SBS",
      creatorName: "Carlos Carrillo",
      description: "Fotografía estereoscópica Half-SBS.",
      mediaUrl: "https://cdn.example.com/wixarika-3-sbs.jpg",
      width: 1000,
      height: 1000,
      sortOrder: 2,
    },
  ];
}

describe("MediaCarouselController", () => {
  it("navigates across mixed items with wrap-around next/prev, formatting, and reset", () => {
    const items = createSampleItems();
    const controller = new MediaCarouselController(items);

    expect(controller.isEmpty()).toBe(false);
    expect(controller.getCount()).toBe(3);
    expect(controller.getCurrentIndex()).toBe(0);
    expect(controller.getCounterLabel()).toBe("1 / 3");
    expect(controller.getCurrentItem()?.id).toBe("item-1");
    expect(controller.isCurrentVideo()).toBe(false);
    expect(controller.isCurrentHalfSBS()).toBe(false);
    expect(controller.getNextPrefetchUrl()).toBe("https://cdn.example.com/wixarika-2-poster.jpg");

    const second = controller.next();
    expect(second?.id).toBe("item-2");
    expect(controller.getCurrentIndex()).toBe(1);
    expect(controller.getCounterLabel()).toBe("2 / 3");
    expect(controller.isCurrentVideo()).toBe(true);
    expect(controller.isCurrentHalfSBS()).toBe(false);
    expect(controller.getNextPrefetchUrl()).toBe("https://cdn.example.com/wixarika-3-sbs.jpg");

    const third = controller.next();
    expect(third?.id).toBe("item-3");
    expect(controller.getCurrentIndex()).toBe(2);
    expect(controller.getCounterLabel()).toBe("3 / 3");
    expect(controller.isCurrentVideo()).toBe(false);
    expect(controller.isCurrentHalfSBS()).toBe(true);
    expect(controller.getNextPrefetchUrl()).toBe("https://cdn.example.com/wixarika-1.jpg");

    const wrappedNext = controller.next();
    expect(wrappedNext?.id).toBe("item-1");
    expect(controller.getCurrentIndex()).toBe(0);

    const wrappedPrev = controller.prev();
    expect(wrappedPrev?.id).toBe("item-3");
    expect(controller.getCurrentIndex()).toBe(2);

    controller.reset();
    expect(controller.getCurrentIndex()).toBe(0);
    expect(controller.getCounterLabel()).toBe("1 / 3");
  });

  it("handles an empty carousel safely without out-of-bounds failures", () => {
    const controller = new MediaCarouselController([]);

    expect(controller.isEmpty()).toBe(true);
    expect(controller.getCount()).toBe(0);
    expect(controller.getCurrentItem()).toBeNull();
    expect(controller.getCounterLabel()).toBe("0 / 0");
    expect(controller.next()).toBeNull();
    expect(controller.prev()).toBeNull();
    expect(controller.getNextPrefetchUrl()).toBeNull();
    expect(controller.isCurrentVideo()).toBe(false);
    expect(controller.isCurrentHalfSBS()).toBe(false);
  });

  it("tracks play/pause and mute toggles independently", () => {
    const controller = new MediaCarouselController(createSampleItems());

    expect(controller.isPlaying()).toBe(false);
    expect(controller.isMuted()).toBe(false);

    expect(controller.togglePlay()).toBe(true);
    expect(controller.isPlaying()).toBe(true);

    expect(controller.toggleMute()).toBe(true);
    expect(controller.isMuted()).toBe(true);

    controller.setPlaying(false);
    controller.setMuted(false);
    expect(controller.isPlaying()).toBe(false);
    expect(controller.isMuted()).toBe(false);
  });

  it("provides EmptyRoomMediaProvider defaulting to empty collections", () => {
    const provider: RoomMediaProvider = new EmptyRoomMediaProvider();
    expect(provider.getStandItems(RoomId.LOBBY, StandId.HISTORIA)).toEqual([]);
    expect(provider.getStandItems(RoomId.WIXARIKA, StandId.ARTE)).toEqual([]);
  });
});
