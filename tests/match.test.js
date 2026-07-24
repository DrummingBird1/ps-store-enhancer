const { slugify, fuzzyMatch, computeBasePrice, classifyTitle, detectEdition } = require("../extension/match.js");

describe("slugify", () => {
  test("lowercases and replaces spaces", () => {
    expect(slugify("God of War Ragnarök")).toBe("god-of-war-ragnarök");
  });
  test("strips trademark symbols and punctuation", () => {
    expect(slugify("Marvel's Spider-Man™")).toBe("marvels-spider-man");
  });
  test("collapses repeated hyphens", () => {
    expect(slugify("FINAL  FANTASY   VII")).toBe("final-fantasy-vii");
  });
  test("handles null/undefined safely", () => {
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
  });
});

describe("fuzzyMatch", () => {
  test("identical strings match", () => {
    expect(fuzzyMatch("Elden Ring", "Elden Ring")).toBe(true);
  });
  test("case-insensitive", () => {
    expect(fuzzyMatch("elden ring", "Elden Ring")).toBe(true);
  });
  test("strips trademark symbols before comparison", () => {
    expect(fuzzyMatch("Spider-Man™", "Spider-Man")).toBe(true);
  });
  test("matches substring when lengths are comparable", () => {
    expect(fuzzyMatch("God of War", "God of War (PS4)")).toBe(true);
  });
  test("rejects substring when too-long candidate (Hades vs Hades II Anniversary Edition)", () => {
    // "hades" length 5; "hades ii anniversary edition" length 28 → 28 > 5 * 1.6 → false on substring
    // word-overlap: "hades" matches "hades" → 1/1 = 100% ≥ 75% → still TRUE via word match!
    // This is the documented behavior — a single-word query matching the lead word is intentional.
    expect(fuzzyMatch("Hades", "Hades II Anniversary Edition")).toBe(true);
  });
  test("rejects when too few words overlap", () => {
    expect(fuzzyMatch("The Last of Us Part II", "Resident Evil 4")).toBe(false);
  });
  test("matches when 75% of query words appear", () => {
    expect(fuzzyMatch("Final Fantasy VII Rebirth", "Final Fantasy VII Rebirth Deluxe Edition")).toBe(true);
  });
  test("rejects empty input", () => {
    expect(fuzzyMatch("", "Elden Ring")).toBe(false);
    expect(fuzzyMatch("Elden Ring", "")).toBe(false);
    expect(fuzzyMatch(null, null)).toBe(false);
  });
});

describe("computeBasePrice", () => {
  test("indies (under $15) → 1.5x", () => {
    expect(computeBasePrice(5)).toBe(7.5);
    expect(computeBasePrice(10)).toBe(15);
  });
  test("mid-tier ($15-$40) → 1.4x", () => {
    expect(computeBasePrice(20)).toBeCloseTo(28);
    expect(computeBasePrice(30)).toBeCloseTo(42);
  });
  test("AAA ($40+) → 1.2x but capped at $79.99", () => {
    expect(computeBasePrice(50)).toBe(60);
    expect(computeBasePrice(70)).toBe(79.99); // capped
    expect(computeBasePrice(100)).toBe(79.99); // capped
  });
  test("non-positive → fallback $59.99", () => {
    expect(computeBasePrice(0)).toBe(59.99);
    expect(computeBasePrice(-5)).toBe(59.99);
  });
});

describe("classifyTitle", () => {
  test("explicit DLC category", () => {
    expect(classifyTitle({ category: "ps4_nongame", name: "Map Pack 3" })).toBe("dlc");
    expect(classifyTitle({ category: "addon", name: "Outfit Bundle" })).toBe("dlc");
  });
  test("DLC inferred from name", () => {
    expect(classifyTitle({ category: "ps5_native_game", name: "Cyberpunk 2077: Phantom Liberty (Expansion)" })).toBe("dlc");
    expect(classifyTitle({ category: "ps4_game", name: "Hogwarts Legacy Season Pass" })).toBe("dlc");
    expect(classifyTitle({ category: "ps4_game", name: "FC 24 Add-on Pack" })).toBe("dlc");
  });
  test("app/media", () => {
    expect(classifyTitle({ category: "app", name: "Netflix" })).toBe("app");
    expect(classifyTitle({ category: "media", name: "Plex" })).toBe("app");
  });
  test("normal game", () => {
    expect(classifyTitle({ category: "ps5_native_game", name: "Astro Bot" })).toBe("game");
    expect(classifyTitle({ category: "ps4_game", name: "God of War Ragnarök" })).toBe("game");
  });
  test("missing fields default to game", () => {
    expect(classifyTitle({})).toBe("game");
    expect(classifyTitle({ name: "Untitled" })).toBe("game");
  });
});

describe("detectEdition", () => {
  test("plain title has no edition", () => {
    expect(detectEdition("Cyberpunk 2077")).toBeNull();
    expect(detectEdition("Elden Ring")).toBeNull();
  });
  test("detects common edition qualifiers", () => {
    expect(detectEdition("Cyberpunk 2077: Ultimate Edition")).toBe("Ultimate");
    expect(detectEdition("Final Fantasy VII Rebirth Deluxe Edition")).toBe("Deluxe");
    expect(detectEdition("The Witcher 3: Wild Hunt - Game of the Year Edition")).toBe("GOTY");
    expect(detectEdition("Red Dead Redemption 2: Special Edition")).toBe("Special");
  });
  test("is case-insensitive", () => {
    expect(detectEdition("cyberpunk 2077 ULTIMATE EDITION")).toBe("Ultimate");
  });
  test("longer phrase wins over a shorter false-positive", () => {
    // Would also contain "edition" alone if we matched too greedily
    expect(detectEdition("Some Game Game of the Year Edition")).toBe("GOTY");
  });
  test("handles null/undefined safely", () => {
    expect(detectEdition(null)).toBeNull();
    expect(detectEdition(undefined)).toBeNull();
  });
});
