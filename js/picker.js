import {
  cleanHex,
  hexToOklch,
  maxChroma,
  oklchToHex,
  oklchToRgb,
} from './color.js';

const CMAX = 0.37;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d) => String(Number(v.toFixed(d)));

export function createPicker({
  root,
  trigger,
  bar,
  getBase,
  getPalette,
  getRecent,
  fetchName,
  onChange,
}) {
  const $ = (s) => root.querySelector(s);
  const plane = $('.pk-plane');
  const canvas = $('.pk-plane canvas');
  const dot = $('.pk-dot');
  const hue = $('.pk-hue');
  const thumb = $('.pk-hue-thumb');
  const now = $('.pk-now');
  const beforeBtn = $('.pk-before');
  const nameEl = $('.pk-name');
  const hexEl = $('.pk-hexline');
  const inputs = {
    hex: $('#pk-hex'),
    l: $('#pk-l'),
    c: $('#pk-c'),
    h: $('#pk-h'),
  };
  const paletteRow = $('#pk-palette');
  const recentRow = $('#pk-recent');
  const eyedropper = $('.pk-eyedropper');

  let lch = { l: 0.6, c: 0.1, h: 180 };
  let hex = '000000';
  let before = '000000';
  let planeHue = null;
  let raf = 0;
  let nameTimer = 0;
  let nameCtrl = null;
  let open = false;

  const stops = Array.from({ length: 13 }, (_, i) => {
    const h = i * 30;
    return `#${oklchToHex({ l: 0.75, c: 0.13, h })} ${((i / 12) * 100).toFixed(2)}%`;
  });
  hue.style.setProperty(
    '--track',
    `linear-gradient(to right, ${stops.join(', ')})`,
  );

  function drawPlane() {
    raf = 0;
    const w = plane.clientWidth;
    const h = plane.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      planeHue = null;
    }
    if (planeHue === lch.h) return;
    planeHue = lch.h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      const l = 1 - y / (h - 1);
      const edge = maxChroma(l, lch.h);
      for (let x = 0; x < w; x++) {
        const rgb = oklchToRgb({ l, c: (x / (w - 1)) * edge, h: lch.h });
        const i = (y * w + x) * 4;
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function schedulePlane() {
    if (!raf) raf = requestAnimationFrame(drawPlane);
  }

  function paint(skip) {
    hex = oklchToHex(lch);
    const shown = hexToOklch(hex);
    const edge = maxChroma(lch.l, lch.h);
    dot.style.left = `${edge > 0.0005 ? clamp(lch.c / edge, 0, 1) * 100 : 0}%`;
    dot.style.top = `${(1 - lch.l) * 100}%`;
    dot.style.background = `#${hex}`;
    thumb.style.left = `${(lch.h / 360) * 100}%`;
    thumb.style.background = `#${oklchToHex({ l: 0.75, c: 0.13, h: lch.h })}`;
    now.style.background = `#${hex}`;
    hexEl.textContent = `#${hex}`;
    if (skip !== 'hex') inputs.hex.value = `#${hex}`;
    if (skip !== 'l') inputs.l.value = round(lch.l * 100, 1);
    if (skip !== 'c') inputs.c.value = round(shown.c, 3);
    if (skip !== 'h') inputs.h.value = round(lch.h, 0);
    for (const el of [inputs.hex, inputs.l, inputs.c, inputs.h]) {
      if (el.dataset.key !== skip) el.removeAttribute('aria-invalid');
    }
    plane.setAttribute(
      'aria-valuetext',
      `Lightness ${round(lch.l * 100, 0)}%, chroma ${round(shown.c, 3)}`,
    );
    hue.setAttribute('aria-valuenow', String(Math.round(lch.h)));
    schedulePlane();
    lookupName();
  }

  function lookupName() {
    clearTimeout(nameTimer);
    nameCtrl?.abort();
    nameTimer = setTimeout(async () => {
      const ctrl = new AbortController();
      nameCtrl = ctrl;
      const target = hex;
      try {
        const name = await fetchName(target, ctrl.signal);
        if (target === hex) nameEl.textContent = name || ' ';
      } catch {}
    }, 280);
  }

  function set(next, { skip, commit = false } = {}) {
    lch = {
      l: clamp(next.l, 0, 1),
      c: clamp(next.c, 0, CMAX),
      h: ((next.h % 360) + 360) % 360,
    };
    paint(skip);
    onChange(hex, { commit });
  }

  function fromHex(value) {
    const next = hexToOklch(value);
    if (next.c < 0.002) next.h = lch.h;
    return next;
  }

  function planeAt(e) {
    const r = plane.getBoundingClientRect();
    const l = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    return { l, c: x * maxChroma(l, lch.h), h: lch.h };
  }

  function drag(el, move) {
    let active = false;
    el.addEventListener('pointerdown', (e) => {
      active = true;
      el.setPointerCapture(e.pointerId);
      root.classList.add('dragging');
      move(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (active) move(e);
    });
    const end = () => {
      if (!active) return;
      active = false;
      root.classList.remove('dragging');
      onChange(hex, { commit: true });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  drag(plane, (e) => set(planeAt(e)));
  drag(hue, (e) => {
    const r = hue.getBoundingClientRect();
    const h = clamp((e.clientX - r.left) / r.width, 0, 1) * 359.9;
    set({ l: lch.l, c: Math.min(lch.c, maxChroma(lch.l, h)), h });
  });

  plane.addEventListener('keydown', (e) => {
    const big = e.shiftKey ? 4 : 1;
    const moves = {
      ArrowUp: [0.01, 0],
      ArrowDown: [-0.01, 0],
      ArrowRight: [0, 0.005],
      ArrowLeft: [0, -0.005],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const edge = maxChroma(lch.l, lch.h);
    const rel = edge > 0.0005 ? lch.c / edge : 0;
    const l = clamp(lch.l + m[0] * big, 0, 1);
    const nextRel = clamp(rel + m[1] * 4 * big, 0, 1);
    set({ l, c: nextRel * maxChroma(l, lch.h), h: lch.h }, { commit: true });
  });

  hue.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[
      e.key
    ];
    if (!d) return;
    e.preventDefault();
    const h = lch.h + d * (e.shiftKey ? 15 : 2);
    set(
      { l: lch.l, c: Math.min(lch.c, maxChroma(lch.l, h)), h },
      { commit: true },
    );
  });

  inputs.hex.dataset.key = 'hex';
  inputs.l.dataset.key = 'l';
  inputs.c.dataset.key = 'c';
  inputs.h.dataset.key = 'h';

  inputs.hex.addEventListener('input', () => {
    const v = cleanHex(inputs.hex.value);
    const full = inputs.hex.value.replace('#', '').length === 6;
    if (v && full) set(fromHex(v), { skip: 'hex' });
  });

  for (const key of ['l', 'c', 'h']) {
    const el = inputs[key];
    el.addEventListener('input', () => {
      const n = Number.parseFloat(el.value);
      const limits = { l: [0, 100], c: [0, CMAX], h: [0, 360] };
      if (Number.isNaN(n) || n < limits[key][0] || n > limits[key][1]) {
        el.setAttribute('aria-invalid', 'true');
        return;
      }
      el.removeAttribute('aria-invalid');
      const next = { ...lch, [key]: key === 'l' ? n / 100 : n };
      next.c = Math.min(next.c, maxChroma(next.l, next.h));
      set(next, { skip: key });
    });
  }

  for (const el of Object.values(inputs)) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        el.blur();
        onChange(hex, { commit: true });
      }
    });
    el.addEventListener('blur', () => paint());
    el.addEventListener('focus', () => el.select());
  }

  function swatchButtons(row, hexes, label) {
    row.replaceChildren();
    for (const h of hexes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pk-swatch';
      b.style.background = `#${h}`;
      b.setAttribute('aria-label', `${label} #${h}`);
      b.addEventListener('click', () => set(fromHex(h), { commit: true }));
      row.append(b);
    }
    row.parentElement.hidden = hexes.length === 0;
  }

  beforeBtn.addEventListener('click', () =>
    set(fromHex(before), { commit: true }),
  );

  if ('EyeDropper' in window) {
    eyedropper.hidden = false;
    eyedropper.addEventListener('click', async () => {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        const v = cleanHex(sRGBHex);
        if (v) set(fromHex(v), { commit: true });
      } catch {}
    });
  }

  function position() {
    const gutter = innerWidth < 360 ? 10 : 16;
    const barRect = bar.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const wide = barRect.top < 420 && innerWidth >= 540;
    root.classList.toggle('wide', wide);
    const width = Math.min(wide ? 560 : 328, innerWidth - gutter * 2);
    root.style.width = `${width}px`;
    const left = clamp(anchor.left - 10, gutter, innerWidth - width - gutter);
    root.style.left = `${left}px`;
    let room = barRect.top - 16;
    root.style.bottom = `${innerHeight - barRect.top + 8}px`;
    if (wide && room < 200) {
      room = innerHeight - 16;
      root.style.bottom = '8px';
    }
    root.classList.remove('tight');
    root.style.setProperty('--plane-h', '176px');
    let extra = root.offsetHeight - 176;
    if (!wide && room - extra < 120) {
      root.classList.add('tight');
      extra = root.offsetHeight - 176;
    }
    root.style.setProperty(
      '--plane-h',
      `${clamp(room - extra - 4, 72, 176)}px`,
    );
    planeHue = null;
    schedulePlane();
  }

  function show() {
    if (open) return;
    open = true;
    before = getBase();
    lch = fromHex(before);
    beforeBtn.style.background = `#${before}`;
    beforeBtn.setAttribute('aria-label', `Back to #${before}`);
    swatchButtons(paletteRow, getPalette(), 'Use');
    swatchButtons(recentRow, getRecent(), 'Use');
    nameEl.textContent = ' ';
    root.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    position();
    paint();
    if (!reduced()) {
      root.animate(
        [
          { opacity: 0, transform: 'translateY(6px) scale(0.97)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 180, easing: EASE_OUT },
      );
    }
    plane.focus({ preventScroll: true });
  }

  async function hide({ refocus = false } = {}) {
    if (!open) return;
    open = false;
    trigger.setAttribute('aria-expanded', 'false');
    clearTimeout(nameTimer);
    nameCtrl?.abort();
    if (!reduced()) {
      await root
        .animate(
          [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'translateY(4px) scale(0.98)' },
          ],
          { duration: 120, easing: EASE_OUT },
        )
        .finished.catch(() => {});
    }
    if (!open) root.hidden = true;
    if (refocus) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => (open ? hide() : show()));
  document.addEventListener('pointerdown', (e) => {
    if (!open) return;
    if (root.contains(e.target) || trigger.contains(e.target)) return;
    hide();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      hide({ refocus: true });
    }
  });
  addEventListener('resize', () => open && position());

  return {
    show,
    hide,
    get isOpen() {
      return open;
    },
  };
}
