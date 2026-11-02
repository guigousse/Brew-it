import { DRINKABLE_MIN, verdictOf, type Tasting } from '../core/brewing/model';
import { STRAINS, type StrainId } from '../core/brewing/strains';
import { type Beer, type Game } from '../core/game';
import { DISTRIBUTORS, bottlePrice } from '../core/market';
import { CAPACITY, PRECISION, STATION_ORDER, STATIONS, type StationId } from '../core/stations';
import { SCENE_H, SCENE_W, Scene } from '../render/scene';
import { stationCanvas } from '../render/sprites';
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
  private speedBtn = h('button', 'map-btn');
  private bottom = h('nav', 'bottombar');
  private brewBtn = h('button', 'brew-btn');
  private rangeBtn = h('button', 'side-btn');
  private salesBtn = h('button', 'side-btn');
  private sheet = h('section', 'sheet hidden');
  private modal = h('div', 'modal hidden');
  private mentor = h('div', 'mentor hidden');
  private toasts = h('div', 'toasts');
  private openSheet: { kind: 'station'; id: StationId } | { kind: 'brew' | 'range' | 'sales' } | null = null;
  private sheetKey = '';
  private mentorKey = '';
  private scale = 2;

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
    this.speedBtn.onclick = () => this.cb.setSpeed(({ 1: 2, 2: 4, 4: 1 } as Record<number, number>)[this.cb.getSpeed()] ?? 1);
    this.sceneWrap.append(this.speedBtn);
    this.stage.append(this.sceneWrap);

    // barre du bas
    this.rangeBtn.onclick = () => this.open({ kind: 'range' });
    this.salesBtn.onclick = () => this.open({ kind: 'sales' });
    this.brewBtn.onclick = () => this.open({ kind: 'brew' });
    this.bottom.append(this.rangeBtn, this.brewBtn, this.salesBtn);

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
      o.text.textContent = batch ? (batch.waiting ? `${STATIONS[id].step} ⏸` : `${STATIONS[id].step} · ${Math.round(pct * 100)} %`) : STATIONS[id].step;
      (o.bar.firstElementChild as HTMLElement).style.width = `${pct * 100}%`;
    }
  }

  /** Rafraîchissement de l'interface DOM (≈ 4 Hz). */
  update(): void {
    const g = this.game();
    this.moneyEl.textContent = moneyInt(g.money);
    this.speedBtn.textContent = `⏩ ×${this.cb.getSpeed()}`;
    const can = g.canBrew();
    this.brewBtn.replaceChildren(h('span', 'brew-title', 'Brasser'), h('span', 'brew-sub', can.ok ? `${g.batchLiters} L · ${moneyInt(g.brewCost())}` : g.batchAt('mill') ? 'Moulin occupé' : 'Fonds insuffisants'));
    this.brewBtn.classList.toggle('ready', can.ok);
    const stock = g.beers.reduce((s, b) => s + b.stock, 0);
    this.rangeBtn.replaceChildren(h('span', 'side-title', 'Ma gamme'), h('span', 'side-sub', g.pending.length ? '🍺 À goûter !' : `${g.beers.length}/${g.rangeSlots} · ${stock} btl`));
    this.rangeBtn.classList.toggle('alert', g.pending.length > 0);
    const available = DISTRIBUTORS.some((d) => !g.signed.includes(d.id) && g.totalSold >= d.unlockSold);
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
    const key = JSON.stringify([s, g.level(s.kind === 'station' ? s.id : 'mill'), g.beers.map((b) => [b.id, b.stock, b.name]), g.pending.length, g.signed, g.selectedBeer, g.autoBrew, Math.floor(g.totalSold / 10), g.batchLiters, s.kind === 'brew' ? g.canBrew().ok : 0]);
    if (key === this.sheetKey) return this.refreshLive();
    this.sheetKey = key;
    const scroll = this.sheet.querySelector('.sheet-body')?.scrollTop ?? 0;
    this.sheet.replaceChildren();
    if (s.kind === 'station') this.stationSheet(g, s.id);
    if (s.kind === 'brew') this.brewSheet(g);
    if (s.kind === 'range') this.rangeSheet(g);
    if (s.kind === 'sales') this.salesSheet(g);
    const body = this.sheet.querySelector('.sheet-body');
    if (body) body.scrollTop = scroll;
  }

  /** Met à jour sans reconstruire ce qui dépend de l'argent. */
  private refreshLive(): void {
    const g = this.game();
    this.sheet.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach((b) => (b.disabled = g.money < Number(b.dataset.cost) || b.dataset.blocked === '1'));
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
    body.append(h('div', 'step-tag', `${def.step} · niveau ${lv}/3`), h('p', 'hint', def.description));
    const batch = g.batchAt(id);
    if (batch) body.append(h('p', 'note', `Un brassin est en cours ici. Tes réglages s'appliqueront au prochain brassin.`));
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
    const levels = h('div', 'levels');
    for (let i = 1; i <= 3; i++) {
      const cell = h('div', `level${i === lv ? ' current' : i < lv ? ' done' : ''}`);
      cell.append(img(stationCanvas(id, i), 'pix level-pic'), h('div', 'level-name', def.names[i - 1]!), h('div', 'level-perk', def.perks[i - 1]!));
      levels.append(cell);
    }
    up.append(levels);
    up.append(h('div', 'hint', `Volume ${CAPACITY[lv]} L · précision ± ${String(PRECISION[lv]).replace('.', ',')} °C`));
    if (lv < 3) {
      const cost = def.upgradeCost[lv - 1]!;
      const b = this.btn('btn primary', `Passer au niveau ${lv + 1} : ${def.names[lv]} · ${moneyInt(cost)}`, () => {
        const r = g.upgrade(id);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        this.toast(`${def.names[lv]} installé !`, 'good');
        this.sheetKey = '';
      });
      b.dataset.cost = String(cost);
      if (batch) {
        b.dataset.blocked = '1';
        up.append(h('p', 'hint', 'Attends que l\'appareil soit vide pour l\'améliorer.'));
      }
      b.disabled = g.money < cost || !!batch;
      up.append(b);
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
    const go = this.btn('btn primary big', can.ok ? 'Lancer le brassin' : can.reason!, () => {
      const r = g.brew();
      if (!r.ok) return this.toast(r.reason!, 'bad');
      if (g.tips === 2 || g.tips === 1) g.tips = 3;
      this.toast('Brassin lancé : suis-le descendre !', 'good');
      this.close();
    });
    go.disabled = !can.ok;
    body.append(go);
    if (beer) {
      const auto = h('label', 'toggle');
      const box = h('input');
      box.type = 'checkbox';
      box.checked = g.autoBrew;
      box.onchange = () => {
        g.autoBrew = box.checked;
        this.toast(box.checked ? 'Brassage automatique activé' : 'Brassage automatique arrêté', 'info');
      };
      auto.append(box, h('span', '', `Brasser « ${beer.name} » en continu`));
      body.append(auto, h('p', 'hint', 'Un nouveau brassin démarre dès que le moulin est libre, tant que tu as de quoi payer les ingrédients. Ça continue même quand l\'appli est fermée.'));
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

  // --- Ma gamme
  private rangeSheet(g: Game): void {
    const body = this.frameSheet(`Ma gamme · ${g.beers.length}/${g.rangeSlots}`);
    if (g.pending.length) {
      const banner = h('div', 'card banner');
      banner.append(h('div', 'beer-name', `${g.pending.length} essai${g.pending.length > 1 ? 's' : ''} à goûter`), this.btn('btn primary', 'Goûter', () => this.openTasting()));
      body.append(banner);
    }
    if (!g.beers.length) body.append(h('p', 'hint', 'Ta gamme est vide. Brasse un essai réussi pour y ajouter ta première bière.'));
    for (const b of g.beers) body.append(this.beerCard(g, b));
    if (g.beers.length >= g.rangeSlots) body.append(h('p', 'hint', 'Signe de nouveaux distributeurs (onglet Ventes) pour agrandir ta gamme.'));
  }

  private beerCard(g: Game, b: Beer): HTMLElement {
    const t = b.tasting;
    const v = verdictOf(t.quality);
    const card = h('div', `card beer${b.id === g.selectedBeer ? ' selected' : ''}`);
    const head = h('div', 'beer-head');
    head.append(h('span', 'beer-name', b.name), h('span', `verdict ${VERDICT_CLASS[v]}`, v));
    card.append(head, h('div', 'stats-line', `${t.style} · ${t.abv.toFixed(1)} % · ${Math.round(t.ibu)} IBU · ${t.color}`), h('div', 'stats-line strong', `Stock : ${b.stock} bouteilles · vendues : ${b.sold} · ${moneyInt(b.revenue)}`));
    const actions = h('div', 'row');
    actions.append(this.btn('btn small', b.id === g.selectedBeer ? 'Réglages chargés' : 'Charger ses réglages', () => {
      g.loadBeer(b.id);
      this.sheetKey = '';
    }));
    actions.append(this.btn('btn small', 'Fiche', () => this.openTastingView(b.name, t)));
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
    body.append(h('div', 'stats-line strong', `${g.totalSold} bouteilles vendues · ${moneyInt(g.totalRevenue)} de chiffre d'affaires`));
    for (const d of DISTRIBUTORS) {
      const signed = g.signed.includes(d.id);
      const unlocked = g.totalSold >= d.unlockSold;
      const card = h('div', `card distributor${signed ? ' signed' : unlocked ? ' available' : ' locked'}`);
      const head = h('div', 'beer-head');
      head.append(h('span', 'beer-name', d.name), h('span', `verdict ${signed ? 'v-good' : unlocked ? 'v-top' : 'v-meh'}`, signed ? 'Sous contrat' : unlocked ? 'Disponible' : '🔒'));
      card.append(head, h('p', 'hint', d.description));
      card.append(h('div', 'stats-line', `${d.rate} bouteilles/min · ${money(d.price * 0.6)}–${money(d.price * 1.4)} la bouteille · qualité min. ${verdictOf(d.minQuality)}`));
      if (d.likes) card.append(h('div', 'note', `Aime : ${d.likes.label} (+30 %)`));
      if (signed) {
        const best = g.beers.filter((b) => b.tasting.quality >= d.minQuality);
        card.append(h('div', 'hint', best.length ? `Achète : ${best.map((b) => `${b.name} (${money(bottlePrice(d, b.tasting))})`).join(', ')}` : 'Aucune bière de ta gamme ne lui convient.'));
      } else if (unlocked) {
        const b = this.btn('btn primary', `Signer le contrat · ${moneyInt(d.fee)}`, () => {
          const r = g.sign(d.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`Contrat signé avec ${d.name} ! Une place de plus dans ta gamme.`, 'good');
          this.sheetKey = '';
        });
        b.dataset.cost = String(d.fee);
        b.disabled = g.money < d.fee;
        card.append(b);
      } else {
        const bar = h('div', 'progress');
        const fill = h('div', 'progress-fill');
        fill.style.width = `${Math.min(100, (g.totalSold / d.unlockSold) * 100)}%`;
        bar.append(fill);
        card.append(h('div', 'hint', `Vends ${d.unlockSold} bouteilles pour le débloquer (${g.totalSold}/${d.unlockSold})`), bar);
      }
      body.append(card);
    }
  }

  // ------------------------------------------------------------------ fenêtres

  /** Dégustation de l'essai le plus ancien en attente. */
  openTasting(): void {
    const g = this.game();
    const p = g.pending[0];
    if (!p) return;
    const t = p.tasting;
    const card = this.modalCard('Dégustation');
    this.tastingBody(card, t);
    card.append(h('div', 'stats-line', `${p.bottles} bouteilles`));
    const ok = t.quality >= DRINKABLE_MIN;
    const full = g.beers.length >= g.rangeSlots;
    if (ok && !full) {
      const input = h('input', 'name-input');
      input.maxLength = 28;
      input.placeholder = 'Nom de ta bière';
      input.value = g.beers.length ? '' : 'Blonde de Gaston';
      card.append(h('div', 'section-title', 'Ajouter à ma gamme'), input, this.btn('btn primary big', 'Ajouter à ma gamme', () => {
        const r = g.addToRange(input.value);
        if (!r.ok) return this.toast(r.reason!, 'bad');
        if (g.tips <= 4) g.tips = 4;
        this.closeModal();
        this.toast('Ajoutée à ta gamme : le bar commence à l\'acheter !', 'good');
        this.sheetKey = '';
        if (g.pending.length) this.openTasting();
      }));
    } else card.append(h('p', 'note bad', ok ? 'Ta gamme est pleine : retire une bière ou signe un distributeur pour faire de la place.' : 'Imbuvable : impossible à vendre. Ajuste les réglages et retente.'));
    card.append(this.btn('btn bad', 'Jeter ce brassin', () => {
      g.discardPending();
      this.closeModal();
      this.sheetKey = '';
      if (g.pending.length) this.openTasting();
    }));
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
    card.append(fresh, this.btn('btn', 'Fermer', () => this.closeModal()));
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
      3: { text: 'Ton brassin descend de machine en machine. Tu peux accélérer le temps avec ⏩. À la fin, on goûtera !' },
      4: { text: 'Ta bière est dans ta gamme et le bar du coin l\'achète. Relance des brassins (ou active le brassage continu), puis améliore tes machines pour brasser plus et mieux !', action: 'Compris' },
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
