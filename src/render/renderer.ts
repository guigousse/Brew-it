import { Application, Container, Graphics, TextureStyle } from 'pixi.js';
import { Alert, type Building } from '../core/building';
import { BUILDINGS, type BuildingType } from '../core/content/buildings';
import { FLUIDS } from '../core/content/fluids';
import { ITEMS } from '../core/content/items';
import { DX, DY, type Dir } from '../core/dir';
import type { World } from '../core/world';
import { Camera, TILE } from './camera';

const PALETTE = {
  bg: 0x1a1423,
  floorA: 0x3b3246,
  floorB: 0x362e40,
  locked: 0x231c2b,
  lockedGrid: 0x2a2233,
  wall: 0x5a4a6a,
  ghostOk: 0x7ee081,
  ghostBad: 0xe05a47,
  alert: 0xffcc33,
  danger: 0xff4d4d,
};

export interface Ghost {
  type: BuildingType;
  tiles: { x: number; y: number; rot: Dir }[];
  valid: boolean;
}

/**
 * Rendu placeholder « pixel » : formes pleines alignées sur la grille 16 px.
 * Prévu pour être remplacé progressivement par des sprites (atlas Aseprite) sans toucher à la simulation.
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
  selectedId: number | null = null;

  async init(host: HTMLElement): Promise<void> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    await this.app.init({
      resizeTo: host,
      background: PALETTE.bg,
      antialias: false,
      roundPixels: true,
      resolution: Math.min(window.devicePixelRatio || 1, 3),
      autoDensity: true,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.layer.addChild(this.floor, this.dynamic, this.overlay);
    this.app.stage.addChild(this.layer);
    this.camera = new Camera(this.layer);
  }

  draw(world: World): void {
    this.drawFloor(world);
    const g = this.dynamic.clear();
    for (const b of world.list) this.drawBuilding(g, b, world);
    this.drawOverlay(world);
  }

  private drawFloor(world: World): void {
    const { unlockedW: uw, unlockedH: uh, width, height } = world.grid;
    const key = `${uw}x${uh}`;
    if (key === this.floorKey) return;
    this.floorKey = key;
    const g = this.floor.clear();
    // Zone verrouillée visible autour : le joueur voit où l'usine pourra s'étendre.
    const vw = Math.min(width, uw + 6);
    const vh = Math.min(height, uh + 4);
    g.rect(0, 0, vw * TILE, vh * TILE).fill(PALETTE.locked);
    for (let x = 0; x <= vw; x++) g.rect(x * TILE, 0, 1, vh * TILE).fill(PALETTE.lockedGrid);
    for (let y = 0; y <= vh; y++) g.rect(0, y * TILE, vw * TILE, 1).fill(PALETTE.lockedGrid);
    for (let y = 0; y < uh; y++)
      for (let x = 0; x < uw; x++) g.rect(x * TILE, y * TILE, TILE, TILE).fill((x + y) % 2 ? PALETTE.floorA : PALETTE.floorB);
    g.rect(-2, -2, uw * TILE + 4, 2).fill(PALETTE.wall);
    g.rect(-2, uh * TILE, uw * TILE + 4, 2).fill(PALETTE.wall);
    g.rect(-2, 0, 2, uh * TILE).fill(PALETTE.wall);
    g.rect(uw * TILE, 0, 2, uh * TILE).fill(PALETTE.wall);
  }

  private drawBuilding(g: Graphics, b: Building, world: World): void {
    const def = BUILDINGS[b.type];
    const px = b.x * TILE;
    const py = b.y * TILE;
    const s = def.size * TILE;

    if (b.belt) {
      g.rect(px + 1, py + 1, TILE - 2, TILE - 2).fill(def.color);
      this.arrow(g, px, py, b.rot, 0x8e8ea6);
      for (const it of b.belt) {
        const cx = px + TILE / 2 + DX[b.rot]! * (it.pos - 0.5) * TILE;
        const cy = py + TILE / 2 + DY[b.rot]! * (it.pos - 0.5) * TILE;
        g.rect(Math.round(cx) - 2, Math.round(cy) - 2, 4, 4).fill(ITEMS[it.item].color);
      }
      return;
    }

    if (def.category === 'transport' && def.size === 1) {
      const horizontal = b.rot % 2 === 0;
      g.rect(px, py, TILE, TILE).fill(0x2b2433);
      if (horizontal) g.rect(px, py + 4, TILE, 8).fill(def.color);
      else g.rect(px + 4, py, 8, TILE).fill(def.color);
      const f = b.fluid;
      if (f && f.fluid && f.amount > 0.01) {
        const color = FLUIDS[f.fluid].color;
        const fill = Math.min(1, f.amount / (def as { fluid: { capacity: number } }).fluid.capacity);
        if (horizontal) g.rect(px, py + 6, TILE, 4).fill({ color, alpha: 0.35 + 0.65 * fill });
        else g.rect(px + 6, py, 4, TILE).fill({ color, alpha: 0.35 + 0.65 * fill });
      }
      this.arrow(g, px, py, b.rot, 0xffffff);
    } else {
      g.rect(px + 1, py + 1, s - 2, s - 2).fill(0x2b2433);
      g.rect(px + 2, py + 2, s - 4, s - 4).fill(def.color);
      g.rect(px + 2, py + 2, s - 4, 2).fill({ color: 0xffffff, alpha: 0.25 }); // reflet
      // Jauge de cuve
      const tank = b.fluid?.amount ? b.fluid : b.fluidIn;
      if (tank?.fluid && def.size > 1) {
        const cap = Math.max(1, ('fluid' in def && def.fluid.capacity) || ('fluidIn' in def && def.fluidIn.capacity) || 1);
        const h = Math.round((s - 8) * Math.min(1, tank.amount / cap));
        g.rect(px + s - 6, py + 4, 3, s - 8).fill(0x1a1423);
        g.rect(px + s - 6, py + 4 + (s - 8 - h), 3, h).fill(FLUIDS[tank.fluid].color);
      }
      // Barre de progression du lot
      const m = b.machine;
      if (m && m.duration > 0 && (m.phase === 'processing' || m.phase === 'heating')) {
        const w = Math.round((s - 6) * Math.min(1, m.timer / m.duration));
        g.rect(px + 3, py + s - 5, s - 6, 2).fill(0x1a1423);
        g.rect(px + 3, py + s - 5, w, 2).fill(0x7ee081);
      }
    }

    // Indicateurs d'alerte (clignotants)
    if (b.alerts) {
      const blink = Math.floor(world.time * 3) % 2 === 0;
      const danger = b.alerts & (Alert.Broken | Alert.BatchLost | Alert.Overpressure | Alert.Overheat);
      if (blink || !danger) {
        g.rect(px + s - 5, py - 3, 5, 5).fill(danger ? PALETTE.danger : PALETTE.alert);
        g.rect(px + s - 3, py - 2, 1, 2).fill(0x1a1423);
      }
    }
  }

  /** Petite flèche indiquant le sens d'un convoyeur / tuyau. */
  private arrow(g: Graphics, px: number, py: number, rot: Dir, color: number): void {
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const dx = DX[rot]!;
    const dy = DY[rot]!;
    g.poly([cx + dx * 4, cy + dy * 4, cx - dx * 2 - dy * 3, cy - dy * 2 + dx * 3, cx - dx * 2 + dy * 3, cy - dy * 2 - dx * 3]).fill({
      color,
      alpha: 0.8,
    });
  }

  private drawOverlay(world: World): void {
    const g = this.overlay.clear();
    if (this.selectedId != null) {
      const b = world.buildings.get(this.selectedId);
      if (b) {
        const s = BUILDINGS[b.type].size * TILE;
        g.rect(b.x * TILE - 1, b.y * TILE - 1, s + 2, s + 2).stroke({ width: 1, color: 0xffffff });
      }
    }
    if (this.ghost) {
      const size = BUILDINGS[this.ghost.type].size * TILE;
      const color = this.ghost.valid ? PALETTE.ghostOk : PALETTE.ghostBad;
      for (const t of this.ghost.tiles) {
        g.rect(t.x * TILE, t.y * TILE, size, size).fill({ color, alpha: 0.35 });
        if (BUILDINGS[this.ghost.type].rotatable) this.arrow(g, t.x * TILE, t.y * TILE, t.rot, color);
      }
    }
  }
}
