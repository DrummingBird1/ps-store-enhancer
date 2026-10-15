const fs = require("fs");
const path = require("path");
const helpers = require("../extension/helpers.js");
const viewer = require("../assets/docs/wishlist-view.js");

describe("shared-wishlist viewer (assets/docs/wishlist-view.js)", () => {
  const sample = [
    { name: "Elden Ring", lastCheckedPrice: 52.89, targetPrice: 10, note: "private" },
    { name: "Hades II", lastCheckedPrice: null },
    { name: "משחק \u{1F3AE} <b>x</b>", lastCheckedPrice: 5 }
  ];

  test("decodes exactly what the extension encodes", () => {
    const frag = helpers.encodeShareList(sample);
    expect(viewer.decodeShareList(frag)).toEqual(helpers.decodeShareList(frag));
    expect(viewer.decodeShareList("#" + frag)).toHaveLength(3);
  });

  test("never exposes targets or notes", () => {
    const decoded = viewer.decodeShareList(helpers.encodeShareList(sample));
    expect(JSON.stringify(decoded)).not.toMatch(/private|targetPrice/);
  });

  test("rejects garbage, wrong versions and oversized lists the same way as the extension", () => {
    for (const bad of ["", "%%%", "e30", Buffer.from('{"v":2,"i":[]}').toString("base64url"), Buffer.from("[1,2]").toString("base64url")]) {
      expect(viewer.decodeShareList(bad)).toEqual([]);
      expect(helpers.decodeShareList(bad)).toEqual([]);
    }
    const many = Array.from({ length: 300 }, (_, i) => ({ name: "G" + i, lastCheckedPrice: 1 }));
    expect(viewer.decodeShareList(helpers.encodeShareList(many))).toHaveLength(200);
  });

  test("renders with textContent only — a crafted link can't inject markup", () => {
    const code = (f) =>
      fs
        .readFileSync(path.join(__dirname, "..", "assets", "docs", f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
    const unsafe = /innerHTML|outerHTML|insertAdjacentHTML|document\.write/;
    expect(code("wishlist-view.js")).not.toMatch(unsafe);
    expect(code("supporters.js")).not.toMatch(unsafe);
  });
});
