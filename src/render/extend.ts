/**
 * Prolonge le décor d'une pièce au-delà de ses 160 × 300 px, pour remplir tout l'écran quel que soit son format.
 * Chaque ligne du décor (murs, passerelles, sols) est le plus souvent un motif qui se répète : on cherche sa période
 * près du bord et on la recopie vers l'extérieur, si bien que briques, carrelage et planchers continuent sans couture.
 * Une ligne sans motif répété prolonge simplement sa couleur de bord. Même chose en hauteur, colonne par colonne.
 */

/** Plus petite période p d'une suite de pixels, cherchée à partir des positions `starts` ; null s'il n'y en a pas. */
function findPeriod(at: (i: number) => number, n: number, starts: readonly number[], maxP: number): { s: number; p: number } | null {
  for (const s of starts) {
    for (let p = 1; p <= maxP; p++) {
      const len = Math.max(2 * p, 16);
      if (s + len + p > n) break;
      let ok = true;
      for (let i = s; i < s + len && ok; i++) ok = at(i) === at(i + p);
      if (ok) return { s, p };
    }
  }
  return null;
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

/**
 * Prolonge une suite de n pixels (lus par `at`) de `before` pixels avant et `after` après.
 * Renvoie, pour chaque position étendue, l'index du pixel source.
 */
function extendLine(at: (i: number) => number, n: number, before: number, after: number, maxP: number): Int32Array {
  const out = new Int32Array(before + n + after);
  const starts = [0, 2, 4, 8, 12, 16, 24, 32, 40];
  const left = before > 0 ? findPeriod(at, n, starts, maxP) : null;
  const right = after > 0 ? findPeriod((i) => at(n - 1 - i), n, starts, maxP) : null;
  for (let k = 0; k < out.length; k++) {
    const x = k - before;
    if (x >= 0 && x < n) out[k] = x;
    else if (x < 0) out[k] = left ? left.s + mod(x - left.s, left.p) : 0;
    else {
      // en miroir : on travaille sur la ligne lue depuis la droite
      const r = n - 1 - x;
      out[k] = right ? n - 1 - (right.s + mod(r - right.s, right.p)) : n - 1;
    }
  }
  return out;
}

/**
 * Dessine dans `out` (w × h px) le décor `src` placé en (ox, oy), prolongé tout autour.
 * Les ailes sont légèrement assombries vers l'extérieur : le regard reste sur la pièce.
 */
export function extendBackdrop(src: HTMLCanvasElement, out: HTMLCanvasElement, w: number, h: number, ox: number, oy: number): void {
  const sw = src.width;
  const sh = src.height;
  out.width = w;
  out.height = h;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  let pix: Uint32Array;
  try {
    pix = new Uint32Array(src.getContext('2d')!.getImageData(0, 0, sw, sh).data.buffer);
  } catch {
    return;
  }
  const after = w - ox - sw;
  // 1. en largeur, ligne par ligne
  const wide = new Uint32Array(w * sh);
  for (let y = 0; y < sh; y++) {
    const row = y * sw;
    const map = extendLine((i) => pix[row + i]!, sw, ox, Math.max(0, after), 48);
    for (let x = 0; x < w; x++) wide[y * w + x] = pix[row + map[x]!]!;
  }
  // 2. en hauteur, colonne par colonne
  const full = new Uint32Array(w * h);
  const below = h - oy - sh;
  for (let x = 0; x < w; x++) {
    const map = extendLine((i) => wide[i * w + x]!, sh, oy, Math.max(0, below), 48);
    for (let y = 0; y < h; y++) full[y * w + x] = wide[map[y]! * w + x]!;
  }
  const img = new ImageData(new Uint8ClampedArray(full.buffer), w, h);
  g.putImageData(img, 0, 0);
  // ombre des ailes
  const shade = (x0: number, x1: number, horizontal: boolean) => {
    const grad = horizontal ? g.createLinearGradient(x0, 0, x1, 0) : g.createLinearGradient(0, x0, 0, x1);
    grad.addColorStop(0, 'rgba(10,6,14,0.12)');
    grad.addColorStop(1, 'rgba(10,6,14,0.45)');
    g.fillStyle = grad;
  };
  if (ox > 0) { shade(ox, 0, true); g.fillRect(0, 0, ox, h); }
  if (after > 0) { shade(ox + sw, w, true); g.fillRect(ox + sw, 0, after, h); }
  if (oy > 0) { shade(oy, 0, false); g.fillRect(ox, 0, sw, oy); }
  if (below > 0) { shade(oy + sh, h, false); g.fillRect(ox, oy + sh, sw, below); }
}
