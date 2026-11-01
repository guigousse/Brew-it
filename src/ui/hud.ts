import { Alert, type Building } from '../core/building';
import { BUILDINGS, type BuildingType, type Category } from '../core/content/buildings';
import { EXPANSIONS } from '../core/content/expansions';
import { FLUIDS } from '../core/content/fluids';
import { PARAMS } from '../core/content/params';
import type { GameEvent } from '../core/events';
import type { World } from '../core/world';
import type { InputController } from './input';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'transport', label: 'Flux' },
  { id: 'supply', label: 'Appro' },
  { id: 'brewing', label: 'Brassage' },
  { id: 'sales', label: 'Vente' },
];

const ALERT_LABELS: [number, string][] = [
  [Alert.Broken, 'En panne — à réparer'],
  [Alert.BatchLost, 'Lot perdu'],
  [Alert.Overpressure, 'Surpression !'],
  [Alert.Overheat, 'Température hors plage de la levure'],
  [Alert.OutputBlocked, 'Sortie bloquée'],
  [Alert.NoInput, 'En attente d\'approvisionnement'],
  [Alert.MixedFluids, 'Fluides incompatibles'],
  [Alert.NoMoney, 'Fonds insuffisants'],
];

const PHASES: Record<string, string> = {
  idle: 'Inactif', filling: 'Remplissage', heating: 'Chauffe', processing: 'En cours', blocked: 'Bloqué', failed: 'Échec',
};

const money = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

/** Interface DOM superposée au canvas. Vanilla TS pour l'instant (cf. docs/ARCHITECTURE.md §UI). */
export class Hud {
  private top = h('div', 'topbar');
  private moneyEl = h('span', 'money');
  private stageEl = h('span', 'stage');
  private trendEl = h('span', 'trend');
  private expandBtn = h('button', 'btn small');
  private toolbar = h('div', 'toolbar');
  private palette = h('div', 'palette');
  private inspector = h('div', 'inspector hidden');
  private toasts = h('div', 'toasts');
  private category: Category = 'transport';
  selectedId: number | null = null;
  private inspectorKey = '';

  constructor(
    private root: HTMLElement,
    private world: () => World,
    private input: InputController,
  ) {
    this.top.append(this.moneyEl, this.stageEl, this.trendEl, this.expandBtn);
    this.expandBtn.onclick = () => {
      const r = this.world().expand();
      if (!r.ok) this.toast(r.reason!, 'bad');
    };
    root.append(this.top, this.inspector, this.toasts, this.toolbar);
    this.buildToolbar();
  }

  private buildToolbar(): void {
    this.toolbar.replaceChildren();
    const tabs = h('div', 'tabs');
    for (const c of CATEGORIES) {
      const t = h('button', `tab${c.id === this.category ? ' active' : ''}`, c.label);
      t.onclick = () => {
        this.category = c.id;
        this.buildToolbar();
      };
      tabs.append(t);
    }
    const actions = h('div', 'actions');
    const rotate = h('button', 'btn icon', '⟳');
    rotate.title = 'Pivoter';
    rotate.onclick = () => (this.input.rot = ((this.input.rot + 1) % 4) as 0 | 1 | 2 | 3);
    const del = h('button', `btn icon${this.input.tool.kind === 'delete' ? ' active' : ''}`, '🗑');
    del.onclick = () => this.setTool(this.input.tool.kind === 'delete' ? { kind: 'none' } : { kind: 'delete' });
    const cancel = h('button', 'btn icon', '✕');
    cancel.onclick = () => this.setTool({ kind: 'none' });
    actions.append(rotate, del, cancel);

    this.palette.replaceChildren();
    for (const [type, def] of Object.entries(BUILDINGS) as [BuildingType, (typeof BUILDINGS)[BuildingType]][]) {
      if (def.category !== this.category) continue;
      const active = this.input.tool.kind === 'build' && this.input.tool.type === type;
      const btn = h('button', `tool${active ? ' active' : ''}`);
      const sw = h('span', 'swatch');
      sw.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
      btn.append(sw, h('span', 'name', def.name), h('span', 'cost', money(def.cost)));
      btn.onclick = () => this.setTool(active ? { kind: 'none' } : { kind: 'build', type });
      this.palette.append(btn);
    }
    this.toolbar.append(tabs, this.palette, actions);
  }

  private setTool(tool: InputController['tool']): void {
    this.input.setTool(tool);
    if (tool.kind !== 'none') this.select(null);
    this.buildToolbar();
  }

  select(id: number | null): void {
    this.selectedId = id;
    this.inspectorKey = '';
  }

  /** Rafraîchissement throttlé (≈ 4 Hz) : l'UI DOM n'a pas besoin de suivre le 60 fps. */
  update(): void {
    const w = this.world();
    this.moneyEl.textContent = money(w.money);
    this.stageEl.textContent = EXPANSIONS[w.expansion]!.name;
    this.trendEl.textContent = `Tendance : ${w.market.trend.name}`;
    const next = EXPANSIONS[w.expansion + 1];
    this.expandBtn.textContent = next ? `Agrandir → ${next.name} (${money(next.cost)})` : 'Taille max';
    this.expandBtn.disabled = !next || w.money < next.cost;
    this.inspector.style.top = `${this.top.getBoundingClientRect().bottom + 8}px`;
    this.updateInspector(w);
  }

  private updateInspector(w: World): void {
    const b = this.selectedId != null ? w.buildings.get(this.selectedId) : undefined;
    this.inspector.classList.toggle('hidden', !b);
    if (!b) return;
    const def = BUILDINGS[b.type];
    // On ne reconstruit les curseurs que si la sélection change (sinon on casserait le glisser en cours).
    if (this.inspectorKey !== `${b.id}`) {
      this.inspectorKey = `${b.id}`;
      this.inspector.replaceChildren();
      const head = h('div', 'insp-head');
      head.append(h('strong', '', def.name));
      const close = h('button', 'btn icon small', '✕');
      close.onclick = () => this.select(null);
      head.append(close);
      this.inspector.append(head, h('div', 'insp-status'));
      const params = h('div', 'params');
      for (const key of Object.keys(b.params)) params.append(this.paramControl(w, b, key));
      const actions = h('div', 'insp-actions');
      if (def.rotatable) {
        const r = h('button', 'btn small', 'Pivoter');
        r.onclick = () => w.rotate(b.id);
        actions.append(r);
      }
      const repair = h('button', 'btn small', 'Réparer');
      repair.onclick = () => {
        const r = w.repair(b.id);
        if (!r.ok) this.toast(r.reason!, 'bad');
      };
      const demolish = h('button', 'btn small bad', 'Démolir');
      demolish.onclick = () => {
        w.remove(b.id);
        this.select(null);
      };
      actions.append(repair, demolish);
      this.inspector.append(params, actions);
    }
    const status = this.inspector.querySelector('.insp-status')!;
    status.replaceChildren(...this.statusLines(w, b).map((l) => h('div', l.cls, l.text)));
  }

  private statusLines(w: World, b: Building): { text: string; cls: string }[] {
    const lines: { text: string; cls: string }[] = [];
    const def = BUILDINGS[b.type];
    if (b.machine) {
      const m = b.machine;
      const pct = m.duration > 0 ? ` ${Math.round((100 * m.timer) / m.duration)} %` : '';
      lines.push({ text: `${PHASES[m.phase]}${m.phase === 'processing' ? pct : ''}${m.temp != null && m.phase !== 'filling' ? ` · ${m.temp.toFixed(0)} °C` : ''}`, cls: 'line' });
    }
    for (const [tank, label] of [[b.fluidIn, 'Entrée'], [b.fluid, 'Contenu']] as const) {
      if (tank?.fluid) lines.push({ text: `${label} : ${FLUIDS[tank.fluid].name} ${tank.amount.toFixed(1)} L · ${tank.temp.toFixed(0)} °C`, cls: 'line' });
    }
    const batch = w.batches.get(b.fluid?.batch ?? b.machine?.batch ?? null);
    if (batch && batch.og > 0) {
      lines.push({ text: `Lot : DI ${(1 + batch.og / 1000).toFixed(3)} · ${batch.ibu.toFixed(0)} IBU · ${batch.abv.toFixed(1)} % · fruité ${(batch.fruity * 100).toFixed(0)} · qualité ${(batch.quality * 100).toFixed(0)} %`, cls: 'line dim' });
    }
    lines.push({ text: `Santé ${Math.round((100 * b.health) / def.maxHealth)} %`, cls: 'line dim' });
    for (const [flag, label] of ALERT_LABELS) if (b.alerts & flag) lines.push({ text: `⚠ ${label}`, cls: 'line alert' });
    return lines;
  }

  private paramControl(w: World, b: Building, key: string): HTMLElement {
    const meta = PARAMS[key];
    const row = h('label', 'param');
    if (!meta) return row;
    const value = h('span', 'pval');
    row.append(h('span', 'plabel', meta.label), value);
    if (meta.kind === 'range') {
      const input = h('input');
      Object.assign(input, { type: 'range', min: meta.min, max: meta.max, step: meta.step, value: String(b.params[key]) });
      const show = () => (value.textContent = `${input.value} ${meta.unit}`);
      input.oninput = () => {
        w.setParam(b.id, key, Number(input.value));
        show();
      };
      show();
      row.append(input);
    } else {
      const sel = h('select');
      for (const o of meta.options) {
        const opt = h('option', '', o.label);
        opt.value = o.value;
        sel.append(opt);
      }
      sel.value = String(b.params[key]);
      sel.onchange = () => w.setParam(b.id, key, sel.value);
      row.append(sel);
    }
    return row;
  }

  onEvent(e: GameEvent): void {
    if (e.type === 'batchLost') this.toast(`Lot perdu : ${e.reason}`, 'bad');
    if (e.type === 'broken') this.toast('Un tuyau a cédé sous la pression !', 'bad');
    if (e.type === 'expanded') this.toast(`Nouvel espace : ${EXPANSIONS[e.level]!.name}`, 'good');
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = h('div', `toast ${kind}`, text);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3500);
  }
}
