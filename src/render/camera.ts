import type { Container } from 'pixi.js';

export const TILE = 16; // px par case (art en 16x16)

/**
 * Caméra tactile : glisser à un doigt = déplacer (en mode navigation), pincer = zoomer.
 * Le zoom est arrondi au 0.5 près pour garder des pixels nets.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 3;
  minZoom = 0.5; // vue d'ensemble ; les zooms entiers restent privilégiés par snapZoom()
  maxZoom = 8;

  constructor(private layer: Container) {}

  apply(): void {
    this.layer.scale.set(this.zoom);
    this.layer.position.set(Math.round(this.x), Math.round(this.y));
  }

  /** Cadre une zone (en cases) dans le rectangle écran visible (hors barres d'interface). */
  fit(widthTiles: number, heightTiles: number, view: { x: number; y: number; w: number; h: number }, margin = 0.92): void {
    const z = Math.min((view.w * margin) / (widthTiles * TILE), (view.h * margin) / (heightTiles * TILE));
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, z >= 1 ? Math.floor(z) : Math.floor(z * 4) / 4));
    this.x = view.x + (view.w - widthTiles * TILE * this.zoom) / 2;
    this.y = view.y + (view.h - heightTiles * TILE * this.zoom) / 2;
    this.apply();
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.apply();
  }

  /** Zoom autour d'un point écran (centre du pincement). */
  zoomAt(factor: number, sx: number, sy: number): void {
    const next = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const wx = (sx - this.x) / this.zoom;
    const wy = (sy - this.y) / this.zoom;
    this.zoom = next;
    this.x = sx - wx * next;
    this.y = sy - wy * next;
    this.apply();
  }

  snapZoom(): void {
    this.zoom = Math.max(this.minZoom, this.zoom >= 1 ? Math.round(this.zoom) : Math.round(this.zoom * 4) / 4);
    this.apply();
  }

  screenToTile(sx: number, sy: number): { x: number; y: number } {
    return { x: Math.floor((sx - this.x) / (this.zoom * TILE)), y: Math.floor((sy - this.y) / (this.zoom * TILE)) };
  }
}
