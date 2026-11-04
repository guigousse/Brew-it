/** Dessin des étiquettes : aperçu de l'éditeur (grand format) et miniature sur les bouteilles. */
import type { Label } from '../core/label';

const EMBLEM_PIXELS: Record<Exclude<Label['emblem'], 'none'>, string[]> = {
  hop: ['....#....', '...###...', '..#####..', '.##.#.##.', '..#####..', '.##.#.##.', '..#####..', '...###...', '....#....'],
  wheat: ['....#....', '...#.#...', '....#....', '...#.#...', '....#....', '...#.#...', '....#....', '....#....', '....#....'],
  barrel: ['..#####..', '.#.....#.', '#########', '#.......#', '#.......#', '#.......#', '#########', '.#.....#.', '..#####..'],
  star: ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '##.....##'],
  crown: ['#...#...#', '##.###.##', '#########', '#########', '#.#.#.#.#', '#########', '.........', '.........', '.........'],
  anchor: ['...###...', '...#.#...', '...###...', '....#....', '.#######.', '....#....', '#...#...#', '.#..#..#.', '..#####..'],
  mountain: ['.........', '....#....', '...###...', '..##.##..', '..#...#..', '.#.....#.', '#..#....#', '#.###...#', '#########'],
  leaf: ['.......##', '.....####', '...######', '..####.##', '.####.###', '.###.####', '.##.####.', '.#.####..', '#........'],
  bee: ['..#...#..', '...#.#...', '.#######.', '#.#.#.#.#', '#########', '#.#.#.#.#', '.#######.', '...###...', '....#....'],
  sun: ['....#....', '.#..#..#.', '..#####..', '..#####..', '#########', '..#####..', '..#####..', '.#..#..#.', '....#....'],
  fish: ['.........', '..####...', '.######.#', '##.#####.', '########.', '.######.#', '..####...', '.........', '.........'],
  castle: ['#.#...#.#', '###...###', '###.#.###', '#########', '#########', '###...###', '###...###', '###...###', '#########'],
  skull: ['..#####..', '.#######.', '#########', '#..#.#..#', '#..#.#..#', '#########', '.###.###.', '..#.#.#..', '..#####..'],
};

const FONT_FAMILY: Record<Label['font'], string> = {
  pixel: '"Silkscreen", monospace',
  retro: '"VT323", monospace',
  classic: 'Georgia, "Times New Roman", serif',
};

function shapePath(g: CanvasRenderingContext2D, shape: Label['shape'], w: number, h: number) {
  g.beginPath();
  switch (shape) {
    case 'oval':
      g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'shield':
      g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h * 0.55); g.quadraticCurveTo(w, h * 0.85, w / 2, h); g.quadraticCurveTo(0, h * 0.85, 0, h * 0.55);
      break;
    case 'ribbon':
      g.moveTo(0, h * 0.15); g.lineTo(w * 0.08, 0); g.lineTo(w * 0.92, 0); g.lineTo(w, h * 0.15); g.lineTo(w * 0.94, h / 2); g.lineTo(w, h * 0.85);
      g.lineTo(w * 0.92, h); g.lineTo(w * 0.08, h); g.lineTo(0, h * 0.85); g.lineTo(w * 0.06, h / 2);
      break;
    case 'round': {
      const r = Math.min(w, h) * 0.22;
      g.roundRect(0, 0, w, h, r);
      break;
    }
    case 'arch':
      g.moveTo(0, h); g.lineTo(0, h * 0.42); g.ellipse(w / 2, h * 0.42, w / 2, h * 0.42, 0, Math.PI, 0); g.lineTo(w, h);
      break;
    case 'notched': {
      const r = Math.min(w, h) * 0.2;
      g.moveTo(r, 0); g.lineTo(w - r, 0); g.arc(w, 0, r, Math.PI, Math.PI / 2, true); g.lineTo(w, h - r); g.arc(w, h, r, -Math.PI / 2, Math.PI, true);
      g.lineTo(r, h); g.arc(0, h, r, 0, -Math.PI / 2, true); g.lineTo(0, r); g.arc(0, 0, r, Math.PI / 2, 0, true);
      break;
    }
    default:
      g.rect(0, 0, w, h);
  }
  g.closePath();
}

function pattern(g: CanvasRenderingContext2D, l: Label, w: number, h: number, unit: number) {
  g.fillStyle = l.patternColor;
  const u = unit;
  switch (l.pattern) {
    case 'stripes':
      for (let x = 0; x < w; x += u * 4) g.fillRect(x, 0, u * 2, h);
      break;
    case 'dots':
      for (let y = u; y < h; y += u * 4) for (let x = ((y / (u * 4)) % 2) * u * 2 + u; x < w; x += u * 4) g.fillRect(x, y, u, u);
      break;
    case 'diamonds':
      for (let y = 0; y < h; y += u * 6) for (let x = 0; x < w; x += u * 6) {
        g.beginPath(); g.moveTo(x + u * 3, y); g.lineTo(x + u * 6, y + u * 3); g.lineTo(x + u * 3, y + u * 6); g.lineTo(x, y + u * 3); g.fill();
      }
      break;
    case 'waves':
      for (let y = u * 2; y < h; y += u * 5) for (let x = 0; x < w; x += u) g.fillRect(x, y + Math.round(Math.sin(x / (u * 2)) * u), u, u);
      break;
    case 'checks':
      for (let y = 0; y < h; y += u * 3) for (let x = 0; x < w; x += u * 3) if (((x + y) / (u * 3)) % 2 === 0) g.fillRect(x, y, u * 3, u * 3);
      break;
    case 'zigzag':
      for (let y = 0; y < h; y += u * 6) for (let x = 0; x < w; x += u) g.fillRect(x, y + Math.abs(((x / u) % 6) - 3) * u, u, u);
      break;
    case 'scales':
      for (let y = 0, row = 0; y < h + u * 4; y += u * 3, row++) for (let x = (row % 2) * u * 3 - u * 3; x < w; x += u * 6) {
        g.beginPath(); g.arc(x + u * 3, y, u * 3, 0, Math.PI); g.lineTo(x + u * 2, y); g.arc(x + u * 3, y, u * 2, Math.PI, 0, true); g.fill();
      }
      break;
    case 'herringbone':
      for (let y = 0; y < h; y += u * 4) for (let x = 0; x < w; x += u * 4) {
        const up = ((x / (u * 4)) % 2) === 0;
        for (let k = 0; k < 4; k++) g.fillRect(x + k * u, y + (up ? 3 - k : k) * u, u, u);
      }
      break;
    case 'tartan':
      g.globalAlpha = 0.45;
      for (let x = 0; x < w; x += u * 10) g.fillRect(x, 0, u * 4, h);
      for (let y = 0; y < h; y += u * 10) g.fillRect(0, y, w, u * 4);
      g.globalAlpha = 1;
      for (let x = u * 7; x < w; x += u * 10) g.fillRect(x, 0, u, h);
      for (let y = u * 7; y < h; y += u * 10) g.fillRect(0, y, w, u);
      break;
    case 'rays':
      g.save();
      g.translate(w / 2, h / 2);
      for (let i = 0; i < 12; i += 2) {
        g.beginPath(); g.moveTo(0, 0);
        g.arc(0, 0, Math.max(w, h), (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
        g.fill();
      }
      g.restore();
      break;
  }
}

/** Rend le texte sans anticrénelage (seuil sur l'opacité) pour rester dans le style pixel. */
function crispText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, color: string, font: Label['font'], size: number) {
  const c = document.createElement('canvas');
  c.width = g.canvas.width;
  c.height = g.canvas.height;
  const t = c.getContext('2d')!;
  let s = size;
  do {
    t.font = `${font === 'classic' ? 'italic bold ' : ''}${s}px ${FONT_FAMILY[font]}`;
    s--;
  } while (t.measureText(text).width > maxW && s > 6);
  t.textAlign = 'center';
  t.textBaseline = 'middle';
  t.fillStyle = color;
  t.fillText(text, x, y);
  const img = t.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i]! > 110 ? 255 : 0;
  t.putImageData(img, 0, 0);
  g.drawImage(c, 0, 0);
}

/** Grand format (éditeur, fiches) : 120 × 76 px natifs. */
export function drawLabel(canvas: HTMLCanvasElement, l: Label, name: string): void {
  const w = (canvas.width = 120);
  const h = (canvas.height = 76);
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, w, h);
  g.save();
  shapePath(g, l.shape, w, h);
  g.clip();
  g.fillStyle = l.bg;
  g.fillRect(0, 0, w, h);
  pattern(g, l, w, h, 2);
  // bandeau clair derrière le nom pour la lisibilité
  g.fillStyle = l.bg;
  g.fillRect(8, h - 30, w - 16, 20);
  g.restore();
  g.save();
  shapePath(g, l.shape, w, h);
  g.lineWidth = 3;
  g.strokeStyle = l.textColor;
  g.stroke();
  g.restore();
  if (l.emblem !== 'none') {
    const px = EMBLEM_PIXELS[l.emblem];
    const s = 3;
    const ox = Math.round(w / 2 - (9 * s) / 2);
    const oy = 7;
    g.fillStyle = l.bg;
    g.fillRect(ox - 3, oy - 3, 9 * s + 6, 9 * s + 6);
    g.fillStyle = l.textColor;
    px.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && g.fillRect(ox + x * s, oy + y * s, s, s)));
  }
  crispText(g, name || 'Ma bière', w / 2, h - 20, w - 20, l.textColor, l.font, l.font === 'retro' ? 18 : 12);
}

/** Miniature sur la bouteille ou le carton (carré de `size` px). */
export function drawMiniLabel(g: CanvasRenderingContext2D, l: Label, x: number, y: number, size = 5): void {
  const n = size;
  g.fillStyle = l.textColor;
  g.fillRect(x - 0, y - 0, n, n);
  g.fillStyle = l.bg;
  g.fillRect(x, y + 1, n, n - 2);
  g.fillStyle = l.patternColor;
  if (l.pattern === 'stripes' || l.pattern === 'rays') for (let i = 0; i < n; i += 2) g.fillRect(x + i, y + 1, 1, n - 2);
  else if (l.pattern === 'checks' || l.pattern === 'diamonds') for (let i = 0; i < n; i += 2) g.fillRect(x + i, y + 1 + (i % 4 ? 1 : 0), 1, 1);
  else if (l.pattern !== 'none') g.fillRect(x, y + n - 2, n, 1);
  g.fillStyle = l.textColor;
  const c = Math.floor(n / 2);
  g.fillRect(x + c - 1, y + 2, 2, Math.max(1, n - 4));
}
