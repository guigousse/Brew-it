import { Application, Container, Graphics, TextureStyle } from 'pixi.js';
import { Alert, type Building } from '../core/building';
import { BUILDINGS, type BuildingType } from '../core/content/buildings';
import { FLUIDS } from '../core/content/fluids';
import type { ItemId } from '../core/content/items';
import { DX, DY, opposite, type Dir } from '../core/dir';
import { ingredientNeeds, type IngredientNeed } from '../core/ingredients';
import { currentStep, pendingPlacements } from '../core/tutorial/tutorial';
import type { World } from '../core/world';
import { Camera, TILE } from './camera';

const C = {
  bg: 0x1a1423,
  floorA: 0x3b3246,
  floorB: 0x362e40,
  locked: 0x231c2b,
  lockedGrid: 0x2a2233,
  wall: 0x5a4a6a,
  outline: 0x1a1423,
  ok: 0x7ee081,
  bad: 0xe05a47,
  alert: 0xffcc33,
  danger: 0xff4d4d,
  copper: 0xc47f2c,
  copperDark: 0x7a4a1c,
  steel: 0xb9c2cc,
  steelDark: 0x6b7480,
  wood: 0xa8743c,
  woodDark: 0x6e4724,
  belt: 0x4a4458,
  beltEdge: 0x2b2433,
  pipe: 0x8a8fa3,
  pipeDark: 0x55596b,
};

export interface Ghost {
  type: BuildingType;
  tiles: { x: number; y: number; rot: Dir }[];
  valid: boolean;
}

/** Position (px monde) de l'icône « + » d'une machine : coin haut droit. */
export function iconAnchor(b: Building): { x: number; y: number } {
  const s = BUILDINGS[b.type].size * TILE;
  return { x: b.x * TILE + s - 3, y: b.y * TILE + 1 };
}
export const ICON_RADIUS = 7;

/**
 * Rendu procédural « pixel » : chaque bâtiment est dessiné avec des formes simples (cuves rondes,
 * flammes, bulles…) et s'anime selon son état. Remplaçable plus tard par des sprites Aseprite.
 */
export class GameRenderer {
  readonly app = new Application();
  readonly layer = new Container();
  camera!: Camera;
  private floor = new Graphics();
  private dynamic = new Graphics();
  private overlay = new Graphics();
  private floorKey = '';
  ghost: Ghost | null = null;
  /** Fantôme de déplacement : bâtiment déplacé et case visée. */
  moveGhost: { id: number; x: number; y: number; valid: boolean } | null = null;
  selectedId: number | null = null;
  /** Bâtiments marqués pour suppression (surbrillance rouge). */
  deleteSet = new Set<number>();
  needs: IngredientNeed[] = [];
  private t = 0;

  async init(host: HTMLElement): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      resizeTo: host, background: C.bg, antialias: false, roundPixels: true,
      resolution: Math.min(window.devicePixelRatio || 1, 3), autoDensity: true, preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.layer.addChild(this.floor, this.dynamic, this.overlay);
    this.app.stage.addChild(this.layer);
    this.camera = new Camera(this.layer);
  }

  draw(world: World): void {
    this.t = performance.now() / 1000;
    this.drawFloor(world);
    const g = this.dynamic.clear();
    // Les liaisons d'abord, pour que les machines recouvrent leurs embouts.
    for (const b of world.list) if (isLink(b)) this.drawLink(g, b, world);
    for (const b of world.list) if (!isLink(b)) this.drawMachine(g, b, world);
    for (const b of world.list) this.drawAlerts(g, b, world);
    this.needs = ingredientNeeds(world);
    this.drawOverlay(world);
  }

  // ------------------------------------------------------------------ sol

  private drawFloor(world: World): void {
    const { unlockedW: uw, unlockedH: uh, width, height } = world.grid;
    const key = `${uw}x${uh}`;
    if (key === this.floorKey) return;
    this.floorKey = key;
    const g = this.floor.clear();
    const vw = Math.min(width, uw + 6);
    const vh = Math.min(height, uh + 4);
    g.rect(0, 0, vw * TILE, vh * TILE).fill(C.locked);
    for (let x = 0; x <= vw; x++) g.rect(x * TILE, 0, 1, vh * TILE).fill(C.lockedGrid);
    for (let y = 0; y <= vh; y++) g.rect(0, y * TILE, vw * TILE, 1).fill(C.lockedGrid);
    for (let y = 0; y < uh; y++)
      for (let x = 0; x < uw; x++) {
        g.rect(x * TILE, y * TILE, TILE, TILE).fill((x + y) % 2 ? C.floorA : C.floorB);
        if ((x * 7 + y * 13) % 11 === 0) g.rect(x * TILE + 4, y * TILE + 9, 2, 1).fill(0x2f283a); // fissures du béton
      }
    g.rect(-2, -2, uw * TILE + 4, 2).fill(C.wall);
    g.rect(-2, uh * TILE, uw * TILE + 4, 2).fill(C.wall);
    g.rect(-2, 0, 2, uh * TILE).fill(C.wall);
    g.rect(uw * TILE, 0, 2, uh * TILE).fill(C.wall);
  }

  // ------------------------------------------------------------------ tapis & tuyaux

  /** D'où vient le flux d'un tapis/tuyau : l'arrière en priorité, sinon un côté (virage). */
  private entryDir(b: Building, world: World): Dir {
    const back = opposite(b.rot);
    const feeds = (d: Dir) => {
      const n = world.at(b.x + DX[d]!, b.y + DY[d]!);
      if (!n || n === world.front(b)) return false;
      if (isLink(n)) return n.rot === opposite(d) && sameKind(n, b);
      return b.belt ? !!n.itemsOut : !!n.fluid && !BUILDINGS[n.type].category.startsWith('transport');
    };
    if (feeds(back)) return back;
    for (const d of [((b.rot + 1) % 4) as Dir, ((b.rot + 3) % 4) as Dir]) if (feeds(d)) return d;
    return back;
  }

  private drawLink(g: Graphics, b: Building, world: World): void {
    const px = b.x * TILE;
    const py = b.y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const entry = this.entryDir(b, world);
    const exit = b.rot;
    const front = world.front(b);
    // L'embout dépasse dans la machine branchée devant : la liaison se voit clairement.
    const reach = front && !isLink(front) ? 3 : 0;
    const back = world.at(b.x + DX[entry]!, b.y + DY[entry]!);
    const reachIn = back && !isLink(back) ? 3 : 0;
    const w = b.belt ? 10 : 6;
    const seg = (d: Dir, len: number, color: number, width: number) => {
      const half = width / 2;
      const x0 = d === 2 ? cx - len : d === 0 ? cx : cx - half;
      const y0 = d === 3 ? cy - len : d === 1 ? cy : cy - half;
      const ww = d % 2 === 0 ? len : width;
      const hh = d % 2 === 0 ? width : len;
      g.rect(Math.round(x0), Math.round(y0), ww, hh).fill(color);
    };
    const path = (width: number, color: number) => {
      seg(entry, TILE / 2 + reachIn, color, width);
      seg(exit, TILE / 2 + reach, color, width);
      g.rect(cx - width / 2, cy - width / 2, width, width).fill(color);
    };

    if (b.belt) {
      path(w + 2, C.beltEdge);
      path(w, C.belt);
      // Chevrons animés le long du tapis
      const speed = (BUILDINGS[b.type] as { conveyor: { speed: number } }).conveyor.speed;
      const phase = (this.t * speed) % 1;
      for (let k = 0; k < 2; k++) {
        const p = (phase + k * 0.5) % 1;
        const pt = pointOnPath(entry, exit, p, cx, cy);
        g.rect(Math.round(pt.x) - 1, Math.round(pt.y) - 1, 2, 2).fill(0x6c6680);
      }
      for (const it of b.belt) {
        const pt = pointOnPath(entry, exit, it.pos, cx, cy);
        drawItem(g, it.item, pt.x, pt.y);
      }
      return;
    }

    // Tuyau : contour, corps métal, fluide visible au centre, brides aux raccords.
    path(w + 2, C.outline);
    path(w, b.type === 'pump' ? 0x3f6fa8 : b.type === 'cooler' ? 0x7ec8e3 : C.pipe);
    const f = b.fluid;
    if (f?.fluid && f.amount > 0.01) {
      const cap = (BUILDINGS[b.type] as { fluid: { capacity: number } }).fluid.capacity;
      g.alpha = 1;
      path(2, FLUIDS[f.fluid].color);
      if (f.amount / cap > 1.01) path(2, C.danger);
    }
    for (const d of [entry, exit]) {
      const ex = cx + DX[d]! * (TILE / 2 - 1);
      const ey = cy + DY[d]! * (TILE / 2 - 1);
      if (d % 2 === 0) g.rect(ex - 1, ey - 4, 2, 8).fill(C.pipeDark);
      else g.rect(ex - 4, ey - 1, 8, 2).fill(C.pipeDark);
    }
    if (b.type === 'cooler') {
      // ailettes
      for (let i = -1; i <= 1; i++) {
        if (exit % 2 === 1) g.rect(cx - 6, cy + i * 3, 12, 1).fill(0xdff4fb);
        else g.rect(cx + i * 3, cy - 6, 1, 12).fill(0xdff4fb);
      }
    }
    if (b.type === 'pump') {
      g.circle(cx, cy, 4).fill(0x2d5a8f).stroke({ width: 1, color: C.outline });
      g.rect(cx + DX[exit]! * 2 - 1, cy + DY[exit]! * 2 - 1, 2, 2).fill(0xffffff);
    }
  }

  // ------------------------------------------------------------------ machines

  private drawMachine(g: Graphics, b: Building, world: World): void {
    const def = BUILDINGS[b.type];
    const s = def.size * TILE;
    const px = b.x * TILE;
    const py = b.y * TILE;
    const cx = px + s / 2;
    const cy = py + s / 2;
    const m = b.machine;
    const busy = m?.phase === 'processing' || m?.phase === 'heating';
    const t = this.t;
    const shadow = () => g.ellipse(cx + 1, py + s - 2, s / 2 - 2, 3).fill({ color: 0x000000, alpha: 0.25 });

    switch (b.type) {
      case 'mill': {
        shadow();
        g.rect(px + 2, py + 5, 12, 10).fill(C.outline);
        g.rect(px + 3, py + 6, 10, 8).fill(0x8a6a4a);
        g.poly([px + 3, py + 1, px + 13, py + 1, px + 10, py + 6, px + 6, py + 6]).fill(C.wood).stroke({ width: 1, color: C.outline });
        const a = busy ? t * 6 : 0;
        g.circle(cx, py + 10, 4).fill(0x9a9aa6).stroke({ width: 1, color: C.outline });
        g.rect(Math.round(cx + Math.cos(a) * 3) - 0.5, Math.round(py + 10 + Math.sin(a) * 3) - 0.5, 1, 1).fill(C.outline);
        if (b.itemsIn?.length) g.rect(px + 6, py + 2, 4, 2).fill(0xd9a441); // malt dans la trémie
        break;
      }
      case 'mash_tun':
      case 'kettle': {
        shadow();
        const kettle = b.type === 'kettle';
        const r = s / 2 - 2;
        if (kettle && busy) {
          // flammes du brûleur
          for (let i = 0; i < 5; i++) {
            const fx = cx - 10 + i * 5;
            const h = 3 + Math.round(2 * Math.abs(Math.sin(t * 9 + i)));
            g.poly([fx - 2, py + s - 1, fx + 2, py + s - 1, fx, py + s - 1 - h]).fill(i % 2 ? 0xffb02e : 0xff6a1a);
          }
        }
        g.circle(cx, cy, r + 1).fill(C.outline);
        g.circle(cx, cy, r).fill(kettle ? 0xb5482c : C.copper);
        g.circle(cx, cy, r - 3).fill(kettle ? 0x7a2e1c : C.copperDark);
        const liquid = m?.phase === 'heating' || m?.phase === 'processing' || m?.phase === 'blocked'
          ? (kettle ? 0x9f8a2a : 0xc8892f)
          : b.fluidIn?.fluid ? FLUIDS[b.fluidIn.fluid].color : null;
        if (liquid) g.circle(cx, cy, r - 5).fill(liquid);
        if (!kettle && m?.phase === 'processing') {
          // brasseur (pale) qui tourne
          const a = t * 3;
          g.moveTo(cx - Math.cos(a) * (r - 6), cy - Math.sin(a) * (r - 6)).lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)).stroke({ width: 2, color: 0x5a3a18 });
        }
        if (kettle && m?.phase === 'processing') for (let i = 0; i < 4; i++) g.circle(cx - 5 + ((i * 7 + t * 4) % 10), cy - 3 + (i % 2) * 6, 1.5).fill(0x6dbb4a); // houblon
        if ((m?.temp ?? 0) > 60 && busy) this.steam(g, cx, py + 4, t);
        g.circle(cx, cy, r).stroke({ width: 1, color: 0xffffff, alpha: 0.18 });
        break;
      }
      case 'fermenter': {
        shadow();
        const r = s / 2 - 2;
        g.circle(cx, cy, r + 1).fill(C.outline);
        g.circle(cx, cy, r).fill(C.steel);
        g.circle(cx, cy, r - 4).fill(0xa3adb8);
        g.circle(cx, cy, r - 8).fill(C.steelDark); // cône
        g.circle(cx - 4, cy - 5, 3).fill(0xdfe5ea); // reflet
        g.circle(cx + 6, cy - 7, 2).fill(C.steelDark).stroke({ width: 1, color: C.outline }); // trou d'homme
        if (m?.phase === 'processing') {
          // bulles de fermentation qui montent
          for (let i = 0; i < 5; i++) {
            const p = (t * 0.7 + i / 5) % 1;
            g.circle(cx - 6 + i * 3, cy + 6 - p * 12, 1).fill({ color: 0xffffff, alpha: 1 - p });
          }
        }
        // jauge de niveau
        const fill = Math.min(1, ((b.fluidIn?.amount ?? 0) + (m?.phase === 'processing' ? 20 : 0) + (b.fluid?.amount ?? 0)) / 30);
        g.rect(px + s - 5, py + 6, 3, s - 12).fill(C.outline);
        g.rect(px + s - 5, py + 6 + (s - 12) * (1 - fill), 3, (s - 12) * fill).fill(0xf0b030);
        break;
      }
      case 'bottler': {
        shadow();
        g.roundRect(px + 1, py + 2, s - 2, s - 3, 3).fill(C.outline);
        g.roundRect(px + 2, py + 3, s - 4, s - 5, 2).fill(0x4f9a94);
        g.rect(px + 4, py + 5, s - 8, 3).fill(0x3b7570);
        g.circle(cx, cy + 2, 9).fill(0x3b7570).stroke({ width: 1, color: C.outline });
        const a0 = busy ? t * 2 : 0;
        for (let i = 0; i < 6; i++) {
          const a = a0 + (i * Math.PI) / 3;
          drawBottle(g, cx + Math.cos(a) * 6, cy + 2 + Math.sin(a) * 6, i < Math.round(((b.itemsIn?.length ?? 0) / 60) * 6) + 1 ? 0x7fb3c9 : 0x2f5d5a, false);
        }
        break;
      }
      case 'crate': {
        g.rect(px + 1, py + 2, 14, 13).fill(C.outline);
        g.rect(px + 2, py + 3, 12, 11).fill(C.wood);
        g.rect(px + 2, py + 6, 12, 1).fill(C.woodDark);
        g.rect(px + 2, py + 10, 12, 1).fill(C.woodDark);
        const n = m?.phase === 'processing' ? 0 : (b.itemsIn?.length ?? 0);
        for (let i = 0; i < n; i++) g.rect(px + 3 + (i % 4) * 3, py + 4 + Math.floor(i / 4) * 3, 2, 2).fill(0xe8b33a); // capsules
        if (m?.phase === 'processing') {
          // camionnette qui part
          const dx = Math.min(1, m.timer / m.duration) * 12;
          g.rect(px + 2 + dx, py + 4, 9, 5).fill(0xe8e4dc).stroke({ width: 1, color: C.outline });
          g.rect(px + 3 + dx, py + 9, 2, 2).fill(C.outline);
          g.rect(px + 8 + dx, py + 9, 2, 2).fill(C.outline);
        }
        break;
      }
      case 'water_tap': {
        g.rect(px + 3, py + 3, 10, 11).fill(C.outline);
        g.rect(px + 4, py + 4, 8, 9).fill(0x2d6cb5);
        g.rect(px + 6, py + 1, 4, 4).fill(C.steelDark).stroke({ width: 1, color: C.outline });
        g.circle(cx, py + 2, 2).fill(0xd94a3a); // robinet
        g.rect(px + 5, py + 6, 6, 1).fill(0x6aa6e6);
        if ((b.fluid?.amount ?? 0) < 19 && Math.floor(t * 3) % 2 === 0) g.rect(cx - 0.5, py + 9, 1, 2).fill(0xbfe0ff);
        break;
      }
      case 'tank': {
        shadow();
        const r = s / 2 - 2;
        g.circle(cx, cy, r + 1).fill(C.outline);
        g.circle(cx, cy, r).fill(0x8995a3);
        g.circle(cx, cy, r - 3).stroke({ width: 1, color: 0x6b7480 });
        if (b.fluid?.fluid) g.circle(cx, cy, (r - 5) * Math.min(1, b.fluid.amount / 200) + 1).fill(FLUIDS[b.fluid.fluid].color);
        break;
      }
      case 'stand': {
        g.rect(px + 2, py + 14, s - 4, s - 17).fill(C.outline);
        g.rect(px + 3, py + 15, s - 6, s - 19).fill(C.wood);
        for (let i = 0; i < 6; i++) g.rect(px + 2 + i * 5, py + 2, 5, 11).fill(i % 2 ? 0xffffff : 0xe05a47);
        g.rect(px + 2, py + 13, s - 4, 1).fill(C.outline);
        for (let i = 0; i < Math.min(6, b.itemsIn?.length ?? 0); i++) drawBottle(g, px + 7 + i * 4, py + 20, 0x6b3a12, true);
        break;
      }
      case 'supplier': {
        g.rect(px + 1, py + 11, 14, 3).fill(C.woodDark);
        g.roundRect(px + 2, py + 4, 6, 8, 2).fill(0xd9c29a).stroke({ width: 1, color: C.outline });
        g.roundRect(px + 8, py + 3, 6, 9, 2).fill(0xcbb084).stroke({ width: 1, color: C.outline });
        break;
      }
      default: {
        g.rect(px + 1, py + 1, s - 2, s - 2).fill(C.outline);
        g.rect(px + 2, py + 2, s - 4, s - 4).fill(def.color);
      }
    }
  }

  private steam(g: Graphics, x: number, y: number, t: number): void {
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.8 + i / 3) % 1;
      g.circle(x - 4 + i * 4 + Math.sin(t * 2 + i) * 1.5, y - p * 8, 1.5 + p * 1.5).fill({ color: 0xffffff, alpha: 0.5 * (1 - p) });
    }
  }

  private drawAlerts(g: Graphics, b: Building, world: World): void {
    if (!b.alerts) return;
    const s = BUILDINGS[b.type].size * TILE;
    const px = b.x * TILE;
    const py = b.y * TILE;
    const danger = b.alerts & (Alert.Broken | Alert.BatchLost | Alert.Overpressure | Alert.Overheat);
    if (danger && Math.floor(world.time * 3) % 2) return;
    g.poly([px + 3, py - 1, px + 7, py - 7, px + 11, py - 1]).fill(danger ? C.danger : C.alert).stroke({ width: 1, color: C.outline });
    g.rect(px + 6.5, py - 5, 1, 2).fill(C.outline);
    void s;
  }

  // ------------------------------------------------------------------ superpositions

  private drawOverlay(world: World): void {
    const g = this.overlay.clear();
    this.drawTutorial(g, world);
    if (this.selectedId != null) {
      const b = world.buildings.get(this.selectedId);
      if (b) {
        const s = BUILDINGS[b.type].size * TILE;
        g.rect(b.x * TILE - 1, b.y * TILE - 1, s + 2, s + 2).stroke({ width: 1, color: 0xffffff });
      }
    }
    for (const id of this.deleteSet) {
      const b = world.buildings.get(id);
      if (!b) continue;
      const s = BUILDINGS[b.type].size * TILE;
      g.rect(b.x * TILE, b.y * TILE, s, s).fill({ color: C.danger, alpha: 0.4 });
      g.rect(b.x * TILE - 1, b.y * TILE - 1, s + 2, s + 2).stroke({ width: 1, color: C.danger });
    }
    if (this.ghost) {
      const size = BUILDINGS[this.ghost.type].size * TILE;
      const color = this.ghost.valid ? C.ok : C.bad;
      for (const t of this.ghost.tiles) {
        g.rect(t.x * TILE, t.y * TILE, size, size).fill({ color, alpha: 0.35 });
        if (BUILDINGS[this.ghost.type].rotatable) this.arrow(g, t.x * TILE, t.y * TILE, t.rot, color);
      }
    }
    if (this.moveGhost) {
      const b = world.buildings.get(this.moveGhost.id);
      if (b) {
        const s = BUILDINGS[b.type].size * TILE;
        const color = this.moveGhost.valid ? C.ok : C.bad;
        g.rect(this.moveGhost.x * TILE, this.moveGhost.y * TILE, s, s).fill({ color, alpha: 0.35 }).stroke({ width: 1, color });
      }
    }
    this.drawIcons(g, world);
  }

  /** Icônes « + » des ingrédients manquants, avec une légère pulsation. */
  private drawIcons(g: Graphics, world: World): void {
    for (const n of this.needs) {
      const b = world.buildings.get(n.buildingId);
      if (!b) continue;
      const { x, y } = iconAnchor(b);
      const pulse = 1 + 0.12 * Math.sin(this.t * 5 + b.id);
      const r = 6 * pulse;
      g.circle(x, y, r + 1).fill(C.outline);
      g.circle(x, y, r).fill(0xfbf3e0);
      drawItem(g, n.item, x, y, 1.3);
      g.circle(x + r - 1, y + r - 1, 3).fill(0x3aa655).stroke({ width: 1, color: C.outline });
      g.rect(x + r - 2.5, y + r - 1.5, 3, 1).fill(0xffffff);
      g.rect(x + r - 1.5, y + r - 2.5, 1, 3).fill(0xffffff);
    }
  }

  /** Tutoriel : fantôme clignotant du bâtiment attendu, et contour de la machine à toucher. */
  private drawTutorial(g: Graphics, world: World): void {
    const step = currentStep(world);
    if (!step) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5.5);
    for (const t of pendingPlacements(world)) {
      const def = BUILDINGS[t.type];
      const s = def.size * TILE;
      const px = t.x * TILE;
      const py = t.y * TILE;
      g.rect(px, py, s, s).fill({ color: def.color, alpha: 0.2 + 0.25 * pulse });
      g.rect(px - 1, py - 1, s + 2, s + 2).stroke({ width: 1, color: C.alert, alpha: 0.5 + 0.5 * pulse });
      if (def.rotatable) this.arrow(g, px, py, t.rot ?? 0, C.alert);
    }
    if (step.focus) {
      const b = world.at(step.focus.x, step.focus.y);
      if (b && this.selectedId !== b.id) {
        const s = BUILDINGS[b.type].size * TILE;
        g.rect(b.x * TILE - 2, b.y * TILE - 2, s + 4, s + 4).stroke({ width: 1, color: C.alert, alpha: 0.4 + 0.6 * pulse });
      }
    }
  }

  private arrow(g: Graphics, px: number, py: number, rot: Dir, color: number): void {
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const dx = DX[rot]!;
    const dy = DY[rot]!;
    g.poly([cx + dx * 4, cy + dy * 4, cx - dx * 2 - dy * 3, cy - dy * 2 + dx * 3, cx - dx * 2 + dy * 3, cy - dy * 2 - dx * 3]).fill({ color, alpha: 0.9 });
  }
}

// ------------------------------------------------------------------ utilitaires de dessin

const isLink = (b: Building) => !!b.belt || (BUILDINGS[b.type].category === 'transport' && BUILDINGS[b.type].size === 1);
const sameKind = (a: Building, b: Building) => !!a.belt === !!b.belt;

/** Point sur le trajet d'un tapis : de l'entrée (bord `entry`) au centre, puis du centre vers la sortie. */
function pointOnPath(entry: Dir, exit: Dir, pos: number, cx: number, cy: number) {
  if (pos < 0.5) return { x: cx + DX[entry]! * (0.5 - pos) * TILE, y: cy + DY[entry]! * (0.5 - pos) * TILE };
  return { x: cx + DX[exit]! * (pos - 0.5) * TILE, y: cy + DY[exit]! * (pos - 0.5) * TILE };
}

function drawBottle(g: Graphics, x: number, y: number, glass: number, cap: boolean): void {
  const bx = Math.round(x) - 1;
  const by = Math.round(y) - 3;
  g.rect(bx, by + 2, 3, 4).fill(glass);
  g.rect(bx + 1, by, 1, 2).fill(glass);
  if (cap) g.rect(bx + 1, by - 1, 1, 1).fill(0xe8b33a);
}

/** Petits pictogrammes d'ingrédients et de produits (tapis, icônes « + »). */
export function drawItem(g: Graphics, item: ItemId, x: number, y: number, scale = 1): void {
  const u = scale;
  switch (item) {
    case 'malt':
    case 'crushed_malt': {
      const c = item === 'malt' ? 0xd9b679 : 0xb5793a;
      g.roundRect(x - 2.5 * u, y - 2 * u, 5 * u, 5 * u, 1.5 * u).fill(c).stroke({ width: 0.6, color: C.outline });
      g.rect(x - 1.5 * u, y - 2.6 * u, 3 * u, 1 * u).fill(0x8a5a2a); // lien du sac
      break;
    }
    case 'hops':
      g.circle(x, y + 1.2 * u, 1.6 * u).fill(0x5aa63a);
      g.circle(x, y - 0.3 * u, 1.9 * u).fill(0x6dbb4a);
      g.circle(x, y - 1.8 * u, 1.3 * u).fill(0x8bd16a);
      break;
    case 'yeast':
      g.rect(x - 2 * u, y - 2.5 * u, 4 * u, 5 * u).fill(0xf2e5b8).stroke({ width: 0.6, color: C.outline });
      g.rect(x - 1 * u, y - 0.5 * u, 2 * u, 1 * u).fill(0xc9a24a);
      break;
    case 'bottle':
      g.rect(x - 1 * u, y - 0.5 * u, 2.4 * u, 3.5 * u).fill(0x7fb3c9);
      g.rect(x - 0.3 * u, y - 2.5 * u, 1 * u, 2 * u).fill(0x7fb3c9);
      break;
    case 'beer_bottle':
      g.rect(x - 1.2 * u, y - 0.5 * u, 2.6 * u, 4 * u).fill(0x6b3a12);
      g.rect(x - 1.2 * u, y + 0.8 * u, 2.6 * u, 1.2 * u).fill(0xf2e5b8); // étiquette
      g.rect(x - 0.4 * u, y - 2.6 * u, 1 * u, 2.1 * u).fill(0x6b3a12);
      g.rect(x - 0.6 * u, y - 3.2 * u, 1.4 * u, 0.8 * u).fill(0xe8b33a); // capsule
      break;
  }
}
