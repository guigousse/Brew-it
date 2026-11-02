import { Alert, type Building } from '../core/building';
import { predict, styleLabel, DEFAULT_CHOICES, type Recipe, type RecipeChoices } from '../core/brewing/recipe';
import { BUILDINGS, type BuildingType, type Category } from '../core/content/buildings';
import { EXPANSIONS } from '../core/content/expansions';
import { ITEMS } from '../core/content/items';
import { RECIPE_CHOICES } from '../core/content/params';
import { STRAINS } from '../core/content/strains';
import { describe } from '../core/describe';
import type { GameEvent } from '../core/events';
import { needOf } from '../core/ingredients';
import { REFUND_RATIO, type World } from '../core/world';
import { TUTORIAL_STEPS } from '../core/tutorial/steps';
import { currentStep, skipTutorial, stepText, tutorialPalette } from '../core/tutorial/tutorial';
import { drawGaston } from './gaston';
import type { InputController, Tool } from './input';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'brewing', label: 'Brassage' },
  { id: 'transport', label: 'Flux' },
  { id: 'sales', label: 'Vente' },
  { id: 'supply', label: 'Réserves' },
];

const ALERT_LABELS: [number, string][] = [
  [Alert.Broken, 'En panne : touche « Réparer »'],
  [Alert.BatchLost, 'Lot perdu'],
  [Alert.Overpressure, 'Surpression !'],
  [Alert.OutputBlocked, 'Sortie bloquée : rien ne peut récupérer ce qui sort'],
  [Alert.MixedFluids, 'Deux liquides différents se rencontrent'],
  [Alert.NoMoney, 'Plus assez d\'argent pour acheter'],
];

const BREWING_MACHINES: readonly BuildingType[] = ['mill', 'mash_tun', 'kettle', 'fermenter'];

const money = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 2 : 0 })} €`;
const moneyInt = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

const optionLabel = (key: keyof RecipeChoices, value: unknown) => RECIPE_CHOICES.find((c) => c.key === key)?.options.find((o) => o.value === value);

/** Résumé lisible d'un brassin : « 5 kg · 66 °C · 50 g de houblon · Ale américaine · 3 j ». */
export function recipeSummary(r: RecipeChoices): string {
  return [
    optionLabel('grainKg', r.grainKg)?.label,
    optionLabel('mashTemp', r.mashTemp)?.label,
    `${optionLabel('hopsItems', r.hopsItems)?.label} de houblon`,
    STRAINS[r.strain].name,
    `garde ${optionLabel('gardeDays', r.gardeDays)?.label}`,
  ].join(' · ');
}

export interface HudCallbacks {
  setSpeed(speed: number): void;
  getSpeed(): number;
  newGame(): void;
  layoutChanged(): void;
}

/** Interface DOM superposée au canvas : barre du haut, Gaston, palette, inspecteur, brassins, menu. */
export class Hud {
  private top = h('div', 'topbar');
  private moneyEl = h('span', 'money');
  private stageEl = h('span', 'stage');
  private brewBtn = h('button', 'btn small brew-btn');
  private expandBtn = h('button', 'btn small');
  private speedBtn = h('button', 'btn small speed');
  private menuBtn = h('button', 'btn icon small', '☰');
  private mentor = h('div', 'mentor hidden');
  private mentorText = h('p', 'mentor-text');
  private mentorChapter = h('div', 'mentor-chapter');
  private mentorActions = h('div', 'mentor-actions');
  private toolbar = h('div', 'toolbar');
  private palette = h('div', 'palette');
  private tabs = h('div', 'tabs');
  private actions = h('div', 'actions');
  private inspector = h('div', 'inspector hidden');
  private modal = h('div', 'modal hidden');
  private toasts = h('div', 'toasts');
  private category: Category = 'brewing';
  selectedId: number | null = null;
  private inspectorKey = '';
  private mentorKey = '';
  private paletteKey = '';

  constructor(
    private root: HTMLElement,
    private world: () => World,
    private input: InputController,
    private deleteSet: Set<number>,
    private cb: HudCallbacks,
  ) {
    this.top.append(this.moneyEl, this.stageEl, this.brewBtn, this.expandBtn, this.speedBtn, this.menuBtn);
    this.expandBtn.onclick = () => {
      const r = this.world().expand();
      if (!r.ok) this.toast(r.reason!, 'bad');
    };
    this.brewBtn.onclick = () => this.openProduction();
    this.speedBtn.onclick = () => this.cb.setSpeed(({ 1: 2, 2: 4, 4: 1 } as Record<number, number>)[this.cb.getSpeed()] ?? 1);
    this.menuBtn.onclick = () => this.openMenu();
    const avatar = h('canvas', 'mentor-avatar');
    drawGaston(avatar);
    const body = h('div', 'mentor-body');
    const head = h('div', 'mentor-head');
    head.append(h('strong', 'mentor-name', 'Gaston'), this.mentorChapter);
    body.append(head, this.mentorText, this.mentorActions);
    this.mentor.append(avatar, body);
    this.toolbar.append(this.tabs, this.palette, this.actions);
    root.append(this.top, this.inspector, this.toasts, this.mentor, this.toolbar, this.modal);
    this.update();
  }

  // ------------------------------------------------------------------ palette & outils

  private available(): BuildingType[] {
    const w = this.world();
    return w.tutorial.done ? w.unlocked : tutorialPalette(w);
  }

  private buildPalette(): void {
    const w = this.world();
    const tool = this.input.tool;
    const types = this.available();
    if (!w.tutorial.done && types[0]) this.category = BUILDINGS[types[0]].category;
    if (!types.some((t) => BUILDINGS[t].category === this.category) && types[0]) this.category = BUILDINGS[types[0]].category;
    const key = `${types.join()}|${this.category}|${JSON.stringify(tool)}|${w.tutorial.done}|${this.deleteSet.size}|${Math.floor(w.money)}`;
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    this.tabs.replaceChildren();
    this.palette.replaceChildren();
    this.actions.replaceChildren();

    if (tool.kind === 'delete') return this.buildDeleteBar(w);
    if (tool.kind === 'move') {
      const b = w.buildings.get(tool.id);
      this.palette.append(h('span', 'palette-hint', `Déplacer ${b ? BUILDINGS[b.type].name.toLowerCase() : ''} : touche ou glisse jusqu'au nouvel emplacement.`));
      this.actions.append(this.button('btn', 'Terminé', () => this.setTool({ kind: 'none' })));
      return;
    }

    for (const c of CATEGORIES) {
      if (!types.some((t) => BUILDINGS[t].category === c.id)) continue;
      this.tabs.append(this.button(`tab${c.id === this.category ? ' active' : ''}`, c.label, () => {
        this.category = c.id;
        this.paletteKey = '';
        this.buildPalette();
      }));
    }
    if (!types.length) this.palette.append(h('span', 'palette-hint', w.tutorial.done ? '' : 'Écoute Gaston…'));
    for (const type of types) {
      const def = BUILDINGS[type];
      if (def.category !== this.category) continue;
      const active = tool.kind === 'build' && tool.type === type;
      const btn = h('button', `tool${active ? ' active' : ''}${!w.tutorial.done && !active ? ' pulse' : ''}`);
      const sw = h('span', 'swatch');
      sw.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
      btn.append(sw, h('span', 'name', def.name), h('span', 'cost', w.tutorial.done ? moneyInt(def.cost) : 'Offert'));
      btn.onclick = () => this.setTool(active ? { kind: 'none' } : { kind: 'build', type });
      this.palette.append(btn);
    }
    if (tool.kind === 'build' && BUILDINGS[tool.type].rotatable && w.tutorial.done && !(BUILDINGS[tool.type].size === 1)) {
      this.actions.append(this.button('btn icon', '⟳', () => (this.input.rot = ((this.input.rot + 1) % 4) as 0 | 1 | 2 | 3)));
    }
    if (w.tutorial.done) this.actions.append(this.button('btn icon', '🗑', () => this.setTool({ kind: 'delete' })));
    if (tool.kind !== 'none') this.actions.append(this.button('btn icon', '✕', () => this.setTool({ kind: 'none' })));
  }

  /** Barre de suppression : les éléments touchés passent en rouge, puis on confirme. */
  private buildDeleteBar(w: World): void {
    const n = this.deleteSet.size;
    const refund = [...this.deleteSet].reduce((s, id) => {
      const b = w.buildings.get(id);
      return s + (b ? Math.floor(BUILDINGS[b.type].cost * REFUND_RATIO) : 0);
    }, 0);
    this.palette.append(h('span', 'palette-hint', n ? `${n} élément${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''} (+${moneyInt(refund)} remboursés)` : 'Touche les éléments à supprimer : ils passent en rouge.'));
    const confirm = this.button('btn bad', `Supprimer${n ? ` (${n})` : ''}`, () => {
      for (const id of [...this.deleteSet]) w.remove(id);
      this.deleteSet.clear();
      this.setTool({ kind: 'none' });
      if (n) this.toast(`${n} élément${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}`, 'info');
    });
    confirm.disabled = n === 0;
    this.actions.append(confirm, this.button('btn', 'Annuler', () => this.setTool({ kind: 'none' })));
  }

  setTool(tool: Tool): void {
    this.input.setTool(tool);
    if (tool.kind !== 'none') this.select(null);
    this.paletteKey = '';
    this.buildPalette();
  }

  deleteSelectionChanged(): void {
    this.paletteKey = '';
    this.buildPalette();
  }

  private button(cls: string, text: string, onclick: () => void): HTMLButtonElement {
    const b = h('button', cls, text);
    b.onclick = onclick;
    return b;
  }

  // ------------------------------------------------------------------ inspecteur

  select(id: number | null): void {
    this.selectedId = id;
    this.inspectorKey = '';
  }

  /** Achat via l'icône « + » ou le bouton de l'inspecteur. */
  buy(id: number): void {
    const r = this.world().buyMissing(id);
    if (!r.ok) return this.toast(r.reason!, 'bad');
    const item = ITEMS[r.item as keyof typeof ITEMS];
    this.toast(`+${r.qty} ${item.name.toLowerCase()} (−${money(r.cost!)})`, 'good');
  }

  private updateInspector(w: World): void {
    const b = this.selectedId != null ? w.buildings.get(this.selectedId) : undefined;
    this.inspector.classList.toggle('hidden', !b);
    if (!b) return;
    const def = BUILDINGS[b.type];
    const key = `${b.id}|${w.tutorial.done}|${w.production.recipeId}`;
    if (this.inspectorKey !== key) {
      this.inspectorKey = key;
      this.inspector.replaceChildren();
      const head = h('div', 'insp-head');
      head.append(h('strong', '', def.name), this.button('btn icon small', '✕', () => this.select(null)));
      this.inspector.append(head, h('p', 'insp-desc', def.description), h('div', 'insp-status'), h('div', 'insp-buy'));
      const recipe = w.activeRecipe;
      if (BREWING_MACHINES.includes(b.type)) {
        const box = h('div', 'insp-recipe');
        box.append(h('div', 'choice-label', recipe ? `Brassin : ${recipe.name}` : 'Aucun brassin'), h('div', 'choice-why', recipe ? recipeSummary(recipe) : 'Compose ton brassin pour lancer la production.'));
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
    const buyBox = this.inspector.querySelector('.insp-buy')!;
    const buyKey = need ? `${need.item}|${need.missing}` : '';
    if ((buyBox as HTMLElement).dataset.key !== buyKey) {
      (buyBox as HTMLElement).dataset.key = buyKey;
      buyBox.replaceChildren();
      if (need) {
        const item = ITEMS[need.item];
        buyBox.append(this.button('btn primary buy', `＋ Ajouter ${need.missing} × ${item.name.toLowerCase()} · ${money(need.total)}`, () => this.buy(b.id)));
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

  /** Assistant « Nouveau brassin » : un choix par écran, expliqué, puis le nom et le lancement. */
  openWizard(base: RecipeChoices = DEFAULT_CHOICES): void {
    const choices: RecipeChoices = { ...base };
    let index = 0;
    const total = RECIPE_CHOICES.length + 1;
    const render = () => {
      this.modal.replaceChildren();
      this.modal.classList.remove('hidden');
      const card = h('div', 'modal-card wizard');
      const head = h('div', 'wizard-head');
      head.append(h('strong', '', 'Nouveau brassin'), h('span', 'mentor-chapter', `${Math.min(index + 1, total)}/${total}`), this.button('btn icon small', '✕', () => this.closeModal()));
      const dots = h('div', 'dots');
      for (let i = 0; i < total; i++) dots.append(h('span', `dot${i <= index ? ' on' : ''}`));
      card.append(head, dots);

      if (index < RECIPE_CHOICES.length) {
        const meta = RECIPE_CHOICES[index]!;
        card.append(h('div', 'wizard-step', meta.step), h('div', 'wizard-title', meta.label), h('p', 'wizard-why', meta.why));
        const row = h('div', 'choice-options');
        for (const o of meta.options) {
          const active = choices[meta.key] === o.value;
          const btn = h('button', `option${active ? ' active' : ''}`);
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
          h('div', 'choice-why', recipeSummary(choices)),
        );
        const launch = this.button('btn primary big', 'Sauvegarder et lancer la production', () => {
          const w = this.world();
          const r = w.createRecipe(input.value, choices);
          if (!r.ok) return this.toast(r.reason!, 'bad');
          this.closeModal();
          this.toast(`Brassin « ${w.activeRecipe!.name} » lancé !`, 'good');
          this.inspectorKey = '';
        });
        card.append(input, sheet, launch);
      }
      if (index > 0) card.append(this.button('btn small back', '← Retour', () => { index--; render(); }));
      this.modal.append(card);
    };
    render();
  }

  // ------------------------------------------------------------------ production & brassins sauvegardés

  openProduction(): void {
    const w = this.world();
    if (!w.tutorial.done && !w.activeRecipe) return;
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const card = h('div', 'modal-card');
    const head = h('div', 'wizard-head');
    head.append(h('strong', '', 'Production'), this.button('btn icon small', '✕', () => this.closeModal()));
    card.append(head);
    const active = w.activeRecipe;
    const status = h('div', 'beer-sheet');
    if (active) {
      const p = predict(active);
      status.append(
        h('div', 'beer-style', `${w.production.running ? '▶ En production' : '⏸ En pause'} : ${active.name}`),
        h('div', 'beer-stats', `≈ ${p.abv.toFixed(1)} % · ${Math.round(p.ibu)} IBU`),
        h('div', 'choice-why', recipeSummary(active)),
      );
    } else status.append(h('div', 'beer-style', 'Aucun brassin pour l\'instant'));
    card.append(status);
    if (active) {
      card.append(this.button(`btn ${w.production.running ? '' : 'primary'}`, w.production.running ? '⏸ Mettre la production en pause' : '▶ Reprendre la production', () => {
        w.setProduction(!w.production.running);
        this.openProduction();
      }));
      if (w.production.running) card.append(h('p', 'choice-why', 'Pour changer de bière, mets d\'abord la production en pause : les lots en cours se terminent.'));
    }
    const paused = !w.production.running || !active;
    if (w.recipes.length) {
      card.append(h('div', 'choice-label', 'Mes brassins'));
      const list = h('div', 'recipe-list');
      for (const r of [...w.recipes].reverse()) list.append(this.recipeRow(w, r, paused));
      card.append(list);
    }
    if (paused && w.tutorial.done) card.append(this.button('btn primary', '＋ Nouveau brassin', () => this.openWizard(active ?? DEFAULT_CHOICES)));
    this.modal.append(card);
  }

  private recipeRow(w: World, r: Recipe, selectable: boolean): HTMLElement {
    const isActive = w.production.recipeId === r.id;
    const row = h('button', `recipe-row${isActive ? ' active' : ''}`);
    row.disabled = !selectable && !isActive;
    row.append(h('span', 'option-label', `${r.name}${isActive ? ' (actif)' : ''}`), h('span', 'option-hint', recipeSummary(r)));
    row.onclick = () => {
      if (isActive || !selectable) return;
      const res = w.selectRecipe(r.id);
      if (!res.ok) return this.toast(res.reason!, 'bad');
      w.setProduction(true);
      this.toast(`Production relancée : « ${r.name} »`, 'good');
      this.closeModal();
    };
    return row;
  }

  private closeModal(): void {
    this.modal.classList.add('hidden');
    this.modal.replaceChildren();
  }

  // ------------------------------------------------------------------ menu

  private openMenu(): void {
    const w = this.world();
    this.modal.replaceChildren();
    this.modal.classList.remove('hidden');
    const card = h('div', 'modal-card');
    const head = h('div', 'wizard-head');
    head.append(h('strong', '', 'Menu'), this.button('btn icon small', '✕', () => this.closeModal()));
    card.append(head);
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

  /** Rafraîchissement throttlé (≈ 4 Hz) : l'UI DOM n'a pas besoin de suivre le 60 fps. */
  update(): void {
    const w = this.world();
    const inTutorial = !w.tutorial.done;
    this.moneyEl.textContent = moneyInt(w.money);
    this.stageEl.textContent = EXPANSIONS[w.expansion]!.name;
    const r = w.activeRecipe;
    this.brewBtn.hidden = !r && inTutorial;
    this.brewBtn.textContent = r ? `${w.production.running ? '▶' : '⏸'} ${r.name}` : '🍺 Brassin';
    const next = EXPANSIONS[w.expansion + 1];
    this.expandBtn.hidden = inTutorial;
    this.expandBtn.textContent = next ? `Agrandir · ${moneyInt(next.cost)}` : 'Taille max';
    this.expandBtn.disabled = !next || w.money < next.cost;
    this.speedBtn.textContent = `×${this.cb.getSpeed()}`;
    const tool = this.input.tool;
    if (tool.kind === 'build' && !this.available().includes(tool.type)) this.setTool({ kind: 'none' });
    this.buildPalette();
    this.updateMentor(w);
    const top = this.top.getBoundingClientRect().bottom + 8;
    this.inspector.style.top = `${top}px`;
    this.inspector.style.maxHeight = `${Math.max(160, this.bottomInset - top - 8)}px`;
    this.root.style.setProperty('--toolbar-h', `${this.toolbar.getBoundingClientRect().height}px`);
    this.updateInspector(w);
  }

  // ------------------------------------------------------------------ événements

  onEvent(e: GameEvent): void {
    const w = this.world();
    if (e.type === 'batchLost') this.toast(`Lot perdu : ${e.reason}`, 'bad');
    if (e.type === 'broken') this.toast('Un tuyau a cédé sous la pression !', 'bad');
    if (e.type === 'expanded') this.toast(`Nouvel espace : ${EXPANSIONS[e.level]!.name}`, 'good');
    if (e.type === 'crateDelivered') this.toast(`Caisse livrée au bar : +${money(e.price)}`, 'good');
    if (e.type === 'unlocked' && w.tutorial.done && w.stats.crates > 0 && e.buildings.length < 6) {
      this.toast(`Nouveau : ${e.buildings.map((t) => BUILDINGS[t as BuildingType].name).join(', ')}`, 'good');
    }
    if (e.type === 'tutorialStep' || e.type === 'tutorialDone') {
      this.mentorKey = '';
      this.paletteKey = '';
      this.inspectorKey = '';
      if (e.type === 'tutorialDone') this.cb.setSpeed(1);
      if (currentStep(w)?.places) this.select(null);
    }
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = h('div', `toast ${kind}`, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  get topInset(): number {
    return this.top.getBoundingClientRect().bottom;
  }

  get bottomInset(): number {
    const el = this.mentor.classList.contains('hidden') ? this.toolbar : this.mentor;
    return el.getBoundingClientRect().top;
  }
}
