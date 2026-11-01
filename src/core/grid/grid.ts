import { DX, DY, type Dir } from '../dir';

export const EMPTY = 0;

/**
 * Grille d'occupation. Chaque case contient l'id du bâtiment qui l'occupe (0 = vide).
 * Allouée à la taille maximale ; seul le rectangle [0, unlockedW) x [0, unlockedH) est constructible.
 */
export class Grid {
  private readonly cells: Int32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    public unlockedW: number,
    public unlockedH: number,
  ) {
    this.cells = new Int32Array(width * height);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isUnlocked(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.unlockedW && y < this.unlockedH;
  }

  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.cells[y * this.width + x]! : EMPTY;
  }

  /** Id du voisin dans la direction `d` depuis (x, y). */
  neighbor(x: number, y: number, d: Dir): number {
    return this.get(x + DX[d]!, y + DY[d]!);
  }

  canPlace(x: number, y: number, size: number): boolean {
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        if (!this.isUnlocked(x + i, y + j) || this.get(x + i, y + j) !== EMPTY) return false;
      }
    return true;
  }

  fill(id: number, x: number, y: number, size: number): void {
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) this.cells[(y + j) * this.width + (x + i)] = id;
  }

  clear(x: number, y: number, size: number): void {
    this.fill(EMPTY, x, y, size);
  }

  unlock(w: number, h: number): void {
    this.unlockedW = Math.min(Math.max(w, this.unlockedW), this.width);
    this.unlockedH = Math.min(Math.max(h, this.unlockedH), this.height);
  }
}
