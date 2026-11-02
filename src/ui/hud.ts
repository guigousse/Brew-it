import { Alert, type Building } from '../core/building';
import { predict, styleLabel, DEFAULT_CHOICES, type Recipe, type RecipeChoices } from '../core/brewing/recipe';
import { BUILDINGS, kindOf, type BuildingDef, type BuildingType, type Category } from '../core/content/buildings';
import { EXPANSIONS } from '../core/content/expansions';
import { ITEMS, type ItemId } from '../core/content/items';
import { RECIPE_CHOICES } from '../core/content/params';
import { unlockText } from '../core/content/progression';
import { STRAINS } from '../core/content/strains';
import { SUPPLIES } from '../core/content/supplies';
import { describe } from '../core/describe';
import type { GameEvent } from '../core/events';
import { needOf } from '../core/ingredients';
import { REFUND_RATIO, type World } from '../core/world';
import { TUTORIAL_STEPS } from '../core/tutorial/steps';
import { currentStep, skipTutorial, stepText, tutorialPalette } from '../core/tutorial/tutorial';
import { itemCanvas, spriteCanvas } from '../render/sprites';
import { drawGaston } from './gaston';
import type { InputController, Tool } from './input';

type Tab = 'shop' | 'supplier' | 'brews';

const SHOP_CATEGORIES: { id: Category | 'local'; label: string }[] = [
  { id: 'brewing', label: 'Brassage' },
  { id: 'transport', label: 'Liaisons' },
  { id: 'supply', label: 'Eau' },
  { id: 'sales', label: 'Vente' },
  { id: 'local', label: 'Local' },
];

const ALERT_LABELS: [number, string][] = [
  [Alert.Broken, 'En panne : touche « Réparer »'],
  [Alert.BatchLost, 'Lot perdu'],
  [Alert.Overpressure, 'Surpression !'],
  [Alert.OutputBlocked, 'Sortie bloquée : rien n\'est branché pour récupérer ce qui sort'],
  [Alert.MixedFluids, 'Deux liquides différents se rencontrent'],
  [Alert.NoMoney, 'Plus assez d\'argent'],
];

const money = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 2 : 0 })} €`;
const moneyInt = (v: number) => `${Math.floor(v).toLocaleString('fr-FR')} €`;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

/** Copie un canvas de sprite dans une image DOM (agrandie au pixel près par le CSS). */
function pixelImg(canvas: HTMLCanvasElement | null, cls = 'pix'): HTMLElement {
  const img = h('img', cls);
  if (canvas) {
    img.src = canvas.toDataURL();
    img.width = canvas.width;
    img.height = canvas.height;
    img.style.setProperty('--w', String(canvas.width));
    img.style.setProperty('--h', String(canvas.height));
  }
  img.alt = '';
  return img;
}

const optionLabel = (key: keyof RecipeChoices, value: unknown) => RECIPE_CHOICES.find((c) => c.key === key)?.options.find((o) => o.value === value);

export function recipeSummary(r: RecipeChoices): string {
  return [
    optionLabel('grainKg', r.grainKg)?.label,
    optionLabel('mashTemp', r.mashTemp)?.label,
    `${optionLabel('hopsItems', r.hopsItems)?.label} de houblon`,
    STRAINS[r.strain].name,
    `garde ${optionLabel('gardeDays', r.gardeDays)?.label}`,
  ].join(' · ');
}

/** Caractéristiques d'un appareil pour le magasin. */
function specText(def: BuildingDef): string {
  const parts: string[] = [];
  if (def.batchScale) parts.push(`Lots de ${25 * def.batchScale} L`);
  if (def.cooler) parts.push(`${def.fluid?.maxFlow} L/s`);
  if (def.machine === 'bottler') parts.push(`${Math.round(60 / Number(def.defaultParams?.interval ?? 1))} bouteilles/min`);
  if (def.machine === 'mill') parts.push(`${Math.round(60 / Number(def.defaultParams?.interval ?? 1))} kg/min`);
  if (def.speed && def.speed !== 1 && def.machine !== 'bottler' && def.machine !== 'mill') parts.push(`Vitesse ×${def.speed}`);
  if (def.tier === 1) parts.unshift('Mini');
  if (def.tier === 2) parts.unshift('Pro');
  return parts.join(' · ');
}

export interface HudCallbacks {
  setSpeed(speed: number): void;
  getSpeed(): number;
  newGame(): void;
  layoutChanged(): void;
}

/**
 * Interface : header (nom, argent, options), carte au centre, Gaston, et en bas les onglets
 * Magasin / Fournisseur / Brassins qui ouvrent un panneau. Une barre de mode remplace le panneau
 * quand on pose, déplace ou supprime.
 */
export class Hud {
  private header = h('header', 'topbar');
  private moneyEl = h('span', 'money-value');
  private speedBtn = h('button', 'map-btn speed');
  private prodChip = h('button', 'map-btn prod-chip');
  private mentor = h('div', 'mentor hidden');
  private mentorText = h('p', 'mentor-text');
  private mentorChapter = h('div', 'mentor-chapter');
  private mentorActions = h('div', 'mentor-actions');
  private sheet = h('section', 'sheet hidden');
  private modebar = h('div', 'modebar hidden');
  private tabbar = h('nav', 'tabbar');
  private tabButtons = new Map<Tab, HTMLButtonElement>();
  private inspector = h('div', 'inspector hidden');
  private modal = h('div', 'modal hidden');
  private toasts = h('div', 'toasts');
  private openTab: Tab | null = null;
  private shopCategory: Category | 'local' = 'brewing';
  selectedId: number | null = null;
  private inspectorKey = '';
  private mentorKey = '';
  private sheetKey = '';
  private modeKey = '';

  constructor(
    private root: HTMLElement,
    private world: () => World,
    private input: InputController,
    private deleteSet: Set<number>,
    private cb: HudCallbacks,
  ) {
    // Header : nom de l'appli, argent, options
    const logo = h('div', 'logo');
    logo.append(pixelImg(spriteCanvas('kettle_mini'), 'pix logo-icon'), h('span', 'logo-text', 'Brew It'));
    const moneyPill = h('div', 'money');
    moneyPill.append(h('span', 'coin'), this.moneyEl);
    const options = h('button', 'icon-btn', '⚙');
    options.setAttribute('aria-label', 'Options');
    options.onclick = () => this.openMenu();
    this.header.append(logo, moneyPill, options);

    // Contrôles flottants sur la carte
    const mapControls = h('div', 'map-controls');
    this.speedBtn.onclick = () => this.cb.setSpeed(({ 1: 2, 2: 4, 4: 1 } as Record<number, number>)[this.cb.getSpeed()] ?? 1);
    this.prodChip.onclick = () => this.toggleTab('brews');
    mapControls.append(this.speedBtn, this.prodChip);

    // Gaston
    const avatar = h('canvas', 'mentor-avatar');
    drawGaston(avatar);
    const body = h('div', 'mentor-body');
    const head = h('div', 'mentor-head');
    head.append(h('strong', 'mentor-name', 'Gaston'), this.mentorChapter);
    body.append(head, this.mentorText, this.mentorActions);
    this.mentor.append(avatar, body);

    // Onglets du bas
    const tabs: [Tab, string, HTMLCanvasElement | null][] = [
      ['shop', 'Magasin', spriteCanvas('mash_tun_mini')],
      ['supplier', 'Fournisseur', itemCanvas('malt')],
      ['brews', 'Brassins', spriteCanvas('fermenter_mini')],
    ];
    for (const [id, label, icon] of tabs) {
      const b = h('button', 'tab');
      b.append(pixelImg(icon, 'pix tab-icon'), h('span', 'tab-label', label));
      b.onclick = () => this.toggleTab(id);
      this.tabButtons.set(id, b);
      this.tabbar.append(b);
    }

    root.append(this.header, mapControls, this.inspector, this.toasts, this.mentor, this.sheet, this.modebar, this.tabbar, this.modal);
    this.update();
  }

  // ------------------------------------------------------------------ onglets et panneaux

  toggleTab(tab: Tab): void {
    this.openTab = this.openTab === tab ? null : tab;
    if (this.openTab) {
      this.select(null);
      if (this.input.tool.kind !== 'none') this.setTool({ kind: 'none' });
    }
    this.sheetKey = '';
    this.renderSheet();
  }

  private renderSheet(): void {
    const w = this.world();
    const tab = this.openTab;
    for (const [id, b] of this.tabButtons) {
      b.classList.toggle('active', id === tab);
      const step = currentStep(w);
      b.classList.toggle('pulse', !!step && step.tab === id && tab !== id && this.input.tool.kind === 'none');
    }
    this.sheet.classList.toggle('hidden', !tab);
    if (!tab) return;
    const key = `${tab}|${this.shopCategory}|${Math.floor(w.money)}|${JSON.stringify(w.stock)}|${w.tutorial.step}|${w.unlocked.length}|${w.production.recipeId}|${w.production.running}|${w.recipes.length}|${w.expansion}`;
    if (key === this.sheetKey) return;
    this.sheetKey = key;
    const scroll = this.sheet.querySelector('.sheet-body')?.scrollTop ?? 0;
    this.sheet.replaceChildren();
    if (tab === 'shop') this.renderShop(w);
    if (tab === 'supplier') this.renderSupplier(w);
    if (tab === 'brews') this.renderBrews(w);
    const bodyEl = this.sheet.querySelector('.sheet-body');
    if (bodyEl) bodyEl.scrollTop = scroll;
  }

  private sheetFrame(title: string): HTMLElement {
    const head = h('div', 'sheet-head');
    head.append(h('strong', '', title), this.button('icon-btn small', '✕', () => this.toggleTab(this.openTab!)));
    const body = h('div', 'sheet-body');
    this.sheet.append(head, body);
    return body;
  }

  // --- Magasin
  private renderShop(w: World): void {
    const body = this.sheetFrame('Magasin');
    const inTutorial = !w.tutorial.done;
    const tutorialTypes = tutorialPalette(w);
    if (!inTutorial) {
      const chips = h('div', 'chips');
      for (const c of SHOP_CATEGORIES) {
        chips.append(this.button(`chip${c.id === this.shopCategory ? ' active' : ''}`, c.label, () => {
          this.shopCategory = c.id;
          this.sheetKey = '';
          this.renderSheet();
        }));
      }
      body.append(chips);
    }
    const grid = h('div', 'shop-grid');
    if (!inTutorial && this.shopCategory === 'local') {
      const next = EXPANSIONS[w.expansion + 1];
      const card = h('div', 'card');
      card.append(h('div', 'card-title', next ? `Agrandir : ${next.name}` : 'Local au maximum'), h('div', 'card-spec', next ? `${next.width} × ${next.height} cases` : ''));
      if (next) {
        const buy = this.button('btn primary', moneyInt(next.cost), () => {
          const r = w.expand();
          if (!r.ok) this.toast(r.reason!, 'bad');
        });
        buy.disabled = w.money < next.cost;
        card.append(buy);
      }
      const del = h('div', 'card');
      del.append(h('div', 'card-title', 'Supprimer des éléments'), h('div', 'card-spec', `Remboursés à ${Math.round(REFUND_RATIO * 100)} %`), this.button('btn bad', 'Choisir', () => {
        this.openTab = null;
        this.setTool({ kind: 'delete' });
      }));
      grid.append(card, del);
      body.append(grid, h('p', 'hint', 'Pour déplacer un appareil, touche-le sur la carte puis « Déplacer ».'));
      return;
    }
    const types = (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => {
      const d = BUILDINGS[t] as BuildingDef;
      if (d.hidden) return false;
      return inTutorial ? tutorialTypes.includes(t) : d.category === this.shopCategory;
    });
    if (inTutorial && !types.length) body.append(h('p', 'hint', 'Écoute Gaston : rien à acheter pour l\'instant.'));
    for (const t of types) {
      const d = BUILDINGS[t] as BuildingDef;
      const locked = !inTutorial && !w.unlocked.includes(t);
      const card = h('button', `card shop-item${locked ? ' locked' : ''}${inTutorial ? ' pulse' : ''}`);
      const pic = h('div', 'card-pic');
      pic.append(pixelImg(spriteCanvas(t, true)));
      card.append(pic, h('div', 'card-title', d.name), h('div', 'card-spec', locked ? unlockText(d.unlock!) : specText(d) || d.description));
      card.append(h('div', `price${!locked && !inTutorial && w.money < d.cost ? ' short' : ''}`, locked ? '🔒' : inTutorial ? 'Offert' : moneyInt(d.cost)));
      card.disabled = locked;
      card.onclick = () => {
        this.openTab = null;
        this.setTool({ kind: 'build', type: t });
      };
      grid.append(card);
    }
    body.append(grid);
  }

  // --- Fournisseur
  private renderSupplier(w: World): void {
    const body = this.sheetFrame('Fournisseur');
    body.append(h('p', 'hint', 'Les ingrédients achetés vont dans ton stock. Touche ensuite le « + » d\'une machine pour la charger.'));
    const step = currentStep(w);
    for (const s of SUPPLIES) {
      const row = h('div', 'supply');
      const info = h('div', 'supply-info');
      const title = h('div', 'card-title');
      title.append(pixelImg(itemCanvas(s.item), 'pix item-icon'), document.createTextNode(` ${s.name}`));
      info.append(title, h('div', 'card-spec', s.description), h('div', 'stock', `En stock : ${w.stock[s.item] ?? 0} ${s.unit}`));
      const packs = h('div', 'packs');
      const highlight = !!step && ((step.signal === `stock:${s.item}`) || (step.id === 'load_rest' && !w.tutorial.signals.includes(`load:${s.item}`) && !(w.stock[s.item] ?? 0)));
      for (const p of s.packs) {
        const b = this.button(`btn pack${highlight && p === s.packs[0] ? ' pulse' : ''}`, '', () => {
          const r = w.buyPack(p.id);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.toast(`${p.label} ${s.name.toLowerCase()} : en stock`, 'good');
          this.sheetKey = '';
          this.renderSheet();
        });
        b.append(h('span', 'pack-label', p.label), h('span', 'pack-price', money(p.price)));
        b.disabled = w.money < p.price;
        packs.append(b);
      }
      row.append(info, packs);
      body.append(row);
    }
  }

  // --- Brassins
  private renderBrews(w: World): void {
    const body = this.sheetFrame('Brassins');
    const active = w.activeRecipe;
    const status = h('div', 'beer-sheet');
    if (active) {
      const p = predict(active);
      status.append(
        h('div', 'beer-style', `${w.production.running ? '▶ En production' : '⏸ En pause'} : ${active.name}`),
        h('div', 'beer-stats', `≈ ${p.abv.toFixed(1)} % · ${Math.round(p.ibu)} IBU · ${styleLabel(p)}`),
        h('div', 'card-spec', recipeSummary(active)),
      );
    } else status.append(h('div', 'beer-style', 'Aucun brassin pour l\'instant'));
    body.append(status);
    if (!active && !w.tutorial.done) {
      body.append(h('p', 'hint', 'Gaston te dira quand composer ton premier brassin.'));
      return;
    }
    if (active) {
      body.append(this.button(`btn ${w.production.running ? '' : 'primary'}`, w.production.running ? '⏸ Mettre la production en pause' : '▶ Reprendre la production', () => {
        w.setProduction(!w.production.running);
        this.sheetKey = '';
        this.renderSheet();
      }));
      if (w.production.running) body.append(h('p', 'hint', 'Pour changer de bière, mets la production en pause : les lots en cours se terminent.'));
    }
    const paused = !w.production.running || !active;
    if (w.recipes.length) {
      body.append(h('div', 'section-title', 'Mes brassins'));
      const list = h('div', 'recipe-list');
      for (const r of [...w.recipes].reverse()) list.append(this.recipeRow(w, r, paused));
      body.append(list);
    }
    if (paused && w.tutorial.done) body.append(this.button('btn primary', '＋ Nouveau brassin', () => this.openWizard(active ?? DEFAULT_CHOICES)));
  }

  private recipeRow(w: World, r: Recipe, selectable: boolean): HTMLElement {
    const isActive = w.production.recipeId === r.id;
    const row = h('button', `recipe-row${isActive ? ' active' : ''}`);
    row.disabled = !selectable && !isActive;
    row.append(h('span', 'option-label', `${r.name}${isActive ? ' (actif)' : ''}`), h('span', 'card-spec', recipeSummary(r)));
    row.onclick = () => {
      if (isActive || !selectable) return;
      const res = w.selectRecipe(r.id);
      if (!res.ok) return this.toast(res.reason!, 'bad');
      w.setProduction(true);
      this.toast(`Production relancée : « ${r.name} »`, 'good');
      this.sheetKey = '';
      this.renderSheet();
    };
    return row;
  }

  // ------------------------------------------------------------------ barre de mode (poser / déplacer / supprimer)

  private renderModebar(w: World): void {
    const tool = this.input.tool;
    const visible = tool.kind !== 'none';
    this.modebar.classList.toggle('hidden', !visible);
    if (!visible) return;
    const key = `${JSON.stringify(tool)}|${this.deleteSet.size}|${Math.floor(w.money)}`;
    if (key === this.modeKey) return;
    this.modeKey = key;
    this.modebar.replaceChildren();
    const text = h('div', 'mode-text');
    const actions = h('div', 'mode-actions');
    if (tool.kind === 'build') {
      const d = BUILDINGS[tool.type] as BuildingDef;
      text.append(pixelImg(spriteCanvas(tool.type, true), 'pix mode-icon'), h('span', '', `${d.name} : ${d.rotatable && d.size === 1 ? 'glisse ton doigt pour tracer' : 'touche un emplacement'}${w.tutorial.done ? ` · ${moneyInt(d.cost)}` : ''}`));
      actions.append(this.button('btn', 'Terminé', () => this.setTool({ kind: 'none' })));
    } else if (tool.kind === 'move') {
      const b = w.buildings.get(tool.id);
      text.append(h('span', '', `Déplacer ${b ? BUILDINGS[b.type].name.toLowerCase() : ''} : touche le nouvel emplacement.`));
      actions.append(this.button('btn', 'Annuler', () => this.setTool({ kind: 'none' })));
    } else if (tool.kind === 'delete') {
      const n = this.deleteSet.size;
      const refund = [...this.deleteSet].reduce((s, id) => {
        const b = w.buildings.get(id);
        return s + (b ? Math.floor(BUILDINGS[b.type].cost * REFUND_RATIO) : 0);
      }, 0);
      text.append(h('span', '', n ? `${n} élément${n > 1 ? 's' : ''} en rouge · +${moneyInt(refund)} remboursés` : 'Touche les éléments à supprimer : ils passent en rouge.'));
      const confirm = this.button('btn bad', `Confirmer${n ? ` (${n})` : ''}`, () => {
        for (const id of [...this.deleteSet]) w.remove(id);
        this.deleteSet.clear();
        this.setTool({ kind: 'none' });
        if (n) this.toast(`${n} élément${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}`, 'info');
      });
      confirm.disabled = n === 0;
      actions.append(confirm, this.button('btn', 'Annuler', () => this.setTool({ kind: 'none' })));
    }
    this.modebar.append(text, actions);
  }

  setTool(tool: Tool): void {
    this.input.setTool(tool);
    if (tool.kind !== 'none') {
      this.select(null);
      this.openTab = null;
      this.renderSheet();
    }
    this.modeKey = '';
    this.renderModebar(this.world());
    this.cb.layoutChanged();
  }

  deleteSelectionChanged(): void {
    this.modeKey = '';
    this.renderModebar(this.world());
  }

  private button(cls: string, text: string, onclick: () => void): HTMLButtonElement {
    const b = h('button', cls, text);
    b.onclick = onclick;
    return b;
  }

  // ------------------------------------------------------------------ fiche d'un appareil

  select(id: number | null): void {
    this.selectedId = id;
    this.inspectorKey = '';
    if (id != null && this.openTab) {
      this.openTab = null;
      this.renderSheet();
    }
  }

  /** Icône « + » ou bouton « Charger » : depuis le stock, complément acheté si besoin. */
  load(id: number): void {
    const r = this.world().loadMissing(id);
    if (!r.ok) return this.toast(r.reason!, 'bad');
    const item = ITEMS[r.item as ItemId];
    const paid = r.cost! > 0 ? ` (−${money(r.cost!)})` : ' (depuis le stock)';
    this.toast(`+${r.qty} ${item.name.toLowerCase()}${paid}`, 'good');
  }

  private updateInspector(w: World): void {
    const b = this.selectedId != null ? w.buildings.get(this.selectedId) : undefined;
    this.inspector.classList.toggle('hidden', !b);
    if (!b) return;
    const def = BUILDINGS[b.type] as BuildingDef;
    const key = `${b.id}|${w.tutorial.done}|${w.production.recipeId}`;
    if (this.inspectorKey !== key) {
      this.inspectorKey = key;
      this.inspector.replaceChildren();
      const head = h('div', 'insp-head');
      const title = h('div', 'insp-title');
      title.append(pixelImg(spriteCanvas(b.type, true), 'pix insp-icon'), h('strong', '', def.name));
      head.append(title, this.button('icon-btn small', '✕', () => this.select(null)));
      const spec = specText(def);
      this.inspector.append(head, h('p', 'insp-desc', def.description + (spec ? ` (${spec})` : '')), h('div', 'insp-status'), h('div', 'insp-load'));
      const recipe = w.activeRecipe;
      if (['mill', 'mash_tun', 'kettle', 'fermenter'].includes(kindOf(b.type) ?? '')) {
        const box = h('div', 'insp-recipe');
        box.append(h('div', 'section-title', recipe ? `Brassin : ${recipe.name}` : 'Aucun brassin'), h('div', 'card-spec', recipe ? recipeSummary(recipe) : 'Compose ton brassin dans l\'onglet Brassins.'));
        this.inspector.append(box);
      }
      const actions = h('div', 'insp-actions');
      if (w.tutorial.done) {
        actions.append(this.button('btn small', 'Déplacer', () => this.setTool({ kind: 'move', id: b.id })));
        if (def.rotatable) actions.append(this.button('btn small', 'Pivoter', () => w.rotate(b.id)));
      }
      if (b.health < def.maxHealth) {
        actions.append(this.button('btn small', 'Réparer', () => {
          const r = w.repair(b.id);
          if (!r.ok) this.toast(r.reason!, 'bad');
        }));
      }
      if (w.tutorial.done) {
        actions.append(this.button('btn small bad', 'Supprimer', () => {
          this.setTool({ kind: 'delete' });
          this.deleteSet.add(b.id);
          this.deleteSelectionChanged();
        }));
      }
      if (actions.childElementCount) this.inspector.append(actions);
    }
    const info = describe(w, b);
    const rows: HTMLElement[] = [h('div', 'line', info.status)];
    if (info.progress != null) {
      const bar = h('div', 'progress');
      const fill = h('div', 'progress-fill');
      fill.style.width = `${Math.round(info.progress * 100)}%`;
      bar.append(fill);
      rows.push(bar);
    }
    if (info.needs.length && b.machine && ['idle', 'filling'].includes(b.machine.phase)) {
      const needs = h('div', 'needs');
      for (const n of info.needs) {
        const ok = n.have >= n.want;
        needs.append(h('span', `need${ok ? ' ok' : ''}`, `${ok ? '✓' : '…'} ${n.label} ${Math.min(n.have, n.want)}/${n.want}${n.unit ? ` ${n.unit}` : ''}`));
      }
      rows.push(needs);
    }
    for (const [flag, label] of ALERT_LABELS) if (b.alerts & flag) rows.push(h('div', 'line alert', `⚠ ${label}`));
    this.inspector.querySelector('.insp-status')!.replaceChildren(...rows);
    const need = needOf(w, b);
    const box = this.inspector.querySelector('.insp-load') as HTMLElement;
    const loadKey = need ? `${need.item}|${need.missing}|${w.stock[need.item] ?? 0}` : '';
    if (box.dataset.key !== loadKey) {
      box.dataset.key = loadKey;
      box.replaceChildren();
      if (need) {
        const item = ITEMS[need.item];
        const inStock = Math.min(w.stock[need.item] ?? 0, need.missing);
        const extra = (need.missing - inStock) * need.unitPrice;
        const label = `＋ Charger ${need.missing} × ${item.name.toLowerCase()}${extra > 0 ? ` · ${money(extra)}` : ' (stock)'}`;
        box.append(this.button('btn primary load', label, () => this.load(b.id)));
      }
    }
  }

  // ------------------------------------------------------------------ Gaston

  private updateMentor(w: World): void {
    const step = currentStep(w);
    const visible = !!step;
    if (this.mentor.classList.contains('hidden') === visible) {
      this.mentor.classList.toggle('hidden', !visible);
      this.cb.layoutChanged();
    }
    if (!step) return;
    this.mentorText.textContent = stepText(w, step);
    const key = `${w.tutorial.step}|${this.cb.getSpeed()}`;
    if (key === this.mentorKey) return;
    this.mentorKey = key;
    this.mentorChapter.textContent = `${step.chapter} · ${w.tutorial.step + 1}/${TUTORIAL_STEPS.length}`;
    this.mentorActions.replaceChildren();
    if (step.ack) this.mentorActions.append(this.button('btn primary', step.id === 'finale' ? 'Lancer ma brasserie !' : 'Continuer', () => w.signal(`ack:${step.id}`)));
    if (step.action === 'recipe') this.mentorActions.append(this.button('btn primary pulse', 'Composer mon brassin', () => this.openWizard()));
    if (step.fastForward) {
      const fast = this.cb.getSpeed() > 1;
      this.mentorActions.append(this.button(`btn${fast ? ' active' : ''}`, fast ? `⏩ Vitesse ×${this.cb.getSpeed()}` : '⏩ Accélérer le temps', () => this.cb.setSpeed(fast ? 1 : 4)));
    }
  }

  // ------------------------------------------------------------------ assistant de brassin

  openWizard(base: RecipeChoices = DEFAULT_CHOICES): void {
    const choices: RecipeChoices = { ...base };
    let index = 0;
    const total = RECIPE_CHOICES.length + 1;
    const render = () => {
      this.modal.replaceChildren();
      this.modal.classList.remove('hidden');
      const card = h('div', 'modal-card wizard');
      const head = h('div', 'sheet-head');
      head.append(h('strong', '', 'Nouveau brassin'), h('span', 'mentor-chapter', `${Math.min(index + 1, total)}/${total}`), this.button('icon-btn small', '✕', () => this.closeModal()));
      const dots = h('div', 'dots');
      for (let i = 0; i < total; i++) dots.append(h('span', `dot${i <= index ? ' on' : ''}`));
      card.append(head, dots);
      if (index < RECIPE_CHOICES.length) {
        const meta = RECIPE_CHOICES[index]!;
        card.append(h('div', 'wizard-step', meta.step), h('div', 'wizard-title', meta.label), h('p', 'wizard-why', meta.why));
        const row = h('div', 'choice-options');
        for (const o of meta.options) {
          const btn = h('button', `option${choices[meta.key] === o.value ? ' active' : ''}`);
          btn.append(h('span', 'option-label', o.label), h('span', 'option-hint', o.hint));
          btn.onclick = () => {
            (choices as Record<string, unknown>)[meta.key] = o.value;
            index++;
            render();
          };
          row.append(btn);
        }
        card.append(row);
      } else {
        const p = predict(choices);
        card.append(h('div', 'wizard-step', 'Dernière étape'), h('div', 'wizard-title', 'Donne un nom à ta bière'));
        const input = h('input', 'name-input');
        input.maxLength = 32;
        input.placeholder = 'Ex. : Blonde du garage';
        input.value = this.world().recipes.length ? '' : 'Blonde du garage';
        const sheet = h('div', 'beer-sheet');
        sheet.append(
          h('div', 'beer-style', styleLabel(p)),
          h('div', 'beer-stats', `≈ ${p.abv.toFixed(1)} % alcool · ${Math.round(p.ibu)} IBU · ${Math.round(p.liters / 0.33)} bouteilles par brassin`),
          h('div', 'card-spec', recipeSummary(choices)),
        );
        const launch = this.button('btn primary big', 'Sauvegarder et lancer la production', () => {
          const w = this.world();
          const r = w.createRecipe(input.value, choices);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.closeModal();
          this.toast(`Brassin « ${w.activeRecipe!.name} » lancé !`, 'good');
          this.inspectorKey = '';
          this.sheetKey = '';
        });
        card.append(input, sheet, launch);
      }
      if (index > 0) card.append(this.button('btn small back', '← Retour', () => { index--; render(); }));
      this.modal.append(card);
    };
    render();
  }

  private closeModal(): void {
    this.modal.classList.add('hidden');
    this.modal.replaceChildren();
  }

  // ------------------------------------------------------------------ options

  private openMenu(): void {
    const w = this.world();
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const card = h('div', 'modal-card');
    const head = h('div', 'sheet-head');
    head.append(h('strong', '', 'Options'), this.button('icon-btn small', '✕', () => this.closeModal()));
    card.append(head);
    card.append(h('div', 'card-spec', `${EXPANSIONS[w.expansion]!.name} · ${w.stats.crates} caisse${w.stats.crates > 1 ? 's' : ''} livrée${w.stats.crates > 1 ? 's' : ''} · ${moneyInt(w.stats.earned)} gagnés`));
    if (!w.tutorial.done) {
      card.append(this.button('btn', 'Passer le tutoriel', () => {
        skipTutorial(w);
        this.closeModal();
      }));
    }
    const fresh = this.button('btn bad', 'Nouvelle partie', () => {
      if (fresh.dataset.confirm) {
        this.closeModal();
        this.cb.newGame();
        return;
      }
      fresh.dataset.confirm = '1';
      fresh.textContent = 'Sûr ? Ta brasserie actuelle sera effacée. Toucher pour confirmer';
    });
    card.append(fresh, this.button('btn', 'Fermer', () => this.closeModal()));
    this.modal.append(card);
  }

  // ------------------------------------------------------------------ boucle

  update(): void {
    const w = this.world();
    this.moneyEl.textContent = moneyInt(w.money);
    this.speedBtn.textContent = `⏩ ×${this.cb.getSpeed()}`;
    const r = w.activeRecipe;
    this.prodChip.hidden = !r;
    this.prodChip.textContent = r ? `${w.production.running ? '▶' : '⏸'} ${r.name}` : '';
    const tool = this.input.tool;
    if (tool.kind === 'build' && !w.tutorial.done && !tutorialPalette(w).includes(tool.type)) this.setTool({ kind: 'none' });
    this.renderSheet();
    this.renderModebar(w);
    this.updateMentor(w);
    const top = this.header.getBoundingClientRect().bottom + 6;
    this.inspector.style.top = `${top}px`;
    this.inspector.style.maxHeight = `${Math.max(160, this.bottomInset - top - 8)}px`;
    this.root.style.setProperty('--tabbar-h', `${this.tabbar.getBoundingClientRect().height}px`);
    const mode = this.modebar.classList.contains('hidden') ? 0 : this.modebar.getBoundingClientRect().height;
    this.root.style.setProperty('--modebar-h', `${mode}px`);
    this.updateInspector(w);
  }

  onEvent(e: GameEvent): void {
    const w = this.world();
    if (e.type === 'batchLost') this.toast(`Lot perdu : ${e.reason}`, 'bad');
    if (e.type === 'broken') this.toast('Un tuyau a cédé sous la pression !', 'bad');
    if (e.type === 'expanded') this.toast(`Nouvel espace : ${EXPANSIONS[e.level]!.name}`, 'good');
    if (e.type === 'crateDelivered') this.toast(`Caisse livrée au bar : +${money(e.price)}`, 'good');
    if (e.type === 'unlocked' && w.tutorial.done && w.stats.crates > 0 && e.buildings.length < 8) {
      this.toast(`Nouveau au Magasin : ${e.buildings.map((t) => BUILDINGS[t as BuildingType].name).join(', ')}`, 'good');
    }
    if (e.type === 'tutorialStep' || e.type === 'tutorialDone') {
      this.mentorKey = '';
      this.sheetKey = '';
      this.inspectorKey = '';
      if (e.type === 'tutorialDone') this.cb.setSpeed(1);
      const step = currentStep(w);
      if (step?.places) this.select(null);
      // Le panneau de l'étape suivante s'ouvre si Gaston le demande ; sinon on dégage la carte.
      if (this.openTab && step?.tab !== this.openTab) {
        this.openTab = null;
        this.renderSheet();
      }
    }
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = h('div', `toast ${kind}`, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3200);
  }

  get topInset(): number {
    return this.header.getBoundingClientRect().bottom;
  }

  get bottomInset(): number {
    if (!this.mentor.classList.contains('hidden')) return this.mentor.getBoundingClientRect().top;
    if (!this.modebar.classList.contains('hidden')) return this.modebar.getBoundingClientRect().top;
    return this.tabbar.getBoundingClientRect().top;
  }
}
