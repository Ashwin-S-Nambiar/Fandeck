import { fetchName, fetchScheme, knownName, rememberName } from './api.js';
import {
  cleanHex,
  contrast,
  FORMATS,
  formatColor,
  grade,
  localScheme,
  MODES,
  randomBase,
} from './color.js';
import { download, toCss, toJson, toPng, toTailwind } from './exporters.js';
import { createPicker } from './picker.js';
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
import { initTips } from './tip.js';
import { paletteImage, sharedPalette } from './share.js';

const COUNT = 5;
const APP = 'Fandeck';
const HOME_TITLE = `${APP} · Five colors from one you pick`;
const THRESHOLDS = [3, 4.5, 7];
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const els = {
  chips: $('#chips'),
  stage: $('#stage'),
  pairs: $('#pairs'),
  pairsGrid: $('#pairs-grid'),
  pairsSummary: $('#pairs-summary'),
  threshold: $('#threshold'),
  markBar: $$('#mark-bar i'),
  seedBtn: $('#seed-btn'),
  hex: $('#seed-hex'),
  base: $('.base'),
  eyedropper: $('#eyedropper-btn'),
  formats: $('#formats'),
  share: $('#share-btn'),
  exportBtn: $('#export-btn'),
  shuffle: $('#shuffle-btn'),
  modesList: $('.modes-list[role="radiogroup"]'),
  modesOn: $('.modes-on'),
  views: $$('.view'),
  historyBtn: $('#history-btn'),
  sound: $('#sound-btn'),
  toast: $('#toast'),
};

const state = {
  base: '2A9D8F',
  mode: load('csg:mode', 'analogic'),
  swatches: [],
  format: load('csg:format', 'hex'),
  threshold: load('csg:threshold', 4.5),
  view: 'chips',
};

if (!MODES.some((m) => m.id === state.mode)) state.mode = 'analogic';
if (!FORMATS.includes(state.format)) state.format = 'hex';
if (!THRESHOLDS.includes(state.threshold)) state.threshold = 4.5;

const tips = initTips($('#tip'));
const undoStack = [];
let committed = null;
let controller = null;
let pendingTimer = 0;
let historyTimer = 0;
let seedTimer = 0;
let seedPending = false;

function setTitle(section) {
  document.title = section ? `${section} · ${APP}` : HOME_TITLE;
}

function currentTitle() {
  return state.view === 'pairs' ? 'Contrast' : '';
}

function buildChips() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('article');
    el.className = 'chip';
    el.dataset.i = i;
    el.innerHTML = `
      <div class="field">
        <div class="fills"></div>
        <div class="samples" aria-hidden="true">
          <span class="sample w"><b>Aa</b><span></span></span>
          <span class="sample k"><b>Aa</b><span></span></span>
        </div>
      </div>
      <button class="chip-hit" type="button" data-sfx="none"></button>
      <div class="label">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <p class="name">&nbsp;</p>
        <p class="value">&nbsp;</p>
        <p class="hexline">&nbsp;</p>
        <span class="acts">
          <button class="act lock" type="button" aria-pressed="false" data-sfx="none">
            <svg class="ic ic-a"><use href="#i-unlock" /></svg>
            <svg class="ic ic-b"><use href="#i-lock" /></svg>
          </button>
          <button class="act copy" type="button" data-sfx="none">
            <svg class="ic ic-a"><use href="#i-copy" /></svg>
            <svg class="ic ic-b"><use href="#i-check" /></svg>
          </button>
        </span>
      </div>`;
    frag.append(el);
  }
  els.chips.append(frag);
}

function chipEl(i) {
  return els.chips.children[i];
}

function writeChipText(el, sw) {
  const value = formatColor(sw.hex, state.format);
  $('.name', el).textContent = sw.name || ' ';
  $('.value', el).textContent = value;
  $('.hexline', el).textContent = `#${sw.hex}`;
  const w = contrast(sw.hex, 'FFFFFF');
  const k = contrast(sw.hex, '000000');
  const white = $('.sample.w', el);
  const black = $('.sample.k', el);
  $('span', white).textContent = `${w.toFixed(1)} ${grade(w)}`;
  $('span', black).textContent = `${k.toFixed(1)} ${grade(k)}`;
  white.classList.toggle('fail', w < 3);
  black.classList.toggle('fail', k < 3);
  const label = sw.name ? `${sw.name}, ${value}` : value;
  $('.chip-hit', el).setAttribute(
    'aria-label',
    `Copy ${label}. White text ${w.toFixed(1)} to 1, black text ${k.toFixed(1)} to 1`,
  );
  $('.copy', el).setAttribute('aria-label', `Copy ${value}`);
  const lock = $('.lock', el);
  lock.setAttribute(
    'aria-label',
    sw.locked ? `Unlock ${value}` : `Lock ${value}`,
  );
  lock.dataset.tip = sw.locked
    ? 'Unlock so shuffle can change it'
    : 'Keep this color when you shuffle';
  tips.refresh(lock);
}

function paintChip(i, sw, { animate = true, delay = 0 } = {}) {
  const el = chipEl(i);
  const fills = $('.fills', el);
  const prevHex = el.dataset.hex;
  el.dataset.hex = sw.hex;
  el.toggleAttribute('data-locked', !!sw.locked);
  const lock = $('.lock', el);
  lock.classList.toggle('alt', !!sw.locked);
  lock.setAttribute('aria-pressed', String(!!sw.locked));

  if (prevHex === sw.hex) {
    writeChipText(el, sw);
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
    writeChipText(el, sw);
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
    writeChipText(el, sw);
    el.classList.remove('swap');
  }, delay + 90);
}

function renderAll(opts) {
  state.swatches.forEach((sw, i) => {
    paintChip(i, sw, { ...opts, delay: (opts?.stagger ?? 0) * i });
  });
}

function paintMark() {
  els.markBar.forEach((bar, i) => {
    const sw = state.swatches[i];
    bar.style.background = sw ? `#${sw.hex}` : '';
  });
}

function setPending(on) {
  clearTimeout(pendingTimer);
  if (!on) {
    for (const el of els.chips.children) el.classList.remove('pending');
    return;
  }
  pendingTimer = setTimeout(() => {
    for (const el of els.chips.children) {
      const sw = state.swatches[Number(el.dataset.i)];
      if (!sw?.locked) el.classList.add('pending');
    }
  }, 160);
}

function paintSeed() {
  els.base.style.setProperty('--seed', `#${state.base}`);
  if (document.activeElement !== els.hex) els.hex.value = `#${state.base}`;
  els.hex.removeAttribute('aria-invalid');
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
  const image = paletteImage(sharedPalette(params));
  document.querySelector('meta[property="og:image"]').content = image;
  document.querySelector('meta[name="twitter:image"]').content = image;
  document.querySelector('meta[property="og:image:type"]').content = 'image/png';
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
  paintMark();
  syncUrl();
  scheduleHistory();
  renderPairs();
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
            writeChipText(chipEl(i), sw);
          }
        });
      } catch {}
    }),
  );
  scheduleHistory();
}

async function generate() {
  seedPending = false;
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
    toast({
      tone: 'warn',
      eyebrow: 'Offline',
      text: "The Color API didn't answer. Mixed locally, without names.",
      action: { label: 'Retry', run: generate },
    });
  }
}

function setBase(hex, { regen = true, debounce = 0 } = {}) {
  state.base = hex;
  paintSeed();
  clearTimeout(seedTimer);
  seedPending = false;
  if (!regen) return;
  if (debounce) {
    seedPending = true;
    seedTimer = setTimeout(generate, debounce);
  } else generate();
}

function flushBase(hex) {
  if (hex !== state.base) {
    setBase(hex);
  } else if (seedPending) {
    clearTimeout(seedTimer);
    seedPending = false;
    generate();
  }
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

function paintRadios(group, attr, value) {
  for (const b of group.querySelectorAll(`[${attr}]`)) {
    const on = b.getAttribute(attr) === String(value);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

function setFormat(format) {
  state.format = format;
  save('csg:format', format);
  paintRadios(els.formats, 'data-format', format);
  state.swatches.forEach((sw, i) => {
    writeChipText(chipEl(i), sw);
  });
}

let toastTimer = 0;
function toast({ eyebrow, text, hex, tone, mono, action }) {
  const t = els.toast;
  t.replaceChildren();
  const mark = document.createElement('span');
  mark.className = 'toast-mark';
  if (hex) {
    mark.style.background = `#${hex}`;
  } else {
    mark.innerHTML = `<svg class="ic"><use href="#i-${tone === 'warn' ? 'warn' : 'check'}" /></svg>`;
  }
  const body = document.createElement('span');
  body.className = 'toast-body';
  if (eyebrow) {
    const e = document.createElement('span');
    e.className = 'toast-eyebrow';
    e.textContent = eyebrow;
    body.append(e);
  }
  const line = document.createElement('span');
  line.className = mono ? 'toast-text mono' : 'toast-text';
  line.textContent = text;
  body.append(line);
  t.append(mark, body);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
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
    toast({
      tone: 'warn',
      eyebrow: 'Not copied',
      text: 'The browser blocked the clipboard.',
    });
    return;
  }
  sfx.copy();
  haptic(10);
  toast({
    eyebrow: sw.name ? `Copied · ${sw.name}` : 'Copied',
    text: value,
    hex: sw.hex,
    mono: true,
  });
  const btn = $('.copy', chipEl(i));
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
  paintChip(i, sw);
}

function shuffle() {
  if (state.swatches.length && state.swatches.every((s) => s.locked)) {
    sfx.error();
    toast({
      tone: 'warn',
      eyebrow: 'All locked',
      text: 'Unlock a chip to shuffle it.',
    });
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
    toast({ eyebrow: 'Undo', text: 'Nothing to undo.' });
    return;
  }
  controller?.abort();
  controller = null;
  setPending(false);
  state.base = prev.base;
  state.mode = prev.mode;
  save('csg:mode', prev.mode);
  paintSeed();
  paintModes();
  commit(prev.swatches, { undoable: false });
  toast({ eyebrow: 'Undo', text: 'Back to the previous palette.' });
}

function restore(entry) {
  controller?.abort();
  controller = null;
  setPending(false);
  state.base = entry.base;
  if (MODES.some((m) => m.id === entry.mode)) state.mode = entry.mode;
  paintSeed();
  paintModes();
  for (const s of entry.swatches) rememberName(s.hex, s.name);
  commit(entry.swatches.map((s) => ({ ...s, locked: false })));
}

function pairItems() {
  return [
    ...state.swatches.map((s) => ({ hex: s.hex, name: s.name })),
    { hex: 'FFFFFF', name: 'White' },
    { hex: '000000', name: 'Black' },
  ];
}

function renderPairs() {
  if (!state.swatches.length) return;
  const items = pairItems();
  const grid = els.pairsGrid;
  const frag = document.createDocumentFragment();
  let pass = 0;
  let total = 0;
  for (const fg of items) {
    const r = document.createElement('span');
    r.className = 'pair-row';
    r.style.background = `#${fg.hex}`;
    frag.append(r);
    for (const bg of items) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'pair';
      cell.dataset.sfx = 'none';
      cell.style.background = `#${bg.hex}`;
      cell.style.color = `#${fg.hex}`;
      if (fg.hex === bg.hex) {
        cell.classList.add('same');
        cell.tabIndex = -1;
        cell.setAttribute('aria-hidden', 'true');
      } else {
        const ratio = contrast(fg.hex, bg.hex);
        const ok = ratio >= state.threshold;
        total++;
        if (ok) pass++;
        cell.classList.toggle('fail', !ok);
        cell.dataset.fg = fg.hex;
        cell.dataset.bg = bg.hex;
        cell.innerHTML = `<b>Aa</b><span>${ratio.toFixed(1)}</span>`;
        cell.setAttribute(
          'aria-label',
          `${fg.name || `#${fg.hex}`} on ${bg.name || `#${bg.hex}`}: ${ratio.toFixed(2)} to 1, ${ok ? 'passes' : 'fails'}. Copy as CSS`,
        );
      }
      frag.append(cell);
    }
  }
  grid.replaceChildren(frag);
  const label = { 3: 'AA large', 4.5: 'AA', 7: 'AAA' }[state.threshold];
  els.pairsSummary.textContent = `Rows are text, columns are backgrounds. ${pass} of ${total} pairs pass ${label}.`;
}

function setThreshold(th) {
  state.threshold = th;
  save('csg:threshold', th);
  paintRadios(els.threshold, 'data-th', th);
  renderPairs();
}

async function copyPair(cell) {
  const { fg, bg } = cell.dataset;
  if (!fg) return;
  const css = `color: ${formatColor(fg, state.format)};\nbackground-color: ${formatColor(bg, state.format)};`;
  if (await copyText(css)) {
    sfx.copy();
    haptic(10);
    toast({
      eyebrow: `Copied · ${contrast(fg, bg).toFixed(1)} to 1`,
      text: `#${fg} on #${bg}`,
      hex: bg,
      mono: true,
    });
  }
}

function setView(view) {
  state.view = view;
  const pairs = view === 'pairs';
  els.stage.dataset.view = view;
  els.chips.hidden = pairs;
  els.pairs.hidden = !pairs;
  for (const b of els.views) {
    b.setAttribute('aria-pressed', String(b.dataset.view === view));
  }
  setTitle(currentTitle());
  if (!reduced()) {
    (pairs ? els.pairs : els.chips).animate(
      [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: EASE_OUT },
    );
  }
}

function paintSound() {
  const on = soundOn();
  els.sound.classList.toggle('alt', !on);
  els.sound.setAttribute('aria-pressed', String(on));
  els.sound.setAttribute('aria-label', on ? 'Mute sounds' : 'Turn sounds on');
  els.sound.dataset.tip = on ? 'Mute sounds' : 'Turn sounds on';
  tips.refresh(els.sound);
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
      await navigator.share({ title: `${APP} palette`, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  if (await copyText(url)) {
    sfx.copy();
    toast({ eyebrow: 'Link copied', text: 'It opens this exact palette.' });
  } else {
    sfx.error();
    toast({
      tone: 'warn',
      eyebrow: 'Not copied',
      text: 'The browser blocked the clipboard.',
    });
  }
}

const exportState = { tab: 'css', png: null, pngKey: '' };
const exportEls = {
  code: $('#export-code'),
  png: $('#export-png'),
  note: $('#export-note'),
  copy: $('#export-copy'),
  download: $('#export-download'),
  tabs: $$('.tabs [role="tab"]'),
};

const NOTES = {
  css: () =>
    `Custom properties in ${state.format.toUpperCase()}. Change it under Copy as.`,
  tailwind: () => 'Paste into your main CSS file, below @import "tailwindcss".',
  json: () => 'Names plus every format, for scripts and token tools.',
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

const EXPORT_NAMES = {
  css: 'CSS',
  tailwind: 'Tailwind theme',
  json: 'JSON',
  png: 'Image',
};

async function exportCopy() {
  if (exportState.tab === 'png') {
    try {
      await renderExport();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': exportState.png }),
      ]);
      sfx.copy();
      toast({ eyebrow: 'Copied', text: 'Image copied.' });
    } catch {
      sfx.error();
      toast({
        tone: 'warn',
        eyebrow: 'Not copied',
        text: "This browser can't copy images. Download it instead.",
      });
    }
    return;
  }
  if (await copyText(exportText(exportState.tab))) {
    sfx.copy();
    haptic(10);
    toast({
      eyebrow: 'Copied',
      text: `${EXPORT_NAMES[exportState.tab]} copied.`,
    });
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
  onOpen: () => setTitle('Recent palettes'),
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

function radioKeys(group, attr, values, apply) {
  group.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      e.key
    ];
    if (!d) return;
    e.preventDefault();
    const current = group.querySelector('[aria-checked="true"]');
    const i = values.indexOf(current?.getAttribute(attr));
    const next = values[(i + d + values.length) % values.length];
    apply(next);
    group.querySelector(`[${attr}="${next}"]`)?.focus();
  });
}

function bind() {
  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const i = Number(chip.dataset.i);
    if (e.target.closest('.lock')) toggleLock(i);
    else if (e.target.closest('.copy, .chip-hit')) copySwatch(i);
  });

  els.pairsGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.pair');
    if (cell) copyPair(cell);
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
  radioKeys(
    els.modesList,
    'data-mode',
    MODES.map((m) => m.id),
    setMode,
  );
  new ResizeObserver(() => placeIndicator(true)).observe(els.modesList);

  els.formats.addEventListener('click', (e) => {
    const b = e.target.closest('[data-format]');
    if (b) setFormat(b.dataset.format);
  });
  radioKeys(els.formats, 'data-format', FORMATS, setFormat);

  els.threshold.addEventListener('click', (e) => {
    const b = e.target.closest('[data-th]');
    if (b) setThreshold(Number(b.dataset.th));
  });
  radioKeys(els.threshold, 'data-th', THRESHOLDS.map(String), (v) =>
    setThreshold(Number(v)),
  );

  for (const b of els.views) {
    b.addEventListener('click', () => setView(b.dataset.view));
  }

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
    toast({ eyebrow: 'Recent', text: 'Cleared.' });
  });

  els.sound.addEventListener('click', () => {
    setSound(!soundOn());
    paintSound();
    sfx.tap();
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
    if (e.target.closest?.('#picker')) return;
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
    } else if (e.key === 'p' || e.key === 'P') {
      setView(state.view === 'pairs' ? 'chips' : 'pairs');
    } else if (/^[1-5]$/.test(e.key)) {
      copySwatch(Number(e.key) - 1);
    }
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
  buildChips();
  paintModes(true);
  paintRadios(els.formats, 'data-format', state.format);
  paintRadios(els.threshold, 'data-th', state.threshold);
  paintSound();
  bind();

  createPicker({
    root: $('#picker'),
    trigger: els.seedBtn,
    bar: $('#bar'),
    getBase: () => state.base,
    getPalette: () => state.swatches.map((s) => s.hex),
    getRecent: () =>
      [...new Set(readHistory().map((e) => e.base))]
        .filter((h) => h !== state.base)
        .slice(0, 8),
    fetchName,
    onChange: (hex, { commit }) => {
      if (commit) flushBase(hex);
      else if (hex !== state.base) setBase(hex, { debounce: 240 });
    },
  });

  const shared = fromUrl();
  const last = readHistory()[0];
  const start = shared ?? last;
  if (start) {
    state.base = start.base;
    if (MODES.some((m) => m.id === start.mode)) state.mode = start.mode;
    paintModes(true);
    paintSeed();
    for (const s of start.swatches) rememberName(s.hex, s.name);
    commit(
      start.swatches.map((s) => ({ ...s, locked: false })),
      { undoable: false, stagger: 40 },
    );
  } else {
    state.base = randomBase();
    paintSeed();
    generate();
  }
}

init();
