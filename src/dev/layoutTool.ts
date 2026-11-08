/**
 * OUTIL DE DÉVELOPPEMENT — à supprimer avant la sortie de l'application (avec les lignes marquées « DEV » dans
 * src/ui/app.ts, src/ui/style.css et src/main.ts).
 *
 * Mise en page des décors, dans chaque pièce et pour chacun de ses niveaux : on ajoute ou on retire des assets
 * (catalogue de decorAssets.ts), on les fait glisser au doigt ou on tape leurs coordonnées exactes (pixels du plan
 * de 160 × 300), on les met à l'échelle (poignée en bas à droite, ou valeur exacte), on les retourne, on les passe
 * devant. Au bar, le comptoir, l'objet d'événement et les tables se déplacent aussi (ils ne se retirent pas).
 * Tout est gardé dans le navigateur ; « Copier le code » donne DECOR_DEFAULT et BAR_LAYOUT_DEFAULT à coller.
 */
import { decorAsset, instBox } from '../render/decor';
import { DECOR_ASSETS } from '../render/decorAssets';
import { applyDecor, decorLayout, resetDecor, ROOM_LEVELS, ROOM_NAMES, type DecorInst, type RoomKey } from '../render/decorLayout';
import { applyBarLayout, BAR_ITEM_NAMES, barLayout, RESIZABLE, resetBarLayout, type BarItem } from '../render/barLayout';

const DECOR_KEY = 'brewit:dev-decor';
const BAR_KEY = 'brewit:dev-bar-layout';
const ROOMS = Object.keys(ROOM_NAMES) as RoomKey[];

/** Au démarrage : reprend la mise en page gardée par l'outil. */
export function loadDevLayout(): void {
  try {
    const bar = localStorage.getItem(BAR_KEY);
    if (bar) applyBarLayout(JSON.parse(bar));
    const decor = localStorage.getItem(DECOR_KEY);
    if (decor) applyDecor(JSON.parse(decor));
  } catch { /* rien de gardé */ }
}

function save(): void {
  try {
    localStorage.setItem(DECOR_KEY, JSON.stringify(decorLayout));
    localStorage.setItem(BAR_KEY, JSON.stringify(barLayout));
  } catch { /* stockage indisponible */ }
}

const num = (v: number) => String(Math.round(v * 100) / 100);

/** Le code à coller dans decorLayout.ts et barLayout.ts. */
export function layoutCode(): string {
  const rooms = ROOMS.map((room) => {
    const levels = Object.entries(decorLayout[room]).map(([lv, items]) => {
      const rows = items.map((i) => `      { id: '${i.id}', a: '${i.a}', x: ${i.x}, y: ${i.y}, s: ${num(i.s)}${i.f ? ', f: true' : ''}${i.front ? ', front: true' : ''} },`);
      return `    ${lv}: [\n${rows.join('\n')}\n    ],`;
    });
    return `  ${room}: {\n${levels.join('\n')}\n  },`;
  });
  const bar = (Object.keys(barLayout) as BarItem[]).map((k) => {
    const v = barLayout[k];
    return `  ${k}: { x: ${v.x}, y: ${v.y}, w: ${v.w}, h: ${v.h} },`;
  });
  return `// src/render/decorLayout.ts\nexport const DECOR_DEFAULT: DecorLayout = {\n${rooms.join('\n')}\n};\n\n// src/render/barLayout.ts\nexport const BAR_LAYOUT_DEFAULT: Readonly<Record<BarItem, BarSpot>> = {\n${bar.join('\n')}\n};`;
}

/** Ce que l'app prête à l'outil, pour une pièce. */
export interface RoomHost {
  /** Le calque de la pièce (même repère que le plan, à l'échelle de l'écran). */
  wrap: HTMLElement;
  /** Le dessin de la pièce : son aperçu et son cache. */
  renderer: { preview: { level: number; event?: 'party' | 'foot' | 'darts' } | null; invalidate(): void };
  /** Le niveau actuel de la pièce dans la partie. */
  level: () => number;
}

export interface ToolHost {
  room: (key: RoomKey) => RoomHost;
  /** La pièce affichée (null : pas une pièce). */
  current: () => RoomKey | null;
  go: (key: RoomKey) => void;
  scale: () => number;
  /** Bloque le glissement d'une pièce à l'autre pendant l'outil. */
  lock: (on: boolean) => void;
  /** Après un changement : zones à toucher du bar, etc. */
  changed: (key: RoomKey) => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const option = (value: string, text: string) => {
  const o = el('option', '', text);
  o.value = value;
  return o;
};

/** Une sélection : un décor posé, ou un élément fixe du bar. */
type Sel = { kind: 'decor'; id: string } | { kind: 'fixed'; id: BarItem } | null;

let closeTool: (() => void) | null = null;
export const isLayoutToolOpen = () => !!closeTool;

export function openLayoutTool(host: ToolHost, start?: RoomKey): void {
  closeTool?.();
  let room: RoomKey = start ?? host.current() ?? 'bar';
  let level = Math.min(ROOM_LEVELS[room], host.room(room).level());
  let event: 'party' | 'foot' | 'darts' = 'foot';
  let sel: Sel = null;
  host.lock(true);

  const items = () => (decorLayout[room][level] ??= []);
  const find = (id: string) => items().find((i) => i.id === id);

  // ---- calque des boîtes, posé sur la pièce
  const layer = el('div', 'dev-layer');
  layer.addEventListener('pointerdown', (e) => {
    if (e.target !== layer) return;
    e.stopPropagation();
    select(null);
  });

  // ---- le panneau
  const panel = el('div', 'dev-panel');
  const head = el('div', 'dev-row');
  const roomPick = el('select', 'dev-input');
  for (const r of ROOMS) roomPick.append(option(r, ROOM_NAMES[r]));
  const levelPick = el('select', 'dev-input');
  const fold = el('button', 'dev-btn', '▾');
  const flipPanel = el('button', 'dev-btn', '⇅');
  const close = el('button', 'dev-btn', '✕');
  head.append(el('strong', '', 'Décors'), roomPick, levelPick, fold, flipPanel, close);
  flipPanel.onclick = () => panel.classList.toggle('top'); // le panneau en haut ou en bas de l'écran
  const body = el('div', 'dev-body');
  fold.onclick = () => {
    body.classList.toggle('hidden');
    fold.textContent = body.classList.contains('hidden') ? '▸' : '▾';
  };
  close.onclick = () => closeTool?.();

  // ce qui est posé à ce niveau
  const itemRow = el('div', 'dev-row');
  const itemPick = el('select', 'dev-input dev-grow');
  const dup = el('button', 'dev-btn', 'Dupliquer');
  const del = el('button', 'dev-btn dev-bad', 'Retirer');
  itemRow.append(itemPick, dup, del);
  itemPick.onchange = () => {
    const v = itemPick.value;
    select(!v ? null : v.startsWith('fixed:') ? { kind: 'fixed', id: v.slice(6) as BarItem } : { kind: 'decor', id: v });
  };

  // ajouter un asset du catalogue
  const addRow = el('div', 'dev-row');
  const catalog = el('select', 'dev-input dev-grow');
  for (const r of ROOMS) {
    const group = el('optgroup');
    group.label = ROOM_NAMES[r];
    for (const a of DECOR_ASSETS.filter((x) => x.room === r)) group.append(option(a.id, `${a.name}${a.furniture ? ' (mobilier)' : ''}`));
    catalog.append(group);
  }
  const add = el('button', 'dev-btn', 'Ajouter');
  addRow.append(catalog, add);

  // coordonnées
  const fields = el('div', 'dev-row dev-fields');
  const inputs = {} as Record<'x' | 'y' | 's' | 'w' | 'h', HTMLInputElement>;
  const wraps = {} as Record<'x' | 'y' | 's' | 'w' | 'h', HTMLElement>;
  const steps = { x: 1, y: 1, s: 0.1, w: 1, h: 1 };
  for (const k of ['x', 'y', 's', 'w', 'h'] as const) {
    const box = el('label', 'dev-field');
    const minus = el('button', 'dev-btn', '−');
    const input = el('input', 'dev-input dev-num');
    input.type = 'number';
    input.step = k === 's' ? '0.05' : '1';
    input.inputMode = 'decimal';
    const plus = el('button', 'dev-btn', '+');
    input.onchange = () => { if (input.value !== '' && Number.isFinite(+input.value)) set(k, +input.value); };
    minus.onclick = () => set(k, get(k) - steps[k]);
    plus.onclick = () => set(k, get(k) + steps[k]);
    box.append(el('span', '', k === 's' ? 'Échelle' : k.toUpperCase()), minus, input, plus);
    inputs[k] = input;
    wraps[k] = box;
    fields.append(box);
  }
  const flags = el('div', 'dev-row');
  const flip = el('label', 'dev-field');
  const flipBox = el('input');
  flipBox.type = 'checkbox';
  flip.append(flipBox, el('span', '', 'Retourné'));
  const front = el('label', 'dev-field');
  const frontBox = el('input');
  frontBox.type = 'checkbox';
  front.append(frontBox, el('span', '', 'Devant tout'));
  const eventPick = el('select', 'dev-input');
  for (const [v, n] of [['foot', 'Télé'], ['darts', 'Fléchettes'], ['party', 'Boule à facettes']] as const) eventPick.append(option(v, n));
  flags.append(flip, front, eventPick);
  flipBox.onchange = () => editDecor((i) => { if (flipBox.checked) i.f = true; else delete i.f; });
  frontBox.onchange = () => editDecor((i) => { if (frontBox.checked) i.front = true; else delete i.front; });
  eventPick.onchange = () => {
    event = eventPick.value as typeof event;
    applyPreview();
  };

  // niveaux, remise à zéro, export
  const copyRow = el('div', 'dev-row');
  const target = el('select', 'dev-input');
  const copyTo = el('button', 'dev-btn', 'Copier ce niveau vers');
  copyRow.append(copyTo, target);
  copyTo.onclick = () => {
    const to = Number(target.value);
    if (!to || to === level) return;
    decorLayout[room][to] = JSON.parse(JSON.stringify(items()));
    copyTo.textContent = `Copié vers le niv. ${to} ✓`;
    setTimeout(() => (copyTo.textContent = 'Copier ce niveau vers'), 1500);
    commit();
  };
  const resetRow = el('div', 'dev-row');
  const resetLevel = el('button', 'dev-btn', 'Réinit. niveau');
  const resetRoom = el('button', 'dev-btn', 'Réinit. pièce');
  const resetAll = el('button', 'dev-btn dev-bad', 'Tout réinit.');
  resetRow.append(resetLevel, resetRoom, resetAll);
  const confirm = (b: HTMLButtonElement, run: () => void) => () => {
    if (!b.dataset.sure) {
      b.dataset.sure = b.textContent!;
      b.textContent = 'Sûr ?';
      setTimeout(() => { if (b.dataset.sure) { b.textContent = b.dataset.sure; delete b.dataset.sure; } }, 2500);
      return;
    }
    b.textContent = b.dataset.sure;
    delete b.dataset.sure;
    run();
    sel = null;
    commit();
  };
  resetLevel.onclick = confirm(resetLevel, () => resetDecor(room, level));
  resetRoom.onclick = confirm(resetRoom, () => {
    resetDecor(room);
    if (room === 'bar') resetBarLayout();
  });
  resetAll.onclick = confirm(resetAll, () => {
    resetDecor();
    resetBarLayout();
  });
  const out = el('textarea', 'dev-out hidden');
  out.readOnly = true;
  const copy = el('button', 'dev-btn', 'Copier le code');
  copy.onclick = () => {
    out.value = layoutCode();
    out.classList.remove('hidden');
    out.select();
    void navigator.clipboard?.writeText(out.value).then(() => (copy.textContent = 'Copié ✓'), () => (copy.textContent = 'Sélectionné ↓'));
  };
  resetRow.append(copy);

  body.append(itemRow, addRow, fields, flags, copyRow, resetRow, out);
  panel.append(head, body);
  document.body.append(panel);

  roomPick.onchange = () => switchRoom(roomPick.value as RoomKey);
  levelPick.onchange = () => {
    level = Number(levelPick.value);
    sel = null;
    applyPreview();
    refresh();
  };
  add.onclick = () => {
    const a = decorAsset(catalog.value);
    if (!a) return;
    const n = items().filter((i) => i.a === a.id).length;
    let k = n + 1;
    while (find(`${a.id}-${k}`)) k++;
    const inst: DecorInst = { id: `${a.id}-${k}`, a: a.id, x: Math.round(80 - a.w / 2), y: Math.round(120 - a.h / 2), s: 1 };
    items().push(inst);
    sel = { kind: 'decor', id: inst.id };
    commit();
  };
  dup.onclick = () => {
    if (sel?.kind !== 'decor') return;
    const src = find(sel.id);
    if (!src) return;
    let k = 1;
    while (find(`${src.a}-${k}`)) k++;
    const copyInst = { ...src, id: `${src.a}-${k}`, x: src.x + 6, y: src.y + 6 };
    items().push(copyInst);
    sel = { kind: 'decor', id: copyInst.id };
    commit();
  };
  del.onclick = () => {
    if (sel?.kind !== 'decor') return;
    const id = sel.id;
    decorLayout[room][level] = items().filter((i) => i.id !== id);
    sel = null;
    commit();
  };

  // ---- lire et écrire la sélection
  function get(k: 'x' | 'y' | 's' | 'w' | 'h'): number {
    if (sel?.kind === 'decor') {
      const i = find(sel.id);
      return i ? (k === 's' ? i.s : k === 'x' ? i.x : k === 'y' ? i.y : 0) : 0;
    }
    if (sel?.kind === 'fixed') return k === 's' ? 1 : barLayout[sel.id][k];
    return 0;
  }
  function set(k: 'x' | 'y' | 's' | 'w' | 'h', v: number): void {
    if (sel?.kind === 'decor') {
      editDecor((i) => {
        if (k === 's') i.s = Math.max(0.1, Math.round(v * 100) / 100);
        else if (k === 'x' || k === 'y') i[k] = Math.round(v);
      });
    } else if (sel?.kind === 'fixed' && k !== 's') {
      barLayout[sel.id][k] = Math.round(k === 'w' || k === 'h' ? Math.max(4, v) : v);
      commit();
    }
  }
  function editDecor(fn: (i: DecorInst) => void): void {
    if (sel?.kind !== 'decor') return;
    const i = find(sel.id);
    if (!i) return;
    fn(i);
    commit();
  }

  // ---- affichage
  let boxes: { el: HTMLElement; sel: NonNullable<Sel> }[] = [];
  function buildBoxes(): void {
    layer.replaceChildren();
    boxes = [];
    const all: NonNullable<Sel>[] = [
      ...(room === 'bar' ? (Object.keys(barLayout) as BarItem[]).map((id) => ({ kind: 'fixed' as const, id })) : []),
      ...items().map((i) => ({ kind: 'decor' as const, id: i.id })),
    ];
    for (const s of all) {
      const b = el('div', `dev-box${s.kind === 'fixed' ? ` fixed${RESIZABLE.includes(s.id) ? ' resizable' : ''}` : ''}`);
      b.append(el('span', 'dev-tag', label(s)));
      const handle = el('div', 'dev-handle');
      b.append(handle);
      drag(b, s, false);
      drag(handle, s, true);
      layer.append(b);
      boxes.push({ el: b, sel: s });
    }
  }
  function label(s: NonNullable<Sel>): string {
    if (s.kind === 'fixed') return `${BAR_ITEM_NAMES[s.id]} (fixe)`;
    const i = find(s.id);
    return i ? `${decorAsset(i.a)?.name ?? i.a}${i.s !== 1 ? ` ×${num(i.s)}` : ''}` : s.id;
  }
  function rectOf(s: NonNullable<Sel>): { x: number; y: number; w: number; h: number } | null {
    if (s.kind === 'fixed') return barLayout[s.id];
    const i = find(s.id);
    return i ? instBox(i) : null;
  }
  /** Glisser une boîte (ou sa poignée : l'échelle, ou la taille du comptoir). */
  function drag(target: HTMLElement, s: NonNullable<Sel>, resize: boolean): void {
    target.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      select(s);
      const sc = host.scale();
      const r0 = rectOf(s);
      if (!r0) return;
      const inst = s.kind === 'decor' ? find(s.id) : null;
      const s0 = inst?.s ?? 1;
      const start = { x: e.clientX, y: e.clientY };
      target.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const dx = (ev.clientX - start.x) / sc;
        const dy = (ev.clientY - start.y) / sc;
        if (s.kind === 'fixed') {
          const spot = barLayout[s.id];
          if (resize) {
            if (RESIZABLE.includes(s.id)) { spot.w = Math.max(4, Math.round(r0.w + dx)); spot.h = Math.max(4, Math.round(r0.h + dy)); }
          } else { spot.x = Math.round(r0.x + dx); spot.y = Math.round(r0.y + dy); }
        } else if (inst) {
          if (resize) inst.s = Math.max(0.1, Math.round(((r0.w + dx) / (r0.w / s0)) * 20) / 20);
          else { inst.x = Math.round(r0.x + dx); inst.y = Math.round(r0.y + dy); }
        }
        commit(false);
      };
      const up = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
        commit();
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    });
  }

  function select(s: Sel): void {
    sel = s;
    refresh(false);
  }

  /** Met à jour boîtes et champs ; `rebuild` : la liste des objets a changé. */
  function refresh(rebuild = true): void {
    if (rebuild || boxes.length !== (room === 'bar' ? 3 : 0) + items().length) buildBoxes();
    const sc = host.scale();
    for (const { el: b, sel: s } of boxes) {
      const r = rectOf(s);
      if (!r) continue;
      Object.assign(b.style, { left: `${r.x * sc}px`, top: `${r.y * sc}px`, width: `${Math.max(2, r.w * sc)}px`, height: `${Math.max(2, r.h * sc)}px` });
      const on = !!sel && sel.kind === s.kind && sel.id === s.id;
      b.classList.toggle('on', on);
      (b.firstChild as HTMLElement).textContent = label(s);
    }
    // listes
    roomPick.value = room;
    levelPick.replaceChildren(...Array.from({ length: ROOM_LEVELS[room] }, (_, i) => option(String(i + 1), `Niveau ${i + 1}`)));
    levelPick.value = String(level);
    target.replaceChildren(...Array.from({ length: ROOM_LEVELS[room] }, (_, i) => i + 1).filter((l) => l !== level).map((l) => option(String(l), `niv. ${l}`)));
    copyRow.classList.toggle('hidden', ROOM_LEVELS[room] < 2);
    itemPick.replaceChildren(
      option('', `— ${items().length} décor${items().length > 1 ? 's' : ''} —`),
      ...(room === 'bar' ? (Object.keys(barLayout) as BarItem[]).map((id) => option(`fixed:${id}`, `${BAR_ITEM_NAMES[id]} (fixe)`)) : []),
      ...items().map((i) => option(i.id, `${decorAsset(i.a)?.name ?? i.a} · ${i.x}, ${i.y}`)),
    );
    itemPick.value = !sel ? '' : sel.kind === 'fixed' ? `fixed:${sel.id}` : sel.id;
    // champs
    const decor = sel?.kind === 'decor' ? find(sel.id) : null;
    const fixed = sel?.kind === 'fixed' ? sel.id : null;
    for (const k of ['x', 'y', 's', 'w', 'h'] as const) {
      const show = !!sel && (k === 's' ? !!decor : k === 'w' || k === 'h' ? !!fixed && RESIZABLE.includes(fixed) : true);
      wraps[k].classList.toggle('hidden', !show);
      if (show && document.activeElement !== inputs[k]) inputs[k].value = num(get(k));
    }
    fields.classList.toggle('hidden', !sel);
    flip.classList.toggle('hidden', !decor);
    front.classList.toggle('hidden', !decor);
    flipBox.checked = !!decor?.f;
    frontBox.checked = !!decor?.front;
    eventPick.classList.toggle('hidden', room !== 'bar');
    dup.disabled = !decor;
    del.disabled = !decor;
    if (!out.classList.contains('hidden')) out.value = layoutCode();
  }

  /** Après une modification : redessiner la pièce, garder, mettre à jour l'outil. */
  function commit(persist = true): void {
    host.room(room).renderer.invalidate();
    host.changed(room);
    if (persist) save();
    refresh(false);
  }

  function applyPreview(): void {
    for (const r of ROOMS) host.room(r).renderer.preview = null;
    host.room(room).renderer.preview = { level, event };
    host.room(room).renderer.invalidate();
    host.changed(room);
  }

  function switchRoom(r: RoomKey): void {
    host.room(room).renderer.preview = null;
    host.room(room).renderer.invalidate();
    room = r;
    level = Math.min(ROOM_LEVELS[r], host.room(r).level());
    sel = null;
    host.go(r);
    host.room(r).wrap.append(layer);
    applyPreview();
    refresh();
  }

  const onResize = () => refresh(false);
  window.addEventListener('resize', onResize);
  closeTool = () => {
    window.removeEventListener('resize', onResize);
    layer.remove();
    panel.remove();
    for (const r of ROOMS) {
      host.room(r).renderer.preview = null;
      host.room(r).renderer.invalidate();
    }
    host.changed(room);
    host.lock(false);
    closeTool = null;
  };
  switchRoom(room);
}
