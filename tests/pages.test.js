/**
 * The extension's own pages, with their real scripts in jsdom (see tests/support/page-env.js):
 *  - the popup's Auto / Dark / Light switch (and the high-contrast theme, which only Settings can choose);
 *  - "Report a problem" in the popup and in Settings, including the message when the copy failed;
 *  - the buttons that open other pages are real <button>s (reachable and operable from the keyboard);
 *  - Settings' side navigation: its targets exist, the clicked section is marked, and the CSS is told the bar's height.
 */
const fs = require("fs");
const path = require("path");
const { loadExtensionPage, closePages, until } = require("./support/page-env");

afterEach(closePages);

const EXT = path.join(__dirname, "..", "extension");
const en = JSON.parse(fs.readFileSync(path.join(EXT, "_locales", "en", "messages.json"), "utf8"));
const VERSION = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8")).version;

/** The popup, once its start-up has finished (the PSN row is drawn last). */
async function popup(opts = {}) {
  const page = loadExtensionPage("popup.html", { respond: { PSN_STATUS: () => ({ connected: false }) }, ...opts });
  await until(() => page.$("psnText").textContent !== "...", "the popup to finish starting");
  return page;
}
/** Settings, once its start-up has reached the end (the navigation is wired last). */
async function settings(opts = {}) {
  const page = loadExtensionPage("options.html", { sync: { userLanguage: "en" }, ...opts });
  await until(() => page.doc.documentElement.style.getPropertyValue("--nav-h") !== "", "Settings to finish starting");
  return page;
}

describe("popup: the Auto / Dark / Light switch", () => {
  const pressed = (page) => Object.fromEntries([...page.doc.querySelectorAll("#themeSeg button")].map((b) => [b.dataset.theme, b.getAttribute("aria-pressed")]));
  const classes = (page) => ["theme-light", "theme-contrast"].filter((c) => page.doc.body.classList.contains(c));

  test("it offers exactly Auto, Dark and Light, each with a label of its own", async () => {
    const page = await popup();
    const buttons = [...page.doc.querySelectorAll("#themeSeg button")];
    expect(buttons.map((b) => b.dataset.theme)).toEqual(["auto", "dark", "light"]);
    for (const b of buttons) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("aria-label")).toBeTruthy();
    }
  });

  test("no stored theme means Auto: it follows the system", async () => {
    const dark = await popup({ prefersLight: false });
    expect(pressed(dark)).toEqual({ auto: "true", dark: "false", light: "false" });
    expect(classes(dark)).toEqual([]);
    const light = await popup({ prefersLight: true });
    expect(pressed(light)).toEqual({ auto: "true", dark: "false", light: "false" });
    expect(classes(light)).toEqual(["theme-light"]);
  });

  test("clicking a button presses it alone, sets the body class and stores the choice", async () => {
    const page = await popup({ sync: { theme: "dark" }, prefersLight: false });
    expect(pressed(page)).toEqual({ auto: "false", dark: "true", light: "false" });
    const click = (theme) => page.doc.querySelector(`#themeSeg [data-theme="${theme}"]`).click();

    click("light");
    expect(pressed(page)).toEqual({ auto: "false", dark: "false", light: "true" });
    expect(classes(page)).toEqual(["theme-light"]);
    expect(page.calls.syncSet.at(-1)).toEqual({ theme: "light" });

    click("dark");
    expect(pressed(page)).toEqual({ auto: "false", dark: "true", light: "false" });
    expect(classes(page)).toEqual([]);
    expect(page.calls.syncSet.at(-1)).toEqual({ theme: "dark" });

    click("auto"); // the system is dark here
    expect(pressed(page)).toEqual({ auto: "true", dark: "false", light: "false" });
    expect(classes(page)).toEqual([]);
    expect(page.calls.syncSet.at(-1)).toEqual({ theme: "auto" });
  });

  test("Auto on a light system is light, and it is stored as 'auto', not as 'light'", async () => {
    const page = await popup({ sync: { theme: "dark" }, prefersLight: true });
    page.doc.querySelector('#themeSeg [data-theme="auto"]').click();
    expect(classes(page)).toEqual(["theme-light"]);
    expect(pressed(page).auto).toBe("true");
    expect(page.calls.syncSet.at(-1)).toEqual({ theme: "auto" });
  });

  test("high contrast (chosen in Settings) is shown, and none of the three buttons is pressed", async () => {
    const page = await popup({ sync: { theme: "contrast" } });
    expect(classes(page)).toEqual(["theme-contrast"]);
    expect(pressed(page)).toEqual({ auto: "false", dark: "false", light: "false" });
    page.doc.querySelector('#themeSeg [data-theme="light"]').click(); // leaving high contrast replaces it, it does not stack
    expect(classes(page)).toEqual(["theme-light"]);
  });
});

describe("popup: the PSN row once connected", () => {
  test("'synced a minute ago' in Hebrew has no stray '(1)' (CLDR 48 writes Hebrew singular forms with one)", async () => {
    const respond = { PSN_STATUS: () => ({ connected: true, profile: { onlineId: "Tester" }, gameCount: 12, dlcCount: 3, lastSync: Date.now() - 60000 }) };
    const page = loadExtensionPage("popup.html", { sync: { userLanguage: "he" }, respond });
    await until(() => page.$("psnSynced").textContent !== "", "the PSN row to be drawn");
    expect(page.$("psnText").textContent).toBe("Tester");
    expect(page.$("psnSynced").textContent).toMatch(/דקה/);
    expect(page.$("psnSynced").textContent).not.toMatch(/\(1\)/);
  });
});

describe("popup: Report a problem and the page links", () => {
  test("the button copies the diagnostics (version first), then opens the report form", async () => {
    const page = await popup();
    page.$("reportBtn").click();
    await until(() => page.calls.tabs.length > 0, "the report form to open");
    expect(page.calls.clipboard).toHaveLength(1);
    expect(page.calls.clipboard[0].split("\n")[0]).toBe(`PS Store Enhancer ${VERSION}`);
    expect(page.calls.tabs).toEqual([{ url: page.win.PSEDiag.ISSUE_URL }]);
  });

  test("the form still opens when the clipboard refuses", async () => {
    const page = await popup({ clipboardFails: true });
    page.$("reportBtn").click();
    await until(() => page.calls.tabs.length > 0, "the report form to open");
    expect(page.calls.clipboard).toEqual([]);
    expect(page.calls.tabs[0].url).toBe(page.win.PSEDiag.ISSUE_URL);
  });

  test("its tooltip explains what it does, from the translation key", async () => {
    const page = await popup();
    expect(page.$("reportBtn").getAttribute("data-i18n-title")).toBe("reportProblemHint");
    expect(page.$("reportBtn").title).toBeTruthy(); // the English fallback, for the moment before translation
  });

  test("'Advanced settings' and 'What's new' are real buttons that open Settings and the changelog", async () => {
    const page = await popup();
    expect(page.$("openOptions").tagName).toBe("BUTTON");
    expect(page.$("openChangelog").tagName).toBe("BUTTON");
    page.$("openOptions").click();
    expect(page.calls.openOptions).toBe(1);
    page.$("openChangelog").click();
    await until(() => page.calls.tabs.length > 0, "the changelog to open");
    expect(page.calls.tabs).toEqual([{ url: "chrome-extension://testextensionid/changelog.html" }]);
  });

  test("the PSN row works from the keyboard too (Enter and Space)", async () => {
    const page = await popup();
    const row = page.$("psnStatus");
    expect(row.getAttribute("role")).toBe("button");
    expect(row.tabIndex).toBe(0);
    for (const key of ["Enter", " "]) row.dispatchEvent(new page.win.KeyboardEvent("keydown", { key, bubbles: true }));
    expect(page.calls.openOptions).toBe(2);
  });

  test("every control that does something is a <button>, so the keyboard reaches it", async () => {
    const page = await popup();
    for (const id of ["reportBtn", "wipeBtn", "checkPageBtn", "psnRefresh", "openOptions", "openChangelog", "whatsNewClose"]) {
      expect([id, page.$(id).tagName]).toEqual([id, "BUTTON"]);
    }
  });
});

describe("welcome page", () => {
  test("'Open Settings' is a real button and opens Settings", async () => {
    const page = loadExtensionPage("welcome.html");
    await until(() => page.doc.documentElement.dir !== "", "the welcome page to finish starting");
    expect(page.$("openSettings").tagName).toBe("BUTTON");
    page.$("openSettings").click();
    expect(page.calls.openOptions).toBe(1);
  });
});

describe("Settings: Report a problem", () => {
  const toast = (page) => page.$("toast");

  test("when the diagnostics were copied: the toast says so and the form opens", async () => {
    const page = await settings();
    page.$("reportBtn").click();
    await until(() => toast(page).classList.contains("show"), "the toast");
    expect(toast(page).textContent).toBe(en.reportProblemCopied.message);
    expect(page.calls.clipboard[0].split("\n")[0]).toBe(`PS Store Enhancer ${VERSION}`);
    expect(page.calls.tabs).toEqual([{ url: page.win.PSEDiag.ISSUE_URL }]);
  });

  test("when the copy failed: the toast says the form opened but nothing was copied, and where to copy from", async () => {
    const page = await settings({ clipboardFails: true });
    page.$("reportBtn").click();
    await until(() => toast(page).classList.contains("show"), "the toast");
    expect(toast(page).textContent).toBe(en.reportProblemNotCopied.message);
    expect(toast(page).textContent).not.toBe(en.reportProblemCopied.message);
    expect(en.reportProblemNotCopied.message).toContain(en.diagTitle.message); // it names the Diagnostics section
    expect(page.calls.tabs).toHaveLength(1); // the form opens either way
  });

  test("its tooltip uses the translation key", async () => {
    const page = await settings();
    expect(page.$("reportBtn").getAttribute("data-i18n-title")).toBe("reportProblemHint");
    expect(page.$("reportBtn").title).toBe(en.reportProblemHint.message);
  });
});

describe("Settings: side navigation", () => {
  test("every link points at a section that exists", async () => {
    const page = await settings();
    const links = [...page.doc.querySelectorAll(".nav a[href^='#sec-']")];
    expect(links.length).toBeGreaterThanOrEqual(7);
    expect(links.filter((a) => !page.$(a.getAttribute("href").slice(1))).map((a) => a.getAttribute("href"))).toEqual([]);
    expect(new Set(links.map((a) => a.getAttribute("href"))).size).toBe(links.length);
  });

  test("clicking a link marks it, and only it, as the current section", async () => {
    const page = await settings();
    const links = [...page.doc.querySelectorAll(".nav a[href^='#sec-']")];
    links[2].click();
    expect(links.map((a) => a.classList.contains("on"))).toEqual(links.map((_, i) => i === 2));
    links[4].click();
    expect(links.map((a) => a.classList.contains("on"))).toEqual(links.map((_, i) => i === 4));
  });

  test("the bar's real height is written to --nav-h, so a picked section is scrolled clear of it", async () => {
    const page = await settings({
      beforeScripts: (w) => Object.defineProperty(w.HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 74 })
    });
    expect(page.doc.documentElement.style.getPropertyValue("--nav-h")).toBe("74px");
  });
});

describe("page scripts and their markup agree", () => {
  test.each([["popup.html", "popup.js"], ["options.html", "options.js"], ["welcome.html", "welcome.js"]])("%s has every id that %s looks up by name", (html, js) => {
    const markup = fs.readFileSync(path.join(EXT, html), "utf8");
    const ids = new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const code = fs.readFileSync(path.join(EXT, js), "utf8");
    const wanted = [...code.matchAll(/(?:\$|getElementById)\(\s*"([\w-]+)"\s*\)/g)].map((m) => m[1]);
    expect(wanted.length).toBeGreaterThan(0);
    expect(wanted.filter((id) => !ids.has(id))).toEqual([]);
  });
});
