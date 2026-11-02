/**
 * Peintre pixel art « 32-bit » : dessin au pixel près sur canvas à résolution native, palettes riches,
 * tramage ordonné aux transitions d'ombrage, contour coloré (version assombrie de la couleur voisine).
 */
export type Shades = readonly string[]; // du plus clair au plus sombre

export const PAL = {
  cu: ['#fff1c9', '#ffd08a', '#f0a95a', '#d4823a', '#a85c26', '#723818'] as Shades, // cuivre
  st: ['#ffffff', '#e8eef4', '#c4d0dc', '#98a6b6', '#6c7a8c', '#465264'] as Shades, // inox
  pl: ['#ffffff', '#f4f1e8', '#ddd7c6', '#bdb59e', '#948b74', '#6b6452'] as Shades, // plastique alimentaire
  wd: ['#ffd9a0', '#e8b070', '#c88a4a', '#a06830', '#744620', '#4c2c14'] as Shades, // bois
  br: ['#fff4b0', '#ffd860', '#e8b030', '#b88420', '#8a5c14', '#5c3a0c'] as Shades, // laiton
  gl: ['#f0fffc', '#c8f0e8', '#98d8cc', '#68b4a8', '#3e8a80', '#245c56'] as Shades, // verre
  ir: ['#8c88a0', '#6c6884', '#545068', '#3e3a50', '#2c283a', '#1c1828'] as Shades, // fonte
  bl: ['#c8ecff', '#8cd0ff', '#4ea8f0', '#2e7cc8', '#1e5494', '#123460'] as Shades, // bleu (glycol, moteurs)
  rd: ['#ffc4b0', '#ff8a6a', '#e85a3a', '#b83a24', '#842416', '#54140c'] as Shades,
  gr: ['#d8ffb0', '#a8e870', '#6cc040', '#3e9028', '#246018', '#143c0c'] as Shades,
  tl: ['#c0fff0', '#80e8d0', '#40c0a8', '#28907c', '#186454', '#0c3c32'] as Shades, // turquoise
  beer: ['#fff0a0', '#ffd860', '#f2b330', '#d88a1c', '#a85e10', '#6e3a08'] as Shades,
  wort: ['#f8d890', '#e8b860', '#c88a38', '#a06424', '#744418', '#4c2c10'] as Shades,
  water: ['#e0f6ff', '#a8e0ff', '#6cc0f0', '#3c94d0', '#2068a8', '#104078'] as Shades,
  malt: ['#fff0c0', '#f0d48c', '#d8b060', '#b88c40', '#8c6428', '#5c4018'] as Shades,
};

const BAYER = [
  [0, 2],
  [3, 1],
];

export class Painter {
  readonly c: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  constructor(readonly w: number, readonly h: number) {
    this.c = document.createElement('canvas');
    this.c.width = w;
    this.c.height = h;
    this.g = this.c.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    if (w <= 0 || h <= 0) return;
    this.g.fillStyle = color;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  px(x: number, y: number, color: string) {
    this.rect(x, y, 1, 1, color);
  }
  hl(x: number, y: number, w: number, c: string) {
    this.rect(x, y, w, 1, c);
  }
  vl(x: number, y: number, h: number, c: string) {
    this.rect(x, y, 1, h, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = -ry; y <= ry; y++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.3))));
      this.hl(cx - half, cy + y, half * 2 + 1, c);
    }
  }
  /** Teinte selon la position horizontale sur un cylindre (lumière venant de la gauche), avec tramage. */
  shadeAt(t: number, s: Shades, x: number, y: number): string {
    const stops = [0.06, 0.2, 0.32, 0.4, 0.62, 0.8, 0.93];
    const idx = [3, 2, 1, 0, 2, 3, 4, 5];
    let i = 0;
    while (i < stops.length && t > stops[i]!) i++;
    // tramage près des transitions
    const prev = stops[i - 1] ?? -1;
    const next = stops[i] ?? 2;
    const near = Math.min(t - prev, next - t);
    if (near < 0.025 && i > 0 && i < stops.length && BAYER[y & 1]![x & 1]! >= 2) {
      const other = t - prev < next - t ? idx[i - 1]! : idx[i + 1]!;
      return s[other]!;
    }
    return s[idx[i]!]!;
  }
  /** Corps cylindrique vertical. */
  cylinder(x: number, y: number, w: number, h: number, s: Shades) {
    for (let i = 0; i < w; i++) {
      const t = (i + 0.5) / w;
      for (let j = 0; j < h; j++) this.px(x + i, y + j, this.shadeAt(t, s, x + i, y + j));
    }
  }
  /** Cerclage (bande en relief) sur un cylindre. */
  band(x: number, y: number, w: number, s: Shades) {
    for (let i = 0; i < w; i++) {
      const t = (i + 0.5) / w;
      this.px(x + i, y, s[Math.max(0, (t < 0.4 ? 1 : t < 0.75 ? 2 : 4) - 1)]!);
      this.px(x + i, y + 1, s[t < 0.4 ? 3 : t < 0.75 ? 4 : 5]!);
    }
  }
  /** Dôme (haut de cuve). */
  dome(x: number, y: number, w: number, h: number, s: Shades) {
    for (let j = 0; j < h; j++) {
      const k = (j + 1) / h;
      const half = Math.round((w / 2) * Math.sqrt(1 - (1 - k) * (1 - k)));
      const x0 = Math.round(x + w / 2 - half);
      for (let i = 0; i < half * 2; i++) this.px(x0 + i, y + j, this.shadeAt((x0 + i - x + 0.5) / w, s, x0 + i, y + j));
    }
  }
  /** Fond conique (cuves de fermentation). */
  cone(x: number, y: number, w: number, h: number, s: Shades, tip = 4) {
    for (let j = 0; j < h; j++) {
      const ww = Math.round(w - ((w - tip) * j) / h);
      const x0 = Math.round(x + (w - ww) / 2);
      for (let i = 0; i < ww; i++) this.px(x0 + i, y + j, this.shadeAt((x0 + i - x + 0.5) / w, s, x0 + i, y + j));
    }
  }
  rivets(x: number, y: number, w: number, step: number, s: Shades) {
    for (let i = 2; i < w - 1; i += step) {
      this.px(x + i, y, s[1]!);
      this.px(x + i, y + 1, s[4]!);
    }
  }
  legs(x0: number, x1: number, y: number, h: number, s: Shades = PAL.ir) {
    for (const x of [x0, x1]) {
      this.rect(x, y, 3, h, s[2]!);
      this.vl(x, y, h, s[1]!);
      this.vl(x + 2, y, h, s[4]!);
      this.rect(x - 1, y + h - 1, 5, 1, s[3]!);
    }
  }
  gauge(cx: number, cy: number) {
    this.ellipse(cx, cy, 3, 3, PAL.ir[2]!);
    this.ellipse(cx, cy, 2, 2, PAL.pl[1]!);
    this.px(cx, cy, PAL.rd[3]!);
    this.px(cx + 1, cy - 1, PAL.rd[3]!);
  }
  thermometer(x: number, y: number, h: number) {
    this.rect(x, y, 3, h, PAL.st[3]!);
    this.rect(x + 1, y + 1, 1, h - 2, PAL.pl[1]!);
    this.rect(x + 1, y + Math.floor(h / 2), 1, h - Math.floor(h / 2) - 1, PAL.rd[2]!);
    this.rect(x, y + h, 3, 2, PAL.rd[2]!);
  }
  valveWheel(cx: number, cy: number) {
    this.rect(cx - 2, cy, 5, 1, PAL.rd[2]!);
    this.rect(cx, cy - 2, 1, 5, PAL.rd[2]!);
    this.px(cx, cy, PAL.rd[0]!);
  }
  panel(x: number, y: number, w: number, h: number) {
    this.rect(x, y, w, h, PAL.ir[3]!);
    this.hl(x, y, w, PAL.ir[1]!);
    this.rect(x + 1, y + 2, w - 2, 3, '#1c3c2c');
    this.px(x + 2, y + 3, '#7cff9c');
    for (let i = 0; i < 3; i++) this.px(x + 2 + i * 2, y + h - 2, [PAL.gr[2]!, PAL.br[2]!, PAL.rd[2]!][i]!);
  }
  /** Contour coloré : chaque pixel de bord prend une version assombrie de son voisin. */
  outline(strength = 0.42) {
    const img = this.g.getImageData(0, 0, this.w, this.h);
    const d = img.data;
    const out = new Uint8ClampedArray(d);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : (y * this.w + x) * 4);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = at(x, y);
        if (d[i + 3]! > 0) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const j = at(x + dx, y + dy);
          if (j < 0 || d[j + 3]! < 200) continue;
          out[i] = d[j]! * strength;
          out[i + 1] = d[j + 1]! * strength;
          out[i + 2] = d[j + 2]! * strength * 1.15;
          out[i + 3] = 255;
          break;
        }
      }
    img.data.set(out);
    this.g.putImageData(img, 0, 0);
  }
}
