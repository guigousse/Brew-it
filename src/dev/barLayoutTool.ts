/**
 * OUTIL DE DÉVELOPPEMENT — à supprimer avant la sortie de l'application (avec les lignes marquées « DEV » dans
 * src/ui/app.ts et src/main.ts).
 *
 * Disposition du bar : chaque élément (comptoir, cadres, juke-box…) est entouré d'une boîte qu'on fait glisser au doigt,
 * ou dont on tape les coordonnées exactes (en pixels du plan de 160 × 300). La disposition est gardée dans le
 * navigateur ; « Copier » donne le code à coller dans BAR_LAYOUT_DEFAULT (src/render/barLayout.ts).
 */
import { applyBarLayout, BAR_ITEM_NAMES, BAR_LAYOUT_DEFAULT, barLayout, RESIZABLE, resetBarLayout, type BarItem } from '../render/barLayout';
import type { BarRoom } from '../render/rooms';

const KEY = 'brewit:dev-bar-layout';

/** Au démarrage : reprend la disposition gardée par l'outil. */
export function loadDevBarLayout(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) applyBarLayout(JSON.parse(raw));
  } catch { /* rien de gardé */ }
}

function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(barLayout)); } catch { /* stockage indisponible */ }
}

/** Le code de BAR_LAYOUT_DEFAULT, prêt à coller. */
export function layoutCode(): string {
  const lines = (Object.keys(barLayout) as BarItem[]).map((k) => {
    const v = barLayout[k];
    return `  ${k}: { x: ${v.x}, y: ${v.y}, w: ${v.w}, h: ${v.h} },`;
  });
  return `export const BAR_LAYOUT_DEFAULT: Readonly<Record<BarItem, BarSpot>> = {\n${lines.join('\n')}\n};`;
}

interface ToolHost {
  room: BarRoom;
  /** Le calque du bar (même repère que le plan, à l'échelle de l'écran). */
  wrap: HTMLElement;
  scale: () => number;
  /** Après un changement : redessiner le décor, replacer les zones à toucher. */
  changed: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

let open: (() => void) | null = null;

export function openBarLayoutTool(host: ToolHost): void {
  open?.();
  const items = Object.keys(barLayout) as BarItem[];
  let sel: BarItem = 'counter';
  host.room.preview = { level: 1, event: 'foot' };

  // ---- les boîtes, posées sur le bar
  const layer = el('div', 'dev-layer');
  const boxes = new Map<BarItem, HTMLElement>();
  for (const id of items) {
    const b = el('div', 'dev-box');
    b.append(el('span', 'dev-tag', BAR_ITEM_NAMES[id]));
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); // pas de glissement d'une pièce à l'autre
      e.preventDefault();
      select(id);
      const s = host.scale();
      const start = { x: e.clientX, y: e.clientY, ox: barLayout[id].x, oy: barLayout[id].y };
      b.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        barLayout[id].x = Math.round(start.ox + (ev.clientX - start.x) / s);
        barLayout[id].y = Math.round(start.oy + (ev.clientY - start.y) / s);
        update();
      };
      const up = () => {
        b.removeEventListener('pointermove', move);
        b.removeEventListener('pointerup', up);
        b.removeEventListener('pointercancel', up);
      };
      b.addEventListener('pointermove', move);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
    boxes.set(id, b);
    layer.append(b);
  }
  host.wrap.append(layer);

  // ---- le panneau
  const panel = el('div', 'dev-panel');
  const head = el('div', 'dev-row');
  const title = el('strong', '', 'Disposition du bar (dev)');
  const fold = el('button', 'dev-btn', '▾');
  head.append(title, fold);
  const body = el('div', 'dev-body');
  fold.onclick = () => {
    body.classList.toggle('hidden');
    fold.textContent = body.classList.contains('hidden') ? '▸' : '▾';
  };

  const pick = el('select', 'dev-input');
  for (const id of items) {
    const o = el('option', '', BAR_ITEM_NAMES[id]);
    o.value = id;
    pick.append(o);
  }
  pick.onchange = () => select(pick.value as BarItem);

  const fields = el('div', 'dev-row');
  const inputs = {} as Record<'x' | 'y' | 'w' | 'h', HTMLInputElement>;
  const wraps = {} as Record<'x' | 'y' | 'w' | 'h', HTMLElement>;
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    const box = el('label', 'dev-field');
    const minus = el('button', 'dev-btn', '−');
    const input = el('input', 'dev-input dev-num');
    input.type = 'number';
    input.inputMode = 'numeric';
    const plus = el('button', 'dev-btn', '+');
    const set = (v: number) => {
      barLayout[sel][k] = Math.round(v);
      update();
    };
    input.onchange = () => { if (input.value !== '' && Number.isFinite(+input.value)) set(+input.value); };
    minus.onclick = () => set(barLayout[sel][k] - 1);
    plus.onclick = () => set(barLayout[sel][k] + 1);
    box.append(el('span', '', k.toUpperCase()), minus, input, plus);
    inputs[k] = input;
    wraps[k] = box;
    fields.append(box);
  }

  const view = el('div', 'dev-row');
  const level = el('select', 'dev-input');
  for (let i = 1; i <= 5; i++) {
    const o = el('option', '', `Niveau ${i}`);
    o.value = String(i);
    level.append(o);
  }
  level.onchange = () => {
    host.room.preview = { ...host.room.preview!, level: +level.value };
    host.changed();
  };
  const event = el('select', 'dev-input');
  for (const [v, n] of [['foot', 'Télé'], ['darts', 'Fléchettes'], ['party', 'Boule à facettes']]) {
    const o = el('option', '', n);
    o.value = v!;
    event.append(o);
  }
  event.value = 'foot';
  event.onchange = () => { host.room.preview = { ...host.room.preview!, event: event.value as 'foot' }; };
  view.append(level, event);

  const out = el('textarea', 'dev-out');
  out.readOnly = true;
  const actions = el('div', 'dev-row');
  const copy = el('button', 'dev-btn', 'Copier le code');
  copy.onclick = () => {
    out.value = layoutCode();
    out.classList.remove('hidden');
    out.select();
    void navigator.clipboard?.writeText(out.value).then(() => (copy.textContent = 'Copié ✓'), () => (copy.textContent = 'Sélectionné ↓'));
  };
  const resetOne = el('button', 'dev-btn', 'Réinit. élément');
  resetOne.onclick = () => {
    Object.assign(barLayout[sel], BAR_LAYOUT_DEFAULT[sel]);
    update();
  };
  const resetAll = el('button', 'dev-btn', 'Tout réinit.');
  resetAll.onclick = () => {
    resetBarLayout();
    update();
  };
  const close = el('button', 'dev-btn', 'Fermer');
  close.onclick = () => open?.();
  actions.append(copy, resetOne, resetAll, close);
  out.classList.add('hidden');

  body.append(pick, fields, view, actions, out);
  panel.append(head, body);
  document.body.append(panel);

  function select(id: BarItem): void {
    sel = id;
    pick.value = id;
    update(false);
  }

  function update(changed = true): void {
    const s = host.scale();
    for (const [id, b] of boxes) {
      const r = barLayout[id];
      Object.assign(b.style, { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` });
      b.classList.toggle('on', id === sel);
    }
    const r = barLayout[sel];
    for (const k of ['x', 'y', 'w', 'h'] as const) {
      if (document.activeElement !== inputs[k]) inputs[k].value = String(r[k]);
      wraps[k].classList.toggle('hidden', (k === 'w' || k === 'h') && !RESIZABLE.includes(sel));
    }
    if (!changed) return;
    save();
    host.changed();
    if (!out.classList.contains('hidden')) out.value = layoutCode();
  }

  const onResize = () => update(false);
  window.addEventListener('resize', onResize);
  open = () => {
    window.removeEventListener('resize', onResize);
    layer.remove();
    panel.remove();
    host.room.preview = null;
    host.changed();
    open = null;
  };
  host.changed();
  update(false);
}
