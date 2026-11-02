import { DRINKABLE_MIN, verdictOf, type Tasting } from '../core/brewing/model';
import { STRAINS, type StrainId } from '../core/brewing/strains';
import { type Beer, type Game } from '../core/game';
import { DISTRIBUTORS, MAX_DEAL, bottlePrice } from '../core/market';
import { BREWERY_NAMES, CAPACITY, MAX_LEVEL, PRECISION, STATION_ORDER, STATIONS, upgradeCost, type StationId } from '../core/stations';
import { SCENE_H, SCENE_W, Scene } from '../render/scene';
import { stationCanvas } from '../render/sprites';
import { drawLabel } from '../render/labelArt';
import { BOTTLE_SCALE, drawShelfBottle, drawStorage, LABEL_SPOT, type ShelfBottleKind } from '../render/bottleArt';
import { CRATE, STORAGE } from '../core/warehouse';
import { DEFAULT_LABEL, EMBLEMS, FONTS, LABEL_COLORS, PATTERNS, SHAPES, type Label } from '../core/label';
import { drawGaston } from './gaston';
import { createKnob } from './knob';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const money = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 2 : 0 })} €`;
const moneyInt = (v: number) => `${Math.floor(v).toLocaleString('fr-FR')} €`;
const fmtRate = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 });
const VERDICT_CLASS: Record<string, string> = { Imbuvable: 'v-bad', Médiocre: 'v-meh', Correcte: 'v-ok', Bonne: 'v-good', Excellente: 'v-top' };

function img(canvas: HTMLCanvasElement, cls = 'pix'): HTMLImageElement {
  const i = h('img', cls);
  i.src = canvas.toDataURL();
  i.style.setProperty('--w', String(canvas.width));
  i.style.setProperty('--h', String(canvas.height));
  i.alt = '';
  return i;
}

export interface AppCallbacks {
  getSpeed(): number;
  setSpeed(s: number): void;
  newGame(): void;
}

/** Interface du jeu : header, brasserie, barre du bas, panneaux et fenêtres. */
export class App {
  readonly scene = new Scene();
  private header = h('header', 'topbar');
  private moneyEl = h('span', 'money-value');
  private stage = h('main', 'stage');
  private sceneWrap = h('div', 'scene-wrap');
  private overlays = new Map<StationId, { btn: HTMLButtonElement; label: HTMLElement; bar: HTMLElement; text: HTMLElement }>();
  private tasteBtn = h('button', 'taste-btn hidden', '🍺 Goûter');
  /** Plaque du niveau de la brasserie, en haut à gauche de la scène. */
  private plaque = h('button', 'map-btn plaque');
  private announcedTaste = -1;
  private bottom = h('nav', 'bottombar');
  private brewBtn = h('button', 'brew-btn');
  private rangeBtn = h('button', 'side-btn');
  private salesBtn = h('button', 'side-btn');
  private storageBtn = h('button', 'side-btn');
  /** Bière choisie sur l'étagère (fiche affichée sous l'étagère). */
  private shelfSel: number | null = null;
  private sheet = h('section', 'sheet hidden');
  private modal = h('div', 'modal hidden');
  private mentor = h('div', 'mentor hidden');
  private toasts = h('div', 'toasts');
  private openSheet: { kind: 'station'; id: StationId } | { kind: 'brew' | 'range' | 'sales' | 'storage' } | null = null;
  private sheetKey = '';
  private mentorKey = '';
  private scale = 2;
  /** Appelé quand une première bouteille d'essai est prête (haptique). */
  onTasteReady?: () => void;

  constructor(private root: HTMLElement, private game: () => Game, private cb: AppCallbacks) {
    // header
    const logo = h('div', 'logo');
    logo.append(img(stationCanvas('boil', 1), 'pix logo-icon'), h('span', 'logo-text', 'Brew It'));
    const pill = h('div', 'money');
    pill.append(h('span', 'coin'), this.moneyEl);
    const opts = h('button', 'icon-btn', '⚙');
    opts.setAttribute('aria-label', 'Options');
    opts.onclick = () => this.openOptions();
    this.header.append(logo, pill, opts);

    // scène + étiquettes cliquables
    this.sceneWrap.append(this.scene.canvas);
    for (const id of STATION_ORDER) {
      const btn = h('button', 'station-hit');
      btn.setAttribute('aria-label', STATIONS[id].step);
      btn.onclick = () => this.open({ kind: 'station', id });
      const label = h('div', 'station-label');
      const text = h('span', 'label-text');
      const bar = h('div', 'label-bar');
      bar.append(h('div', 'label-fill'));
      label.append(text, bar);
      this.sceneWrap.append(btn, label);
      this.overlays.set(id, { btn, label, bar, text });
    }
    this.tasteBtn.onclick = () => this.openTasting();
    this.plaque.onclick = () => this.openBrewery();
    this.sceneWrap.append(this.plaque, this.tasteBtn);
    this.stage.append(this.sceneWrap);

    // barre du bas
    this.rangeBtn.onclick = () => this.open({ kind: 'range' });
    this.salesBtn.onclick = () => this.open({ kind: 'sales' });
    this.storageBtn.onclick = () => this.open({ kind: 'storage' });
    this.brewBtn.onclick = () => this.open({ kind: 'brew' });
    this.bottom.append(this.rangeBtn, this.storageBtn, this.brewBtn, this.salesBtn);

    // Gaston
    const av = h('canvas', 'mentor-avatar');
    drawGaston(av);
    this.mentor.append(av, h('div', 'mentor-body'));

    root.append(this.header, this.stage, this.mentor, this.sheet, this.bottom, this.modal, this.toasts);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  // ------------------------------------------------------------------ mise en page

  /** La brasserie remplit l'espace entre le header et la barre du bas, agrandie au pixel près. */
  layout(): void {
    const top = this.header.getBoundingClientRect().bottom;
    const bottom = this.bottom.getBoundingClientRect().top;
    const availW = window.innerWidth - 8;
    const availH = Math.max(100, bottom - top - 8);
    this.scale = Math.min(availW / SCENE_W, availH / SCENE_H);
    const w = Math.floor(SCENE_W * this.scale);
    const hh = Math.floor(SCENE_H * this.scale);
    Object.assign(this.sceneWrap.style, { width: `${w}px`, height: `${hh}px` });
    Object.assign(this.scene.canvas.style, { width: `${w}px`, height: `${hh}px` });
    this.stage.style.top = `${top}px`;
    this.stage.style.bottom = `${window.innerHeight - bottom}px`;
    this.root.style.setProperty('--bottom-h', `${window.innerHeight - bottom}px`);
    this.root.style.setProperty('--top-h', `${top}px`);
    this.laidOut = `${top}|${bottom}|${window.innerWidth}`;
  }
  private laidOut = '';

  // ------------------------------------------------------------------ boucle d'affichage

  frame(t: number): void {
    const g = this.game();
    this.scene.draw(g, t);
    // étiquettes des appareils
    for (const id of STATION_ORDER) {
      const o = this.overlays.get(id)!;
      const r = this.scene.rect(id, g.level(id));
      const s = this.scale;
      Object.assign(o.btn.style, { left: `${r.x * s}px`, top: `${r.y * s}px`, width: `${r.w * s}px`, height: `${r.h * s}px` });
      const batch = g.batchAt(id);
      o.label.classList.toggle('busy', !!batch);
      o.label.style.left = `${(r.x + r.w / 2) * s}px`;
      o.label.style.top = `${Math.max(0, r.y * s - 18)}px`;
      const pct = batch ? Math.min(1, batch.elapsed / Math.max(0.01, batch.duration)) : 0;
      o.text.textContent = batch
        ? id === 'bottling' && g.bottlingBlocked ? 'Stockage plein ⏸'
        : batch.waiting ? `${STATIONS[id].step} ⏸` : `${STATIONS[id].step} · ${Math.round(pct * 100)} %`
        : STATIONS[id].step;
      o.label.classList.toggle('blocked', id === 'bottling' && g.bottlingBlocked);
      (o.bar.firstElementChild as HTMLElement).style.width = `${pct * 100}%`;
    }
  }

  private placeTaste(): void {
    const p = this.scene.tastePoint;
    this.tasteBtn.style.left = `${p.x * this.scale}px`;
    this.tasteBtn.style.top = `${p.y * this.scale}px`;
  }

  /** Rafraîchissement de l'interface DOM (≈ 4 Hz). */
  update(): void {
    const g = this.game();
    this.moneyEl.textContent = moneyInt(g.money);
    this.plaque.textContent = `★ ${g.breweryLevel} · ${g.breweryName}`;
    const can = g.canBrew();
    const sub = g.autoBrew ? '⟳ En continu' : can.ok ? (g.broke ? 'Offert par Gaston' : `${g.batchLiters} L · ${moneyInt(g.brewCost())}`) : g.batchAt('mill') ? 'Moulin occupé' : 'Fonds insuffisants';
    this.brewBtn.replaceChildren(h('span', 'brew-title', 'Brasser'), h('span', 'brew-sub', sub));
    this.brewBtn.classList.toggle('ready', can.ok && !g.autoBrew);
    const trial = g.tastable;
    this.rangeBtn.replaceChildren(h('span', 'side-title', 'Gamme'), h('span', 'side-sub', `${g.beers.length}/${g.rangeSlots} bières`));
    const capCrates = STORAGE[g.storageLevel - 1]!.crates;
    this.storageBtn.replaceChildren(h('span', 'side-title', 'Stockage'), h('span', 'side-sub', g.storageFull ? 'Plein !' : `${Math.ceil(g.stored / CRATE)}/${capCrates} caisses`));
    this.storageBtn.classList.toggle('alert', g.bottlingBlocked);
    this.tasteBtn.classList.toggle('hidden', !trial || this.modalOpen);
    this.placeTaste();
    if (trial && trial.id !== this.announcedTaste) {
      this.announcedTaste = trial.id;
      this.toast('La première bouteille sort : goûte-la !', 'good');
      this.onTasteReady?.();
    }
    const available = DISTRIBUTORS.some((d) => !g.signed.includes(d.id) && g.distributorOpen(d.id));
    this.salesBtn.replaceChildren(h('span', 'side-title', 'Ventes'), h('span', 'side-sub', available ? '✍ Nouveau contrat' : `${g.totalSold} vendues`));
    this.salesBtn.classList.toggle('alert', available);
    this.renderSheet();
    this.renderMentor();
    // La barre du bas change de hauteur une fois remplie / les polices chargées : on recadre.
    const key = `${this.header.getBoundingClientRect().bottom}|${this.bottom.getBoundingClientRect().top}|${window.innerWidth}`;
    if (key !== this.laidOut) this.layout();
  }

  // ------------------------------------------------------------------ panneaux

  open(s: NonNullable<App['openSheet']>): void {
    const same = this.openSheet && this.openSheet.kind === s.kind && (s.kind !== 'station' || (this.openSheet as { id?: string }).id === s.id);
    this.openSheet = same ? null : s;
    this.scene.selected = this.openSheet?.kind === 'station' ? this.openSheet.id : null;
    this.sheetKey = '';
    if (this.openSheet?.kind === 'station' && this.game().tips === 1) this.game().tips = 2;
    this.renderSheet();
  }

  private close(): void {
    this.openSheet = null;
    this.scene.selected = null;
    this.sheetKey = '';
    this.renderSheet();
  }

  private renderSheet(): void {
    const g = this.game();
    const s = this.openSheet;
    this.sheet.classList.toggle('hidden', !s);
    if (!s) return;
    const key = JSON.stringify([
      s, g.level(s.kind === 'station' ? s.id : 'mill'), g.beers.map((b) => [b.id, b.stock, b.name]), g.tastable?.id ?? 0, g.signed, g.selectedBeer, g.autoBrew,
      Math.floor(g.totalSold / 10), g.batchLiters, s.kind === 'brew' ? [g.canBrew().ok, g.roomForBatch, g.queued, g.broke] : 0, s.kind === 'sales' ? [g.deals, Math.round(g.demandRate), Math.round(g.productionRate())] : 0, g.rangeSlots, g.storageLevel, g.bottlingBlocked, this.shelfSel,
    ]);
    if (key === this.sheetKey) return this.refreshLive();
    this.sheetKey = key;
    const scroll = this.sheet.querySelector('.sheet-body')?.scrollTop ?? 0;
    const shelfScroll = this.sheet.querySelector('.shelf')?.scrollLeft ?? 0;
    this.sheet.replaceChildren();
    if (s.kind === 'station') this.stationSheet(g, s.id);
    if (s.kind === 'brew') this.brewSheet(g);
    if (s.kind === 'range') this.rangeSheet(g);
    if (s.kind === 'storage') this.storageSheet(g);
    if (s.kind === 'sales') this.salesSheet(g);
    const body = this.sheet.querySelector('.sheet-body');
    if (body) body.scrollTop = scroll;
    const shelf = this.sheet.querySelector('.shelf');
    if (shelf) shelf.scrollLeft = shelfScroll;
  }

  /** Met à jour sans reconstruire ce qui dépend de l'argent. */
  private refreshLive(): void {
    const g = this.game();
    this.sheet.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach((b) => (b.disabled = g.money < Number(b.dataset.cost)));
  }

  private frameSheet(title: string, icon?: HTMLCanvasElement): HTMLElement {
    const head = h('div', 'sheet-head');
    const t = h('div', 'sheet-title');
    if (icon) t.append(img(icon, 'pix sheet-icon'));
    t.append(h('strong', '', title));
    const close = h('button', 'icon-btn small', '✕');
    close.onclick = () => this.close();
    head.append(t, close);
    const body = h('div', 'sheet-body');
    this.sheet.append(head, body);
    return body;
  }

  private btn(cls: string, text: string, onclick: () => void): HTMLButtonElement {
    const b = h('button', cls, text);
    b.onclick = onclick;
    return b;
  }

  // --- Fiche d'un appareil : réglages et amélioration
  private stationSheet(g: Game, id: StationId): void {
    const def = STATIONS[id];
    const lv = g.level(id);
    const body = this.frameSheet(`${def.names[lv - 1]}`, stationCanvas(id, lv));
    body.append(h('div', 'step-tag', `${def.step} · niveau ${lv}/${MAX_LEVEL}`), h('p', 'hint', def.description));
    const batch = g.batchAt(id);
    if (batch) body.append(h('p', 'note', 'Un brassin est en cours ici. Tes réglages s\'appliqueront au prochain brassin.'));
    if (def.strain) {
      const row = h('div', 'chips');
      const desc = h('div', 'hint strain-desc', STRAINS[g.recipe.strain].description);
      for (const [sid, st] of Object.entries(STRAINS)) {
        const c = this.btn(`chip${g.recipe.strain === sid ? ' active' : ''}`, st.name, () => {
          g.setParam('strain', sid as StrainId);
          row.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
          desc.textContent = st.description;
        });
        row.append(c);
      }
      body.append(h('div', 'section-title', 'Levure'), row, desc);
    }
    const knobs = h('div', 'knob-row');
    for (const k of def.knobs) {
      knobs.append(createKnob({ label: k.label, min: k.min, max: k.max, step: k.step, unit: k.unit, value: g.recipe[k.key] as number, onChange: (v) => g.setParam(k.key, v) }));
    }
    body.append(knobs);
    // amélioration
    const up = h('div', 'card upgrade');
    up.append(h('div', 'section-title', 'Améliorer'));
    // On ne dévoile que le palier suivant : la surprise reste entière pour les niveaux d'après.
    const levels = h('div', 'levels');
    const cell = (i: number, tag: string, cls: string) => {
      const c = h('div', `level ${cls}`);
      c.append(h('div', 'section-title', tag), img(stationCanvas(id, i), 'pix level-pic'), h('div', 'level-name', def.names[i - 1]!), h('div', 'level-perk', def.perks[i - 1]!));
      return c;
    };
    levels.append(cell(lv, `Actuel · niv. ${lv}`, 'done'));
    if (lv < MAX_LEVEL) levels.append(h('div', 'level-arrow', '➜'), cell(lv + 1, `Suivant · niv. ${lv + 1}`, 'current'));
    up.append(levels);
    up.append(h('div', 'hint', `Volume ${CAPACITY[lv]} L · précision ± ${String(PRECISION[lv]).replace('.', ',')} °C`));
    if (lv < MAX_LEVEL) {
      const cost = upgradeCost(id, lv + 1);
      const b = this.btn('btn primary', `Passer au niveau ${lv + 1} : ${def.names[lv]} · ${moneyInt(cost)}`, () => {
        const r = g.upgrade(id);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`${def.names[lv]} installé !`, 'good');
        this.sheetKey = '';
      });
      b.dataset.cost = String(cost);
      b.disabled = g.money < cost;
      up.append(b);
      if (batch) up.append(h('p', 'hint', 'Le brassin en cours continue pendant l\'installation.'));
    } else up.append(h('p', 'note', 'Niveau maximal atteint.'));
    body.append(up);
  }

  // --- Lancer un brassin
  private brewSheet(g: Game): void {
    const body = this.frameSheet('Brasser');
    const beer = g.beers.find((b) => b.id === g.selectedBeer);
    const card = h('div', 'card');
    card.append(
      h('div', 'section-title', 'Recette'),
      h('div', 'beer-name', beer ? beer.name : 'Nouvel essai'),
      h('p', 'hint', beer ? 'Les machines sont réglées sur cette bière de ta gamme : les bouteilles iront dans son stock.' : 'Avec les réglages actuels des machines. À la fin, tu goûteras le résultat.'),
      h('div', 'stats-line', `${g.batchLiters} L · ${Math.floor(g.batchLiters / 0.33)} bouteilles · ingrédients ${money(g.brewCost())}`),
    );
    body.append(card);
    const can = g.canBrew();
    const busy = !!g.batchAt('mill');
    const label = g.queued ? 'En attente du moulin…' : can.ok ? (g.broke ? 'Lancer (Gaston avance les ingrédients)' : 'Lancer le brassin') : busy ? 'Lancer dès que le moulin est libre' : can.reason!;
    const go = this.btn('btn primary big', label, () => {
      const r = busy ? g.queueBrew() : g.brew();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      if (g.tips === 2 || g.tips === 1) g.tips = 3;
      this.toast(busy ? 'Ton brassin passera au prochain tour du moulin.' : 'Brassin lancé : suis-le descendre !', 'good');
      this.close();
    });
    go.disabled = g.queued || (!can.ok && !(busy && g.money >= g.brewCost()));
    body.append(go);
    if (g.beers.length) {
      const auto = h('label', 'toggle');
      const box = h('input');
      box.type = 'checkbox';
      box.checked = g.autoBrew;
      box.onchange = () => {
        g.autoBrew = box.checked;
        this.toast(box.checked ? 'Brassage continu activé' : 'Brassage continu arrêté', 'info');
        this.sheetKey = '';
      };
      auto.append(box, h('span', '', 'Brasser toute ma gamme en continu'));
      body.append(auto, h('p', 'hint', 'Dès que le moulin est libre, on relance la bière de ta gamme qui a le moins de bouteilles, tant que tu as de quoi payer les ingrédients et de la place dans le stockage. Ça continue même quand l\'appli est fermée. Un essai que tu lances passe toujours en priorité.'));
      if (g.autoBrew && !g.roomForBatch) body.append(h('p', 'note bad', 'En pause : le stockage sera plein avec les brassins déjà en route. Vends ou agrandis ton stockage.'));
    }
    if (g.beers.length) {
      body.append(h('div', 'section-title', 'Charger une bière de ma gamme'));
      const list = h('div', 'chips');
      for (const b of g.beers) list.append(this.btn(`chip${b.id === g.selectedBeer ? ' active' : ''}`, b.name, () => {
        g.loadBeer(b.id);
        this.sheetKey = '';
        this.toast(`Machines réglées sur « ${b.name} »`, 'info');
      }));
      body.append(list);
    }
  }

  // --- Ma gamme : une étagère de grandes bouteilles, et une silhouette « + » pour en créer une nouvelle
  private rangeSheet(g: Game): void {
    const body = this.frameSheet(`Ma gamme · ${g.beers.length}/${g.rangeSlots}`);
    if (g.tastable) {
      const banner = h('div', 'card banner');
      banner.append(h('div', 'beer-name', 'Un essai sort de la ligne'), this.btn('btn primary', 'Goûter', () => this.openTasting()));
      body.append(banner);
    }
    if (this.shelfSel == null || !g.beers.some((b) => b.id === this.shelfSel)) this.shelfSel = g.selectedBeer ?? g.beers[0]?.id ?? null;
    const shelf = h('div', 'shelf');
    const row = h('div', 'shelf-row');
    const slot = (kind: ShelfBottleKind, tag: string, onclick: () => void, beer?: Beer) => {
      const item = h('button', `shelf-item ${kind}${beer && beer.id === this.shelfSel ? ' selected' : ''}`);
      const bottle = h('div', 'shelf-bottle');
      const c = h('canvas', 'shelf-glass');
      drawShelfBottle(c, kind);
      bottle.append(c);
      if (beer) {
        const lab = h('canvas', 'shelf-label');
        drawLabel(lab, beer.label, beer.name);
        Object.assign(lab.style, { left: `${LABEL_SPOT.x * BOTTLE_SCALE}px`, top: `${LABEL_SPOT.y * BOTTLE_SCALE}px` });
        bottle.append(lab);
      }
      item.append(bottle, h('span', 'shelf-tag', tag));
      item.onclick = onclick;
      row.append(item);
      return item;
    };
    for (const b of g.beers) {
      slot('beer', `${b.stock} btl`, () => {
        this.shelfSel = b.id;
        this.sheetKey = '';
      }, b);
    }
    for (let i = g.beers.length; i < g.rangeSlots; i++) {
      slot('empty', 'Place libre', () => this.toast('Brasse un essai, goûte-le et garde-le : il prendra cette place.', 'info'));
    }
    const cost = g.nextSlotCost;
    if (cost != null) {
      const add = slot('add', moneyInt(cost), () => this.openNewRange());
      add.setAttribute('aria-label', `Nouvelle gamme pour ${moneyInt(cost)}`);
      add.classList.toggle('afford', g.money >= cost);
    }
    shelf.append(row);
    body.append(shelf);
    const sel = g.beers.find((b) => b.id === this.shelfSel);
    if (sel) body.append(this.beerCard(g, sel));
    else body.append(h('p', 'hint', g.rangeSlots > g.beers.length
      ? 'Ton étagère attend sa première bière : brasse un essai réussi, goûte-le et garde-le.'
      : 'Touche la silhouette « + » pour ouvrir une nouvelle gamme.'));
  }

  /** Confirmation d'achat d'une nouvelle place sur l'étagère. */
  private openNewRange(): void {
    const g = this.game();
    const cost = g.nextSlotCost;
    if (cost == null) return;
    const card = this.modalCard('Nouvelle gamme');
    card.append(
      h('p', 'hint', 'Ajoute une place sur ton étagère pour une nouvelle bière.'),
      h('p', 'hint', 'Ensuite, règle tes machines pour une autre recette, brasse un essai, goûte-le et garde-le : il prendra cette place, avec son nom et son étiquette.'),
    );
    const buy = this.btn('btn primary big', `Créer une gamme · ${moneyInt(cost)}`, () => {
      const r = g.buySlot();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.closeModal();
      this.sheetKey = '';
      this.toast('Nouvelle place sur ton étagère !', 'good');
    });
    buy.disabled = g.money < cost;
    card.append(buy);
    if (g.money < cost) card.append(h('p', 'note bad', `Il te manque ${moneyInt(cost - g.money)}.`));
    card.append(h('p', 'hint', 'Chaque nouvelle gamme coûte plus cher que la précédente.'));
    card.append(this.btn('btn', 'Annuler', () => this.closeModal()));
  }

  // --- Stockage : les caisses s'empilent jusqu'à ce que la réserve soit pleine
  private storageSheet(g: Game): void {
    const lvl = STORAGE[g.storageLevel - 1]!;
    const body = this.frameSheet(`Stockage · ${lvl.name}`);
    const capCrates = lvl.crates;
    const crates = Math.ceil(g.stored / CRATE);
    const pic = h('canvas', 'storage-pic');
    drawStorage(pic, g.beers, capCrates, g.storageLevel);
    body.append(pic);
    body.append(h('div', 'stats-line strong', `${g.stored} / ${g.storageCap} bouteilles · ${crates} / ${capCrates} caisses de ${CRATE}`));
    const bar = h('div', 'progress');
    const fill = h('div', `progress-fill${g.storageFull ? ' full' : ''}`);
    fill.style.width = `${Math.min(100, (g.stored / g.storageCap) * 100)}%`;
    bar.append(fill);
    body.append(bar);
    if (g.bottlingBlocked) body.append(h('p', 'note bad', 'Stockage plein : l\'embouteillage est à l\'arrêt. Attends les ventes ou agrandis ta réserve.'));
    else body.append(h('p', 'hint', 'Les bouteilles embouteillées arrivent ici en caisses ; les distributeurs y viennent les chercher.'));
    if (g.beers.length) {
      const list = h('div', 'stock-list');
      for (const b of g.beers) {
        const line = h('div', 'stock-line');
        const thumb = h('canvas', 'label-thumb');
        drawLabel(thumb, b.label, b.name);
        line.append(thumb, h('span', 'stock-name', b.name), h('span', 'stock-qty', `${b.stock} btl · ${Math.ceil(b.stock / CRATE)} caisses`));
        list.append(line);
      }
      body.append(list);
    }
    // agrandissement
    const up = h('div', 'card upgrade');
    up.append(h('div', 'section-title', 'Agrandir'));
    // Seulement le palier actuel et le suivant.
    const levels = h('div', 'storage-levels');
    const next = STORAGE[g.storageLevel];
    for (const [l, tag, cls] of [[lvl, 'Actuel', 'done'], [next, 'Suivant', 'current']] as const) {
      if (!l) continue;
      const cell = h('div', `storage-level ${cls}`);
      cell.append(h('span', 'level-name', `${tag} : ${l.name}`), h('span', 'level-perk', `${l.crates} caisses · ${l.crates * CRATE} btl`));
      levels.append(cell);
    }
    up.append(levels);
    if (next) {
      const b = this.btn('btn primary', `Passer à : ${next.name} (${next.crates} caisses) · ${moneyInt(next.cost)}`, () => {
        const r = g.upgradeStorage();
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`${next.name} : ${next.crates} caisses de place !`, 'good');
        this.sheetKey = '';
      });
      b.dataset.cost = String(next.cost);
      b.disabled = g.money < next.cost;
      up.append(b);
    } else up.append(h('p', 'note', 'Niveau maximal atteint.'));
    body.append(up);
  }

  private beerCard(g: Game, b: Beer): HTMLElement {
    const t = b.tasting;
    const v = verdictOf(t.quality);
    const card = h('div', `card beer${b.id === g.selectedBeer ? ' selected' : ''}`);
    const head = h('div', 'beer-head');
    const thumb = h('canvas', 'label-thumb');
    drawLabel(thumb, b.label, b.name);
    const title = h('div', 'beer-title');
    title.append(thumb, h('span', 'beer-name', b.name));
    head.append(title, h('span', `verdict ${VERDICT_CLASS[v]}`, v));
    card.append(head, h('div', 'stats-line', `${t.style} · ${t.abv.toFixed(1)} % · ${Math.round(t.ibu)} IBU · ${t.color}`), h('div', 'stats-line strong', `Stock : ${b.stock} bouteilles · vendues : ${b.sold} · ${moneyInt(b.revenue)}`));
    const actions = h('div', 'row');
    actions.append(this.btn('btn small', b.id === g.selectedBeer ? 'Réglages chargés' : 'Charger ses réglages', () => {
      g.loadBeer(b.id);
      this.sheetKey = '';
    }));
    actions.append(this.btn('btn small', 'Fiche', () => this.openTastingView(b.name, t)));
    actions.append(this.btn('btn small', 'Étiquette', () => this.openLabelEditor(b.name, b.label, (name, label) => {
      b.name = name.trim() || b.name;
      g.setLabel(b.id, label);
      this.sheetKey = '';
      this.closeModal();
    })));
    actions.append(this.btn('btn small bad', 'Retirer', () => {
      g.removeBeer(b.id);
      this.sheetKey = '';
    }));
    card.append(actions);
    return card;
  }

  // --- Ventes
  private salesSheet(g: Game): void {
    const body = this.frameSheet('Ventes');
    body.append(h('div', 'stats-line strong', `${g.totalSold.toLocaleString('fr-FR')} bouteilles vendues · ${moneyInt(g.totalRevenue)} de chiffre d'affaires`));
    const demand = g.demandRate;
    const prod = g.productionRate();
    const balance = h('div', 'card');
    balance.append(
      h('div', 'stats-line', `Commandes : ${fmtRate(demand)} btl/min · ta ligne peut en faire ${fmtRate(prod)} btl/min`),
      h('p', demand > prod * 1.05 ? 'note bad' : 'hint', demand > prod * 1.05
        ? 'Ta production ne suit pas : améliore tes appareils (le plus petit fixe le volume, le plus lent la cadence).'
        : 'Ta ligne suit la demande : signe ou négocie des contrats pour vendre plus.'),
    );
    body.append(balance);
    for (const d of DISTRIBUTORS) {
      const signed = g.signed.includes(d.id);
      const unlocked = g.distributorOpen(d.id);
      const card = h('div', `card distributor${signed ? ' signed' : unlocked ? ' available' : ' locked'}`);
      const head = h('div', 'beer-head');
      head.append(h('span', 'beer-name', d.name), h('span', `verdict ${signed ? 'v-good' : unlocked ? 'v-top' : 'v-meh'}`, signed ? 'Sous contrat' : unlocked ? 'Disponible' : '🔒'));
      card.append(head, h('p', 'hint', d.description));
      card.append(h('div', 'stats-line', `${signed ? fmtRate(g.orderRate(d.id)) : d.rate} btl/min · commandes de ${d.order} · ${money(d.price * 0.6)}–${money(d.price * 1.4)} la bouteille · qualité min. ${verdictOf(d.minQuality)}`));
      if (d.order > g.storageCap) card.append(h('p', 'note bad', `Ton stockage (${g.storageCap} btl) est trop petit pour ses commandes de ${d.order} bouteilles.`));
      if (d.likes) card.append(h('div', 'note', `Aime : ${d.likes.label} (+30 %)`));
      if (signed) {
        const best = g.beers.filter((b) => b.tasting.quality >= d.minQuality);
        card.append(h('div', 'hint', best.length ? `Achète : ${best.map((b) => `${b.name} (${money(bottlePrice(d, b.tasting))})`).join(', ')}` : 'Aucune bière de ta gamme ne lui convient.'));
        if (best.length > 1) card.append(h('div', 'hint', `Variété : ${best.length} bières qui lui plaisent, il commande plus.`));
        const lvl = g.deals[d.id] ?? 0;
        const pips = h('div', 'deal-pips');
        for (let i = 0; i < MAX_DEAL; i++) pips.append(h('span', `pip${i < lvl ? ' on' : ''}`));
        const row = h('div', 'deal-row');
        row.append(h('span', 'section-title', 'Volume négocié'), pips);
        card.append(row);
        const cost = g.dealCost(d.id);
        if (cost != null) {
          const nb = this.btn('btn small', `Négocier +40 % de commandes · ${moneyInt(cost)}`, () => {
            const r = g.negotiate(d.id);
            if (!r.ok) return this.toast(r.reason!, 'bad');
            this.toast(`${d.name} commandera plus !`, 'good');
            this.sheetKey = '';
          });
          nb.dataset.cost = String(cost);
          nb.disabled = g.money < cost;
          card.append(nb);
        }
      } else if (unlocked) {
        const b = this.btn('btn primary', `Signer le contrat · ${moneyInt(d.fee)}`, () => {
          const r = g.sign(d.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`Contrat signé avec ${d.name} !`, 'good');
          this.sheetKey = '';
        });
        b.dataset.cost = String(d.fee);
        b.disabled = g.money < d.fee;
        card.append(b);
      } else {
        const lvOk = g.breweryLevel >= d.level;
        card.append(h('div', lvOk ? 'note' : 'note bad', `${lvOk ? '✓' : '✗'} Brasserie niveau ${d.level} : ${BREWERY_NAMES[d.level - 1]}${lvOk ? '' : ` (tous les appareils au niveau ${d.level})`}`));
        const soldOk = g.totalSold >= d.unlockSold;
        if (d.unlockSold > 0) {
          const bar = h('div', 'progress');
          const fill = h('div', 'progress-fill');
          fill.style.width = `${Math.min(100, (g.totalSold / d.unlockSold) * 100)}%`;
          bar.append(fill);
          card.append(h('div', soldOk ? 'note' : 'hint', `${soldOk ? '✓' : '✗'} ${d.unlockSold.toLocaleString('fr-FR')} bouteilles vendues (${Math.min(g.totalSold, d.unlockSold).toLocaleString('fr-FR')}/${d.unlockSold.toLocaleString('fr-FR')})`), bar);
        }
      }
      body.append(card);
    }
  }

  // ------------------------------------------------------------------ fenêtres

  /** Dégustation de la première bouteille d'un essai : garder (nom + étiquette) ou recommencer. */
  openTasting(): void {
    const g = this.game();
    const b = g.tastable;
    if (!b?.tasting) return;
    const t = b.tasting;
    const card = this.modalCard('Dégustation');
    this.tastingBody(card, t);
    card.append(h('div', 'stats-line', `${b.bottles} bouteilles dans ce brassin`));
    const ok = t.quality >= DRINKABLE_MIN;
    const full = g.beers.length >= g.rangeSlots;
    const slotCost = g.nextSlotCost;
    const keep = this.btn('btn primary big', ok ? (full ? 'Gamme pleine' : 'Garder cette bière') : 'Imbuvable', () => {
      this.openLabelEditor(g.beers.length ? '' : 'Blonde de Gaston', { ...DEFAULT_LABEL }, (name, label) => {
        const r = g.keepTrial(name, label);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        if (g.tips <= 4) g.tips = 4;
        this.closeModal();
        this.toast('Ta bière entre dans ta gamme : les bouteilles sont étiquetées !', 'good');
        this.sheetKey = '';
      });
    });
    keep.disabled = !ok || full;
    if (full && ok) {
      card.append(h('p', 'note bad', 'Ta gamme est pleine : crée une nouvelle gamme ou retire une bière.'));
      if (slotCost != null) {
        const buy = this.btn('btn', `Créer une gamme · ${moneyInt(slotCost)}`, () => {
          const r = g.buySlot();
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.sheetKey = '';
          this.openTasting();
        });
        buy.disabled = g.money < slotCost;
        card.append(buy);
      }
    }
    card.append(keep, this.btn('btn bad', 'Recommencer (jeter ce brassin)', () => {
      g.discardTrial();
      this.closeModal();
      this.toast('Brassin jeté : ajuste tes réglages et relance.', 'info');
      this.sheetKey = '';
    }));
  }

  /** Éditeur d'étiquette : forme, fond, motif, couleurs, emblème, police ; aperçu en direct. */
  openLabelEditor(name: string, initial: Label, onDone: (name: string, label: Label) => void): void {
    const label: Label = { ...initial };
    const card = this.modalCard('Ton étiquette');
    const preview = h('div', 'label-preview');
    const big = h('canvas', 'label-big');
    const bottle = h('div', 'bottle-preview');
    const small = h('canvas', 'label-on-bottle');
    bottle.append(small);
    preview.append(big, bottle);
    const input = h('input', 'name-input');
    input.maxLength = 22;
    input.placeholder = 'Nom de ta bière';
    input.value = name;
    const redraw = () => {
      drawLabel(big, label, input.value);
      drawLabel(small, label, input.value);
    };
    input.oninput = redraw;
    card.append(preview, h('div', 'section-title', 'Nom'), input);
    const chooser = <K extends keyof Label>(title: string, key: K, options: { id: Label[K]; name: string }[]) => {
      const row = h('div', 'chips');
      for (const o of options) {
        const c = this.btn(`chip${label[key] === o.id ? ' active' : ''}`, o.name, () => {
          label[key] = o.id;
          row.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
          redraw();
        });
        row.append(c);
      }
      card.append(h('div', 'section-title', title), row);
    };
    const colors = (title: string, key: 'bg' | 'patternColor' | 'textColor') => {
      const row = h('div', 'swatches');
      for (const col of LABEL_COLORS) {
        const sw = this.btn(`swatch${label[key] === col ? ' active' : ''}`, '', () => {
          label[key] = col;
          row.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('active', x === sw));
          redraw();
        });
        sw.style.background = col;
        sw.setAttribute('aria-label', col);
        row.append(sw);
      }
      card.append(h('div', 'section-title', title), row);
    };
    chooser('Forme', 'shape', SHAPES);
    colors('Fond', 'bg');
    chooser('Motif', 'pattern', PATTERNS);
    colors('Couleur du motif', 'patternColor');
    chooser('Emblème', 'emblem', EMBLEMS);
    chooser('Police du nom', 'font', FONTS);
    colors('Couleur du texte et du contour', 'textColor');
    card.append(this.btn('btn primary big', 'Valider l\'étiquette', () => onDone(input.value, label)));
    redraw();
    void document.fonts?.ready.then(redraw);
  }

  private openTastingView(name: string, t: Tasting): void {
    const card = this.modalCard(name);
    this.tastingBody(card, t);
    card.append(this.btn('btn', 'Fermer', () => this.closeModal()));
  }

  private tastingBody(card: HTMLElement, t: Tasting): void {
    const v = verdictOf(t.quality);
    card.append(h('div', `verdict big ${VERDICT_CLASS[v]}`, v), h('div', 'score', `${t.style} · note ${Math.round(t.quality * 20)}/20`));
    const stats = h('div', 'tasting-stats');
    const lab = (x: number, a: string, b: string, c: string) => (x > 0.66 ? a : x > 0.33 ? b : c);
    for (const [k, val] of [
      ['Alcool', `${t.abv.toFixed(1)} %`], ['Amertume', `${Math.round(t.ibu)} IBU`], ['Couleur', t.color],
      ['Arôme', lab(t.aroma, 'Intense', 'Présent', 'Discret')], ['Limpidité', lab(t.clarity, 'Limpide', 'Voilée', 'Trouble')], ['Bulles', t.co2 < 1.8 ? 'Plate' : t.co2 > 3.2 ? 'Excessives' : 'Fines'],
    ] as const) {
      const c = h('div', 'stat');
      c.append(h('div', 'section-title', k), h('div', 'stat-value', val));
      stats.append(c);
    }
    card.append(stats);
    if (t.defects.length) {
      card.append(h('div', 'section-title', 'Ce qui ne va pas'));
      const ul = h('ul', 'defects');
      for (const d of t.defects) ul.append(h('li', '', d.label));
      card.append(ul);
    } else card.append(h('p', 'note', 'Aucun défaut : propre, équilibrée, réussie !'));
  }

  openOffline(): void {
    const g = this.game();
    const o = g.offline;
    if (!o) return;
    const card = this.modalCard('Pendant ton absence');
    const hrs = Math.floor(o.seconds / 3600);
    const min = Math.floor((o.seconds % 3600) / 60);
    card.append(h('p', 'hint', `Ta brasserie a tourné ${hrs ? `${hrs} h ` : ''}${min} min sans toi.`));
    const stats = h('div', 'tasting-stats');
    for (const [k, v] of [['Brassins', String(o.batches)], ['Vendues', `${o.sold} btl`], ['Gains', moneyInt(o.earned)]] as const) {
      const c = h('div', 'stat');
      c.append(h('div', 'section-title', k), h('div', 'stat-value', v));
      stats.append(c);
    }
    card.append(stats, this.btn('btn primary big', `Récolter ${moneyInt(o.earned)}`, () => {
      g.collectOffline();
      this.closeModal();
      this.toast(`+${moneyInt(o.earned)} récoltés`, 'good');
    }));
  }

  /** Fiche de la brasserie : son niveau, ce qui manque pour le suivant et ce qu'il débloque. */
  openBrewery(levelUp = false): void {
    const g = this.game();
    const lv = g.breweryLevel;
    const card = this.modalCard(levelUp ? 'Ta brasserie grandit !' : 'Ta brasserie');
    card.append(h('div', 'verdict big v-top', `★ ${lv} · ${g.breweryName}`));
    const opened = DISTRIBUTORS.filter((d) => d.level === lv && d.level > 1);
    if (levelUp && opened.length) card.append(h('p', 'note', `Nouveaux clients possibles : ${opened.map((d) => d.name).join(', ')} (onglet Ventes).`));
    if (lv < MAX_LEVEL) {
      card.append(h('div', 'section-title', `Pour passer au niveau ${lv + 1} : ${BREWERY_NAMES[lv]}`), h('p', 'hint', `Tous tes appareils doivent atteindre le niveau ${lv + 1}.`));
      const list = h('div', 'brewery-list');
      for (const id of STATION_ORDER) {
        const ok = g.level(id) > lv;
        const row = h('div', `brewery-row${ok ? ' ok' : ''}`);
        row.append(img(stationCanvas(id, g.level(id)), 'pix brewery-pic'), h('span', '', STATIONS[id].step), h('span', 'brewery-state', ok ? '✓' : `niv. ${g.level(id)}`));
        row.onclick = () => {
          this.closeModal();
          this.open({ kind: 'station', id });
        };
        list.append(row);
      }
      const next = DISTRIBUTORS.filter((d) => d.level === lv + 1);
      card.append(list);
      if (next.length) card.append(h('p', 'hint', `Ce niveau ouvrira : ${next.map((d) => d.name).join(', ')}.`));
    } else card.append(h('p', 'note', 'Niveau maximal : ta brasserie est un laboratoire du futur !'));
    card.append(this.btn('btn primary', 'Fermer', () => this.closeModal()));
  }

  private openOptions(): void {
    const g = this.game();
    const card = this.modalCard('Options');
    card.append(h('div', 'stats-line', `${g.batchesDone} brassins · ${g.totalSold} bouteilles vendues · ${moneyInt(g.totalRevenue)}`));
    const fresh = this.btn('btn bad', 'Nouvelle partie', () => {
      if (fresh.dataset.confirm) {
        this.closeModal();
        this.cb.newGame();
        return;
      }
      fresh.dataset.confirm = '1';
      fresh.textContent = 'Sûr ? Ta brasserie sera effacée. Toucher pour confirmer';
    });
    // Accélération du temps : réservée aux tests (elle fausserait l'équilibrage du jeu).
    const speed = h('div', 'card');
    const chips = h('div', 'chips');
    for (const v of [1, 2, 4, 10]) {
      const c = this.btn(`chip${this.cb.getSpeed() === v ? ' active' : ''}`, `×${v}`, () => {
        this.cb.setSpeed(v);
        chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
      });
      chips.append(c);
    }
    speed.append(h('div', 'section-title', 'Mode test : vitesse du temps'), h('p', 'hint', 'Pour essayer le jeu plus vite. En partie normale, laisse ×1.'), chips);
    card.append(speed, fresh, this.btn('btn', 'Fermer', () => this.closeModal()));
  }

  private modalCard(title: string): HTMLElement {
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const card = h('div', 'modal-card');
    const head = h('div', 'sheet-head');
    head.append(h('strong', '', title), this.btn('icon-btn small', '✕', () => this.closeModal()));
    card.append(head);
    this.modal.append(card);
    return card;
  }

  private closeModal(): void {
    this.modal.classList.add('hidden');
    this.modal.replaceChildren();
  }

  get modalOpen(): boolean {
    return !this.modal.classList.contains('hidden');
  }

  // ------------------------------------------------------------------ Gaston

  private renderMentor(): void {
    const g = this.game();
    const tips: Record<number, { text: string; action?: string }> = {
      0: { text: 'Salut, moi c\'est Gaston ! Voici ta brasserie : le malt entre en haut, la bière sort en bas, en bouteilles. J\'ai déjà réglé les machines avec ma recette de blonde.', action: 'Continuer' },
      1: { text: 'Touche une machine pour voir ses réglages et ses améliorations.' },
      2: { text: 'Quand tu es prêt, appuie sur « Brasser » en bas pour lancer ton premier brassin.' },
      3: { text: 'Ton brassin descend de machine en machine. Pour ce premier, je donne un coup de main : ça ira vite ! Dès que la première bouteille sort, on la goûte.' },
      4: { text: 'Ta bière est dans ta gamme et le bar du coin l\'achète. Active le brassage continu (bouton Brasser) : ta brasserie tournera même quand tu fermes l\'appli. Reviens régulièrement améliorer ta verrerie et signer des contrats !', action: 'Compris' },
    };
    const tip = this.modalOpen || this.openSheet?.kind === 'brew' ? undefined : tips[g.tips];
    this.mentor.classList.toggle('hidden', !tip);
    if (!tip) return;
    const key = `${g.tips}`;
    if (key === this.mentorKey) return;
    this.mentorKey = key;
    const body = this.mentor.querySelector('.mentor-body')!;
    body.replaceChildren(h('strong', 'mentor-name', 'Gaston'), h('p', 'mentor-text', tip.text));
    if (tip.action) body.append(this.btn('btn primary small', tip.action, () => {
      g.tips++;
      this.mentorKey = '';
      this.renderMentor();
    }));
  }

  // ------------------------------------------------------------------ notifications

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = h('div', `toast ${kind}`, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3000);
  }
}
