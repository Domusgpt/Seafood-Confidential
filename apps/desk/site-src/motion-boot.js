// Seafood Confidential · motion boot (sc-visual-codex, v0.7.0).
// A tiny synchronous script in <head>, so it runs before the first paint. It decides whether this
// visit animates, so elements that wait to be revealed never flash. Motion is off when the site
// ships still (data-motion-preset="off"), when the reader turned it off (the footer toggle), or when
// the device asks for reduced motion. If the motion script never arrives (blocked, offline, an
// error), everything is shown after a moment: no content ever depends on JavaScript.
(function () {
  var d = document.documentElement;
  var off = (d.getAttribute('data-motion-preset') || 'standard') === 'off';
  try {
    if (window.localStorage.getItem('sc-motion') === 'off') off = true;
  } catch {
    // storage blocked: keep the site's own setting
  }
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) off = true;
  if (off) {
    d.setAttribute('data-motion', 'off');
    return;
  }
  d.classList.add('motion-ready');
  window.setTimeout(function () {
    if (!window.__scMotion) d.classList.remove('motion-ready');
  }, 2500);
})();
