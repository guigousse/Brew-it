import { BUILDINGS, type BuildingType } from '../core/content/buildings';
import type { Dir } from '../core/dir';
import type { World } from '../core/world';
import { TILE } from '../render/camera';
import { ICON_RADIUS, iconAnchor, type GameRenderer } from '../render/renderer';

export type Tool =
  | { kind: 'none' }
  | { kind: 'build'; type: BuildingType }
  | { kind: 'delete' }
  | { kind: 'move'; id: number };

interface Callbacks {
  onSelect(id: number | null): void;
  onBuilt(count: number, failedReason?: string): void;
  onBuy(buildingId: number): void;
  onDeleteSelectionChanged(): void;
  onMoved(ok: boolean, reason?: string): void;
}

const TAP_SLOP = 8; // px avant de considérer qu'un doigt glisse
type Tile = { x: number; y: number };

const dirBetween = (a: Tile, b: Tile): Dir => (b.x > a.x ? 0 : b.x < a.x ? 2 : b.y > a.y ? 1 : 3);

/**
 * Gestes tactiles :
 * - 1 doigt, sans outil : glisser = déplacer la caméra ; toucher = icône « + » ou sélection d'un bâtiment.
 * - Construction : tapis et tuyaux suivent le doigt case par case (virages compris) ; les machines suivent le doigt.
 * - Suppression : toucher / glisser marque les bâtiments en rouge (confirmation dans la barre d'outils).
 * - Déplacement : le bâtiment suit le doigt, on le pose en relâchant.
 * - 2 doigts : pincer = zoomer, glisser = déplacer (dans tous les modes).
 */
export class InputController {
  tool: Tool = { kind: 'none' };
  rot: Dir = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private start: { sx: number; sy: number; tx: number; ty: number } | null = null;
  private moved = false;
  private pinch: { dist: number; mx: number; my: number } | null = null;
  /** Chemin tracé au doigt (tapis / tuyaux). */
  private path: Tile[] = [];
  private lastMark = '';

  constructor(
    private el: HTMLElement,
    private renderer: GameRenderer,
    private world: () => World,
    private cb: Callbacks,
  ) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.renderer.camera.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY);
    }, { passive: false });
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.renderer.ghost = null;
    this.renderer.moveGhost = null;
    if (tool.kind !== 'delete') this.renderer.deleteSet.clear();
  }

  private local(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private isPathTool(): boolean {
    if (this.tool.kind !== 'build') return false;
    const def = BUILDINGS[this.tool.type];
    return def.rotatable && def.size === 1;
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      const t = this.renderer.camera.screenToTile(p.x, p.y);
      this.start = { sx: p.x, sy: p.y, tx: t.x, ty: t.y };
      this.moved = false;
      this.path = [t];
      this.refreshGhost(t);
      if (this.tool.kind === 'delete') this.mark(p, true);
    } else if (this.pointers.size === 2) {
      this.start = null; // un 2e doigt annule le geste en cours
      this.renderer.ghost = null;
      this.pinch = this.pinchState();
    }
  };

  private move = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 2 && this.pinch) {
      const next = this.pinchState();
      this.renderer.camera.pan(next.mx - this.pinch.mx, next.my - this.pinch.my);
      this.renderer.camera.zoomAt(next.dist / Math.max(this.pinch.dist, 1), next.mx, next.my);
      this.pinch = next;
      return;
    }
    if (!this.start) return;
    if (Math.hypot(p.x - this.start.sx, p.y - this.start.sy) > TAP_SLOP) this.moved = true;
    const t = this.renderer.camera.screenToTile(p.x, p.y);
    switch (this.tool.kind) {
      case 'none':
        if (this.moved) this.renderer.camera.pan(p.x - prev.x, p.y - prev.y);
        break;
      case 'build':
        if (this.isPathTool()) this.extendPath(t);
        this.refreshGhost(t);
        break;
      case 'move':
        this.refreshGhost(t);
        break;
      case 'delete':
        this.mark(p, false);
        break;
    }
  };

  private up = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2 && this.pinch) {
      this.pinch = null;
      this.renderer.camera.snapZoom();
    }
    if (!this.start || this.pointers.size > 0) return;
    const p = this.local(e);
    if (this.tool.kind === 'none' && !this.moved) this.tap(p);
    else if (this.tool.kind === 'build' && this.renderer.ghost) this.commitGhost();
    else if (this.tool.kind === 'move' && this.renderer.moveGhost) {
      const g = this.renderer.moveGhost;
      const r = this.world().move(g.id, g.x, g.y);
      this.renderer.moveGhost = null;
      this.cb.onMoved(r.ok, r.reason);
    }
    this.start = null;
  };

  private cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.start = null;
    this.pinch = null;
    this.renderer.ghost = null;
    this.renderer.moveGhost = null;
  };

  /** Toucher simple : une icône « + » en priorité, sinon la sélection d'un bâtiment. */
  private tap(p: { x: number; y: number }): void {
    const cam = this.renderer.camera;
    const wx = (p.x - cam.x) / cam.zoom;
    const wy = (p.y - cam.y) / cam.zoom;
    const w = this.world();
    // Tolérance au doigt : au moins ~22 px écran autour de l'icône.
    const radius = Math.max(ICON_RADIUS + 2, 22 / cam.zoom);
    for (const n of this.renderer.needs) {
      const b = w.buildings.get(n.buildingId);
      if (!b) continue;
      const a = iconAnchor(b);
      if (Math.hypot(wx - a.x, wy - a.y) <= radius) {
        this.cb.onBuy(b.id);
        return;
      }
    }
    this.cb.onSelect(this.renderer.hitTest(wx, wy)?.id ?? w.at(Math.floor(wx / TILE), Math.floor(wy / TILE))?.id ?? null);
  }

  private pinchState() {
    const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  /** Le chemin suit le doigt case par case ; revenir en arrière efface la dernière case. */
  private extendPath(t: Tile): void {
    const last = this.path[this.path.length - 1]!;
    if (last.x === t.x && last.y === t.y) return;
    const prev = this.path[this.path.length - 2];
    if (prev && prev.x === t.x && prev.y === t.y) {
      this.path.pop();
      return;
    }
    // Doigt rapide : on comble l'écart en L (horizontal puis vertical).
    let cur = { ...last };
    while (cur.x !== t.x || cur.y !== t.y) {
      if (cur.x !== t.x) cur = { x: cur.x + Math.sign(t.x - cur.x), y: cur.y };
      else cur = { x: cur.x, y: cur.y + Math.sign(t.y - cur.y) };
      if (this.path.some((q) => q.x === cur.x && q.y === cur.y)) continue; // pas de boucle
      this.path.push(cur);
    }
  }

  private refreshGhost(t: Tile): void {
    const w = this.world();
    if (this.tool.kind === 'move') {
      const b = w.buildings.get(this.tool.id);
      if (!b) return;
      const size = BUILDINGS[b.type].size;
      const x = t.x - Math.floor((size - 1) / 2);
      const y = t.y - Math.floor((size - 1) / 2);
      const valid = canMoveTo(w, b.id, x, y, size);
      this.renderer.moveGhost = { id: b.id, x, y, valid };
      return;
    }
    if (this.tool.kind !== 'build') return;
    const type = this.tool.type;
    let tiles: { x: number; y: number; rot: Dir }[];
    if (this.isPathTool()) {
      // Chaque case pointe vers la suivante ; la dernière garde la direction du dernier segment.
      tiles = this.path.map((q, i) => {
        const next = this.path[i + 1];
        const before = this.path[i - 1];
        const rot = next ? dirBetween(q, next) : before ? dirBetween(before, q) : this.rot;
        return { ...q, rot };
      });
    } else {
      const size = BUILDINGS[type].size;
      tiles = [{ x: t.x - Math.floor((size - 1) / 2), y: t.y - Math.floor((size - 1) / 2), rot: this.rot }];
    }
    const checks = tiles.map((q) => (w.at(q.x, q.y) ? { ok: true, cost: 0 } : w.checkPlace(type, q.x, q.y)));
    const cost = checks.reduce((sum, c) => sum + c.cost, 0);
    this.renderer.ghost = { type, tiles, valid: checks.every((c) => c.ok) && w.money >= cost };
  }

  private commitGhost(): void {
    const ghost = this.renderer.ghost!;
    this.renderer.ghost = null;
    const w = this.world();
    let count = 0;
    let reason: string | undefined;
    for (const t of ghost.tiles) {
      if (w.at(t.x, t.y)) continue; // en glissant, on peut repasser sur une case déjà construite
      const r = w.place(ghost.type, t.x, t.y, t.rot);
      if (r.ok) count++;
      else reason = r.reason;
    }
    if (count > 0 && BUILDINGS[ghost.type].rotatable) this.rot = ghost.tiles[ghost.tiles.length - 1]!.rot;
    this.cb.onBuilt(count, reason);
  }

  /** Mode suppression : toucher bascule la marque rouge ; glisser ajoute des bâtiments. */
  private mark(p: { x: number; y: number }, toggle: boolean): void {
    const cam = this.renderer.camera;
    const wx = (p.x - cam.x) / cam.zoom;
    const wy = (p.y - cam.y) / cam.zoom;
    const b = this.renderer.hitTest(wx, wy);
    const key = b ? String(b.id) : '';
    if (!toggle && key === this.lastMark) return;
    this.lastMark = key;
    if (!b) return;
    if (!toggle && this.renderer.deleteSet.has(b.id)) return;
    const set = this.renderer.deleteSet;
    if (toggle && set.has(b.id)) set.delete(b.id);
    else set.add(b.id);
    this.cb.onDeleteSelectionChanged();
  }
}

function canMoveTo(w: World, id: number, x: number, y: number, size: number): boolean {
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      if (!w.grid.isUnlocked(x + i, y + j)) return false;
      const occ = w.grid.get(x + i, y + j);
      if (occ !== 0 && occ !== id) return false;
    }
  return true;
}
