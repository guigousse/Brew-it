import { BUILDINGS, type BuildingType } from '../core/content/buildings';
import type { Dir } from '../core/dir';
import type { World } from '../core/world';
import type { GameRenderer } from '../render/renderer';

export type Tool = { kind: 'none' } | { kind: 'build'; type: BuildingType } | { kind: 'delete' };

interface Callbacks {
  onSelect(id: number | null): void;
  onBuilt(count: number, failedReason?: string): void;
}

const TAP_SLOP = 8; // px avant de considérer qu'un doigt glisse

/**
 * Gestes tactiles :
 * - 1 doigt, sans outil : glisser = déplacer la caméra, toucher = sélectionner un bâtiment.
 * - 1 doigt, outil construction : glisser = tracer une ligne (convoyeurs/tuyaux orientés dans le sens du geste).
 * - 1 doigt, outil démolition : toucher / glisser = démolir.
 * - 2 doigts : pincer = zoomer, glisser = déplacer (dans tous les modes).
 */
export class InputController {
  tool: Tool = { kind: 'none' };
  rot: Dir = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private start: { sx: number; sy: number; tx: number; ty: number } | null = null;
  private moved = false;
  private pinch: { dist: number; mx: number; my: number } | null = null;

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
  }

  private local(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      const t = this.renderer.camera.screenToTile(p.x, p.y);
      this.start = { sx: p.x, sy: p.y, tx: t.x, ty: t.y };
      this.moved = false;
      if (this.tool.kind === 'build') this.updateGhost(t.x, t.y);
      if (this.tool.kind === 'delete') this.demolish(t.x, t.y);
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
        this.updateGhost(t.x, t.y);
        break;
      case 'delete':
        this.demolish(t.x, t.y);
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
    if (this.tool.kind === 'none' && !this.moved) {
      this.cb.onSelect(this.world().at(this.start.tx, this.start.ty)?.id ?? null);
    } else if (this.tool.kind === 'build' && this.renderer.ghost) {
      this.commitGhost();
    }
    this.start = null;
  };

  private cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.start = null;
    this.pinch = null;
    this.renderer.ghost = null;
  };

  private pinchState() {
    const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  /** Ligne droite (axe dominant) entre le point de départ et le doigt, orientée dans le sens du tracé. */
  private updateGhost(tx: number, ty: number): void {
    if (this.tool.kind !== 'build' || !this.start) return;
    const type = this.tool.type;
    const def = BUILDINGS[type];
    const dx = tx - this.start.tx;
    const dy = ty - this.start.ty;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const len = horizontal ? Math.abs(dx) : Math.abs(dy);
    const step = def.size;
    let rot = this.rot;
    if (def.rotatable && len > 0) rot = (horizontal ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3) as Dir;
    const sx = Math.sign(horizontal ? dx : 0);
    const sy = Math.sign(horizontal ? 0 : dy);
    const tiles = [];
    for (let i = 0; i <= len; i += step) tiles.push({ x: this.start.tx + sx * i, y: this.start.ty + sy * i, rot });
    const w = this.world();
    const checks = tiles.map((t) => w.checkPlace(type, t.x, t.y));
    const cost = checks.reduce((sum, c) => sum + c.cost, 0);
    const valid = checks.every((c) => c.ok) && w.money >= cost;
    this.renderer.ghost = { type, tiles, valid };
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

  private demolish(tx: number, ty: number): void {
    const b = this.world().at(tx, ty);
    if (b) this.world().remove(b.id);
  }
}
