const fs = require("fs");
const path = require("path");
const { baseKey } = require("../extension/match.js");
const { completionistScore, midpointHours } = require("../extension/helpers.js");

const file = path.join(__dirname, "..", "extension", "data", "trophies.json");
const db = JSON.parse(fs.readFileSync(file, "utf8"));
const entries = Object.entries(db.games);

describe("extension/data/trophies.json (community data)", () => {
  test("has a header, an update date and at least the original 75 games", () => {
    expect(typeof db._comment).toBe("string");
    expect(db.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(entries.length).toBeGreaterThanOrEqual(75);
  });

  test.each(entries)("%s has valid fields", (name, g) => {
    expect(typeof g.hasPlatinum).toBe("boolean");
    expect(Number.isInteger(g.difficulty) && g.difficulty >= 1 && g.difficulty <= 10).toBe(true);
    expect(g.hours).toMatch(/^\d+(-\d+|\+)?$/);
    expect(midpointHours(g.hours)).toBeGreaterThan(0);
    expect(g.playthroughs).toMatch(/^\d+(-\d+)?$/);
    expect(completionistScore(g.difficulty, g.hours)).not.toBeNull();
  });

  test("keys are lower-case and no two keys describe the same game", () => {
    const seen = new Map();
    for (const [name] of entries) {
      expect(name).toBe(name.toLowerCase());
      const key = baseKey(name);
      expect(seen.has(key) ? `${name} duplicates ${seen.get(key)}` : "ok").toBe("ok");
      seen.set(key, name);
    }
  });

  test("entries stay sorted alphabetically so pull requests diff cleanly", () => {
    const names = entries.map(([n]) => n);
    expect(names).toEqual([...names].sort());
  });
});
