import { describe, expect, it } from "vitest";
import { previewPerRoom, priceLines, roomsChip } from "./price";

describe("priceLines", () => {
  it("reads a one-room listing exactly as before", () => {
    expect(priceLines({ price: 850, pricePerRoom: 850, priceBasis: "room", roomsAvailable: 1 })).toEqual({
      main: "$850",
      unit: "/mo",
      sub: null,
      text: "$850/mo",
      pin: "$850",
      short: "$850",
    });
  });

  it("leads with the per-room price the poster typed, then the rooms", () => {
    expect(priceLines({ price: 800, pricePerRoom: 800, priceBasis: "room", roomsAvailable: 4 })).toEqual({
      main: "$800",
      unit: "/room",
      sub: "4 rooms",
      text: "$800/room · 4 rooms",
      pin: "$800/rm",
      short: "$800/room",
    });
  });

  it("leads with the whole-place total the poster typed, then the per-room price", () => {
    expect(priceLines({ price: 3200, pricePerRoom: 800, priceBasis: "total", roomsAvailable: 4 })).toEqual({
      main: "$3,200",
      unit: "total",
      sub: "$800/room",
      text: "$3,200 total · $800/room",
      pin: "$800/rm",
      short: "$800/room",
    });
  });

  it("shows the database's whole-dollar per-room price for an uneven split", () => {
    expect(priceLines({ price: 3200, pricePerRoom: 1067, priceBasis: "total", roomsAvailable: 3 }).text).toBe("$3,200 total · $1,067/room");
  });
});

describe("roomsChip", () => {
  it("says Whole place when every bedroom is open and nobody stays", () => {
    expect(roomsChip({ roomsAvailable: 4, bedrooms: 4, roommates: 0 })).toBe("Whole place · 4 BR");
  });

  it("counts rooms when some bedrooms stay taken or roommates stay", () => {
    expect(roomsChip({ roomsAvailable: 3, bedrooms: 5, roommates: 0 })).toBe("3 rooms");
    expect(roomsChip({ roomsAvailable: 4, bedrooms: 4, roommates: 1 })).toBe("4 rooms");
    expect(roomsChip({ roomsAvailable: 2, bedrooms: 2, roommates: null })).toBe("2 rooms");
  });

  it("is absent for one room, a solo 1 BR and a studio included", () => {
    expect(roomsChip({ roomsAvailable: 1, bedrooms: 1, roommates: 0 })).toBeNull();
    expect(roomsChip({ roomsAvailable: 1, bedrooms: 0, roommates: 0 })).toBeNull();
    expect(roomsChip({ roomsAvailable: 1, bedrooms: null, roommates: null })).toBeNull();
  });
});

describe("previewPerRoom", () => {
  it("matches the database's whole-dollar split", () => {
    expect(previewPerRoom(3200, "total", 4)).toBe(800);
    expect(previewPerRoom(3200, "total", 3)).toBe(1067);
    expect(previewPerRoom(2001, "total", 2)).toBe(1001); // 1000.5 rounds up, as round() does
    expect(previewPerRoom(800, "room", 4)).toBe(800);
    expect(previewPerRoom(900, "total", 1)).toBe(900);
  });
});
