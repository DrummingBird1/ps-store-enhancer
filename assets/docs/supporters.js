/* Renders the opt-in supporters wall from supporters.json. The section stays hidden while the
   list is empty. Names are inserted with textContent only. */
(function () {
  "use strict";
  var section = document.getElementById("supporters");
  var list = document.getElementById("supporters-list");
  if (!section || !list) return;
  fetch("supporters.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : { supporters: [] }; })
    .then(function (data) {
      var names = Array.isArray(data.supporters) ? data.supporters : [];
      names.slice(0, 500).forEach(function (n) {
        if (typeof n !== "string" || !n.trim()) return;
        var span = document.createElement("span");
        span.className = "lang-tag";
        span.textContent = n.slice(0, 60);
        list.appendChild(span);
      });
      if (list.children.length) section.hidden = false;
    })
    .catch(function () { /* wall stays hidden */ });
})();
