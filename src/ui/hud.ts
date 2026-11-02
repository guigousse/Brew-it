import { Alert, type Building } from '../core/building';
import { GASTON_RECIPE, RANGES, type Recipe, type RecipeChoices, type Tasting } from '../core/brewing/recipe';
import { colorLabel, DRINKABLE_MIN, verdictOf } from '../core/brewing/profile';
import { BUILDINGS, kindOf, type BuildingDef, type BuildingType, type Category } from '../core/content/buildings';
import { EXPANSIONS } from '../core/content/expansions';
import { ITEMS, type ItemId } from '../core/content/items';
import { GASTON_NOTES, RECIPE_GROUPS } from '../core/content/params';
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
import { createKnob } from './knob';
import type { InputController, Tool } from './input';

type Tab = 'shop' | 'supplier' | 'brews';

const SHOP_SECTIONS: { id: Category | 'local'; label: string; title: string }[] = [
  { id: 'brewing', label: 'Brassage', title: 'Appareils de brassage' },
  { id: 'transport', label: 'Connecteurs', title: 'Connecteurs : tuyaux, tapis, eau' },
  { id: 'storage', label: 'Stockage', title: 'Stockage des ingrédients' },
  { id: 'sales', label: 'Vente', title: 'Vente et livraison' },
  { id: 'local', label: 'Local', title: 'Le local' },
];
const FAMILY_ORDER = ['mill', 'mash_tun', 'kettle', 'cooler', 'fermenter', 'bottler', 'storage'];

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

const fmt = (n: number, d = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function recipeSummary(r: RecipeChoices): string {
  return `${fmt(r.grainKg, r.grainKg % 1 ? 1 : 0)} kg · ${r.mashTemp} °C ${r.mashTime} min · ${r.hopsGrams} g houblon ${r.boilTime} min · ${STRAINS[r.strain].name} ${r.fermentTemp} °C · garde ${r.gardeDays} j`;
}

const VERDICT_CLASS: Record<string, string> = { Imbuvable: 'v-bad', Médiocre: 'v-meh', Correcte: 'v-ok', Bonne: 'v-good', Excellente: 'v-top' };

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
  if (def.tier === 3) parts.unshift('Industriel');
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
    const key = `${tab}|${JSON.stringify(w.stock)}|${w.tutorial.step}|${w.unlocked.length}|${w.production.recipeId}|${w.production.running}|${w.recipes.length}|${w.expansion}|${w.tasting?.recipeId ?? ''}|${w.recipes.map((r) => r.status + (r.tasting ? 't' : '')).join()}`;
    if (key === this.sheetKey) return this.refreshAffordability(w);
    this.sheetKey = key;
    const scroll = this.sheet.querySelector('.sheet-body')?.scrollTop ?? 0;
    this.sheet.replaceChildren();
    if (tab === 'shop') this.renderShop(w);
    if (tab === 'supplier') this.renderSupplier(w);
    if (tab === 'brews') this.renderBrews(w);
    const bodyEl = this.sheet.querySelector('.sheet-body');
    if (bodyEl) bodyEl.scrollTop = scroll;
  }

  /** Met à jour sur place ce qui dépend de l'argent (sans reconstruire le panneau). */
  private refreshAffordability(w: World): void {
    this.sheet.querySelectorAll<HTMLElement>('[data-cost]').forEach((el) => {
      const short = w.money < Number(el.dataset.cost);
      if (el instanceof HTMLButtonElement && el.classList.contains('pack')) el.disabled = short;
      else el.classList.toggle('short', short);
    });
  }

  private sheetFrame(title: string): HTMLElement {
    const head = h('div', 'sheet-head');
    head.append(h('strong', '', title), this.button('icon-btn small', '✕', () => this.toggleTab(this.openTab!)));
    const body = h('div', 'sheet-body');
    this.sheet.append(head, body);
    return body;
  }

  // --- Magasin : une liste unique découpée en sections, avec des raccourcis en haut
  private renderShop(w: World): void {
    const body = this.sheetFrame('Magasin');
    const inTutorial = !w.tutorial.done;
    const tutorialTypes = tutorialPalette(w);
    const shopCard = (t: BuildingType) => {
      const d = BUILDINGS[t] as BuildingDef;
      const locked = !inTutorial && !!d.unlock && !w.unlocked.includes(t);
      const card = h('button', `card shop-item${locked ? ' locked' : ''}${inTutorial ? ' pulse' : ''}`);
      const pic = h('div', 'card-pic');
      pic.append(pixelImg(spriteCanvas(t, true)));
      card.append(pic, h('div', 'card-title', d.name), h('div', 'card-spec', locked ? unlockText(d.unlock!) : specText(d) || d.description));
      const price = h('div', `price${!locked && !inTutorial && w.money < d.cost ? ' short' : ''}`, locked ? '🔒' : inTutorial ? 'Offert' : moneyInt(d.cost));
      if (!locked && !inTutorial) price.dataset.cost = String(d.cost);
      card.append(price);
      card.disabled = locked;
      card.onclick = () => {
        this.openTab = null;
        this.setTool({ kind: 'build', type: t });
      };
      return card;
    };
    if (inTutorial) {
      const grid = h('div', 'shop-grid');
      for (const t of tutorialTypes) grid.append(shopCard(t));
      if (!tutorialTypes.length) body.append(h('p', 'hint', 'Écoute Gaston : rien à acheter pour l\'instant.'));
      body.append(grid);
      return;
    }
    const chips = h('div', 'chips');
    body.append(chips);
    for (const sec of SHOP_SECTIONS) {
      const header = h('div', 'shop-section', sec.title);
      chips.append(this.button('chip', sec.label, () => header.scrollIntoView({ block: 'start', behavior: 'smooth' })));
      body.append(header);
      const grid = h('div', 'shop-grid');
      if (sec.id === 'local') {
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
        continue;
      }
      const types = (Object.keys(BUILDINGS) as BuildingType[])
        .filter((t) => !(BUILDINGS[t] as BuildingDef).hidden && BUILDINGS[t].category === sec.id)
        .sort((a, b) => {
          const da = BUILDINGS[a] as BuildingDef;
          const db = BUILDINGS[b] as BuildingDef;
          return (FAMILY_ORDER.indexOf(da.family ?? '') - FAMILY_ORDER.indexOf(db.family ?? '')) || (da.tier ?? 0) - (db.tier ?? 0);
        });
      for (const t of types) grid.append(shopCard(t));
      body.append(grid);
    }
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
        b.dataset.cost = String(p.price);
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
    if (w.tasting) {
      const banner = h('div', 'beer-sheet pulse');
      banner.append(h('div', 'beer-style', 'Fournée d\'essai prête !'), this.button('btn primary', 'Goûter la bière', () => w.tasting && this.openTasting(w.tasting.recipeId)));
      body.append(banner);
    }
    const status = h('div', 'beer-sheet');
    if (active) {
      const state = active.status === 'test'
        ? (w.tasting ? '🍺 Dégustation en attente' : '🧪 Fournée d\'essai en cours')
        : w.production.running ? '▶ En production' : '⏸ En pause';
      status.append(h('div', 'beer-style', `${state} : ${active.name}`), h('div', 'card-spec', recipeSummary(active)));
    } else status.append(h('div', 'beer-style', 'Aucun brassin pour l\'instant'));
    body.append(status);
    if (!active && !w.tutorial.done) {
      body.append(h('p', 'hint', 'Gaston te dira quand lancer ton premier brassin.'));
      return;
    }
    if (active && active.status === 'validated' && !w.tasting) {
      body.append(this.button(`btn ${w.production.running ? '' : 'primary'}`, w.production.running ? '⏸ Mettre la production en pause' : '▶ Reprendre la production', () => {
        w.setProduction(!w.production.running);
        this.sheetKey = '';
        this.renderSheet();
      }));
    }
    const busy = !!w.tasting || (w.production.running && !!active);
    if (w.tutorial.done) {
      const create = this.button('btn primary', '＋ Nouveau brassin', () => this.openEditor(active ?? GASTON_RECIPE));
      create.disabled = busy;
      body.append(create);
      if (busy) body.append(h('p', 'hint', w.tasting ? 'Goûte d\'abord la fournée d\'essai.' : 'Pour créer ou changer de brassin, mets la production en pause : les lots en cours se terminent.'));
    }
    if (w.recipes.length) {
      body.append(h('div', 'section-title', 'Mes brassins'));
      const list = h('div', 'recipe-list');
      for (const r of [...w.recipes].reverse()) list.append(this.recipeRow(w, r, !busy));
      body.append(list);
    }
  }

  private recipeRow(w: World, r: Recipe, selectable: boolean): HTMLElement {
    const isActive = w.production.recipeId === r.id;
    const row = h('div', `recipe-row${isActive ? ' active' : ''}`);
    const head = h('div', 'recipe-head');
    head.append(h('span', 'option-label', `${r.name}${isActive ? ' (actif)' : ''}`));
    if (r.tasting) {
      const v = verdictOf(r.tasting.quality);
      head.append(h('span', `verdict ${VERDICT_CLASS[v]}`, v));
    } else if (r.status === 'test') head.append(h('span', 'verdict v-meh', 'À goûter'));
    row.append(head, h('span', 'card-spec', recipeSummary(r)));
    const actions = h('div', 'insp-actions');
    if (r.tasting) actions.append(this.button('btn small', 'Dégustation', () => this.openTasting(r.id, true)));
    if (w.tutorial.done) actions.append(this.button('btn small', 'Modifier', () => this.openEditor(r, `${r.name} v2`)));
    const drinkable = r.status === 'validated' && (r.tasting?.quality ?? 1) >= DRINKABLE_MIN;
    if (!isActive && selectable && drinkable) {
      actions.append(this.button('btn small primary', 'Produire', () => {
        const res = w.selectRecipe(r.id);
        if (!res.ok) return this.toast(res.reason!, 'bad');
        w.setProduction(true);
        this.toast(`Production relancée : « ${r.name} »`, 'good');
        this.sheetKey = '';
        this.renderSheet();
      }));
    }
    row.append(actions);
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
    const key = `${b.id}|${w.tutorial.done}|${w.production.recipeId}|${b.params.item ?? ''}`;
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
      if (kindOf(b.type) === 'storage') {
        const box = h('div', 'insp-recipe');
        box.append(h('div', 'section-title', 'Ingrédient stocké'));
        const row = h('div', 'strain-row');
        for (const it of ['malt', 'hops', 'yeast', 'bottle'] as ItemId[]) {
          const btn = h('button', `chip${b.params.item === it ? ' active' : ''}`);
          btn.append(pixelImg(itemCanvas(it), 'pix item-icon'), document.createTextNode(` ${ITEMS[it].name}`));
          btn.onclick = () => {
            if (b.params.item === it) return;
            w.setStorageItem(b.id, it);
            this.inspectorKey = '';
            this.toast(`Réserve réglée sur : ${ITEMS[it].name.toLowerCase()}`, 'info');
          };
          row.append(btn);
        }
        box.append(row, h('p', 'hint', 'Elle alimente tout seul les appareils collés à elle. Changer d\'ingrédient rend le contenu au stock.'));
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
    if (step.action === 'recipe') this.mentorActions.append(this.button('btn primary pulse', 'Voir la recette de Gaston', () => this.openGastonRecipe()));
    if (step.fastForward) {
      const fast = this.cb.getSpeed() > 1;
      this.mentorActions.append(this.button(`btn${fast ? ' active' : ''}`, fast ? `⏩ Vitesse ×${this.cb.getSpeed()}` : '⏩ Accélérer le temps', () => this.cb.setSpeed(fast ? 1 : 4)));
    }
  }

  // ------------------------------------------------------------------ éditeur de brassin (molettes)

  /** Nouveau brassin : une molette par réglage, aucune prévision. Le résultat se découvre à la fournée d'essai. */
  openEditor(base: RecipeChoices = GASTON_RECIPE, name = ''): void {
    const choices: RecipeChoices = { ...base };
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const card = h('div', 'modal-card editor');
    const head = h('div', 'sheet-head');
    head.append(h('strong', '', 'Nouveau brassin'), this.button('icon-btn small', '✕', () => this.closeModal()));
    card.append(head, h('p', 'hint', 'Règle chaque étape, puis lance une fournée d\'essai : tu goûteras le résultat avant de produire.'));
    card.append(this.recipeGroups(choices, false));
    const input = h('input', 'name-input');
    input.maxLength = 32;
    input.placeholder = 'Nom de ta bière';
    input.value = name;
    const launch = this.button('btn primary big', '🧪 Lancer la fournée d\'essai', () => {
      const w = this.world();
      const r = w.createRecipe(input.value, choices);
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.closeModal();
      this.toast(`Fournée d'essai de « ${w.activeRecipe!.name} » lancée`, 'good');
      this.inspectorKey = '';
      this.sheetKey = '';
    });
    card.append(h('div', 'section-title', 'Nom de la bière'), input, launch);
    this.modal.append(card);
  }

  /** Les molettes, groupées par étape. `readonly` pour la fiche de la recette de Gaston. */
  private recipeGroups(choices: RecipeChoices, readonly: boolean, notes?: Record<string, string>): HTMLElement {
    const wrap = h('div', 'recipe-groups');
    for (const g of RECIPE_GROUPS) {
      const box = h('section', 'recipe-group');
      box.append(h('div', 'wizard-step', g.step), h('p', 'hint', g.hint));
      if (g.strain) {
        const strains = h('div', 'strain-row');
        const desc = h('div', 'card-spec strain-desc', STRAINS[choices.strain].description);
        for (const [id, st] of Object.entries(STRAINS)) {
          const b = h('button', `chip${choices.strain === id ? ' active' : ''}`, st.name);
          b.disabled = readonly && choices.strain !== id;
          b.onclick = () => {
            if (readonly) return;
            choices.strain = id as RecipeChoices['strain'];
            strains.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
            desc.textContent = st.description;
          };
          strains.append(b);
        }
        box.append(h('div', 'section-title', 'Levure'), strains, desc);
        if (notes?.strain) box.append(h('p', 'note', notes.strain));
      }
      const knobs = h('div', 'knob-row');
      for (const k of g.knobs) {
        const range = RANGES[k];
        const cell = h('div', 'knob-cell');
        cell.append(createKnob({
          label: range.label, min: range.min, max: range.max, step: range.step, unit: range.unit, value: choices[k], disabled: readonly,
          onChange: (v) => (choices[k] = v),
        }));
        knobs.append(cell);
      }
      box.append(knobs);
      // Explications de Gaston sous la rangée de molettes.
      const lines = g.knobs.filter((k) => notes?.[k]).map((k) => h('li', 'note', notes![k]!));
      if (lines.length) {
        const ul = h('ul', 'notes');
        ul.append(...lines);
        box.append(ul);
      }
      wrap.append(box);
    }
    return wrap;
  }

  /** Tutoriel : Gaston présente sa recette, réglage par réglage ; le joueur la nomme et lance la production. */
  openGastonRecipe(): void {
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const card = h('div', 'modal-card editor');
    const head = h('div', 'sheet-head');
    head.append(h('strong', '', 'La recette de Gaston'), this.button('icon-btn small', '✕', () => this.closeModal()));
    card.append(head, h('p', 'hint', 'Voici chaque réglage et pourquoi. Plus tard, tu tourneras toi-même les molettes.'));
    card.append(this.recipeGroups({ ...GASTON_RECIPE }, true, GASTON_NOTES));
    const input = h('input', 'name-input');
    input.maxLength = 32;
    input.value = 'Blonde de Gaston';
    const launch = this.button('btn primary big', 'Lancer la production', () => {
      const w = this.world();
      const r = w.createRecipe(input.value, GASTON_RECIPE, { validated: true });
      if (!r.ok) return this.toast(r.reason!, 'bad');
      this.closeModal();
      this.toast(`Brassin « ${w.activeRecipe!.name} » lancé !`, 'good');
      this.sheetKey = '';
    });
    card.append(h('div', 'section-title', 'Nom de ta première bière'), input, launch);
    this.modal.append(card);
  }

  /** Dégustation de la fournée d'essai : verdict, mesures, défauts expliqués, décision. */
  openTasting(recipeId: number, readOnly = false): void {
    const w = this.world();
    const r = w.recipes.find((x) => x.id === recipeId);
    const t: Tasting | undefined = r?.tasting;
    if (!r || !t) return;
    const pending = !readOnly && w.tasting?.recipeId === r.id;
    const v = verdictOf(t.quality);
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const card = h('div', 'modal-card tasting');
    const head = h('div', 'sheet-head');
    head.append(h('strong', '', `Dégustation : ${r.name}`), this.button('icon-btn small', '✕', () => this.closeModal()));
    const verdict = h('div', `verdict big ${VERDICT_CLASS[v]}`, v);
    const score = h('div', 'score');
    score.append(h('span', '', `Note ${Math.round(t.quality * 20)}/20`));
    const stats = h('div', 'tasting-stats');
    for (const [k, val] of [['Alcool', `${t.abv.toFixed(1)} %`], ['Amertume', `${Math.round(t.ibu)} IBU`], ['Couleur', colorLabel(t.og)], ['Fruité', t.fruity > 0.5 ? 'Marqué' : t.fruity > 0.25 ? 'Léger' : 'Discret']] as const) {
      const cell = h('div', 'stat');
      cell.append(h('div', 'section-title', k), h('div', 'stat-value', val));
      stats.append(cell);
    }
    card.append(head, verdict, score, stats);
    if (t.defects.length) {
      card.append(h('div', 'section-title', 'Ce qui ne va pas'));
      const list = h('ul', 'defects');
      for (const d of t.defects) list.append(h('li', '', d.label));
      card.append(list);
    } else card.append(h('p', 'note', 'Aucun défaut : propre, équilibrée, réussie. Bravo !'));
    card.append(h('div', 'card-spec', recipeSummary(r)));
    if (pending) {
      const ok = t.quality >= DRINKABLE_MIN;
      const go = this.button('btn primary big', ok ? '▶ Valider et lancer la production' : 'Imbuvable : impossible à vendre', () => {
        const res = w.validateRecipe();
        if (!res.ok) return this.toast(res.reason!, 'bad');
        this.closeModal();
        this.toast(`« ${r.name} » part en production`, 'good');
        this.sheetKey = '';
      });
      go.disabled = !ok;
      const redo = this.button('btn', 'Jeter et modifier la recette', () => {
        w.discardTest();
        this.closeModal();
        this.openEditor(r, `${r.name} v2`);
      });
      const toss = this.button('btn bad', 'Jeter la fournée', () => {
        w.discardTest();
        this.closeModal();
        this.toast('Fournée jetée', 'info');
        this.sheetKey = '';
      });
      card.append(go, redo, toss);
    } else card.append(this.button('btn', 'Fermer', () => this.closeModal()));
    this.modal.append(card);
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
    this.prodChip.textContent = r ? `${w.tasting ? '🍺' : r.status === 'test' ? '🧪' : w.production.running ? '▶' : '⏸'} ${r.name}` : '';
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
    if (e.type === 'crateDelivered') this.toast(e.price > 0 ? `Caisse livrée au bar : +${money(e.price)}` : 'Le bar refuse ta caisse : bière imbuvable !', e.price > 0 ? 'good' : 'bad');
    if (e.type === 'tasting') {
      this.sheetKey = '';
      this.openTasting(e.recipeId);
    }
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
