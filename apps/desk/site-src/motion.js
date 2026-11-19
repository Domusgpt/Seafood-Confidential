// Seafood Confidential · motion (sc-visual-codex, v0.7.0). GSAP 3 + ScrollTrigger, self-hosted.
//
// One system, tuned from brand/tokens.json: every duration, distance, parallax depth and easing is
// read from the --motion-* custom properties, and the site's preset (data-motion-preset: calm,
// standard, expressive) scales them. Nothing here hard-codes a feel.
//
// - Depth: the masthead and section headers are stacks of layers (bathymetry, contours, light, type)
//   that move at different speeds as the page scrolls.
// - Text: page titles rise word by word; eyebrows, summaries and bylines follow.
// - Images: frames open from their edges and develop from muted to full colour; the photograph
//   drifts inside its frame as it passes.
// - Reading: cards, figures and notes rise into place; a rule draws across each section heading; a
//   bar under the navigation shows how far through a story the reader is.
// - Everything scroll-linked reverses when the reader scrolls back.
// - Off switches: the footer toggle (remembered), prefers-reduced-motion (live), or a still site
//   (data-motion-preset="off"). Turning motion off reverts every change, so the page is exactly the
//   server's HTML again. Without JavaScript nothing is hidden (see motion-boot.js).
(function () {
  'use strict';
  var d = document.documentElement;
  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var STORE = 'sc-motion';
  var preset = d.getAttribute('data-motion-preset') || 'standard';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var small = window.matchMedia('(max-width: 719px)');
  var toggle = document.querySelector('[data-motion-toggle]');
  var ctx = null;
  var cleanups = [];
  var splits = [];

  function stored() {
    try {
      return window.localStorage.getItem(STORE);
    } catch {
      return null;
    }
  }
  function store(value) {
    try {
      if (value) window.localStorage.setItem(STORE, value);
      else window.localStorage.removeItem(STORE);
    } catch {
      // storage blocked: the choice lasts for this page only
    }
  }
  function enabled() {
    return Boolean(gsap && ScrollTrigger) && preset !== 'off' && stored() !== 'off' && !reduced.matches;
  }
  function token(name, fallback) {
    var raw = window.getComputedStyle(d).getPropertyValue(name).trim();
    var n = parseFloat(raw);
    return isNaN(n) ? fallback : n;
  }
  function ease(name, fallback) {
    return window.getComputedStyle(d).getPropertyValue(name).trim() || fallback;
  }
  function tokens() {
    return {
      scale: token('--motion-scale', 1),
      speed: token('--motion-speed', 1),
      base: token('--motion-duration-base', 760) / 1000,
      slow: token('--motion-duration-slow', 1150) / 1000,
      hero: token('--motion-duration-hero', 1500) / 1000,
      out: ease('--motion-gsap-ease-out', 'expo.out'),
      soft: ease('--motion-gsap-ease-soft', 'power2.out'),
      reveal: token('--motion-distance-reveal', 34),
      tilt: token('--motion-distance-tilt', 3),
      stagger: token('--motion-stagger', 0.075),
      deep: token('--motion-parallax-deep', 0.5),
      mid: token('--motion-parallax-mid', 0.3),
      near: token('--motion-parallax-near', 0.14),
      type: token('--motion-parallax-type', -0.12),
      media: token('--motion-parallax-media', 0.16),
      mediaScale: token('--motion-media-scale', 1.16),
    };
  }

  // ---------- Layers ----------
  function depthLayers(T) {
    gsap.utils.toArray('[data-masthead]').forEach(function (host) {
      gsap.utils.toArray(host.querySelectorAll('[data-depth]')).forEach(function (layer) {
        var kind = layer.getAttribute('data-depth');
        var depth = T[kind] || 0;
        var vars = {
          y: function () {
            return depth * host.offsetHeight * T.scale;
          },
          ease: 'none',
          scrollTrigger: {
            trigger: host,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
            invalidateOnRefresh: true,
          },
        };
        if (kind === 'type') vars.opacity = 0.2;
        gsap.to(layer, vars);
      });
    });
  }

  // ---------- Titles: word by word ----------
  var TITLES = '.story__title, .feature__title, .page-title, .section-hero__title';
  function split(el) {
    var target = el.querySelector('a') || el;
    var text = target.textContent;
    if (!text || !text.trim() || target.children.length) return null;
    // Each word gets its own span, with real spaces between: the heading's text (what screen
    // readers, find-in-page, copying and translation see) stays exactly the original.
    var shown = document.createElement('span');
    shown.className = 'split';
    text
      .trim()
      .split(/\s+/)
      .forEach(function (word, i) {
        if (i) shown.appendChild(document.createTextNode(' '));
        var w = document.createElement('span');
        w.className = 'split__w';
        var inner = document.createElement('span');
        inner.className = 'split__i';
        inner.textContent = word;
        w.appendChild(inner);
        shown.appendChild(w);
      });
    target.textContent = '';
    target.appendChild(shown);
    splits.push({ el: el, target: target, text: text });
    el.classList.add('is-split');
    return shown.querySelectorAll('.split__i');
  }
  function unsplit() {
    splits.forEach(function (s) {
      s.target.textContent = s.text;
      s.el.classList.remove('is-split');
    });
    splits = [];
  }
  function inView(el, fraction) {
    return el.getBoundingClientRect().top < window.innerHeight * (fraction || 1);
  }
  function titles(T) {
    gsap.utils.toArray(TITLES).forEach(function (el) {
      var words = split(el);
      if (!words) return;
      var from = { yPercent: 118, rotate: Math.min(4, 2.5 * T.scale), opacity: 0 };
      var to = {
        yPercent: 0,
        rotate: 0,
        opacity: 1,
        duration: T.hero * T.speed,
        ease: T.out,
        stagger: T.stagger * 0.6,
      };
      if (inView(el)) gsap.fromTo(words, from, Object.assign(to, { delay: 0.05 }));
      else
        gsap.fromTo(
          words,
          from,
          Object.assign(to, {
            scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
          }),
        );
    });
    // What follows a title arrives just after it: eyebrow, summary, byline.
    gsap.utils
      .toArray('.feature__panel, .story__header, .section-hero__inner, .wrap--empty')
      .forEach(function (group) {
        var parts = gsap.utils.toArray(group.querySelectorAll(':scope > :not(h1):not(h2)'));
        if (!parts.length) return;
        gsap.fromTo(
          parts,
          { opacity: 0, y: (T.reveal / 2) * T.scale },
          { opacity: 1, y: 0, duration: T.base * T.speed, ease: T.out, stagger: T.stagger, delay: 0.25 },
        );
      });
  }

  // ---------- Things that rise into place ----------
  function reveals(T) {
    var items = gsap.utils.toArray('[data-reveal]');
    if (!items.length) return;
    var away = { opacity: 0, y: T.reveal * T.scale };
    gsap.set(items, away);
    ScrollTrigger.batch(items, {
      start: 'top 92%',
      onEnter: function (batch) {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: T.base * T.speed,
          ease: T.out,
          stagger: T.stagger,
          overwrite: true,
        });
      },
      onLeaveBack: function (batch) {
        gsap.to(
          batch,
          Object.assign(
            { duration: T.base * T.speed * 0.5, ease: T.soft, stagger: T.stagger * 0.5, overwrite: true },
            away,
          ),
        );
      },
    });
    // Keyboard and find-in-page land on content before it scrolls in: show it at once.
    var show = function (e) {
      var item = e.target.closest && e.target.closest('[data-reveal]');
      if (item) gsap.to(item, { opacity: 1, y: 0, duration: 0.2, overwrite: true });
    };
    document.addEventListener('focusin', show);
    cleanups.push(function () {
      document.removeEventListener('focusin', show);
    });
  }

  // ---------- Images ----------
  function images(T) {
    gsap.utils.toArray('[data-media]').forEach(function (frame) {
      var pic = frame.querySelector('picture');
      if (!pic) return;
      // The photograph drifts inside its frame; it is scaled just enough that no edge ever shows.
      var room = ((T.mediaScale - 1) / 2) * 0.92;
      var travel = Math.min(T.media * T.scale, room) * 100;
      gsap.set(pic, { scale: T.mediaScale, transformOrigin: '50% 50%' });
      gsap.fromTo(
        pic,
        { yPercent: -travel },
        {
          yPercent: travel,
          ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
        },
      );
      // The frame opens from its edges and the picture develops into full colour.
      var radius = window.getComputedStyle(frame).borderTopLeftRadius || '0px';
      var inset = Math.round(7 * Math.min(1.4, T.scale));
      var closed = {
        clipPath:
          'inset(' +
          inset +
          '% ' +
          inset * 0.8 +
          '% ' +
          inset +
          '% ' +
          inset * 0.8 +
          '% round ' +
          radius +
          ')',
      };
      var open = { clipPath: 'inset(0% 0% 0% 0% round ' + radius + ')' };
      if (!small.matches) {
        closed.filter = 'saturate(0.35) brightness(0.9)';
        open.filter = 'saturate(1) brightness(1)';
      }
      if (inView(frame, 0.92))
        gsap.fromTo(
          frame,
          closed,
          Object.assign({ duration: T.hero * T.speed, ease: T.out, delay: 0.1 }, open),
        );
      else
        gsap.fromTo(
          frame,
          closed,
          Object.assign(
            {
              ease: 'none',
              scrollTrigger: { trigger: frame, start: 'top 100%', end: 'top 80%', scrub: 0.5 },
            },
            open,
          ),
        );
    });
  }

  // ---------- Section rules and reading progress ----------
  function rules() {
    gsap.utils.toArray('.rule-heading').forEach(function (h) {
      gsap.fromTo(
        h,
        { '--rule': 0 },
        {
          '--rule': 1,
          ease: 'none',
          scrollTrigger: { trigger: h, start: 'top 96%', end: 'top 70%', scrub: 0.5 },
        },
      );
    });
  }
  function progress() {
    var bar = document.querySelector('.progress__bar');
    var story = document.querySelector('.story');
    if (!bar || !story) return;
    gsap.fromTo(
      bar,
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { trigger: story, start: 'top top', end: 'bottom bottom', scrub: 0.25 },
      },
    );
  }

  // ---------- The lead panel leans toward the pointer ----------
  function tilt(T) {
    if (!finePointer.matches) return;
    gsap.utils.toArray('[data-tilt]').forEach(function (el) {
      gsap.set(el, { transformPerspective: 1000 });
      var rx = gsap.quickTo(el, 'rotationX', { duration: 0.7, ease: T.soft });
      var ry = gsap.quickTo(el, 'rotationY', { duration: 0.7, ease: T.soft });
      var move = function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        rx(-py * T.tilt * 2 * Math.min(T.scale, 1.5));
        ry(px * T.tilt * 2 * Math.min(T.scale, 1.5));
        el.style.setProperty('--lx', Math.round((px + 0.5) * 100) + '%');
        el.style.setProperty('--ly', Math.round((py + 0.5) * 100) + '%');
      };
      var leave = function () {
        rx(0);
        ry(0);
        el.style.removeProperty('--lx');
        el.style.removeProperty('--ly');
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      cleanups.push(function () {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
        leave();
      });
    });
  }

  // ---------- Start and stop ----------
  function start() {
    if (!enabled()) return stop();
    d.setAttribute('data-motion', preset);
    d.classList.add('motion-ready');
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    var T = tokens();
    ctx = gsap.context(function () {
      depthLayers(T);
      titles(T);
      reveals(T);
      images(T);
      rules();
      progress();
      tilt(T);
    });
    window.__scMotion = true;
    // Late images change heights: measure again once they arrive.
    gsap.utils.toArray('img').forEach(function (img) {
      if (img.complete) return;
      var refresh = function () {
        ScrollTrigger.refresh();
      };
      img.addEventListener('load', refresh, { once: true });
    });
  }
  function stop() {
    cleanups.forEach(function (fn) {
      fn();
    });
    cleanups = [];
    if (ctx) ctx.revert();
    ctx = null;
    unsplit();
    // The server's HTML never carries inline styles (the CSP forbids them), so anything left on an
    // element motion touched came from motion: clear it, and the page is exactly the server's again.
    var touched = document.querySelectorAll(
      '[data-depth], [data-reveal], [data-media], [data-media] picture, [data-tilt], .progress__bar, .rule-heading, ' +
        '.feature__panel > *, .story__header > *, .section-hero__inner > *, .wrap--empty > *',
    );
    for (var i = 0; i < touched.length; i++) touched[i].removeAttribute('style');
    d.classList.remove('motion-ready');
    d.setAttribute('data-motion', 'off');
    window.__scMotion = true;
  }
  function restart() {
    stop();
    start();
    if (enabled()) ScrollTrigger.refresh();
    render();
  }

  // ---------- The reader's switch ----------
  function render() {
    if (!toggle || preset === 'off') return;
    var on = stored() !== 'off' && !reduced.matches;
    toggle.hidden = false;
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.textContent = on ? 'Animation: on' : 'Animation: off';
    toggle.disabled = reduced.matches;
    if (reduced.matches) toggle.title = 'Your device asks for reduced motion, so animation stays off.';
    else toggle.removeAttribute('title');
  }
  if (toggle && preset !== 'off')
    toggle.addEventListener('click', function () {
      store(stored() === 'off' ? null : 'off');
      restart();
    });
  if (reduced.addEventListener) reduced.addEventListener('change', restart);

  // ---------- Navigation depth when it sticks (not motion: always on) ----------
  var nav = document.querySelector('.sections');
  if (nav && 'IntersectionObserver' in window) {
    var sentinel = document.createElement('div');
    sentinel.className = 'sections-sentinel';
    sentinel.setAttribute('aria-hidden', 'true');
    nav.parentNode.insertBefore(sentinel, nav);
    new IntersectionObserver(function (entries) {
      nav.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  start();
  render();
})();
