import { Application, Container, Graphics, Sprite, Texture, TextureStyle } from 'pixi.js';
import { Alert, type Building } from '../core/building';
import { BUILDINGS, kindOf, type BuildingDef, type BuildingType } from '../core/content/buildings';
import { FLUIDS } from '../core/content/fluids';
import type { ItemId } from '../core/content/items';
import { DX, DY, opposite, type Dir } from '../core/dir';
import { ingredientNeeds, type IngredientNeed } from '../core/ingredients';
import { currentStep, pendingPlacements } from '../core/tutorial/tutorial';
import type { World } from '../core/world';
import { Camera, TILE } from './camera';
import { coolerCanvas, PAL, spriteCanvas, spriteSize } from './sprites';

const hex = (s: string) => parseInt(s.slice(1, 7), 16);
const C = {
  bg: 0x150f1d,
  outline: hex(PAL.outline),
  ok: 0x7ee081,
  bad: 0xe05a47,
  alert: 0xffcc33,
  danger: 0xff4d4d,
  st: PAL.st.map(hex),
  ir: PAL.ir.map(hex),
  cu: PAL.cu.map(hex),
};
/** Rangées de mur au-dessus de la zone constructible (vue de face). */
export const WALL_TILES = 2;

export interface Ghost {
  type: BuildingType;
  tiles: { x: number; y: number; rot: Dir }[];
  valid: boolean;
}

interface Node {
  root: Container;
  shadow: Graphics;
  sprite: Sprite | null;
  fx: Graphics;
  type: BuildingType;
}

const textures = new Map<string, Texture>();
function tex(type: BuildingType, preview = false): Texture | null {
  const key = `${type}|${preview}`;
  let t = textures.get(key);
  if (!t) {
    const c = spriteCanvas(type, preview);
    if (!c) return null;
    t = Texture.from(c);
    textures.set(key, t);
  }
  return t;
}

const isLink = (t: BuildingType) => {
  const d = BUILDINGS[t] as BuildingDef;
  return 'conveyor' in d || (d.rotatable && d.size === 1);
};

/** Boîte occupée à l'écran par un bâtiment (sprite plus haut que son emprise au sol). */
export function screenBox(b: Building): { x: number; y: number; w: number; h: number } {
  const size = BUILDINGS[b.type].size * TILE;
  const sp = spriteSize(b.type);
  if (!sp || isLink(b.type)) return { x: b.x * TILE, y: b.y * TILE, w: size, h: size };
  const bottom = b.y * TILE + size;
  return { x: b.x * TILE + (size - sp.w) / 2, y: bottom - sp.h, w: sp.w, h: sp.h };
}

/** Position (px monde) de l'icône « + » d'une machine : au-dessus, à droite du sprite. */
export function iconAnchor(b: Building): { x: number; y: number } {
  const box = screenBox(b);
  return { x: box.x + box.w - 3, y: box.y + 2 };
}
export const ICON_RADIUS = 7;

/**
 * Rendu vue de face, pixel art 16-bit : mur de briques au fond, sprites triés en profondeur
 * (ce qui est plus bas sur la carte passe devant), tuyaux et tapis dessinés au pixel avec leurs raccords.
 */
export class GameRenderer {
  readonly app = new Application();
  readonly layer = new Container();
  camera!: Camera;
  private floor = new Graphics();
  private scene = new Container();
  private overlay = new Graphics();
  private ghostLayer = new Container();
  private nodes = new Map<number, Node>();
  private floorKey = '';
  ghost: Ghost | null = null;
  moveGhost: { id: number; x: number; y: number; valid: boolean } | null = null;
  selectedId: number | null = null;
  deleteSet = new Set<number>();
  needs: IngredientNeed[] = [];
  private t = 0;
  private world: World | null = null;

  async init(host: HTMLElement): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      resizeTo: host, background: C.bg, antialias: false, roundPixels: true,
      resolution: Math.min(window.devicePixelRatio || 1, 3), autoDensity: true, preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.scene.sortableChildren = true;
    this.layer.addChild(this.floor, this.scene, this.ghostLayer, this.overlay);
    this.app.stage.addChild(this.layer);
    this.camera = new Camera(this.layer);
  }

  draw(world: World): void {
    this.world = world;
    this.t = performance.now() / 1000;
    this.drawFloor(world);
    this.syncNodes(world);
    for (const b of world.list) this.drawNode(b, world);
    this.needs = ingredientNeeds(world);
    this.drawOverlay(world);
  }

  /** Bâtiment touché à l'écran : le sprite le plus en avant sous le doigt. */
  hitTest(wx: number, wy: number): Building | undefined {
    const w = this.world;
    if (!w) return undefined;
    const sorted = [...w.list].sort((a, b) => zOf(b) - zOf(a));
    return sorted.find((b) => {
      const box = screenBox(b);
      return wx >= box.x && wx < box.x + box.w && wy >= box.y && wy < box.y + box.h;
    });
  }

  // ------------------------------------------------------------------ sol et mur du fond

  private drawFloor(world: World): void {
    const { unlockedW: uw, unlockedH: uh, width, height } = world.grid;
    const key = `${uw}x${uh}`;
    if (key === this.floorKey) return;
    this.floorKey = key;
    const g = this.floor.clear();
    const vw = Math.min(width, uw + 6);
    const vh = Math.min(height, uh + 4);
    // zone verrouillée : béton brut hachuré
    g.rect(0, -WALL_TILES * TILE, vw * TILE, (vh + WALL_TILES) * TILE).fill(0x1f1828);
    for (let i = -vh; i < vw + vh; i += 3) g.moveTo(i * TILE / 2, 0).lineTo(i * TILE / 2 + vh * TILE, vh * TILE).stroke({ width: 1, color: 0x261e30 });
    // mur de briques
    const wallH = WALL_TILES * TILE;
    g.rect(0, -wallH, uw * TILE, wallH).fill(hex(PAL.brick[1]!));
    for (let row = 0; row < wallH / 4; row++) {
      const y = -wallH + row * 4;
      g.rect(0, y + 3, uw * TILE, 1).fill(hex(PAL.brick[2]!));
      for (let x = (row % 2) * 4; x < uw * TILE; x += 8) {
        g.rect(x, y, 1, 3, ).fill(hex(PAL.brick[2]!));
        g.rect(x + 1, y, 6, 1).fill(hex(PAL.brick[0]!));
      }
    }
    // fenêtre et plinthe
    const wx = Math.max(1, uw - 4) * TILE + 4;
    g.rect(wx, -wallH + 5, 22, 16).fill(C.outline);
    g.rect(wx + 1, -wallH + 6, 20, 14).fill(0x5aa2e8);
    g.rect(wx + 1, -wallH + 6, 20, 5).fill(0xa8dcff);
    g.rect(wx + 10, -wallH + 6, 2, 14).fill(C.outline);
    g.rect(wx + 1, -wallH + 12, 20, 1).fill(C.outline);
    g.rect(0, -3, uw * TILE, 3).fill(hex(PAL.wd[3]!));
    g.rect(0, -3, uw * TILE, 1).fill(hex(PAL.wd[2]!));
    // sol : carrelage de garage
    for (let y = 0; y < uh; y++)
      for (let x = 0; x < uw; x++) {
        const c = (x + y) % 2 ? 0x4a4152 : 0x433b4b;
        g.rect(x * TILE, y * TILE, TILE, TILE).fill(c);
        g.rect(x * TILE, y * TILE, TILE, 1).fill(0x524859);
        if ((x * 7 + y * 13) % 9 === 0) g.rect(x * TILE + 5, y * TILE + 9, 3, 1).fill(0x3a3242);
      }
    g.rect(0, 0, uw * TILE, 2).fill({ color: 0x000000, alpha: 0.25 }); // ombre au pied du mur
    g.rect(-2, -wallH, 2, wallH + uh * TILE).fill(C.outline);
    g.rect(uw * TILE, -wallH, 2, wallH + uh * TILE).fill(C.outline);
    g.rect(-2, uh * TILE, uw * TILE + 4, 2).fill(C.outline);
  }

  // ------------------------------------------------------------------ nœuds (un par bâtiment)

  private syncNodes(world: World): void {
    for (const [id, n] of this.nodes) {
      const b = world.buildings.get(id);
      if (!b || b.type !== n.type) {
        n.root.destroy({ children: true });
        this.nodes.delete(id);
      }
    }
    for (const b of world.list) {
      if (this.nodes.has(b.id)) continue;
      const root = new Container();
      const shadow = new Graphics();
      const fx = new Graphics();
      const t = isLink(b.type) ? null : tex(b.type);
      const sprite = t ? new Sprite(t) : null;
      root.addChild(shadow);
      if (sprite) root.addChild(sprite);
      root.addChild(fx);
      this.scene.addChild(root);
      this.nodes.set(b.id, { root, shadow, sprite, fx, type: b.type });
    }
  }

  private drawNode(b: Building, world: World): void {
    const n = this.nodes.get(b.id)!;
    n.root.zIndex = zOf(b);
    n.shadow.clear();
    n.fx.clear();
    if (isLink(b.type)) {
      this.drawLink(n.fx, b, world);
      return;
    }
    const box = screenBox(b);
    const size = BUILDINGS[b.type].size * TILE;
    if (n.sprite) n.sprite.position.set(Math.round(box.x), Math.round(box.y));
    n.shadow.ellipse(b.x * TILE + size / 2, b.y * TILE + size - 2, size / 2 - 1, 3).fill({ color: 0x000000, alpha: 0.3 });
    this.drawEffects(n.fx, b, box);
    this.drawAlert(n.fx, b, box, world);
  }

  // ------------------------------------------------------------------ tuyaux et tapis (vue de face)

  private entryDir(b: Building, world: World): Dir {
    const back = opposite(b.rot);
    const feeds = (d: Dir) => {
      const n = world.at(b.x + DX[d]!, b.y + DY[d]!);
      if (!n || n === world.front(b)) return false;
      if (isLink(n.type)) return n.rot === opposite(d) && !!n.belt === !!b.belt;
      return b.belt ? !!n.itemsOut : !!n.fluid;
    };
    if (feeds(back)) return back;
    for (const d of [((b.rot + 1) % 4) as Dir, ((b.rot + 3) % 4) as Dir]) if (feeds(d)) return d;
    return back;
  }

  private drawLink(g: Graphics, b: Building, world: World): void {
    const px = b.x * TILE;
    const py = b.y * TILE;
    const entry = this.entryDir(b, world);
    const exit = b.rot;
    const front = world.front(b);
    const back = world.at(b.x + DX[entry]!, b.y + DY[entry]!);
    // L'embout s'enfonce dans l'appareil branché : le raccord se voit.
    const reachOut = front && !isLink(front.type) ? 4 : 0;
    const reachIn = back && !isLink(back.type) ? 4 : 0;

    if (b.belt) {
      this.drawBelt(g, px, py, entry, exit, reachIn, reachOut, b);
      return;
    }
    const cx = px + 8;
    const cy = py + 10; // tuyaux posés bas, près du sol
    const seg = (d: Dir, extra: number) => {
      const len = 8 + extra;
      if (d % 2 === 0) {
        const x0 = d === 0 ? cx : cx - len;
        g.rect(x0, cy - 3, len, 6).fill(C.outline);
        g.rect(x0, cy - 2, len, 4).fill(C.st[2]!);
        g.rect(x0, cy - 2, len, 1).fill(C.st[0]!);
        g.rect(x0, cy + 1, len, 1).fill(C.st[3]!);
      } else {
        const y0 = d === 1 ? cy : cy - len;
        g.rect(cx - 3, y0, 6, len).fill(C.outline);
        g.rect(cx - 2, y0, 4, len).fill(C.st[2]!);
        g.rect(cx - 2, y0, 1, len).fill(C.st[0]!);
        g.rect(cx + 1, y0, 1, len).fill(C.st[3]!);
      }
    };
    seg(entry, reachIn);
    seg(exit, reachOut);
    // coude / jonction
    g.rect(cx - 3, cy - 3, 6, 6).fill(C.outline);
    g.rect(cx - 2, cy - 2, 4, 4).fill(entry % 2 !== exit % 2 ? C.st[1]! : C.st[2]!);
    // brides aux raccords avec les appareils
    const flange = (d: Dir, extra: number) => {
      const fx = cx + DX[d]! * (8 + extra - 2);
      const fy = cy + DY[d]! * (8 + extra - 2);
      if (d % 2 === 0) g.rect(fx - 1, fy - 4, 2, 8).fill(C.st[3]!).rect(fx - 1, fy - 4, 1, 8).fill(C.st[1]!);
      else g.rect(fx - 4, fy - 1, 8, 2).fill(C.st[3]!).rect(fx - 4, fy - 1, 8, 1).fill(C.st[1]!);
    };
    if (reachIn) flange(entry, reachIn);
    if (reachOut) flange(exit, reachOut);
    // regard : le liquide qui circule
    const f = b.fluid;
    if (f?.fluid && f.amount > 0.05) {
      const color = FLUIDS[f.fluid].color;
      const pulse = Math.floor(this.t * 6) % 2;
      g.rect(cx - 1, cy - 1, 2, 2).fill(pulse ? color : 0xffffff);
      g.rect(cx - 1 + DX[exit]! * 4, cy - 1 + DY[exit]! * 4, 2, 2).fill(color);
    }
    const type = b.type;
    if (type === 'pump') {
      g.rect(cx - 5, cy - 9, 10, 7).fill(C.outline);
      g.rect(cx - 4, cy - 8, 8, 5).fill(0x5aa2e8);
      g.rect(cx - 4, cy - 8, 8, 1).fill(0xa8dcff);
      g.rect(cx - 1 + DX[exit]! * 2, cy - 6 + DY[exit]!, 2, 2).fill(0xffffff);
    }
    if (type === 'cooler' || type === 'cooler_2') {
      const t = Texture.from(coolerCanvas(type));
      // Le serpentin est dessiné au-dessus du tuyau, centré.
      g.texture(t, 0xffffff, px, py - 2, 16, 16);
    }
  }

  private drawBelt(g: Graphics, px: number, py: number, entry: Dir, exit: Dir, reachIn: number, reachOut: number, b: Building): void {
    const cx = px + 8;
    const cy = py + 9;
    const seg = (d: Dir, extra: number) => {
      const len = 8 + extra;
      if (d % 2 === 0) {
        const x0 = d === 0 ? cx : cx - len;
        g.rect(x0, cy - 4, len, 9).fill(C.outline);
        g.rect(x0, cy - 3, len, 5).fill(C.ir[1]!); // bande
        g.rect(x0, cy + 2, len, 2).fill(C.ir[0]!); // châssis
      } else {
        const y0 = d === 1 ? cy : cy - len;
        g.rect(cx - 6, y0, 12, len).fill(C.outline);
        g.rect(cx - 5, y0, 10, len).fill(C.ir[1]!);
        g.rect(cx - 5, y0, 1, len).fill(C.ir[0]!);
        g.rect(cx + 4, y0, 1, len).fill(C.ir[2]!);
      }
    };
    seg(entry, reachIn);
    seg(exit, reachOut);
    g.rect(cx - 5, cy - 3, 10, 5).fill(C.ir[1]!);
    // pieds
    if (exit % 2 === 0 && entry % 2 === 0) {
      g.rect(px + 2, cy + 4, 2, 4).fill(C.ir[2]!);
      g.rect(px + 12, cy + 4, 2, 4).fill(C.ir[2]!);
    }
    // lattes animées
    const speed = (BUILDINGS[b.type] as { conveyor: { speed: number } }).conveyor.speed;
    const phase = (this.t * speed) % 1;
    for (let k = 0; k < 3; k++) {
      const p = (phase + k / 3) % 1;
      const pt = pointOnPath(entry, exit, p, cx, cy - 1);
      g.rect(Math.round(pt.x) - (exit % 2 === 0 && p >= 0.5 ? 0 : 0), Math.round(pt.y), 1, 1).fill(C.ir[2]!);
    }
    for (const it of b.belt!) {
      const pt = pointOnPath(entry, exit, it.pos, cx, cy - 2);
      drawItem(g, it.item, pt.x, pt.y);
    }
  }

  // ------------------------------------------------------------------ effets animés

  private drawEffects(g: Graphics, b: Building, box: { x: number; y: number; w: number; h: number }): void {
    const m = b.machine;
    const busy = m?.phase === 'processing' || m?.phase === 'heating';
    const t = this.t;
    const kind = kindOf(b.type);
    const pro = (BUILDINGS[b.type] as BuildingDef).tier === 2;
    const midX = box.x + box.w / 2;
    if (kind === 'kettle' && busy) {
      // flammes du réchaud / brûleur
      const fy = box.y + box.h - (pro ? 6 : 5);
      const n = pro ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const fx = midX - (n * 4) / 2 + i * 4 + 1;
        const h = 2 + Math.round(2 * Math.abs(Math.sin(t * 10 + i * 1.7)));
        g.rect(fx, fy - h, 2, h).fill(0xff7a1a);
        g.rect(fx, fy - h + 1, 1, Math.max(1, h - 1)).fill(0xffd23a);
      }
    }
    if ((kind === 'kettle' || kind === 'mash_tun') && busy && (m?.temp ?? 0) > 55) {
      const top = kind === 'kettle' && pro ? box.y : box.y + 4;
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.7 + i / 3) % 1;
        const r = 1 + Math.round(p * 2);
        g.rect(Math.round(midX - 3 + i * 3 + Math.sin(t * 2 + i) * 2), Math.round(top - p * 10), r, r).fill({ color: 0xffffff, alpha: 0.55 * (1 - p) });
      }
    }
    if (kind === 'fermenter') {
      const level = Math.min(1, ((b.fluidIn?.amount ?? 0) + (m?.phase === 'processing' || m?.phase === 'blocked' ? Number(m?.data?.volume ?? 18) : 0) + (b.fluid?.amount ?? 0)) / (pro ? 40 : 20));
      if (!pro && level > 0) {
        // niveau de liquide dans la dame-jeanne
        const h = Math.round(9 * level);
        const color = m?.phase === 'processing' ? 0xe8a530 : 0xc8892f;
        g.rect(box.x + 3, box.y + 21 - h, 10, h).fill({ color, alpha: 0.85 });
        g.rect(box.x + 4, box.y + 21 - h, 2, 1).fill(0xfff0c0);
      }
      if (m?.phase === 'processing') {
        // bulles dans le barboteur
        const p = (t * 1.5) % 1;
        g.rect(box.x + (pro ? 10 : 7), box.y + (pro ? 1 : 0) - Math.round(p * 4), 1, 1).fill({ color: 0xffffff, alpha: 1 - p });
        if (pro) for (let i = 0; i < 3; i++) g.rect(box.x + 8 + i * 6, box.y + 26 - ((t * 8 + i * 3) % 12), 1, 1).fill({ color: 0xffffff, alpha: 0.6 });
      }
    }
    if (kind === 'mill' && busy) {
      // manivelle qui tourne
      const a = t * 6;
      g.rect(Math.round(box.x + 14 + Math.cos(a) * 2), Math.round(box.y + 9 + Math.sin(a) * 2), 2, 2).fill(0xe8553a);
    }
    if (kind === 'bottler' && busy) {
      const p = (t * 1.5) % 1;
      g.rect(Math.round(box.x + 2 + p * (box.w - 6)), box.y + box.h - 11, 2, 4).fill(0x6b3a12);
    }
    if (kind === 'crate') {
      if (m?.phase === 'processing') {
        const dx = Math.min(1, m.timer / m.duration) * 14;
        g.rect(box.x + dx, box.y - 2, 12, 7).fill(C.outline);
        g.rect(box.x + 1 + dx, box.y - 1, 10, 4).fill(0xe8e4dc);
        g.rect(box.x + 8 + dx, box.y - 1, 3, 2).fill(0x5aa2e8);
        g.rect(box.x + 2 + dx, box.y + 3, 2, 2).fill(C.outline);
        g.rect(box.x + 8 + dx, box.y + 3, 2, 2).fill(C.outline);
      } else {
        const n = b.itemsIn?.length ?? 0;
        for (let i = 0; i < n; i++) {
          const bx = box.x + 2 + (i % 6) * 2;
          const by = box.y + 1 - Math.floor(i / 6) * 2;
          g.rect(bx, by, 1, 3).fill(0x6b3a12);
          g.rect(bx, by - 1, 1, 1).fill(0xf2c14e);
        }
      }
    }
    if (kind === 'water_tap' && (b.fluid?.amount ?? 0) < 19.5 && Math.floor(t * 4) % 2 === 0) {
      g.rect(box.x + 7, box.y + box.h - 2, 2, 2).fill(0xa8dcff);
    }
    if (kind === 'stand') {
      for (let i = 0; i < Math.min(8, b.itemsIn?.length ?? 0); i++) {
        g.rect(box.x + 4 + i * 3, box.y + 18, 2, 4).fill(0x6b3a12);
        g.rect(box.x + 4 + i * 3, box.y + 17, 2, 1).fill(0xf2c14e);
      }
    }
  }

  private drawAlert(g: Graphics, b: Building, box: { x: number; y: number }, world: World): void {
    if (!b.alerts) return;
    const danger = b.alerts & (Alert.Broken | Alert.BatchLost | Alert.Overpressure | Alert.Overheat);
    if (danger && Math.floor(world.time * 3) % 2) return;
    const x = box.x + 2;
    const y = box.y - 2;
    g.poly([x, y, x + 4, y - 7, x + 8, y]).fill(danger ? C.danger : C.alert).stroke({ width: 1, color: C.outline });
    g.rect(x + 3.5, y - 5, 1, 2).fill(C.outline).rect(x + 3.5, y - 2, 1, 1).fill(C.outline);
  }

  // ------------------------------------------------------------------ superpositions

  private drawOverlay(world: World): void {
    const g = this.overlay.clear();
    this.ghostLayer.removeChildren().forEach((c) => c.destroy());
    this.drawTutorial(g, world);
    if (this.selectedId != null) {
      const b = world.buildings.get(this.selectedId);
      if (b) {
        const box = screenBox(b);
        g.rect(box.x - 1, box.y - 1, box.w + 2, box.h + 2).stroke({ width: 1, color: 0xffffff });
      }
    }
    for (const id of this.deleteSet) {
      const b = world.buildings.get(id);
      if (!b) continue;
      const box = screenBox(b);
      g.rect(box.x, box.y, box.w, box.h).fill({ color: C.danger, alpha: 0.45 });
      g.rect(box.x - 1, box.y - 1, box.w + 2, box.h + 2).stroke({ width: 1, color: C.danger });
    }
    if (this.ghost) {
      const def = BUILDINGS[this.ghost.type];
      const size = def.size * TILE;
      const color = this.ghost.valid ? C.ok : C.bad;
      for (const t of this.ghost.tiles) {
        g.rect(t.x * TILE, t.y * TILE, size, size).fill({ color, alpha: 0.3 });
        this.ghostSprite(this.ghost.type, t.x, t.y, this.ghost.valid ? 0.7 : 0.4);
        if (def.rotatable) this.arrow(g, t.x * TILE, t.y * TILE, t.rot, color);
      }
    }
    if (this.moveGhost) {
      const b = world.buildings.get(this.moveGhost.id);
      if (b) {
        const s = BUILDINGS[b.type].size * TILE;
        const color = this.moveGhost.valid ? C.ok : C.bad;
        g.rect(this.moveGhost.x * TILE, this.moveGhost.y * TILE, s, s).fill({ color, alpha: 0.3 }).stroke({ width: 1, color });
        this.ghostSprite(b.type, this.moveGhost.x, this.moveGhost.y, 0.7);
      }
    }
    this.drawIcons(g, world);
  }

  private ghostSprite(type: BuildingType, x: number, y: number, alpha: number): void {
    const t = tex(type, isLink(type));
    if (!t) return;
    const s = new Sprite(t);
    const size = BUILDINGS[type].size * TILE;
    s.position.set(x * TILE + Math.round((size - t.width) / 2), (y * TILE + size) - t.height);
    s.alpha = alpha;
    this.ghostLayer.addChild(s);
  }

  /** Icônes « + » des ingrédients manquants, avec une légère pulsation. */
  private drawIcons(g: Graphics, world: World): void {
    for (const n of this.needs) {
      const b = world.buildings.get(n.buildingId);
      if (!b) continue;
      const { x, y } = iconAnchor(b);
      const bob = Math.round(Math.sin(this.t * 4 + b.id));
      const yy = y + bob;
      g.roundRect(x - 6, yy - 6, 12, 12, 3).fill(C.outline);
      g.roundRect(x - 5, yy - 5, 10, 10, 2).fill(0xfbf3e0);
      drawItem(g, n.item, x, yy, 1.2);
      g.rect(x + 2, yy + 2, 6, 6).fill(C.outline);
      g.rect(x + 3, yy + 3, 4, 4).fill(0x3aa655);
      g.rect(x + 4, yy + 4, 2, 2).fill(0xffffff);
      if (Math.floor(this.t * 2) % 2 === 0) g.roundRect(x - 7, yy - 7, 14, 14, 3).stroke({ width: 1, color: C.alert, alpha: 0.8 });
    }
  }

  private drawTutorial(g: Graphics, world: World): void {
    const step = currentStep(world);
    if (!step) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5.5);
    for (const t of pendingPlacements(world)) {
      const def = BUILDINGS[t.type];
      const s = def.size * TILE;
      g.rect(t.x * TILE, t.y * TILE, s, s).fill({ color: C.alert, alpha: 0.12 + 0.18 * pulse });
      g.rect(t.x * TILE - 1, t.y * TILE - 1, s + 2, s + 2).stroke({ width: 1, color: C.alert, alpha: 0.5 + 0.5 * pulse });
      this.ghostSprite(t.type, t.x, t.y, 0.25 + 0.25 * pulse);
      if (def.rotatable) this.arrow(g, t.x * TILE, t.y * TILE, t.rot ?? 0, C.alert);
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

// ------------------------------------------------------------------ utilitaires

/** Ordre de dessin : plus bas sur la carte = plus en avant ; à égalité, les liaisons passent devant. */
function zOf(b: Building): number {
  return (b.y + BUILDINGS[b.type].size) * 10 + (isLink(b.type) ? 5 : 0);
}

function pointOnPath(entry: Dir, exit: Dir, pos: number, cx: number, cy: number) {
  if (pos < 0.5) return { x: cx + DX[entry]! * (0.5 - pos) * TILE, y: cy + DY[entry]! * (0.5 - pos) * TILE };
  return { x: cx + DX[exit]! * (pos - 0.5) * TILE, y: cy + DY[exit]! * (pos - 0.5) * TILE };
}

/** Pictogrammes pixel des ingrédients et produits (tapis, icônes « + »). */
export function drawItem(g: Graphics, item: ItemId, x: number, y: number, scale = 1): void {
  const X = Math.round(x);
  const Y = Math.round(y);
  const u = scale >= 1.2 ? 1 : 0;
  switch (item) {
    case 'malt':
    case 'crushed_malt': {
      const c = item === 'malt' ? 0xe8cf95 : 0xc08a4a;
      g.rect(X - 3, Y - 2, 6, 6).fill(C.outline);
      g.rect(X - 2, Y - 1, 4, 4).fill(c);
      g.rect(X - 1, Y - 3, 2, 2).fill(0x8a5a2a);
      break;
    }
    case 'hops':
      g.rect(X - 2, Y - 3, 4, 6).fill(C.outline);
      g.rect(X - 1, Y - 2, 2, 4).fill(0x6cc04a);
      g.rect(X - 1, Y - 2, 1, 1).fill(0xb8f08a);
      break;
    case 'yeast':
      g.rect(X - 2, Y - 3, 5, 6).fill(C.outline);
      g.rect(X - 1, Y - 2, 3, 4).fill(0xfffcf0);
      g.rect(X - 1, Y, 3, 1).fill(0xd4a43a);
      break;
    case 'bottle':
      g.rect(X - 1 - u, Y - 3, 3 + u, 7).fill(C.outline);
      g.rect(X - u, Y - 1, 1 + u, 4).fill(0x8fd0e0);
      g.rect(X - u, Y - 2, 1, 1).fill(0x8fd0e0);
      break;
    case 'beer_bottle':
      g.rect(X - 2, Y - 4, 4, 8).fill(C.outline);
      g.rect(X - 1, Y - 1, 2, 4).fill(0x7a3e12);
      g.rect(X - 1, Y, 2, 1).fill(0xfffcf0); // étiquette
      g.rect(X - 1, Y - 3, 1, 2).fill(0x7a3e12);
      g.rect(X - 1, Y - 4, 2, 1).fill(0xf2c14e); // capsule
      break;
  }
}
