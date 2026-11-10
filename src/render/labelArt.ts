/** Dessin des étiquettes : aperçu de l'éditeur (grand format) et miniature sur les bouteilles. */
import { gemStone, type Label } from '../core/label';

const EMBLEM_PIXELS: Record<Exclude<Label['emblem'], 'none' | 'gem'>, string[]> = {
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

/**
 * Diamant taillé vu de dessus (cosmétique de luxe) : la table au centre, les facettes en étoile autour,
 * la lumière en haut à gauche. Les lettres a à e vont du plus clair au plus sombre de la pierre choisie.
 */
const GEM_TOP = gemTop(11);

/**
 * La taille brillant vue de dessus, calculée : un octogone, la table au centre, et autour huit secteurs
 * coupés chacun en deux facettes (une claire, une sombre) éclairées depuis le haut à gauche.
 */
function gemTop(n: number): string[] {
  const c = (n - 1) / 2;
  const rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const dx = x - c;
      const dy = y - c;
      const oct = Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) * 0.72);
      if (oct > c + 0.4) { row += '.'; continue; }
      if (oct > c - 0.6) { row += 'k'; continue; }
      if (oct < 1.6) { // la table : claire, un éclat en haut à gauche
        row += dx < 0 && dy < 0 ? 'w' : dx + dy <= 0 ? 'a' : 'b';
        continue;
      }
      if (oct < 2.2) { row += dx + dy < 0 ? 'b' : 'd'; continue; } // l'arête de la table
      const t = Math.atan2(dy, dx);
      const light = Math.cos(t + (3 * Math.PI) / 4); // 1 en haut à gauche, -1 en bas à droite
      const half = Math.floor(((t + Math.PI) / (Math.PI / 4)) * 2) % 2; // deux facettes par secteur
      const v = light + (half ? 0.45 : -0.45);
      row += v > 0.9 ? 'a' : v > 0.2 ? 'b' : v > -0.4 ? 'c' : v > -1 ? 'd' : 'e';
    }
    rows.push(row);
  }
  return rows;
}
const gemColors = (l: Label): Record<string, string> => {
  const st = gemStone(l.gem);
  return { k: '#1b1424', w: '#ffffff', a: st.a, b: st.b, c: st.c, d: st.d, e: st.e };
};

/** Fleur de lys (motif de luxe) : la silhouette ; le contour et l'ombrage en relief sont calculés (fleurShaded). */
const FLEUR_SHAPE = [
  '.......#.......',
  '......###......',
  '......###......',
  '.....#####.....',
  '.....#####.....',
  '....#######....',
  '.##.#######.##.',
  '###..#####..###',
  '##.#..###..#.##',
  '#..##.###.##..#',
  '#...###.###...#',
  '...#########...',
  '...#########...',
  '.....##.##.....',
  '....##.#.##....',
  '......###......',
  '.......#.......',
];
/**
 * Ombrage d'or poli : bord gauche et haut clairs, bord droit et bas sombres, cœur doré ;
 * tout autour, un contour brun (o) qui détache la fleur du fond.
 */
const FLEUR = ((rows: string[]) => {
  const H = rows.length;
  const W = rows[0]!.length;
  const on = (x: number, y: number) => rows[y]?.[x] === '#';
  const out: string[] = [];
  for (let y = -1; y <= H; y++) {
    let line = '';
    for (let x = -1; x <= W; x++) {
      if (on(x, y)) {
        const r = !on(x + 1, y);
        const b = !on(x, y + 1);
        const l = !on(x - 1, y);
        const t = !on(x, y - 1);
        line += r || b ? (l || t ? 'g' : 'd') : l || t ? 'h' : 'g';
      } else line += on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) ? 'o' : '.';
    }
    out.push(line);
  }
  return out;
})(FLEUR_SHAPE);
const GOLD: Record<string, string> = { h: '#ffe7a0', g: '#f2c14e', d: '#b07a2a', o: '#4a2a08' };

function sprite(g: CanvasRenderingContext2D, rows: string[], colors: Record<string, string>, x: number, y: number, s: number): void {
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = colors[ch];
    if (!c) return;
    g.fillStyle = c;
    g.fillRect(x + i * s, y + j * s, s, s);
  }));
}

/** Silhouette d'un sprite, d'une seule couleur (ombre portée du relief). */
function silhouette(g: CanvasRenderingContext2D, rows: string[], x: number, y: number, s: number, color: string): void {
  g.fillStyle = color;
  rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && g.fillRect(x + i * s, y + j * s, s, s)));
}

/** Un éclat de lumière en croix (3 px de bras). */
function glint(g: CanvasRenderingContext2D, x: number, y: number, s = 1): void {
  g.fillStyle = '#ffffff';
  g.fillRect(x - s, y, s * 3, s);
  g.fillRect(x, y - s, s, s * 3);
}

const FONT_FAMILY: Record<Label['font'], string> = {
  pixel: '"Silkscreen", monospace',
  retro: '"VT323", monospace',
  classic: 'Georgia, "Times New Roman", serif',
};

/**
 * Cartouche baroque : coins creusés, une volute en dôme au milieu du haut et du bas.
 * `i` rentre le tracé dans le canevas pour que le cadre doré tienne entier.
 */
function baroquePath(g: CanvasRenderingContext2D, w: number, h: number, i = 0) {
  const m = 6 + i;
  const r = 10;
  const c = w / 2;
  const L = i;
  const R = w - i;
  g.moveTo(L + r, m);
  g.lineTo(c - 20, m);
  g.bezierCurveTo(c - 10, m, c - 9, i, c, i);
  g.bezierCurveTo(c + 9, i, c + 10, m, c + 20, m);
  g.lineTo(R - r, m);
  g.arc(R, m, r, Math.PI, Math.PI / 2, true);
  g.lineTo(R, h - m - r);
  g.arc(R, h - m, r, -Math.PI / 2, Math.PI, true);
  g.lineTo(c + 20, h - m);
  g.bezierCurveTo(c + 10, h - m, c + 9, h - i, c, h - i);
  g.bezierCurveTo(c - 9, h - i, c - 10, h - m, c - 20, h - m);
  g.lineTo(L + r, h - m);
  g.arc(L, h - m, r, 0, -Math.PI / 2, true);
  g.lineTo(L, m + r);
  g.arc(L, m, r, Math.PI / 2, 0, true);
}

/** Cadre doré biseauté du cartouche, avec ses volutes et un éclat. */
function baroqueFrame(g: CanvasRenderingContext2D, l: Label, w: number, h: number) {
  const stroke = (width: number, color: string, dx = 0, dy = 0, inset = 2) => {
    g.save();
    g.translate(dx, dy);
    g.beginPath();
    baroquePath(g, w, h, inset);
    g.closePath();
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
    g.restore();
  };
  stroke(5, '#5a3a0c');
  stroke(3, '#f2c14e');
  stroke(1, '#ffe7a0', -1, -1); // biseau : lumière en haut à gauche
  stroke(1, '#a8742a', 1, 1); // ombre en bas à droite
  // filet intérieur, à la couleur du texte
  g.save();
  g.translate(w * 0.06, h * 0.08);
  g.scale(0.88, 0.84);
  g.beginPath();
  baroquePath(g, w, h, 2);
  g.closePath();
  g.lineWidth = 1.2;
  g.strokeStyle = l.textColor;
  g.stroke();
  g.restore();
  // volutes : une petite crosse dorée de chaque côté des dômes
  const curl = (x: number, y: number, dir: 1 | -1, up: 1 | -1) => {
    g.fillStyle = '#5a3a0c';
    g.fillRect(x - 1, y - 1, 4, 3);
    g.fillStyle = '#f2c14e';
    g.fillRect(x, y, 2, 1);
    g.fillRect(x + (dir > 0 ? 2 : -1), y - up, 1, 1);
    g.fillStyle = '#ffe7a0';
    g.fillRect(x, y, 1, 1);
  };
  for (const [x, dir] of [[w / 2 - 24, -1], [w / 2 + 22, 1]] as const) {
    curl(x, 9, dir, 1);
    curl(x, h - 10, dir, -1);
  }
  glint(g, 7, 7, 1);
  glint(g, w - 9, h - 9, 1);
}

function shapePath(g: CanvasRenderingContext2D, shape: Label['shape'], w: number, h: number) {
  g.beginPath();
  switch (shape) {
    case 'baroque':
      baroquePath(g, w, h, 2);
      break;
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
    case 'fleurdelis': {
      // semé de fleurs de lys d'or en quinconce, au pixel près, avec quelques éclats : le motif ignore la couleur choisie
      const fw = FLEUR[0]!.length;
      const fh = FLEUR.length;
      const sx = fw + 5;
      // les rangées s'arrêtent au-dessus du bandeau du nom (h - 30) : pas de fleur coupée en deux
      // (cartouche : sous le cadre doré, qui mange le haut)
      const band = h - 30;
      const top = l.shape === 'baroque' ? 10 : 0;
      const rows = Math.max(1, Math.floor((band - top - 2) / fh));
      const gap = (band - top - rows * fh) / (rows + 1);
      for (let row = 0; row < rows; row++) {
        const y = Math.round(top + gap + row * (fh + gap));
        for (let x = (row % 2) * Math.round(sx / 2) - fw / 2; x < w; x += sx) {
          // pas de fleur à moitié cachée sous le logo
          if (l.emblem !== 'none' && x < w / 2 + 17 && x + fw > w / 2 - 17 && y < 40) continue;
          sprite(g, FLEUR, GOLD, Math.round(x), y, 1);
          if ((Math.round(x / sx) + row) % 3 === 0) glint(g, Math.round(x) + 6, y + 4, 1);
        }
      }
      break;
    }
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
  if (l.shape === 'baroque') {
    /* le cadre est posé après le fond du logo : voir plus bas */
  } else {
    g.save();
    shapePath(g, l.shape, w, h);
    g.lineWidth = 3;
    g.strokeStyle = l.textColor;
    g.stroke();
    g.restore();
  }
  if (l.emblem !== 'none') {
    const gem = l.emblem === 'gem';
    const rows: string[] = l.emblem === 'gem' ? GEM_TOP : EMBLEM_PIXELS[l.emblem];
    const n = rows[0]!.length;
    const s = 3;
    const ox = Math.round(w / 2 - (n * s) / 2);
    const oy = l.shape === 'baroque' ? 10 - (n - 9) * 2 : 7 - (n - 9) * 2;
    g.fillStyle = l.bg;
    if (l.shape === 'baroque') {
      // cartouche : le fond épouse le logo, puis le cadre doré passe par-dessus (rien ne le coupe)
      rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && g.fillRect(ox + x * s - 3, oy + y * s - 3, s + 6, s + 6)));
      baroqueFrame(g, l, w, h);
    } else g.fillRect(ox - 3, oy - 3, n * s + 6, n * s + 6);
    if (gem) {
      // relief : ombre portée, puis la pierre facettée, puis un éclat
      silhouette(g, rows, ox + 2, oy + 2, s, 'rgba(0,0,0,0.4)');
      sprite(g, rows, gemColors(l), ox, oy, s);
      glint(g, ox + 2 * s, oy + 2 * s, 1);
    } else {
      g.fillStyle = l.textColor;
      rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && g.fillRect(ox + x * s, oy + y * s, s, s)));
    }
  }
  if (l.shape === 'baroque' && l.emblem === 'none') baroqueFrame(g, l, w, h);
  crispText(g, name || 'Ma bière', w / 2, h - 20, l.shape === 'baroque' ? w - 36 : w - 20, l.textColor, l.font, l.font === 'retro' ? 18 : 12);
}

/** Miniature sur la bouteille ou le carton (carré de `size` px). */
export function drawMiniLabel(g: CanvasRenderingContext2D, l: Label, x: number, y: number, size = 5): void {
  const n = size;
  g.fillStyle = l.shape === 'baroque' ? '#f2c14e' : l.textColor; // cartouche : cadre doré
  g.fillRect(x - 0, y - 0, n, n);
  g.fillStyle = l.bg;
  g.fillRect(x, y + 1, n, n - 2);
  g.fillStyle = l.patternColor;
  if (l.pattern === 'stripes' || l.pattern === 'rays') for (let i = 0; i < n; i += 2) g.fillRect(x + i, y + 1, 1, n - 2);
  else if (l.pattern === 'fleurdelis') {
    g.fillStyle = '#f2c14e';
    for (let i = 0; i < n; i += 2) g.fillRect(x + i, y + 1 + (i % 4 ? 1 : 0), 1, 1);
    g.fillStyle = '#ffe7a0';
    g.fillRect(x + n - 1, y + 1, 1, 1);
  } else if (l.pattern === 'checks' || l.pattern === 'diamonds') for (let i = 0; i < n; i += 2) g.fillRect(x + i, y + 1 + (i % 4 ? 1 : 0), 1, 1);
  else if (l.pattern !== 'none') g.fillRect(x, y + n - 2, n, 1);
  g.fillStyle = l.emblem === 'gem' ? gemStone(l.gem).c : l.textColor;
  const c = Math.floor(n / 2);
  g.fillRect(x + c - 1, y + 2, 2, Math.max(1, n - 4));
  if (l.emblem === 'gem') {
    g.fillStyle = gemStone(l.gem).a;
    g.fillRect(x + c - 1, y + 2, 1, 1);
  }
}
