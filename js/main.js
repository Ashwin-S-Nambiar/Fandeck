import { fetchName, fetchScheme, knownName, rememberName } from './api.js';
import {
  cleanHex,
  contrast,
  FORMATS,
  formatColor,
  grade,
  hexToRgb,
  inkFor,
  localScheme,
  MODES,
  randomBase,
  rgbToHex,
  roles,
} from './color.js';
import { download, toCss, toJson, toPng, toTailwind } from './exporters.js';
import { createSheet } from './sheet.js';
import { setSound, sfx, soundOn } from './sound.js';
import {
  clearHistory,
  haptic,
  load,
  pushHistory,
  readHistory,
  save,
} from './store.js';

const COUNT = 5;
const APP = 'Color Scheme Generator';
const $ = (s, el = document) => el.querySelector(s);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const els = {
  swatches: $('#swatches'),
  stage: $('#stage'),
  preview: $('#preview'),
  mock: $('.mock'),
  picker: $('#seed-picker'),
  hex: $('#seed-hex'),
  seed: $('.seed'),
  eyedropper: $('#eyedropper-btn'),
  format: $('#format-btn'),
  share: $('#share-btn'),
  exportBtn: $('#export-btn'),
  shuffle: $('#shuffle-btn'),
  modesList: $('.modes-list[role="radiogroup"]'),
  modesOn: $('.modes-on'),
  view: $('#view-btn'),
  historyBtn: $('#history-btn'),
  sound: $('#sound-btn'),
  theme: $('#theme-btn'),
  toast: $('#toast'),
  glow: [...document.querySelectorAll('.glow i')],
};

const state = {
  base: '7C3AED',
  mode: load('csg:mode', 'analogic'),
  swatches: [],
  format: load('csg:format', 'hex'),
  view: 'swatches',
};

if (!MODES.some((m) => m.id === state.mode)) state.mode = 'analogic';
if (!FORMATS.includes(state.format)) state.format = 'hex';

const undoStack = [];
let committed = null;
let controller = null;
let pendingTimer = 0;
let historyTimer = 0;
let seedTimer = 0;
let glowIndex = 0;

function setTitle(section) {
  document.title = section ? `${section} · ${APP}` : APP;
}

function currentTitle() {
  return state.view === 'preview' ? 'Preview' : '';
}

function mix(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  });
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function buildSwatches() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('article');
    el.className = 'swatch';
    el.dataset.i = i;
    el.innerHTML = `
      <div class="fills"></div>
      <button class="swatch-hit" type="button" data-sfx="none"></button>
      <div class="sw-body">
        <p class="sw-name">&nbsp;</p>
        <p class="sw-value">&nbsp;</p>
        <p class="sw-hex">&nbsp;</p>
        <p class="sw-contrast">
          <span class="cc on-white"><i></i><span></span></span>
          <span class="cc on-black"><i></i><span></span></span>
        </p>
      </div>
      <div class="sw-actions">
        <button class="sw-btn sw-lock" type="button" aria-pressed="false" data-sfx="none">
          <svg class="ic ic-a"><use href="#i-unlock" /></svg>
          <svg class="ic ic-b"><use href="#i-lock" /></svg>
        </button>
        <button class="sw-btn sw-copy" type="button" data-sfx="none">
          <svg class="ic ic-a"><use href="#i-copy" /></svg>
          <svg class="ic ic-b"><use href="#i-check" /></svg>
        </button>
      </div>`;
    frag.append(el);
  }
  els.swatches.append(frag);
}

function swatchEl(i) {
  return els.swatches.children[i];
}

function writeSwatchText(el, sw) {
  const value = formatColor(sw.hex, state.format);
  $('.sw-name', el).textContent = sw.name || ' ';
  $('.sw-value', el).textContent = value;
  $('.sw-hex', el).textContent = `#${sw.hex}`;
  const w = contrast(sw.hex, 'FFFFFF');
  const k = contrast(sw.hex, '000000');
  const white = $('.on-white', el);
  const black = $('.on-black', el);
  $('span', white).textContent = `${w.toFixed(1)} ${grade(w)}`;
  $('span', black).textContent = `${k.toFixed(1)} ${grade(k)}`;
  white.classList.toggle('low', w < 3);
  black.classList.toggle('low', k < 3);
  white.title = `White text on this color: ${w.toFixed(2)} to 1`;
  black.title = `Black text on this color: ${k.toFixed(2)} to 1`;
  const label = sw.name ? `${sw.name}, ${value}` : value;
  $('.swatch-hit', el).setAttribute('aria-label', `Copy ${label}`);
  $('.sw-copy', el).setAttribute('aria-label', `Copy ${value}`);
  $('.sw-lock', el).setAttribute(
    'aria-label',
    sw.locked ? `Unlock ${value}` : `Lock ${value}`,
  );
}

function setSwatchInk(el, hex) {
  const ink = inkFor(hex);
  el.style.setProperty('--sw-ink', `#${ink}`);
  el.style.setProperty('--sw-chip', rgba(ink, ink === 'FFFFFF' ? 0.16 : 0.1));
  el.style.setProperty('--sw-ring', rgba(ink, 0.32));
}

function paintSwatch(i, sw, { animate = true, delay = 0 } = {}) {
  const el = swatchEl(i);
  const fills = $('.fills', el);
  const prevHex = el.dataset.hex;
  el.dataset.hex = sw.hex;
  el.toggleAttribute('data-locked', !!sw.locked);
  const lock = $('.sw-lock', el);
  lock.classList.toggle('alt', !!sw.locked);
  lock.setAttribute('aria-pressed', String(!!sw.locked));

  if (prevHex === sw.hex) {
    writeSwatchText(el, sw);
    return;
  }

  const fill = document.createElement('span');
  fill.className = 'fill';
  fill.style.background = `#${sw.hex}`;
  fills.append(fill);

  const settle = () => {
    while (fills.children.length > 1) fills.firstElementChild.remove();
  };

  if (!animate || !prevHex) {
    settle();
    setSwatchInk(el, sw.hex);
    writeSwatchText(el, sw);
    if (animate && !prevHex) {
      fill.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 260,
        delay,
        easing: EASE_OUT,
        fill: 'backwards',
      });
    }
    return;
  }

  fill
    .animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      delay,
      easing: EASE_OUT,
      fill: 'backwards',
    })
    .finished.then(settle, settle);

  el.classList.add('swap');
  setTimeout(() => {
    setSwatchInk(el, sw.hex);
    writeSwatchText(el, sw);
    el.classList.remove('swap');
  }, delay + 90);
}

function renderAll(opts) {
  state.swatches.forEach((sw, i) => {
    paintSwatch(i, sw, { ...opts, delay: (opts?.stagger ?? 0) * i });
  });
}

function setPending(on) {
  clearTimeout(pendingTimer);
  if (!on) {
    for (const el of els.swatches.children) el.classList.remove('pending');
    return;
  }
  pendingTimer = setTimeout(() => {
    state.swatches.forEach((sw, i) => {
      if (!sw.locked) swatchEl(i).classList.add('pending');
    });
    if (!state.swatches.length) {
      for (const el of els.swatches.children) el.classList.add('pending');
    }
  }, 160);
}

function paintSeed() {
  els.seed.style.setProperty('--seed', `#${state.base}`);
  els.picker.value = `#${state.base.toLowerCase()}`;
  if (document.activeElement !== els.hex) els.hex.value = `#${state.base}`;
  els.hex.removeAttribute('aria-invalid');
}

function paintGlow() {
  const next = els.glow[glowIndex ^ 1];
  const prev = els.glow[glowIndex];
  next.style.setProperty('--c', `#${state.base}`);
  next.classList.add('on');
  prev.classList.remove('on');
  glowIndex ^= 1;
}

function snapshot() {
  return {
    base: state.base,
    mode: state.mode,
    swatches: state.swatches.map((s) => ({ ...s })),
  };
}

function syncUrl() {
  const params = new URLSearchParams();
  params.set('c', state.swatches.map((s) => s.hex).join('-'));
  params.set('m', state.mode);
  params.set('b', state.base);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function scheduleHistory() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    pushHistory(snapshot());
  }, 1200);
}

function commit(next, { undoable = true, stagger = 28 } = {}) {
  if (undoable && committed) {
    undoStack.push(committed);
    if (undoStack.length > 50) undoStack.shift();
  }
  state.swatches = next;
  committed = snapshot();
  renderAll({ animate: true, stagger: reduced() ? 0 : stagger });
  syncUrl();
  scheduleHistory();
  applyPreview();
  fillMissingNames();
}

async function fillMissingNames() {
  const missing = state.swatches.filter((s) => !s.name);
  if (!missing.length) return;
  await Promise.all(
    missing.map(async (s) => {
      try {
        const name = await fetchName(s.hex);
        state.swatches.forEach((sw, i) => {
          if (sw.hex === s.hex && !sw.name) {
            sw.name = name;
            writeSwatchText(swatchEl(i), sw);
          }
        });
      } catch {}
    }),
  );
  scheduleHistory();
}

async function generate() {
  controller?.abort();
  const ctrl = new AbortController();
  controller = ctrl;
  const { base, mode } = state;
  setPending(true);
  let colors;
  let offline = false;
  try {
    colors = await fetchScheme(base, mode, COUNT, ctrl.signal);
  } catch {
    if (ctrl.signal.aborted) return;
    offline = true;
    colors = localScheme(base, mode, COUNT).map((hex) => ({
      hex,
      name: knownName(hex),
    }));
  }
  if (controller !== ctrl) return;
  controller = null;
  setPending(false);
  const next = Array.from({ length: COUNT }, (_, i) => {
    const current = state.swatches[i];
    if (current?.locked) return current;
    return { ...(colors[i] ?? colors[colors.length - 1]), locked: false };
  });
  commit(next);
  if (offline) {
    sfx.error();
    toast("Can't reach The Color API. Mixed these locally.", {
      action: { label: 'Retry', run: generate },
    });
  }
}

function setBase(hex, { regen = true, debounce = 0 } = {}) {
  state.base = hex;
  paintSeed();
  paintGlow();
  clearTimeout(seedTimer);
  if (!regen) return;
  if (debounce) seedTimer = setTimeout(generate, debounce);
  else generate();
}

function setMode(mode, { regen = true } = {}) {
  if (mode === state.mode && regen) return;
  state.mode = mode;
  save('csg:mode', mode);
  paintModes();
  if (regen) generate();
}

function placeIndicator(instant) {
  const btn = els.modesList.querySelector(`[data-mode="${state.mode}"]`);
  if (!btn) return;
  const list = els.modesList;
  const on = els.modesOn;
  if (instant) on.classList.add('instant');
  on.style.setProperty('--t', `${btn.offsetTop}px`);
  on.style.setProperty('--l', `${btn.offsetLeft}px`);
  on.style.setProperty(
    '--r',
    `${list.clientWidth - btn.offsetLeft - btn.offsetWidth}px`,
  );
  on.style.setProperty(
    '--b',
    `${list.clientHeight - btn.offsetTop - btn.offsetHeight}px`,
  );
  if (instant) {
    on.getBoundingClientRect();
    on.classList.remove('instant');
  }
}

function paintModes(instant) {
  for (const b of els.modesList.children) {
    const on = b.dataset.mode === state.mode;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  placeIndicator(instant);
}

function paintFormat() {
  els.format.textContent = state.format.toUpperCase();
  els.format.setAttribute(
    'aria-label',
    `Color format: ${state.format.toUpperCase()}. Change format`,
  );
}

let toastTimer = 0;
function toast(message, { hex, action } = {}) {
  const t = els.toast;
  t.replaceChildren();
  if (hex) {
    const dot = document.createElement('span');
    dot.className = 'toast-dot';
    dot.style.background = `#${hex}`;
    t.append(dot);
  }
  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  t.append(text);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      t.classList.remove('show');
      action.run();
    });
    t.append(b);
  }
  t.classList.remove('show');
  t.getBoundingClientRect();
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => t.classList.remove('show'),
    action ? 5000 : 1800,
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

async function copySwatch(i) {
  const sw = state.swatches[i];
  if (!sw) return;
  const value = formatColor(sw.hex, state.format);
  if (!(await copyText(value))) {
    sfx.error();
    toast("Couldn't copy that. Try again?");
    return;
  }
  sfx.copy();
  haptic(10);
  toast(`Copied ${value}`, { hex: sw.hex });
  const btn = $('.sw-copy', swatchEl(i));
  btn.classList.add('alt');
  clearTimeout(btn._t);
  btn._t = setTimeout(() => btn.classList.remove('alt'), 1200);
}

function toggleLock(i) {
  const sw = state.swatches[i];
  if (!sw) return;
  sw.locked = !sw.locked;
  sfx.lock(sw.locked);
  haptic(6);
  paintSwatch(i, sw);
}

function shuffle() {
  if (state.swatches.length && state.swatches.every((s) => s.locked)) {
    sfx.error();
    toast('Everything is locked. Unlock one to shuffle.');
    return;
  }
  sfx.shuffle();
  haptic(8);
  const icon = $('.ic', els.shuffle);
  if (!reduced()) {
    icon.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }],
      { duration: 300, easing: EASE_OUT },
    );
  }
  setBase(randomBase());
}

function undo() {
  const prev = undoStack.pop();
  if (!prev) {
    toast('Nothing to undo.');
    return;
  }
  controller?.abort();
  controller = null;
  setPending(false);
  state.base = prev.base;
  state.mode = prev.mode;
  save('csg:mode', prev.mode);
  paintSeed();
  paintGlow();
  paintModes();
  commit(prev.swatches, { undoable: false });
  toast('Undone.');
}

function restore(entry) {
  controller?.abort();
  controller = null;
  setPending(false);
  state.base = entry.base;
  if (MODES.some((m) => m.id === entry.mode)) state.mode = entry.mode;
  paintSeed();
  paintGlow();
  paintModes();
  for (const s of entry.swatches) rememberName(s.hex, s.name);
  commit(entry.swatches.map((s) => ({ ...s, locked: false })));
}

function applyPreview() {
  if (!state.swatches.length) return;
  const hexes = state.swatches.map((s) => s.hex);
  const r = roles(hexes);
  const dark = document.documentElement.dataset.theme === 'dark';
  const page = dark
    ? mix(r.darkest, '0B0B0C', 0.55)
    : mix(r.lightest, 'FAFAF9', 0.6);
  const surface = dark
    ? mix(r.darkest, '19191B', 0.72)
    : mix(r.lightest, 'FFFFFF', 0.86);
  const ink = dark
    ? contrast(r.lightest, surface) >= 7
      ? r.lightest
      : 'F4F4F5'
    : contrast(r.darkest, surface) >= 7
      ? r.darkest
      : '1C1B1A';
  const muted =
    contrast(mix(ink, surface, 0.35), surface) >= 4.5
      ? mix(ink, surface, 0.35)
      : ink;
  const chip = mix(r.secondary, surface, dark ? 0.7 : 0.78);
  const chipInk = contrast(ink, chip) >= 4.5 ? ink : inkFor(chip);
  const vars = {
    '--p-page': page,
    '--p-surface': surface,
    '--p-ink': ink,
    '--p-muted': muted,
    '--p-primary': r.primary,
    '--p-on-primary': inkFor(r.primary),
    '--p-chip': chip,
    '--p-chip-ink': chipInk,
  };
  hexes.forEach((h, i) => {
    vars[`--p-c${i + 1}`] = h;
  });
  for (const [k, v] of Object.entries(vars)) {
    els.mock.style.setProperty(k, `#${v}`);
  }
}

function setView(view) {
  state.view = view;
  const preview = view === 'preview';
  els.stage.dataset.view = view;
  els.preview.hidden = !preview;
  els.view.classList.toggle('alt', preview);
  els.view.setAttribute('aria-pressed', String(preview));
  els.view.setAttribute(
    'aria-label',
    preview ? 'Show swatches' : 'Show UI preview',
  );
  els.view.title = preview ? 'Swatches (P)' : 'UI preview (P)';
  setTitle(currentTitle());
  if (preview && !reduced()) {
    els.preview.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 220, easing: EASE_OUT },
    );
  }
}

function setTheme(theme) {
  const apply = () => {
    document.documentElement.dataset.theme = theme;
    $('meta[name="theme-color"]').content =
      theme === 'dark' ? '#0b0b0c' : '#fafaf9';
    applyPreview();
  };
  save('csg:theme', theme);
  if (document.startViewTransition && !reduced()) {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}

function paintSound() {
  const on = soundOn();
  els.sound.classList.toggle('alt', !on);
  els.sound.setAttribute('aria-pressed', String(on));
  els.sound.setAttribute('aria-label', on ? 'Mute sounds' : 'Turn sounds on');
}

function shareUrl() {
  const params = new URLSearchParams({
    c: state.swatches.map((s) => s.hex).join('-'),
    m: state.mode,
    b: state.base,
  });
  return `${location.origin}/?${params}`;
}

async function share() {
  if (!state.swatches.length) return;
  const url = shareUrl();
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (navigator.share && coarse) {
    try {
      await navigator.share({ title: APP, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  if (await copyText(url)) {
    sfx.copy();
    toast('Link copied. It opens this exact palette.');
  } else {
    sfx.error();
    toast("Couldn't copy the link.");
  }
}

const exportState = { tab: 'css', png: null, pngKey: '' };
const exportEls = {
  code: $('#export-code'),
  png: $('#export-png'),
  note: $('#export-note'),
  copy: $('#export-copy'),
  download: $('#export-download'),
  tabs: [...document.querySelectorAll('.tabs [role="tab"]')],
};

const NOTES = {
  css: () =>
    `Custom properties in ${state.format.toUpperCase()}. The format button in the dock changes it.`,
  tailwind: () =>
    'Drop this into your main CSS file, below @import "tailwindcss".',
  json: () =>
    'Names plus every format, ready for a script or a design token tool.',
  png: () => '1600 by 900, with the name and hex on each color.',
};

function exportText(tab) {
  if (tab === 'tailwind') return toTailwind(state.swatches, state.format);
  if (tab === 'json') {
    return toJson(state.swatches, { mode: state.mode, base: `#${state.base}` });
  }
  return toCss(state.swatches, state.format);
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}

function highlight(text, tab) {
  const lines = text.split('\n');
  return lines
    .map((line, n) => {
      const safe = escapeHtml(line);
      if (tab === 'json') {
        const m = line.match(/"hex": "#([0-9A-F]{6})"/);
        return m
          ? safe.replace(
              '"hex"',
              `<span class="sw" style="background:#${m[1]}"></span>"hex"`,
            )
          : safe;
      }
      const sw = state.swatches[n - 1];
      if (!sw || !line.startsWith('  --')) {
        return safe.replace(/^(:root|@theme)/, '<span class="k">$1</span>');
      }
      return safe.replace(
        /^ {2}(--[\w-]+)/,
        `  <span class="sw" style="background:#${sw.hex}"></span><span class="k">$1</span>`,
      );
    })
    .join('\n');
}

async function renderExport() {
  const tab = exportState.tab;
  for (const t of exportEls.tabs) {
    const on = t.dataset.tab === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  }
  exportEls.note.textContent = NOTES[tab]();
  const isPng = tab === 'png';
  exportEls.code.hidden = isPng;
  exportEls.png.hidden = !isPng;
  $('span', exportEls.copy).textContent = isPng ? 'Copy image' : 'Copy';
  if (!isPng) {
    exportEls.code.innerHTML = highlight(exportText(tab), tab);
    return;
  }
  const key = state.swatches.map((s) => s.hex + s.name).join('');
  if (exportState.pngKey !== key) {
    exportState.png = await toPng(state.swatches);
    exportState.pngKey = key;
    if (exportEls.png.src) URL.revokeObjectURL(exportEls.png.src);
    exportEls.png.src = URL.createObjectURL(exportState.png);
  }
}

async function exportCopy() {
  if (exportState.tab === 'png') {
    try {
      await renderExport();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': exportState.png }),
      ]);
      sfx.copy();
      toast('Image copied.');
    } catch {
      sfx.error();
      toast("This browser won't copy images. Download it instead.");
    }
    return;
  }
  if (await copyText(exportText(exportState.tab))) {
    sfx.copy();
    haptic(10);
    toast('Copied.');
  }
}

async function exportDownload() {
  const tab = exportState.tab;
  if (tab === 'png') {
    await renderExport();
    download(exportState.png, 'palette.png');
    return;
  }
  const names = {
    css: 'palette.css',
    tailwind: 'theme.css',
    json: 'palette.json',
  };
  const type = tab === 'json' ? 'application/json' : 'text/css';
  download(new Blob([exportText(tab)], { type }), names[tab]);
}

function timeAgo(at) {
  const rtf = new Intl.RelativeTimeFormat('en', {
    numeric: 'auto',
    style: 'short',
  });
  const s = Math.round((at - Date.now()) / 1000);
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [u, n] of units) {
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  }
  return 'just now';
}

function renderHistory() {
  const list = $('#history-list');
  const items = readHistory();
  list.replaceChildren();
  $('#history-empty').hidden = items.length > 0;
  $('#history-clear').hidden = items.length === 0;
  for (const entry of items) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'history-item';
    const mode = MODES.find((m) => m.id === entry.mode)?.label ?? '';
    const names = entry.swatches.map((s) => s.name).filter(Boolean);
    b.setAttribute('aria-label', `${mode} palette, ${names.join(', ')}`);
    b.innerHTML = `<span class="history-strip">${entry.swatches
      .map((s) => `<i style="background:#${s.hex}"></i>`)
      .join('')}</span><span class="history-meta"><b></b><span></span></span>`;
    $('b', b).textContent = [mode, names[0]].filter(Boolean).join(' · ');
    $('.history-meta > span', b).textContent = timeAgo(entry.at);
    b.addEventListener('click', () => {
      restore(entry);
      historySheet.close();
    });
    li.append(b);
    list.append(li);
  }
}

const exportSheet = createSheet($('#export-sheet'), {
  onOpen: () => setTitle('Export'),
  onClose: () => setTitle(currentTitle()),
});

const historySheet = createSheet($('#history-sheet'), {
  onOpen: () => setTitle('Recent'),
  onClose: () => setTitle(currentTitle()),
});

function anySheetOpen() {
  return exportSheet.isOpen || historySheet.isOpen;
}

function isTyping(el) {
  return (
    el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable)
  );
}

function bind() {
  els.swatches.addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    const i = Number(sw.dataset.i);
    if (e.target.closest('.sw-lock')) toggleLock(i);
    else if (e.target.closest('.sw-copy, .swatch-hit')) copySwatch(i);
  });

  els.picker.addEventListener('input', () => {
    const hex = cleanHex(els.picker.value);
    if (hex) setBase(hex, { debounce: 260 });
  });
  els.picker.addEventListener('change', () => {
    const hex = cleanHex(els.picker.value);
    if (hex && (hex !== state.base || seedTimer)) setBase(hex);
  });

  els.hex.addEventListener('input', () => {
    const hex = cleanHex(els.hex.value);
    const full = els.hex.value.replace('#', '').length === 6;
    els.hex.removeAttribute('aria-invalid');
    if (hex && full && hex !== state.base) setBase(hex, { debounce: 350 });
  });
  els.hex.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const hex = cleanHex(els.hex.value);
      if (hex) {
        if (hex !== state.base) setBase(hex);
        els.hex.blur();
      } else {
        els.hex.setAttribute('aria-invalid', 'true');
        sfx.error();
      }
    }
    if (e.key === 'Escape') {
      els.hex.value = `#${state.base}`;
      els.hex.blur();
    }
  });
  els.hex.addEventListener('blur', () => {
    const hex = cleanHex(els.hex.value);
    if (hex && hex !== state.base) setBase(hex);
    paintSeed();
  });
  els.hex.addEventListener('focus', () => els.hex.select());

  if ('EyeDropper' in window) {
    els.eyedropper.hidden = false;
    els.eyedropper.addEventListener('click', async () => {
      try {
        const { sRGBHex } = await new window.EyeDropper().open();
        const hex = cleanHex(sRGBHex);
        if (hex) setBase(hex);
      } catch {}
    });
  }

  els.modesList.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });
  els.modesList.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.id === state.mode);
    const next = MODES[(i + keys[e.key] + MODES.length) % MODES.length];
    setMode(next.id);
    els.modesList.querySelector(`[data-mode="${next.id}"]`).focus();
  });
  new ResizeObserver(() => placeIndicator(true)).observe(els.modesList);

  els.format.addEventListener('click', () => {
    state.format =
      FORMATS[(FORMATS.indexOf(state.format) + 1) % FORMATS.length];
    save('csg:format', state.format);
    paintFormat();
    state.swatches.forEach((sw, i) => {
      writeSwatchText(swatchEl(i), sw);
    });
  });

  els.shuffle.addEventListener('click', shuffle);
  els.share.addEventListener('click', share);

  els.exportBtn.addEventListener('click', () => {
    if (!state.swatches.length) return;
    exportSheet.open();
    renderExport();
  });
  for (const t of exportEls.tabs) {
    t.addEventListener('click', () => {
      exportState.tab = t.dataset.tab;
      renderExport();
    });
  }
  $('.tabs').addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    const tabs = exportEls.tabs.map((t) => t.dataset.tab);
    const next =
      tabs[(tabs.indexOf(exportState.tab) + d + tabs.length) % tabs.length];
    exportState.tab = next;
    renderExport();
    exportEls.tabs[tabs.indexOf(next)].focus();
  });
  exportEls.copy.addEventListener('click', exportCopy);
  exportEls.download.addEventListener('click', exportDownload);

  els.historyBtn.addEventListener('click', () => {
    renderHistory();
    historySheet.open();
  });
  $('#history-clear').addEventListener('click', () => {
    clearHistory();
    renderHistory();
    toast('Cleared.');
  });

  els.view.addEventListener('click', () =>
    setView(state.view === 'preview' ? 'swatches' : 'preview'),
  );
  els.sound.addEventListener('click', () => {
    setSound(!soundOn());
    paintSound();
    sfx.tap();
  });
  els.theme.addEventListener('click', () => {
    setTheme(
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
    );
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      const b = e.target.closest('button, .seed-chip, a');
      if (b && !b.closest('[data-sfx="none"]')) sfx.tap();
    },
    { passive: true },
  );

  document.addEventListener('keydown', (e) => {
    if (anySheetOpen() || isTyping(document.activeElement)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      shuffle();
    } else if (e.key === 'f' || e.key === 'F') {
      els.format.click();
    } else if (e.key === 'p' || e.key === 'P') {
      els.view.click();
    } else if (/^[1-5]$/.test(e.key)) {
      copySwatch(Number(e.key) - 1);
    }
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (load('csg:theme', null)) return;
    document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    applyPreview();
  });
}

function fromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('c') ?? params.get('palette');
  if (!raw) return null;
  const hexes = raw.split('-').map(cleanHex);
  if (hexes.length !== COUNT || hexes.some((h) => !h)) return null;
  const mode = params.get('m');
  return {
    base: cleanHex(params.get('b')) ?? hexes[Math.floor(COUNT / 2)],
    mode: MODES.some((m) => m.id === mode) ? mode : state.mode,
    swatches: hexes.map((hex) => ({
      hex,
      name: knownName(hex),
      locked: false,
    })),
  };
}

function init() {
  buildSwatches();
  paintModes(true);
  paintFormat();
  paintSound();
  bind();

  const shared = fromUrl();
  const last = readHistory()[0];
  const start = shared ?? last;
  if (start) {
    state.base = start.base;
    if (MODES.some((m) => m.id === start.mode)) state.mode = start.mode;
    paintModes(true);
    paintSeed();
    paintGlow();
    for (const s of start.swatches) rememberName(s.hex, s.name);
    commit(
      start.swatches.map((s) => ({ ...s, locked: false })),
      { undoable: false, stagger: 40 },
    );
  } else {
    state.base = randomBase();
    paintSeed();
    paintGlow();
    generate();
  }
}

init();
