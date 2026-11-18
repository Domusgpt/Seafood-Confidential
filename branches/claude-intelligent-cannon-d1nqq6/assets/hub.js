// Hub interactions: theme toggle, chart tooltips (hover + keyboard focus), dependency highlighting.
// Tooltips enhance only: every value is also in a direct label or the chart's table view.
(() => {
  // ---- Theme toggle (light / dark / system), remembered per viewer when storage is available.
  const root = document.documentElement;
  const toggle = document.querySelector('[data-theme-toggle]');
  const read = () => {
    try {
      return localStorage.getItem('sc-hub-theme');
    } catch {
      return null;
    }
  };
  const write = (v) => {
    try {
      v ? localStorage.setItem('sc-hub-theme', v) : localStorage.removeItem('sc-hub-theme');
    } catch {
      /* storage unavailable: theme simply isn't remembered */
    }
  };
  const apply = (v) => {
    if (v) root.setAttribute('data-theme', v);
    else root.removeAttribute('data-theme');
    if (toggle)
      toggle.textContent = v === 'dark' ? 'Theme: dark' : v === 'light' ? 'Theme: light' : 'Theme: system';
  };
  apply(read());
  toggle?.addEventListener('click', () => {
    const order = [null, 'light', 'dark'];
    const next = order[(order.indexOf(read()) + 1) % order.length];
    write(next);
    apply(next);
  });

  // ---- Tooltips for chart rows and graph nodes.
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'status');
  tip.hidden = true;
  document.body.appendChild(tip);
  const show = (el, x, y) => {
    tip.textContent = el.getAttribute('data-tip');
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8);
    const top = y + 18 + r.height > window.innerHeight ? y - r.height - 12 : y + 18;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };
  const hide = () => {
    tip.hidden = true;
  };
  document.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointermove', (e) => show(el, e.clientX, e.clientY));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', () => {
      const r = el.getBoundingClientRect();
      show(el, r.left + 8, r.bottom - 10);
    });
    el.addEventListener('blur', hide);
  });
  window.addEventListener('scroll', hide, { passive: true });

  // ---- Dependency graph: highlight a node's incoming and outgoing edges.
  document.querySelectorAll('.viz-deps').forEach((svg) => {
    const edges = [...svg.querySelectorAll('.dep-edge')];
    const set = (id) => {
      svg.classList.toggle('is-hovering', Boolean(id));
      edges.forEach((e) =>
        e.classList.toggle('is-related', Boolean(id) && (e.dataset.from === id || e.dataset.to === id)),
      );
    };
    svg.querySelectorAll('.dep-node').forEach((n) => {
      n.addEventListener('pointerenter', () => set(n.dataset.id));
      n.addEventListener('pointerleave', () => set(null));
      n.addEventListener('focus', () => set(n.dataset.id));
      n.addEventListener('blur', () => set(null));
    });
  });
})();
