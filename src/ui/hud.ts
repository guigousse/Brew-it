import { Alert, type Building } from '../core/building';
import { BUILDINGS, type BuildingType, type Category } from '../core/content/buildings';
import { EXPANSIONS } from '../core/content/expansions';
import { CHOICES } from '../core/content/params';
import { describe } from '../core/describe';
import type { GameEvent } from '../core/events';
import { TUTORIAL_STEPS } from '../core/tutorial/steps';
import { currentStep, skipTutorial, stepText, tutorialPalette } from '../core/tutorial/tutorial';
import type { World } from '../core/world';
import { drawGaston } from './gaston';
import type { InputController } from './input';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'supply', label: 'Appro' },
  { id: 'brewing', label: 'Brassage' },
  { id: 'transport', label: 'Flux' },
  { id: 'sales', label: 'Vente' },
];

const ALERT_LABELS: [number, string][] = [
  [Alert.Broken, 'En panne : touche « Réparer »'],
  [Alert.BatchLost, 'Lot perdu'],
  [Alert.Overpressure, 'Surpression !'],
  [Alert.OutputBlocked, 'Sortie bloquée : rien ne peut récupérer ce qui sort'],
  [Alert.MixedFluids, 'Deux liquides différents se rencontrent'],
  [Alert.NoMoney, 'Plus assez d\'argent pour acheter'],
];

const money = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

export interface HudCallbacks {
  setSpeed(speed: number): void;
  getSpeed(): number;
  newGame(): void;
  layoutChanged(): void;
}

/** Interface DOM superposée au canvas : barre du haut, Gaston, palette, inspecteur, menu. */
export class Hud {
  private top = h('div', 'topbar');
  private moneyEl = h('span', 'money');
  private stageEl = h('span', 'stage');
  private trendEl = h('span', 'trend');
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
  private menu = h('div', 'menu hidden');
  private toasts = h('div', 'toasts');
  private category: Category = 'supply';
  selectedId: number | null = null;
  private inspectorKey = '';
  private mentorKey = '';
  private paletteKey = '';

  constructor(
    private root: HTMLElement,
    private world: () => World,
    private input: InputController,
    private cb: HudCallbacks,
  ) {
    this.top.append(this.moneyEl, this.stageEl, this.trendEl, this.expandBtn, this.speedBtn, this.menuBtn);
    this.expandBtn.onclick = () => {
      const r = this.world().expand();
      if (!r.ok) this.toast(r.reason!, 'bad');
    };
    this.speedBtn.onclick = () => this.cb.setSpeed(({ 1: 2, 2: 4, 4: 1 } as Record<number, number>)[this.cb.getSpeed()] ?? 1);
    this.menuBtn.onclick = () => this.toggleMenu();
    const avatar = h('canvas', 'mentor-avatar');
    drawGaston(avatar);
    const body = h('div', 'mentor-body');
    const head = h('div', 'mentor-head');
    head.append(h('strong', 'mentor-name', 'Gaston'), this.mentorChapter);
    body.append(head, this.mentorText, this.mentorActions);
    this.mentor.append(avatar, body);
    this.toolbar.append(this.tabs, this.palette, this.actions);
    root.append(this.top, this.inspector, this.toasts, this.mentor, this.toolbar, this.menu);
    this.buildActions();
    this.update();
  }

  // ------------------------------------------------------------------ palette

  /** Bâtiments proposés : ceux de l'étape du tutoriel, sinon ceux débloqués. */
  private available(): BuildingType[] {
    const w = this.world();
    return w.tutorial.done ? w.unlocked : tutorialPalette(w);
  }

  private buildPalette(): void {
    const w = this.world();
    const types = this.available();
    const tool = this.input.tool;
    // Le tutoriel ouvre l'onglet du bâtiment demandé.
    if (!w.tutorial.done && types[0]) this.category = BUILDINGS[types[0]].category;
    const key = `${types.join()}|${this.category}|${tool.kind === 'build' ? tool.type : tool.kind}|${w.tutorial.done}`;
    if (key === this.paletteKey) return;
    this.paletteKey = key;

    this.tabs.replaceChildren();
    for (const c of CATEGORIES) {
      if (!types.some((t) => BUILDINGS[t].category === c.id)) continue;
      const t = h('button', `tab${c.id === this.category ? ' active' : ''}`, c.label);
      t.onclick = () => {
        this.category = c.id;
        this.paletteKey = '';
        this.buildPalette();
      };
      this.tabs.append(t);
    }
    this.palette.replaceChildren();
    if (!types.length) this.palette.append(h('span', 'palette-empty', w.tutorial.done ? '' : 'Écoute Gaston…'));
    for (const type of types) {
      const def = BUILDINGS[type];
      if (def.category !== this.category) continue;
      const active = tool.kind === 'build' && tool.type === type;
      const btn = h('button', `tool${active ? ' active' : ''}${!w.tutorial.done && !active ? ' pulse' : ''}`);
      const sw = h('span', 'swatch');
      sw.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
      btn.append(sw, h('span', 'name', def.name), h('span', 'cost', w.tutorial.done ? money(def.cost) : 'Offert'));
      btn.onclick = () => this.setTool(active ? { kind: 'none' } : { kind: 'build', type });
      this.palette.append(btn);
    }
    this.buildActions();
  }

  private buildActions(): void {
    this.actions.replaceChildren();
    const tool = this.input.tool;
    if (tool.kind === 'build' && BUILDINGS[tool.type].rotatable && this.world().tutorial.done) {
      const rotate = h('button', 'btn icon', '⟳');
      rotate.title = 'Pivoter';
      rotate.onclick = () => (this.input.rot = ((this.input.rot + 1) % 4) as 0 | 1 | 2 | 3);
      this.actions.append(rotate);
    }
    if (this.world().tutorial.done) {
      const del = h('button', `btn icon${tool.kind === 'delete' ? ' active' : ''}`, '🗑');
      del.title = 'Démolir';
      del.onclick = () => this.setTool(tool.kind === 'delete' ? { kind: 'none' } : { kind: 'delete' });
      this.actions.append(del);
    }
    if (tool.kind !== 'none') {
      const cancel = h('button', 'btn icon', '✕');
      cancel.onclick = () => this.setTool({ kind: 'none' });
      this.actions.append(cancel);
    }
  }

  setTool(tool: InputController['tool']): void {
    this.input.setTool(tool);
    if (tool.kind !== 'none') this.select(null);
    this.paletteKey = '';
    this.buildPalette();
  }

  // ------------------------------------------------------------------ sélection / inspecteur

  select(id: number | null): void {
    this.selectedId = id;
    this.inspectorKey = '';
    const b = id != null ? this.world().buildings.get(id) : undefined;
    if (b) this.world().signal(`open:${b.type}`);
  }

  private updateInspector(w: World): void {
    const b = this.selectedId != null ? w.buildings.get(this.selectedId) : undefined;
    this.inspector.classList.toggle('hidden', !b);
    if (!b) return;
    const def = BUILDINGS[b.type];
    const step = currentStep(w);
    const focusChoice = step?.signal?.startsWith('choice:') ? step.signal.slice(7) : null;
    const key = `${b.id}|${JSON.stringify(b.params)}|${focusChoice}|${w.tutorial.done}`;
    if (this.inspectorKey !== key) {
      this.inspectorKey = key;
      this.inspector.replaceChildren();
      const head = h('div', 'insp-head');
      head.append(h('strong', '', def.name));
      const close = h('button', 'btn icon small', '✕');
      close.onclick = () => this.select(null);
      head.append(close);
      this.inspector.append(head, h('p', 'insp-desc', def.description), h('div', 'insp-status'));
      for (const k of Object.keys(b.params)) {
        const meta = CHOICES[k];
        // Les livraisons du tutoriel gardent leur ingrédient.
        if (!meta || (k === 'item' && !w.tutorial.done)) continue;
        this.inspector.append(this.choiceControl(w, b, k, focusChoice === k));
      }
      const actions = h('div', 'insp-actions');
      if (def.rotatable && w.tutorial.done) {
        const r = h('button', 'btn small', 'Pivoter');
        r.onclick = () => w.rotate(b.id);
        actions.append(r);
      }
      if (b.health < def.maxHealth) {
        const repair = h('button', 'btn small', 'Réparer');
        repair.onclick = () => {
          const r = w.repair(b.id);
          if (!r.ok) this.toast(r.reason!, 'bad');
        };
        actions.append(repair);
      }
      if (w.tutorial.done) {
        const demolish = h('button', 'btn small bad', 'Démolir');
        demolish.onclick = () => {
          w.remove(b.id);
          this.select(null);
        };
        actions.append(demolish);
      }
      if (actions.childElementCount) this.inspector.append(actions);
      // Fait défiler jusqu'au choix que Gaston demande.
      this.inspector.querySelector('.choice.pulse')?.scrollIntoView({ block: 'nearest' });
    }
    // Partie dynamique : état, progression, besoins, alertes.
    const info = describe(w, b);
    const status = this.inspector.querySelector('.insp-status')!;
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
    status.replaceChildren(...rows);
  }

  /** Un choix de brasseur : 2 ou 3 grosses cartes, l'option active mise en avant. */
  private choiceControl(w: World, b: Building, key: string, highlight: boolean): HTMLElement {
    const meta = CHOICES[key]!;
    const box = h('div', `choice${highlight ? ' pulse' : ''}`);
    box.append(h('div', 'choice-label', meta.label), h('div', 'choice-why', meta.why));
    const row = h('div', 'choice-options');
    for (const o of meta.options) {
      const active = b.params[key] === o.value;
      const btn = h('button', `option${active ? ' active' : ''}`);
      btn.append(h('span', 'option-label', o.label), h('span', 'option-hint', o.hint));
      btn.onclick = () => {
        w.setParam(b.id, key, o.value);
        w.signal(`choice:${key}`);
        this.inspectorKey = '';
      };
      row.append(btn);
    }
    box.append(row);
    return box;
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
    if (step.ack) {
      const next = h('button', 'btn primary', step.id === 'finale' ? 'Lancer ma brasserie !' : 'Continuer');
      next.onclick = () => w.signal(`ack:${step.id}`);
      this.mentorActions.append(next);
    }
    if (step.fastForward) {
      const fast = this.cb.getSpeed() > 1;
      const ff = h('button', `btn${fast ? ' active' : ''}`, fast ? `⏩ Vitesse ×${this.cb.getSpeed()}` : '⏩ Accélérer le temps');
      ff.onclick = () => this.cb.setSpeed(fast ? 1 : 4);
      this.mentorActions.append(ff);
    }
  }

  // ------------------------------------------------------------------ boucle

  /** Rafraîchissement throttlé (≈ 4 Hz) : l'UI DOM n'a pas besoin de suivre le 60 fps. */
  update(): void {
    const w = this.world();
    const inTutorial = !w.tutorial.done;
    this.moneyEl.textContent = money(w.money);
    this.stageEl.textContent = EXPANSIONS[w.expansion]!.name;
    this.trendEl.textContent = inTutorial ? '' : `Tendance : ${w.market.trend.name}`;
    const next = EXPANSIONS[w.expansion + 1];
    this.expandBtn.hidden = inTutorial;
    this.expandBtn.textContent = next ? `Agrandir · ${money(next.cost)}` : 'Taille max';
    this.expandBtn.disabled = !next || w.money < next.cost;
    this.speedBtn.textContent = `×${this.cb.getSpeed()}`;
    // Outil devenu inutile (étape du tutoriel franchie) : on le repose.
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

  // ------------------------------------------------------------------ menu

  private toggleMenu(): void {
    const open = this.menu.classList.toggle('hidden') === false;
    if (!open) return;
    const w = this.world();
    this.menu.replaceChildren(h('div', 'insp-head', 'Menu'));
    const list = h('div', 'menu-list');
    if (!w.tutorial.done) {
      const skip = h('button', 'btn', 'Passer le tutoriel');
      skip.onclick = () => {
        skipTutorial(w);
        this.menu.classList.add('hidden');
      };
      list.append(skip);
    }
    const fresh = h('button', 'btn bad', 'Nouvelle partie');
    fresh.onclick = () => {
      if (fresh.dataset.confirm) {
        this.menu.classList.add('hidden');
        this.cb.newGame();
        return;
      }
      fresh.dataset.confirm = '1';
      fresh.textContent = 'Sûr ? Ta brasserie actuelle sera effacée. Toucher pour confirmer';
    };
    const close = h('button', 'btn', 'Fermer');
    close.onclick = () => this.menu.classList.add('hidden');
    list.append(fresh, close);
    this.menu.append(list);
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
      // Une nouvelle construction est demandée : on referme l'inspecteur pour dégager la carte.
      if (currentStep(w)?.places) this.select(null);
    }
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = h('div', `toast ${kind}`, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3500);
  }

  /** Haut de la zone libre pour la carte, sous la barre du haut. */
  get topInset(): number {
    return this.top.getBoundingClientRect().bottom;
  }

  /** Bas de la zone libre : au-dessus de Gaston s'il parle, sinon de la barre d'outils. */
  get bottomInset(): number {
    const el = this.mentor.classList.contains('hidden') ? this.toolbar : this.mentor;
    return el.getBoundingClientRect().top;
  }

  get rootEl(): HTMLElement {
    return this.root;
  }
}
