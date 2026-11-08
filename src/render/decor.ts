/**
 * Décors des pièces : des « assets » (lampes, cadres, plantes, enseignes…) posés librement dans chaque pièce,
 * avec une liste par niveau de la pièce. Chaque asset se dessine dans son propre petit canvas, à sa taille d'origine,
 * puis il est collé dans la pièce à sa place, à l'échelle voulue (au pixel près), éventuellement retourné.
 *
 * - Les assets fixes sont peints une fois dans le décor en cache de la pièce ;
 * - les assets animés (juke-box, horloge…) ou liés au mobilier acheté sont redessinés à chaque image ;
 * - un asset « devant » passe par-dessus tout le reste de la pièce (clients, machines…).
 * Les lampes déclarent leur lumière : la pièce l'ajoute à l'éclairage de ses murs et de son sol.
 */
import type { Game } from '../core/game';
import type { FurnitureId } from '../core/shop';
import { DECOR_ASSETS } from './decorAssets';
import { decorLayout, type DecorInst, type RoomKey } from './decorLayout';
import type { Bounds } from './space';

export interface DecorCtx {
  /** Niveau (le style) de la pièce où l'asset est posé. */
  lv: number;
  t: number;
  game: Game | null;
  /** Aperçu (captures de contrôle) : tout s'affiche, mobilier compris. */
  preview: boolean;
  /** Limites du canvas de l'asset (pour shade et compagnie). */
  b: Bounds;
}

export interface DecorAsset {
  id: string;
  name: string;
  /** Pièce d'origine (rangement du catalogue) ; l'asset peut être posé partout. */
  room: RoomKey;
  w: number;
  h: number;
  /** Marge autour de la boîte (ombres, halos, lueurs). */
  pad?: number;
  /** Redessiné à chaque image. */
  anim?: boolean;
  /** Ne s'affiche que si ce mobilier a été acheté. */
  furniture?: FurnitureId;
  /** Fils de suspension jusqu'au plafond, depuis (x, 0) de la boîte. */
  hang?: { xs: readonly number[]; color: string };
  /** Lumière : [x, y, rayon, intensité] dans la boîte. */
  light?: readonly [number, number, number, number];
  draw(g: CanvasRenderingContext2D, c: DecorCtx): void;
}

const byId = new Map(DECOR_ASSETS.map((a) => [a.id, a]));
export const decorAsset = (id: string) => byId.get(id);

/** L'asset est-il redessiné à chaque image (sinon, il est peint dans le décor en cache) ? */
export const isLive = (a: DecorAsset, inst: DecorInst) => !!(a.anim || a.furniture || inst.front);

const cache = new Map<string, HTMLCanvasElement>();
const scratch = new Map<string, HTMLCanvasElement>();

/** Le canvas d'un asset, dessiné à sa taille d'origine (mis en cache s'il ne bouge pas). */
function render(a: DecorAsset, lv: number, t: number, game: Game | null, preview: boolean): HTMLCanvasElement {
  const pad = a.pad ?? 0;
  const key = `${a.id}|${lv}`;
  if (!a.anim) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  let c = a.anim ? scratch.get(a.id) : undefined;
  if (!c) {
    c = document.createElement('canvas');
    c.width = a.w + pad * 2;
    c.height = a.h + pad * 2;
    if (a.anim) scratch.set(a.id, c);
  }
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  g.translate(pad, pad);
  a.draw(g, { lv, t, game, preview, b: { L: -pad, R: a.w + pad, T: -pad, B: a.h + pad, ox: pad, oy: pad } });
  if (!a.anim) cache.set(key, c);
  return c;
}

/** Le canvas d'un asset, à sa taille d'origine (marges comprises) : pour l'afficher ailleurs que dans une pièce. */
export function assetCanvas(id: string, lv: number, t: number, game: Game | null): HTMLCanvasElement | null {
  const a = byId.get(id);
  return a ? render(a, lv, t, game, false) : null;
}

/** Oublie les assets en cache (après une purge mémoire d'iOS). */
export function clearDecorCache(): void {
  cache.clear();
}

/** Colle un asset dans la pièce (g est dans le repère du plan de la pièce). */
function place(g: CanvasRenderingContext2D, inst: DecorInst, a: DecorAsset, lv: number, t: number, game: Game | null, preview: boolean, top: number): void {
  const s = inst.s || 1;
  const pad = a.pad ?? 0;
  if (a.hang) {
    g.fillStyle = a.hang.color;
    for (const hxs of a.hang.xs) {
      const hx = inst.f ? inst.x + (a.w - hxs - 1) * s : inst.x + hxs * s;
      g.fillRect(Math.round(hx), top, Math.max(1, Math.round(s)), Math.round(inst.y) - top);
    }
  }
  const c = render(a, lv, t, game, preview);
  const w = Math.round(c.width * s);
  const h = Math.round(c.height * s);
  const x = Math.round(inst.x - pad * s);
  const y = Math.round(inst.y - pad * s);
  g.imageSmoothingEnabled = false;
  if (inst.f) {
    g.save();
    g.translate(x + w, y);
    g.scale(-1, 1);
    g.drawImage(c, 0, 0, w, h);
    g.restore();
  } else g.drawImage(c, x, y, w, h);
}

export interface DecorDraw {
  room: RoomKey;
  lv: number;
  t: number;
  game: Game | null;
  preview: boolean;
  /** Haut de l'écran, dans le plan (pour les fils de suspension). */
  top: number;
}

const visible = (a: DecorAsset, d: DecorDraw) => d.preview || !a.furniture || !d.game || d.game.hasFurniture(a.furniture);

/** Les assets fixes, peints dans le décor en cache de la pièce. */
export function paintDecor(g: CanvasRenderingContext2D, d: DecorDraw): void {
  for (const inst of decorLayout[d.room]?.[d.lv] ?? []) {
    const a = byId.get(inst.a);
    if (a && !isLive(a, inst)) place(g, inst, a, d.lv, d.t, d.game, d.preview, d.top);
  }
}

/** Les assets redessinés à chaque image : derrière le reste (front = false) ou devant (front = true). */
export function drawDecor(g: CanvasRenderingContext2D, d: DecorDraw, front: boolean): void {
  for (const inst of decorLayout[d.room]?.[d.lv] ?? []) {
    const a = byId.get(inst.a);
    if (!a || !isLive(a, inst) || !!inst.front !== front || !visible(a, d)) continue;
    place(g, inst, a, d.lv, d.t, d.game, d.preview, d.top);
  }
}

/** Les lumières des lampes posées dans la pièce, au format de wallLight : [x, y, rayon, intensité]. */
export function decorLights(room: RoomKey, lv: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const inst of decorLayout[room]?.[lv] ?? []) {
    const a = byId.get(inst.a);
    if (!a?.light) continue;
    const s = inst.s || 1;
    const [lx, ly, r, k] = a.light;
    out.push([inst.x + (inst.f ? a.w - lx : lx) * s, inst.y + ly * s, r * s, k]);
  }
  return out;
}

/** Boîte d'un asset posé. */
export function instBox(inst: DecorInst): { x: number; y: number; w: number; h: number } | null {
  const a = byId.get(inst.a);
  if (!a) return null;
  const s = inst.s || 1;
  return { x: inst.x, y: inst.y, w: a.w * s, h: a.h * s };
}
