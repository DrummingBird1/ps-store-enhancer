const {
  normalizeTitle,
  stripEdition,
  matchScore,
  sameGame,
  isAddonTitle,
  pickBestMatch,
  matchTrophyTitle,
  titleKey,
  slugify,
  classifyTitle,
  detectEdition
} = require("../extension/match.js");

describe("normalizeTitle", () => {
  test("straight apostrophe, curly apostrophe and no apostrophe all agree", () => {
    const a = normalizeTitle("Marvel's Spider-Man 2");
    expect(normalizeTitle("Marvel’s Spider-Man 2")).toBe(a);
    expect(normalizeTitle("Marvels Spider-Man 2")).toBe(a);
    expect(normalizeTitle("MARVEL'S SPIDER-MAN 2™")).toBe(a);
    expect(a).toBe("marvels spider man 2");
  });
  test("strips diacritics", () => {
    expect(normalizeTitle("God of War Ragnarök")).toBe("god of war ragnarok");
    expect(normalizeTitle("Pokémon")).toBe("pokemon");
  });
  test("roman numerals and a leading 'The' are normalized", () => {
    expect(normalizeTitle("Hades II")).toBe("hades 2");
    expect(normalizeTitle("FINAL FANTASY VII REBIRTH")).toBe("final fantasy 7 rebirth");
    expect(normalizeTitle("The Witcher 3: Wild Hunt")).toBe("witcher 3 wild hunt");
  });
  test("drops platform tags", () => {
    expect(normalizeTitle("ELDEN RING™ (PS4 & PS5)")).toBe("elden ring");
    expect(normalizeTitle("Horizon Forbidden West PS5")).toBe("horizon forbidden west");
  });
  test("keeps non-latin scripts", () => {
    expect(normalizeTitle("エルデンリング")).not.toBe("");
    expect(normalizeTitle("משחק טוב")).toContain("משחק");
  });
  test("handles null/undefined safely", () => {
    expect(normalizeTitle(null)).toBe("");
    expect(normalizeTitle(undefined)).toBe("");
  });
});

describe("stripEdition", () => {
  test("removes trailing edition qualifiers", () => {
    expect(stripEdition("cyberpunk 2077 ultimate edition")).toBe("cyberpunk 2077");
    expect(stripEdition("witcher 3 wild hunt game of the year edition")).toBe("witcher 3 wild hunt");
    expect(stripEdition("marvels spider man 2 digital deluxe edition")).toBe("marvels spider man 2");
    expect(stripEdition("death stranding directors cut")).toBe("death stranding");
  });
  test("leaves ordinary titles alone", () => {
    expect(stripEdition("elden ring")).toBe("elden ring");
    expect(stripEdition("shadow of the colossus")).toBe("shadow of the colossus");
    expect(stripEdition("gold rush")).toBe("gold rush");
  });
});

describe("matchScore / sameGame (real CheapShark cases)", () => {
  test("identical after normalization scores 3", () => {
    expect(matchScore("Elden Ring", "ELDEN RING")).toBe(3);
    expect(matchScore("Marvel’s Spider-Man 2", "Marvels Spider-Man 2")).toBe(3);
  });
  test("same game, different edition scores 2", () => {
    expect(matchScore("Cyberpunk 2077", "Cyberpunk 2077: Ultimate Edition")).toBe(2);
    expect(matchScore("Marvel's Spider-Man 2", "Marvels Spider-Man 2 - Digital Deluxe Edition")).toBe(2);
  });
  test("a DLC / expansion / spin-off is NOT the same game", () => {
    expect(matchScore("Elden Ring", "ELDEN RING NIGHTREIGN The Forsaken Hollows")).toBe(0);
    expect(matchScore("Elden Ring", "ELDEN RING NIGHTREIGN")).toBe(0);
    expect(matchScore("Cyberpunk 2077", "Cyberpunk 2077: Phantom Liberty")).toBe(0);
    expect(matchScore("Cyberpunk 2077", "Cyberpunk 2077 - Piggyback Interactive Map")).toBe(0);
  });
  test("a sequel is NOT the same game (Hades vs Hades II)", () => {
    expect(sameGame("Hades", "Hades II")).toBe(false);
    expect(sameGame("Hades II", "Hades 2")).toBe(true);
  });
  test("different games never match", () => {
    expect(matchScore("The Last of Us Part II", "Resident Evil 4")).toBe(0);
    expect(matchScore("", "Elden Ring")).toBe(0);
    expect(matchScore("Elden Ring", "")).toBe(0);
    expect(matchScore(null, null)).toBe(0);
  });
});

describe("isAddonTitle", () => {
  test("flags non-game store items", () => {
    expect(isAddonTitle("Grimshade Soundtrack")).toBe(true);
    expect(isAddonTitle("Cyberpunk 2077 - Piggyback Interactive Map")).toBe(true);
    expect(isAddonTitle("Marvels Spider-Man 2 Digital Deluxe Edition Upgrade")).toBe(true);
    expect(isAddonTitle("Hogwarts Legacy Season Pass")).toBe(true);
    expect(isAddonTitle("Game Original Soundtrack (OST)")).toBe(true);
  });
  test("does not flag real games", () => {
    expect(isAddonTitle("Elden Ring")).toBe(false);
    expect(isAddonTitle("Cyberpunk 2077: Ultimate Edition")).toBe(false);
    expect(isAddonTitle("Mapmaker Tycoon")).toBe(false);
    expect(isAddonTitle("Dave the Diver")).toBe(false);
  });
});

describe("pickBestMatch", () => {
  const ext = (c) => c.external;
  test("Elden Ring: picks the real game, never the Nightreign DLC", () => {
    const list = [
      { external: "ELDEN RING NIGHTREIGN The Forsaken Hollows", id: 1 },
      { external: "ELDEN RING NIGHTREIGN", id: 2 },
      { external: "ELDEN RING", id: 3 }
    ];
    const best = pickBestMatch("Elden Ring", list, ext);
    expect(best.item.id).toBe(3);
    expect(best.score).toBe(3);
  });
  test("returns null when only DLC/sequels exist", () => {
    const list = [{ external: "ELDEN RING NIGHTREIGN The Forsaken Hollows" }];
    expect(pickBestMatch("Elden Ring", list, ext)).toBeNull();
  });
  test("Cyberpunk: base game wins over Phantom Liberty, map and Ultimate Edition", () => {
    const list = [
      { external: "Cyberpunk 2077: Phantom Liberty", id: "pl" },
      { external: "Cyberpunk 2077: Ultimate Edition", id: "ue" },
      { external: "Cyberpunk 2077 - Piggyback Interactive Map", id: "map" },
      { external: "Cyberpunk 2077", id: "base" }
    ];
    expect(pickBestMatch("Cyberpunk 2077", list, ext).item.id).toBe("base");
    expect(pickBestMatch("Cyberpunk 2077: Phantom Liberty", list, ext).item.id).toBe("pl");
    expect(pickBestMatch("Cyberpunk 2077 Ultimate Edition", list, ext).item.id).toBe("ue");
  });
  test("an edition-only listing is accepted with score 2 when the base is missing", () => {
    const list = [{ external: "Cyberpunk 2077: Ultimate Edition" }];
    expect(pickBestMatch("Cyberpunk 2077", list, ext).score).toBe(2);
  });
  test("Spider-Man 2: skips the Upgrade add-on even when asking for the Deluxe Edition", () => {
    const list = [
      { external: "Marvels Spider-Man 2", id: "base" },
      { external: "Marvels Spider-Man 2 - Digital Deluxe Edition", id: "dd" },
      { external: "Marvels Spider-Man 2 Digital Deluxe Edition Upgrade", id: "up" }
    ];
    expect(pickBestMatch("Marvel’s Spider-Man 2", list, ext).item.id).toBe("base");
    expect(pickBestMatch("Marvel's Spider-Man 2 Digital Deluxe Edition", list, ext).item.id).toBe("dd");
  });
  test("Hades vs Hades II", () => {
    const list = [{ external: "Hades II", id: 2 }, { external: "Hades", id: 1 }];
    expect(pickBestMatch("Hades", list, ext).item.id).toBe(1);
    expect(pickBestMatch("Hades II", list, ext).item.id).toBe(2);
  });
  test("a PlayStation exclusive with no PC release finds nothing", () => {
    expect(pickBestMatch("Astro Bot", [{ external: "ASTROBOTANICA" }], ext)).toBeNull();
  });
  test("empty / missing candidate lists are safe", () => {
    expect(pickBestMatch("Elden Ring", [], ext)).toBeNull();
    expect(pickBestMatch("Elden Ring", null, ext)).toBeNull();
  });
});

describe("matchTrophyTitle", () => {
  test("matches trophy-set naming variants", () => {
    expect(matchTrophyTitle("Elden Ring", "ELDEN RING")).toBe(3);
    expect(matchTrophyTitle("Elden Ring", "ELDEN RING Trophies")).toBeGreaterThanOrEqual(2);
  });
  test("does not confuse sequels or spin-offs", () => {
    expect(matchTrophyTitle("Hades", "Hades II")).toBe(0);
    expect(matchTrophyTitle("Elden Ring", "ELDEN RING NIGHTREIGN")).toBe(0);
  });
});

describe("titleKey / slugify", () => {
  test("titleKey is stable across typography", () => {
    expect(titleKey("ELDEN RING™")).toBe(titleKey("Elden Ring"));
    expect(titleKey("Marvel’s Spider-Man 2")).toBe("marvels-spider-man-2");
  });
  test("slugify lowercases and replaces spaces", () => {
    expect(slugify("God of War Ragnarök")).toBe("god-of-war-ragnarök");
  });
  test("slugify strips trademark symbols and punctuation incl. curly apostrophes", () => {
    expect(slugify("Marvel's Spider-Man™")).toBe("marvels-spider-man");
    expect(slugify("Marvel’s Spider-Man")).toBe("marvels-spider-man");
  });
  test("slugify collapses repeated hyphens and handles null", () => {
    expect(slugify("FINAL  FANTASY   VII")).toBe("final-fantasy-vii");
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
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
  test("is case-insensitive and handles curly apostrophes", () => {
    expect(detectEdition("cyberpunk 2077 ULTIMATE EDITION")).toBe("Ultimate");
    expect(detectEdition("Death Stranding Director’s Cut")).toBe("Director's Cut");
  });
  test("longer phrase wins over a shorter false-positive", () => {
    expect(detectEdition("Some Game Game of the Year Edition")).toBe("GOTY");
  });
  test("handles null/undefined safely", () => {
    expect(detectEdition(null)).toBeNull();
    expect(detectEdition(undefined)).toBeNull();
  });
});
