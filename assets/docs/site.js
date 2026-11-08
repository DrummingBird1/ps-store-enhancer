/* Optional niceties for the site's top bar. The pages work without this file:
   - closes the narrow-screen menu after a link is chosen, on Escape and on a click outside it
   - marks the link of the section being read with aria-current="location" */
(function () {
  "use strict";
  var menu = document.querySelector(".nav-menu");
  if (!menu) return;

  function close(refocus) {
    if (!menu.open) return;
    menu.open = false;
    if (refocus) { var s = menu.querySelector("summary"); if (s) s.focus(); }
  }
  menu.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("a")) close(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close(true);
  });
  document.addEventListener("click", function (e) {
    if (!menu.contains(e.target)) close(false);
  });

  if (!("IntersectionObserver" in window)) return;
  var links = {};
  Array.prototype.forEach.call(menu.querySelectorAll('a[href^="#"]'), function (a) {
    links[a.getAttribute("href").slice(1)] = a;
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      Object.keys(links).forEach(function (id) { links[id].removeAttribute("aria-current"); });
      var a = links[en.target.id];
      if (a) a.setAttribute("aria-current", "location");
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  Object.keys(links).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) io.observe(el);
  });

  // The last section can never reach the observer's band when the page ends below it: mark it at the bottom.
  // Near the top (the hero) no section link is current.
  var ids = Object.keys(links), ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var de = document.documentElement;
      var atBottom = window.innerHeight + window.scrollY >= de.scrollHeight - 4;
      if (!atBottom && window.scrollY > 120) return;
      ids.forEach(function (id) { links[id].removeAttribute("aria-current"); });
      if (atBottom) links[ids[ids.length - 1]].setAttribute("aria-current", "location");
    });
  }, { passive: true });
})();
