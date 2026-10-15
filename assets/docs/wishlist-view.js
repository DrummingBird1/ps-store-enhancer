/* Read-only viewer for a wishlist shared from PS Store Enhancer.
 *
 * The list lives entirely in the URL fragment (#…), which browsers never send to a server, so
 * nothing is uploaded or stored anywhere. The decoder mirrors decodeShareList() in
 * extension/helpers.js (tests/wishlist-view.test.js keeps the two in sync). Everything is rendered
 * with textContent — never innerHTML — so a crafted link cannot inject markup.
 */
(function (root) {
  "use strict";

  function b64urlDecode(s) {
    var pad = "=".repeat((4 - (s.length % 4)) % 4);
    var bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function decodeShareList(fragment) {
    try {
      var data = JSON.parse(b64urlDecode(String(fragment || "").replace(/^#/, "")));
      if (!data || data.v !== 1 || !Array.isArray(data.i)) return [];
      return data.i
        .slice(0, 200)
        .filter(function (x) { return x && typeof x.n === "string" && x.n.trim(); })
        .map(function (x) {
          return {
            name: x.n.slice(0, 120),
            price: typeof x.p === "number" && isFinite(x.p) && x.p >= 0 ? x.p : null
          };
        });
    } catch (e) {
      return [];
    }
  }

  function render(doc, list) {
    var ul = doc.getElementById("list");
    var empty = doc.getElementById("empty");
    var count = doc.getElementById("count");
    ul.textContent = "";
    if (!list.length) {
      empty.hidden = false;
      count.textContent = "";
      return;
    }
    empty.hidden = true;
    count.textContent = list.length + (list.length === 1 ? " game" : " games");
    list.forEach(function (g) {
      var li = doc.createElement("li");
      var a = doc.createElement("a");
      a.href = "https://store.playstation.com/en-us/search/" + encodeURIComponent(g.name);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = g.name;
      li.appendChild(a);
      if (g.price != null) {
        var p = doc.createElement("span");
        p.className = "price";
        p.textContent = "PC from $" + g.price.toFixed(2);
        li.appendChild(p);
      }
      ul.appendChild(li);
    });
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { decodeShareList: decodeShareList };
  if (root && root.document) {
    var run = function () { render(root.document, decodeShareList(root.location.hash)); };
    root.addEventListener("hashchange", run);
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", run);
    else run();
  }
})(typeof window !== "undefined" ? window : undefined);
