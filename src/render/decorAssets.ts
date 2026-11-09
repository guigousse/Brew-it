/**
 * Le catalogue des décors, extraits des pièces : chacun se dessine dans sa boîte (origine en haut à gauche),
 * dans le style du niveau de la pièce où il est posé (c.lv). Voir decor.ts.
 */
import type { DecorAsset, DecorCtx } from './decor';
import { drawMiniLabel } from './labelArt';
import { BAR_MESSAGE } from '../core/game';
import { ellipseShadow, shade, trap } from './space';

const P = (g: CanvasRenderingContext2D) => (x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};
const hash = (a: number, b = 0) => {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
/** Ombre d'un objet accroché au mur : la même forme, décalée en bas à droite. */
const wallShadow = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k = 0.35) => {
  g.fillStyle = `rgba(16,10,24,${k})`;
  g.fillRect(x + 2, y + 2, w, h);
};
/** Ombre au sol, sous un objet posé. */
const floorShadow = (g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
  g.drawImage(ellipseShadow(rx, ry, 0.8), Math.round(cx - rx), Math.round(cy - ry));
};
/** Rai de lumière en trapèze, du haut (étroit) vers le bas (large). */
const cone = (g: CanvasRenderingContext2D, w: number, h: number, alpha: number, col = '255,230,160') => {
  g.fillStyle = `rgba(${col},${alpha})`;
  g.beginPath();
  g.moveTo(w / 2 - 4, 0); g.lineTo(w / 2 + 5, 0); g.lineTo(w, h); g.lineTo(0, h);
  g.fill();
};

/** Vue sur la ville du futur, la nuit, dans une baie de w × h. */
function city(g: CanvasRenderingContext2D, w: number, h: number): void {
  const px = P(g);
  px(0, 0, w, h, '#0c1420');
  for (let i = 0; i < Math.round(w * 0.4); i++) px(1 + ((i * 37) % (w - 2)), 2 + ((i * 13) % Math.max(1, h - 16)), 1, 1, i % 5 ? '#ffffff' : '#5ef0ff');
  for (let i = 0; i < Math.floor((w - 4) / 8); i++) {
    const bh = 6 + ((i * 11) % Math.max(1, h - 16));
    px(2 + i * 8, h - 1 - bh, 6, bh, '#1c2a44');
    px(3 + i * 8, h - bh, 1, 1, '#f2c14e');
    px(5 + i * 8, h + 2 - bh, 1, 1, '#5ef0ff');
  }
  px(0, 0, w, 1, '#5ef0ff');
  px(0, h - 1, w, 1, '#5ef0ff');
}

export const DECOR_ASSETS: readonly DecorAsset[] = [
  // ------------------------------------------------------------------ lumières
  {
    id: 'bulb', name: 'Ampoule nue', room: 'bar', w: 5, h: 5, pad: 1, hang: { xs: [2], color: '#1b1424' }, light: [2, 4, 50, 0.3],
    draw(g) { const px = P(g); px(0, 0, 5, 5, '#f0d890'); px(1, 1, 3, 3, '#fff4b0'); },
  },
  {
    id: 'lightRay', name: 'Rai de lumière', room: 'bar', w: 48, h: 94,
    draw(g) { cone(g, 48, 94, 0.07); },
  },
  {
    id: 'lightRayWide', name: 'Grand rai de lumière', room: 'bar', w: 74, h: 94,
    draw(g) { cone(g, 74, 94, 0.06); },
  },
  {
    id: 'greenPendant', name: 'Suspension verte', room: 'bar', w: 11, h: 5, hang: { xs: [5], color: '#1b1424' }, light: [5, 6, 34, 0.25],
    draw(g) { const px = P(g); px(0, 0, 11, 4, '#2c5a3a'); px(2, 4, 7, 1, '#fff4b0'); },
  },
  {
    id: 'brassSconce', name: 'Applique dorée', room: 'bar', w: 9, h: 4, hang: { xs: [4], color: '#8a5c14' }, light: [4, 4, 26, 0.2],
    draw(g) { const px = P(g); px(0, 0, 9, 3, '#e8b030'); px(1, 3, 7, 1, '#fff4b0'); },
  },
  {
    id: 'factoryLamp', name: 'Lampe industrielle', room: 'bar', w: 13, h: 6, hang: { xs: [6], color: '#1b1424' }, light: [6, 6, 30, 0.2],
    draw(g) { const px = P(g); px(0, 0, 13, 5, '#2c283a'); px(1, 5, 11, 1, '#fff4b0'); },
  },
  {
    id: 'shopPendant', name: 'Suspension du magasin', room: 'shop', w: 15, h: 7, hang: { xs: [7], color: '#1b1424' }, light: [7, 10, 80, 0.3],
    draw(g) {
      const px = P(g);
      trap(g, 0, 6, 3, 12, 0, 15, '#2c5a3a');
      px(0, 5, 15, 1, '#1c3a26'); px(3, 6, 9, 1, '#fff4b0');
    },
  },
  {
    id: 'lantern', name: 'Lanterne', room: 'storage', w: 5, h: 7, pad: 2, light: [2, 3, 40, 0.35],
    draw(g) { const px = P(g); wallShadow(g, 0, 0, 5, 7, 0.3); px(0, 0, 5, 7, '#2a1a10'); px(1, 1, 3, 5, '#ffb050'); },
  },
  {
    id: 'candle', name: 'Bougie et halo', room: 'workshop', w: 44, h: 44,
    draw(g) {
      const px = P(g);
      g.fillStyle = 'rgba(255,190,90,0.10)'; g.beginPath(); g.arc(22, 22, 22, 0, Math.PI * 2); g.fill();
      px(20, 29, 5, 2, '#a8742a'); px(21, 23, 3, 6, '#f6ecd6');
      px(22, 20, 1, 3, '#ff9a2e'); px(22, 21, 1, 1, '#fff4b0');
    },
  },
  {
    id: 'workLamp', name: 'Lampe d\'atelier', room: 'workshop', w: 42, h: 60,
    draw(g, c) {
      const px = P(g);
      px(21, 0, 1, 6, '#2c283a');
      px(17, 6, 9, 3, c.lv === 3 ? '#b88420' : '#465264');
      px(18, 9, 7, 1, '#fff4b0');
      g.fillStyle = 'rgba(255,230,160,0.06)';
      g.beginPath(); g.moveTo(18, 10); g.lineTo(25, 10); g.lineTo(42, 60); g.lineTo(1, 60); g.fill();
    },
  },
  {
    id: 'ceilingNeon', name: 'Néon de plafond', room: 'workshop', w: 52, h: 55,
    draw(g) {
      const px = P(g);
      px(12, 0, 29, 2, '#ffffff'); px(13, 2, 27, 1, '#5ef0ff');
      g.fillStyle = 'rgba(160,240,255,0.06)';
      g.beginPath(); g.moveTo(23, 3); g.lineTo(30, 3); g.lineTo(52, 53); g.lineTo(1, 53); g.fill();
    },
  },
  {
    id: 'deskLamp', name: 'Lampe de bureau', room: 'office', w: 24, h: 22,
    draw(g, c) {
      const px = P(g);
      // origine : la lampe est en (6, 0) ; sa lumière tombe sur le plateau, en bas
      g.fillStyle = 'rgba(255,240,180,0.10)'; g.beginPath(); g.moveTo(7, 5); g.lineTo(15, 5); g.lineTo(22, 22); g.lineTo(0, 22); g.fill();
      g.fillStyle = 'rgba(16,10,24,0.3)'; g.fillRect(8, 19, 14, 3); // son ombre sur le plateau
      px(5, 20, 12, 2, 'rgba(0,0,0,0.35)');
      px(6, 18, 10, 2, '#2c283a'); px(10, 4, 2, 14, '#2c283a'); px(6, 0, 10, 5, c.lv === 5 ? '#5ef0ff' : '#2c8a4a');
      px(6, 0, 10, 1, c.lv === 5 ? '#ffffff' : '#5ec07a'); px(7, 5, 8, 1, '#fff4b0');
    },
  },
  // ------------------------------------------------------------------ murs : enseignes, fenêtres, cadres
  {
    id: 'openSign', name: 'Pancarte OUVERT', room: 'bar', w: 36, h: 16,
    draw(g) {
      const px = P(g);
      g.save(); g.translate(1, 5); g.rotate(-0.12);
      px(0, 0, 34, 11, '#5a3a1c'); px(1, 1, 32, 9, '#e8dcc0');
      g.fillStyle = '#a8483a'; g.font = '8px monospace'; g.textBaseline = 'alphabetic'; g.fillText('OUVERT', 2, 8);
      g.restore();
    },
  },
  {
    id: 'brewSign', name: 'Enseigne BREW IT', room: 'bar', w: 72, h: 16, pad: 4,
    draw(g) {
      const px = P(g);
      g.fillStyle = 'rgba(255,90,208,0.10)'; g.fillRect(-4, -4, 80, 24);
      px(0, 0, 72, 16, '#1b1424');
      g.fillStyle = '#ff5ad0'; g.font = '11px monospace'; g.textBaseline = 'alphabetic'; g.fillText('BREW IT', 10, 12);
    },
  },
  {
    id: 'shopSign', name: 'Enseigne MAGASIN', room: 'shop', w: 92, h: 18, pad: 3, hang: { xs: [12, 79], color: '#1b1424' },
    draw(g) {
      const px = P(g);
      wallShadow(g, 0, 0, 92, 18, 0.35);
      px(0, 0, 92, 18, '#1b1424'); px(1, 1, 90, 16, '#3a2418'); px(1, 1, 90, 1, '#6a4422');
      g.fillStyle = '#f2c14e'; g.font = '9px monospace'; g.textBaseline = 'alphabetic'; g.fillText('MAGASIN', 27, 13);
    },
  },
  {
    id: 'cityView', name: 'Baie sur la ville', room: 'workshop', w: 100, h: 30,
    draw(g) { city(g, 100, 30); },
  },
  {
    id: 'cityViewSmall', name: 'Petite baie sur la ville', room: 'bar', w: 72, h: 24,
    draw(g) { city(g, 72, 24); },
  },
  {
    id: 'moonWindow', name: 'Lucarne au clair de lune', room: 'workshop', w: 24, h: 24,
    draw(g) {
      const px = P(g);
      g.fillStyle = '#2a2030'; g.beginPath(); g.arc(12, 12, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1c2a4a'; g.beginPath(); g.arc(12, 12, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f6ecd6'; g.beginPath(); g.arc(16, 9, 3, 0, Math.PI * 2); g.fill();
      px(12, 3, 1, 18, '#2a2030'); px(3, 12, 18, 1, '#2a2030');
    },
  },
  {
    id: 'garageWindow', name: 'Fenêtre de garage', room: 'workshop', w: 46, h: 62,
    draw(g) {
      const px = P(g);
      // la fenêtre (16 × 24) en haut, au milieu ; son rai de lumière dessous
      const x = 15;
      px(x - 1, 0, 16, 24, '#2a1a20'); px(x, 1, 14, 22, '#6cc0f0'); px(x, 1, 14, 8, '#a8e0ff');
      px(x + 6, 1, 2, 22, '#2a1a20'); px(x, 11, 14, 1, '#2a1a20');
      g.fillStyle = 'rgba(255,240,200,0.07)';
      g.beginPath(); g.moveTo(x + 4, 23); g.lineTo(x + 11, 23); g.lineTo(46, 61); g.lineTo(0, 61); g.fill();
    },
  },
  {
    id: 'archWindow', name: 'Baie en arc', room: 'workshop', w: 52, h: 76,
    draw(g) {
      const px = P(g);
      const x = 10;
      const y = 16; // le haut de l'arc est en y - 16
      px(x, y, 32, 30, '#3a2c20');
      g.fillStyle = '#3a2c20'; g.beginPath(); g.arc(x + 16, y, 16, Math.PI, 0); g.fill();
      g.fillStyle = '#8ad0f0'; g.beginPath(); g.arc(x + 16, y, 14, Math.PI, 0); g.fill();
      px(x + 2, y, 28, 28, '#8ad0f0'); px(x + 2, y, 28, 10, '#c0ecff');
      px(x + 15, y - 14, 2, 42, '#3a2c20'); px(x + 2, y + 12, 28, 1, '#3a2c20');
      g.fillStyle = 'rgba(255,250,220,0.08)';
      g.beginPath(); g.moveTo(x + 13, y + 28); g.lineTo(x + 20, y + 28); g.lineTo(52, 76); g.lineTo(0, 76); g.fill();
    },
  },
  {
    id: 'cellarVent', name: 'Soupirail', room: 'bar', w: 28, h: 8,
    draw(g) {
      const px = P(g);
      px(0, 0, 28, 8, '#1b1424'); px(1, 1, 26, 6, '#2a3a5a');
      for (let x = 4; x < 26; x += 4) px(x, 1, 1, 6, '#1b1424');
    },
  },
  {
    id: 'cobweb', name: 'Toile d\'araignée', room: 'bar', w: 19, h: 21,
    draw(g) {
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0.5, 1.5); g.lineTo(18.5, 1.5); g.moveTo(0.5, 1.5); g.lineTo(0.5, 20.5); g.moveTo(0.5, 1.5); g.lineTo(14.5, 14.5);
      g.moveTo(6.5, 1.5); g.lineTo(0.5, 7.5); g.moveTo(11.5, 1.5); g.lineTo(0.5, 12.5);
      g.stroke();
    },
  },
  {
    id: 'crack', name: 'Fissure', room: 'bar', w: 2, h: 17,
    draw(g) { const px = P(g); px(0, 0, 1, 10, '#3a2c20'); px(1, 9, 1, 8, '#3a2c20'); },
  },
  {
    id: 'posterBottle', name: 'Cadre : bouteille', room: 'bar', w: 12, h: 15, pad: 2, furniture: 'posters',
    draw(g, c) { poster(g, c, 0); },
  },
  {
    id: 'posterMug', name: 'Cadre : chope', room: 'bar', w: 12, h: 15, pad: 2, furniture: 'posters',
    draw(g, c) { poster(g, c, 1); },
  },
  {
    id: 'board', name: 'Ardoise de la carte', room: 'bar', w: 40, h: 24, pad: 1, anim: true,
    draw(g, c) {
      const px = P(g);
      if (c.lv < 2 && !c.preview) return;
      px(0, 0, 40, c.lv === 2 ? 24 : 20, c.lv === 5 ? '#0c1420' : '#2a3030');
      px(-1, -1, 42, 1, '#8a5a2c');
      const taps = c.game?.taps.filter((tp) => tp.beerId != null).slice(0, 3) ?? [];
      taps.forEach((tp, i) => {
        const b = c.game!.beer(tp.beerId)!;
        drawMiniLabel(g, b.label, 3, 3 + i * 6, 5);
        px(10, 5 + i * 6, 8 + (b.name.length % 5) * 3, 1, c.lv === 5 ? '#5ef0ff' : '#e8e4dc');
        px(32, 5 + i * 6, 5, 1, tp.glasses > 0 ? '#f2c14e' : '#a8483a');
      });
    },
  },
  {
    id: 'chalkboard', name: 'Ardoise des bières', room: 'workshop', w: 28, h: 18,
    draw(g) {
      const px = P(g);
      px(0, 0, 28, 18, '#5a3a18'); px(1, 1, 26, 16, '#2a3030');
      for (let i = 0; i < 4; i++) px(4, 4 + i * 3, 10 + ((i * 7) % 9), 1, '#e8e4dc');
    },
  },
  {
    id: 'toolBoard', name: 'Outils accrochés', room: 'storage', w: 18, h: 14, pad: 3,
    draw(g) {
      const px = P(g);
      wallShadow(g, 0, 0, 18, 14, 0.35);
      px(0, 0, 18, 14, '#8a5a2c'); px(0, 0, 18, 1, '#b07a40'); px(3, 2, 2, 10, '#98a6b6'); px(9, 2, 3, 8, '#c4d0dc'); px(14, 3, 2, 9, '#e85a3a');
    },
  },
  {
    id: 'coldUnit', name: 'Groupe froid', room: 'storage', w: 52, h: 14, pad: 3,
    draw(g) {
      const px = P(g);
      wallShadow(g, 0, 0, 52, 14, 0.4);
      px(0, 0, 52, 14, '#98a6b6'); px(1, 1, 50, 12, '#c4d0dc');
      for (let x = 4; x < 48; x += 3) px(x, 3, 1, 8, '#6c7a8c');
    },
  },
  {
    id: 'thermometer', name: 'Thermomètre 2 °C', room: 'storage', w: 22, h: 12,
    draw(g) {
      const px = P(g);
      px(0, 0, 22, 12, '#1c2a3a'); px(2, 2, 18, 8, '#0c1420');
      g.fillStyle = '#5ef0ff'; g.font = '8px monospace'; g.textBaseline = 'alphabetic'; g.fillText('2°C', 3, 9);
    },
  },
  {
    id: 'robotArm', name: 'Bras robotisé', room: 'storage', w: 120, h: 20,
    draw(g) {
      const px = P(g);
      px(0, 0, 120, 3, '#b8c6d6'); px(50, 3, 6, 12, '#8a9ab0'); px(46, 14, 14, 3, '#5a6a82'); px(52, 17, 2, 3, '#5ef0ff');
    },
  },
  {
    id: 'jarShelf', name: 'Étagère de bocaux', room: 'workshop', w: 34, h: 8,
    draw(g) {
      const px = P(g);
      px(0, 6, 34, 2, '#7a5228');
      const cols = ['#6cc040', '#e8553a', '#4ea8f0', '#f2c14e', '#8a5cc8'];
      for (let i = 0; i < 5; i++) { px(2 + i * 7, 0, 5, 6, '#c8f0e8'); px(3 + i * 7, 2, 3, 4, cols[i]!); }
    },
  },
  {
    id: 'bottleShelf', name: 'Étagère à bouteilles', room: 'bar', w: 70, h: 16,
    draw(g, c) {
      const px = P(g);
      const lv = c.lv;
      px(0, 14, 70, 2, lv === 5 ? '#dce6f0' : '#5a3a1c'); px(0, 14, 70, 1, lv === 5 ? '#ffffff' : '#8a5a2c');
      const n = lv === 1 ? 3 : 6;
      for (let i = 0; i < n; i++) {
        if (lv === 1 && i === 1) continue;
        const bx = 4 + Math.floor((58 * i) / (n - 1)) + (lv === 1 ? Math.floor(hash(i, 5) * 10) : 0);
        const hgt = 8 + Math.floor(hash(i, 6) * 4);
        const col = lv === 1 ? '#6a6458' : ['#2c5a3a', '#6e3a08', '#a85c26', '#245c56', '#842416'][Math.floor(hash(i, 7) * 5)]!;
        px(bx, 14 - hgt, 5, hgt, col); px(bx + 1, 11 - hgt, 3, 3, col); px(bx + 1, 16 - hgt, 1, hgt - 4, '#ffffff40');
        if (lv === 1) px(bx, 11 - hgt, 5, 1, '#a89e8e');
      }
    },
  },
  {
    id: 'barShelf', name: 'Étagère à bouteilles du comptoir', room: 'bar', w: 100, h: 16,
    draw(g, c) {
      const px = P(g);
      const lv = c.lv;
      px(0, 14, 100, 2, lv === 5 ? '#dce6f0' : '#5a3a1c'); px(0, 14, 100, 1, lv === 5 ? '#ffffff' : '#8a5a2c');
      const n = lv === 1 ? 4 : 9;
      for (let i = 0; i < n; i++) {
        if (lv === 1 && i === 1) continue;
        const bx = 4 + Math.floor((88 * i) / (n - 1)) + (lv === 1 ? Math.floor(hash(i, 5) * 10) : 0);
        const hgt = 8 + Math.floor(hash(i, 6) * 4);
        const col = lv === 1 ? '#6a6458' : ['#2c5a3a', '#6e3a08', '#a85c26', '#245c56', '#842416'][Math.floor(hash(i, 7) * 5)]!;
        px(bx, 14 - hgt, 5, hgt, col); px(bx + 1, 11 - hgt, 3, 3, col); px(bx + 1, 16 - hgt, 1, hgt - 4, '#ffffff40');
        if (lv === 1) px(bx, 11 - hgt, 5, 1, '#a89e8e');
      }
    },
  },
  {
    id: 'clock', name: 'Horloge', room: 'office', w: 21, h: 21, pad: 4, anim: true,
    draw(g, c) {
      const r = 9;
      const x = 10;
      const y = 10;
      const lv = c.lv;
      // son ombre sur le mur
      g.fillStyle = 'rgba(16,10,24,0.3)'; g.beginPath(); g.arc(x + 2.5, y + 3.5, r + 2, 0, Math.PI * 2); g.fill();
      const day = ((c.game?.time ?? 0) + 8 * 3600) % 86400;
      const hAng = ((day / 3600) % 12) / 12 * Math.PI * 2 - Math.PI / 2;
      const mAng = ((day / 60) % 60) / 60 * Math.PI * 2 - Math.PI / 2;
      g.fillStyle = '#1b1424';
      for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) if (dx * dx + dy * dy <= (r + 1) * (r + 1)) g.fillRect(x + dx, y + dy, 1, 1);
      g.fillStyle = lv === 5 ? '#1c2230' : '#f6ecd6';
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r - 2) g.fillRect(x + dx, y + dy, 1, 1);
      const ink = lv === 5 ? '#5ef0ff' : '#1b1424';
      g.fillStyle = ink;
      for (let k = 0; k < 12; k += 3) g.fillRect(x + Math.round(Math.cos((k / 12) * Math.PI * 2) * (r - 2)), y + Math.round(Math.sin((k / 12) * Math.PI * 2) * (r - 2)), 1, 1);
      const hand = (a: number, len: number, col: string) => {
        g.fillStyle = col;
        for (let s = 0; s <= len; s += 0.5) g.fillRect(x + Math.round(Math.cos(a) * s), y + Math.round(Math.sin(a) * s), 1, 1);
      };
      hand(mAng, r - 2, ink);
      hand(hAng, r - 4, lv === 5 ? '#ffffff' : '#e8553a');
    },
  },
  // ------------------------------------------------------------------ sol et meubles
  {
    id: 'smallPlant', name: 'Plante en pot', room: 'bar', w: 30, h: 24, furniture: 'plants',
    draw(g, c) {
      const px = P(g);
      const x = 10;
      const top = 23;
      const lv = c.lv;
      const pot = lv === 5 ? ['#ffffff', '#b8c6d6'] : lv === 4 ? ['#3e3a50', '#2c283a'] : ['#b05a32', '#7a3a1c'];
      g.fillStyle = 'rgba(16,10,24,0.35)'; g.fillRect(x + 1, top - 1, 9, 1);
      px(x, top - 7, 8, 7, pot[0]!); px(x + 6, top - 7, 2, 7, pot[1]!); px(x - 1, top - 8, 10, 2, pot[0]!);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.4;
        const len = 7 + ((i * 5) % 6);
        for (let k = 0; k < len; k++) px(Math.round(x + 4 + Math.cos(a) * k), Math.round(top - 9 + Math.sin(a) * k + (k / len) ** 2 * 3), 1, 2, k > len - 3 ? '#7ee081' : i % 2 ? '#2c8a4a' : '#3aa05a');
      }
    },
  },
  {
    id: 'bigPlant', name: 'Grande plante', room: 'office', w: 60, h: 56,
    draw(g, c) {
      const px = P(g);
      // le pot (24 de large) est en (18, 30) ; ses feuilles montent et retombent autour
      const pxp = 18;
      const y0 = 30;
      floorShadow(g, pxp + 13, y0 + 22, 16, 3);
      const pot = c.lv === 5 ? ['#dce6f0', '#ffffff', '#8a9ab0'] : ['#b05a32', '#d8843a', '#6e3418'];
      trap(g, y0 + 3, y0 + 24, pxp, pxp + 24, pxp + 3, pxp + 21, pot[0]!);
      g.fillStyle = pot[2]!; g.beginPath(); g.moveTo(pxp + 21, y0 + 24); g.lineTo(pxp + 24, y0 + 3); g.lineTo(pxp + 24, y0 + 3); g.lineTo(pxp + 21, y0 + 24); g.fill();
      shade(g, c.b, { x: pxp, y: y0 + 3, w: 24, h: 21 }, (x) => 1.12 - ((x - pxp) / 24) * 0.35);
      trap(g, y0, y0 + 4, pxp - 1, pxp + 25, pxp - 1, pxp + 25, pot[1]!);
      trap(g, y0 + 1, y0 + 3, pxp + 1, pxp + 23, pxp + 1, pxp + 23, '#2a1a10');
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + (hash(i, 61) - 0.5) * 2.5;
        const len = 14 + hash(i, 62) * 18;
        for (let k = 0; k < len; k++) {
          const lx = Math.round(pxp + 12 + Math.cos(a) * k);
          const ly = Math.round(y0 + 2 + Math.sin(a) * k + (k / len) ** 2 * 4);
          const tip = k > len - 6;
          px(lx, ly, 2, 2, tip ? '#7ee081' : a > -Math.PI / 2 ? '#2c8a4a' : '#3aa05a');
          if (!tip && a > -Math.PI / 2) px(lx, ly + 2, 2, 1, '#1c5a30');
        }
      }
    },
  },
  {
    id: 'mug', name: 'Tasse', room: 'office', w: 8, h: 8,
    draw(g) {
      const px = P(g);
      px(0, 7, 8, 1, 'rgba(0,0,0,0.35)');
      px(0, 1, 6, 6, '#f6ecd6'); px(6, 2, 2, 3, '#f6ecd6'); px(1, 1, 4, 1, '#6a4422'); px(4, 2, 2, 5, '#c8bca4');
    },
  },
  {
    id: 'chair', name: 'Chaise de bureau', room: 'office', w: 44, h: 54,
    draw(g, c) {
      // dessinée à l'échelle du bureau (×1,35), chaque mesure arrondie au pixel
      const q = (v: number) => Math.round(v * 1.35);
      const p0 = P(g);
      const px = (x: number, y: number, w: number, h: number, col: string) => p0(q(x), q(y), Math.max(1, q(x + w) - q(x)), Math.max(1, q(y + h) - q(y)), col);
      const lv = c.lv;
      const cx = 3;
      const box = (x: number, y: number, w: number, h: number) => ({ x: q(x), y: q(y), w: q(x + w) - q(x), h: q(y + h) - q(y) });
      floorShadow(g, q(cx + 13), q(38), q(15), 4);
      if (lv === 1) {
        // chaise de bois à barreaux
        const [wd, hi, lo] = ['#8a5a2c', '#b07a40', '#4a2c14'];
        px(cx + 1, 0, 3, 38, wd); px(cx + 22, 0, 3, 38, wd); px(cx + 1, 0, 1, 38, hi);
        px(cx, 0, 26, 4, wd); px(cx, 0, 26, 1, hi); px(cx, 3, 26, 1, lo);
        for (const bx of [8, 12, 16]) px(cx + bx, 4, 2, 16, wd);
        px(cx + 1, 20, 24, 3, wd); px(cx + 1, 20, 24, 1, hi);
        px(cx + 1, 29, 24, 2, lo);
        shade(g, c.b, box(cx, 0, 26, 38), (x) => 1.08 - ((x - q(cx)) / q(26)) * 0.22);
        return;
      }
      if (lv === 5) {
        // fauteuil ergonomique blanc, dossier en résille, liseré cyan
        px(cx + 12, 24, 3, 10, '#8a9ab0');
        px(cx + 2, 33, 23, 2, '#8a9ab0');
        for (const wx of [cx + 1, cx + 12, cx + 23]) px(wx, 35, 3, 2, '#2c283a');
        px(cx - 2, 14, 3, 9, '#dce6f0'); px(cx + 25, 14, 3, 9, '#dce6f0'); // accoudoirs
        px(cx, 0, 26, 24, '#b8c6d6');
        px(cx + 1, 1, 24, 22, '#f4f8fc');
        for (let y = 4; y < 21; y += 2) for (let x = 4; x < 22; x += 2) p0(q(cx + x + (y % 4 ? 1 : 0)), q(y), 1, 1, '#c4d0dc');
        px(cx + 1, 1, 24, 1, '#5ef0ff'); px(cx + 3, 22, 20, 1, '#5ef0ff');
        shade(g, c.b, box(cx, 0, 26, 24), (x, y) => 1.04 - ((x - q(cx)) / q(26)) * 0.16 - (y / q(24)) * 0.1);
        return;
      }
      const backc = lv >= 3 ? '#2c283a' : '#3e3a50';
      const cushion = lv === 4 ? '#2e4a6e' : lv === 3 ? '#4a2a2a' : '#4a4660';
      px(cx + 12, 22, 3, 12, '#2c283a'); px(cx + 12, 22, 1, 12, '#545068');
      px(cx + 3, 33, 21, 2, '#2c283a');
      for (const wx of [cx + 2, cx + 12, cx + 22]) px(wx, 35, 3, 2, '#1b1424');
      px(cx - 1, 0, 28, 23, '#1b1424');
      px(cx, 0, 26, 22, backc);
      px(cx + 2, 2, 22, 18, cushion);
      px(cx + 2, 2, 22, 1, '#ffffff30');
      if (lv === 3) for (const k of [7, 13, 19]) for (const j of [6, 12]) p0(q(cx + k), q(j), 1, 1, '#2a1414'); // capitons
      shade(g, c.b, box(cx, 0, 26, 22), (x, y) => 1.08 - ((x - q(cx)) / q(26)) * 0.2 - (y / q(22)) * 0.12);
    },
  },
  {
    id: 'neonSign', name: 'Panneau à message', room: 'bar', w: 48, h: 10, pad: 4, anim: true, furniture: 'neon', hang: { xs: [4, 43], color: '#1b1424' },
    draw(g, c) {
      const px = P(g);
      // panneau lumineux suspendu au-dessus des bouteilles : le message choisi défile de droite à gauche
      const col = ['#ff9a3a', '#7ee081', '#f2c14e', '#ff5ad0', '#5ef0ff'][c.lv - 1] ?? '#f2c14e';
      const on = Math.floor(c.t * 8) % 37 !== 0; // il grésille de temps en temps
      px(0, 0, 48, 10, '#1b1424');
      px(1, 1, 46, 8, '#0c0a10');
      if (on) { g.fillStyle = col + '24'; g.fillRect(-4, -3, 56, 16); }
      const text = c.game?.barMessage ?? BAR_MESSAGE;
      g.save();
      g.beginPath(); g.rect(2, 1, 44, 8); g.clip();
      g.font = '8px monospace';
      g.textBaseline = 'alphabetic';
      const w = Math.ceil(g.measureText(text).width);
      const x = Math.round(46 - ((c.t * 14) % (w + 48)));
      g.fillStyle = on ? col : '#3a3048';
      g.fillText(text, x, 8);
      if (on) { g.fillStyle = '#ffffff50'; g.fillText(text, x, 7); }
      g.restore();
      // la trame des LED
      g.fillStyle = 'rgba(12,10,16,0.45)';
      for (let y = 2; y < 9; y += 2) g.fillRect(2, y, 44, 1);
    },
  },
  {
    id: 'jukebox', name: 'Juke-box', room: 'bar', w: 14, h: 42, pad: 14, anim: true, furniture: 'jukebox',
    draw(g, c) {
      const px = P(g);
      const lv = c.lv;
      const t = c.t;
      const body = lv === 5 ? ['#dce6f0', '#ffffff', '#8a9ab0'] : lv === 4 ? ['#2c283a', '#545068', '#1b1424'] : ['#8a2a1c', '#c85a2c', '#4a1408'];
      g.drawImage(ellipseShadow(10, 3, 0.8), -3, 39);
      px(0, 6, 14, 35, body[0]!);
      g.fillStyle = body[0]!; g.beginPath(); g.ellipse(7, 7, 7, 7, 0, Math.PI, 0); g.fill();
      px(0, 6, 1, 35, body[1]!); px(13, 6, 1, 35, body[2]!);
      const k = Math.floor(t * 4);
      const glow = ['#f2c14e', '#ff5ad0', '#5ef0ff', '#7ee081'];
      px(2, 4, 10, 4, glow[k % 4]!);
      px(2, 10, 10, 8, '#1b1424'); px(4, 12, 6, 4, '#3a3048'); px(6, 13, 2, 2, glow[(k + 1) % 4]!);
      for (let i = 0; i < 4; i++) px(2 + i * 3, 20, 2, 2, glow[(k + i) % 4]!);
      for (let yy = 25; yy < 38; yy += 2) px(2, yy, 10, 1, body[2]!);
      px(-1, 40, 16, 2, body[2]!);
      if (c.preview || c.game?.barServing) {
        const n = (t * 0.7) % 1;
        px(3 + Math.round(Math.sin(t * 3) * 3), Math.round(-2 - n * 12), 2, 2, glow[k % 4]!);
      }
    },
  },
  {
    id: 'barrel', name: 'Vieux tonneau', room: 'bar', w: 20, h: 26, pad: 3,
    draw(g) {
      const px = P(g);
      floorShadow(g, 10, 26, 11, 2);
      const [bx, by] = [1, 2];
      px(bx, by, 18, 24, '#6a4422'); px(bx + 2, by, 14, 24, '#7a5228'); px(bx + 5, by, 5, 24, '#8a5a2c');
      for (const yy of [by + 4, by + 18]) px(bx, yy, 18, 2, '#4a4038');
      px(bx - 1, by - 2, 20, 3, '#5a3a1c'); px(bx - 1, by - 2, 20, 1, '#8a7a68');
    },
  },
  {
    id: 'emptyCrate', name: 'Caisse de bouteilles vides', room: 'bar', w: 24, h: 22,
    draw(g) {
      const px = P(g);
      px(0, 10, 24, 12, '#6a5a4a'); px(0, 10, 24, 1, '#8a7a68');
      for (let i = 0; i < 4; i++) { px(3 + i * 5, 3, 3, 8, '#4a5a4a'); px(4 + i * 5, 0, 1, 3, '#4a5a4a'); }
    },
  },
  // ------------------------------------------------------------------ stockage : au sol
  {
    id: 'maltSacks', name: 'Sacs de malt', room: 'storage', w: 36, h: 28, pad: 3,
    draw(g) {
      const px = P(g);
      floorShadow(g, 18, 27, 19, 3);
      const sack = (x: number, y: number, w: number, h: number) => {
        px(x + 1, y, w - 2, h, '#6a5434'); px(x, y + 2, w, h - 3, '#6a5434');
        px(x + 2, y + 1, w - 4, h - 2, '#c8b088'); px(x + 1, y + 3, w - 2, h - 5, '#c8b088');
        px(x + 2, y + 1, w - 4, 1, '#e0cca4');
        px(x + 4, y + Math.floor(h / 2) - 1, w - 8, 3, '#4e8a3a'); px(x + 6, y + Math.floor(h / 2), w - 12, 1, '#e0cca4');
        px(x + w - 3, y + 2, 1, h - 4, '#a88a5a');
      };
      sack(0, 15, 18, 13); sack(17, 15, 19, 13); sack(8, 3, 19, 13);
    },
  },
  {
    id: 'bucket', name: 'Seau', room: 'storage', w: 11, h: 11, pad: 2,
    draw(g) {
      const px = P(g);
      floorShadow(g, 5, 11, 7, 2);
      px(0, 2, 11, 2, '#5a6a82'); px(1, 4, 9, 7, '#8a9ab0'); px(2, 4, 2, 7, '#c4d0dc'); px(1, 10, 9, 1, '#5a6a82');
      px(1, 0, 1, 2, '#3a4250'); px(9, 0, 1, 2, '#3a4250'); px(2, 0, 7, 1, '#3a4250');
    },
  },
  {
    id: 'coolBoxes', name: 'Caisses isothermes', room: 'storage', w: 34, h: 32, pad: 3,
    draw(g) {
      const px = P(g);
      floorShadow(g, 17, 31, 18, 3);
      const box = (x: number, y: number, w: number, h: number, c: string) => {
        px(x, y, w, h, '#6c7a8c'); px(x + 1, y + 1, w - 2, h - 2, '#f4f8fc'); px(x + 1, y + 1, w - 2, 2, c);
        px(x + w - 3, y + 3, 2, h - 4, '#c4d0dc'); px(x + 3, y + 6, w - 8, 1, '#c4d0dc');
      };
      box(0, 18, 17, 14, '#3f88d4'); box(17, 18, 17, 14, '#3f88d4'); box(6, 5, 20, 13, '#e8553a');
    },
  },
  {
    id: 'palletJack', name: 'Transpalette', room: 'storage', w: 44, h: 30, pad: 3,
    draw(g) {
      const px = P(g);
      floorShadow(g, 24, 29, 22, 3);
      // timon, incliné vers l'arrière
      for (let k = 0; k < 18; k++) px(6 + Math.round(k / 3), 4 + k, 2, 1, '#2c283a');
      px(2, 0, 10, 3, '#1b1424'); px(3, 1, 8, 1, '#545068');
      // corps hydraulique et fourches
      px(8, 20, 9, 7, '#e8742a'); px(8, 20, 9, 1, '#ffb070'); px(10, 22, 4, 4, '#a84a1a');
      px(16, 23, 28, 3, '#e8742a'); px(16, 23, 28, 1, '#ffb070'); px(16, 26, 28, 1, '#a84a1a');
      for (const wx of [9, 40]) { px(wx, 27, 4, 3, '#1b1424'); px(wx + 1, 28, 2, 1, '#545068'); }
    },
  },
  {
    id: 'extinguisher', name: 'Extincteur', room: 'storage', w: 9, h: 22, pad: 2,
    draw(g) {
      const px = P(g);
      floorShadow(g, 4, 22, 6, 2);
      px(1, 5, 7, 17, '#a82a1c'); px(2, 5, 5, 16, '#e8402a'); px(3, 6, 1, 14, '#ff9a8a');
      px(2, 10, 5, 4, '#f4f0e6'); px(3, 11, 3, 1, '#a82a1c');
      px(3, 2, 3, 3, '#2c283a'); px(0, 1, 6, 1, '#1b1424'); px(6, 2, 2, 6, '#1b1424');
    },
  },
  {
    id: 'deliveryBot', name: 'Robot de livraison', room: 'storage', w: 40, h: 34, pad: 3,
    anim: true,
    draw(g, c) {
      const px = P(g);
      floorShadow(g, 20, 33, 21, 3);
      px(1, 24, 38, 7, '#8a9ab0'); px(1, 24, 38, 1, '#ffffff'); px(1, 30, 38, 1, '#5a6a82');
      for (const wx of [4, 30]) { px(wx, 30, 6, 4, '#1b1424'); px(wx + 2, 31, 2, 2, '#545068'); }
      // capteur à l'avant, qui balaie
      const on = Math.sin(c.t * 3) > 0;
      px(33, 26, 4, 2, on ? '#5ef0ff' : '#1c8ca8');
      px(3, 27, 26, 1, '#5ef0ff');
      // deux bacs blancs sur le plateau
      for (const [bx, by] of [[3, 13], [17, 13], [9, 2]] as const) {
        px(bx, by, 14, 11, '#8a9ab0'); px(bx + 1, by + 1, 12, 9, '#e8eef4'); px(bx + 1, by + 1, 12, 1, '#ffffff'); px(bx + 1, by + 8, 12, 1, '#5ef0ff');
      }
    },
  },
  {
    id: 'trolley', name: 'Diable et caisses vides', room: 'storage', w: 44, h: 76, pad: 2,
    draw(g, c) {
      const px = P(g);
      const lv = c.lv;
      const tx = 4;
      const ty = 4;
      floorShadow(g, tx + 16, ty + 70, 24, 4);
      const metal = lv === 5 ? ['#ffffff', '#b8c6d6', '#8a9ab0'] : lv >= 3 ? ['#e8eef4', '#98a6b6', '#5a6a82'] : ['#e85a3a', '#a8483a', '#6e2a22'];
      px(tx, ty, 3, 62, metal[1]!); px(tx, ty, 1, 62, metal[0]!); px(tx + 30, ty, 3, 62, metal[1]!); px(tx + 30, ty, 1, 62, metal[0]!);
      px(tx - 4, ty - 4, 8, 3, '#2c283a'); px(tx + 28, ty - 4, 8, 3, '#2c283a');
      for (const k of [14, 34]) px(tx + 2, ty + k, 30, 2, metal[2]!);
      trap(g, ty + 58, ty + 60, tx, tx + 34, tx - 2, tx + 36, metal[0]!);
      px(tx - 2, ty + 60, 38, 3, metal[2]!);
      for (const wx of [tx - 4, tx + 30]) { px(wx, ty + 62, 8, 8, '#1b1424'); px(wx + 2, ty + 64, 4, 4, '#545068'); px(wx + 3, ty + 65, 2, 2, '#98a6b6'); }
      const crate = lv === 5 ? ['#dce6f0', '#ffffff', '#8a9ab0'] : ['#a06830', '#d09050', '#5a3418'];
      for (let k = 0; k < 3; k++) {
        const cy = ty + 36 - k * 17;
        if (k === 2) trap(g, cy - 3, cy, tx + 6, tx + 27, tx + 4, tx + 29, crate[2]!);
        px(tx + 4, cy, 25, 16, crate[0]!); px(tx + 4, cy, 25, 1, crate[1]!); px(tx + 4, cy + 15, 25, 1, crate[2]!);
        px(tx + 7, cy + 3, 19, 6, '#00000040');
        px(tx + 12, cy + 10, 9, 3, crate[2]!);
      }
      shade(g, c.b, { x: tx + 4, y: ty + 2, w: 25, h: 50 }, (x) => 1.05 - ((x - tx - 4) / 25) * 0.25);
    },
  },
  {
    id: 'register', name: 'Caisse enregistreuse', room: 'shop', w: 26, h: 19,
    draw(g) {
      const px = P(g);
      px(1, 6, 24, 12, '#3e3a50'); px(1, 6, 24, 1, '#8c88a0'); px(5, 0, 16, 6, '#2c283a');
      px(0, 18, 26, 1, 'rgba(0,0,0,0.4)');
      px(7, 2, 12, 2, '#7ee081'); for (let i = 0; i < 4; i++) px(4 + i * 5, 10, 3, 2, '#c4d0dc');
    },
  },
  // ------------------------------------------------------------------ bureau : objets sur le plateau, corbeille
  {
    id: 'rotaryPhone', name: 'Téléphone à cadran', room: 'office', w: 18, h: 11,
    draw(g) {
      const px = P(g);
      g.fillStyle = 'rgba(16,10,24,0.3)'; g.fillRect(3, 9, 16, 2);
      px(1, 4, 16, 6, '#1b1424'); px(2, 4, 14, 1, '#3e3a50');
      px(0, 1, 18, 3, '#1b1424'); px(1, 1, 16, 1, '#3e3a50'); px(0, 3, 3, 2, '#1b1424'); px(15, 3, 3, 2, '#1b1424'); // combiné
      g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(9, 7, 2.5, 0, Math.PI * 2); g.fill();
      px(9, 6, 1, 1, '#1b1424');
    },
  },
  {
    id: 'orderPile', name: 'Pile de bons de commande', room: 'office', w: 16, h: 9,
    draw(g) {
      const px = P(g);
      g.fillStyle = 'rgba(16,10,24,0.3)'; g.fillRect(3, 7, 14, 2);
      for (let k = 0; k < 4; k++) { const o = (k * 3) % 4 - 1; px(1 + o, 6 - k * 2, 14, 2, k % 2 ? '#f6ecd6' : '#e8dcc0'); px(1 + o, 6 - k * 2, 14, 1, '#ffffff'); }
      px(4, 0, 8, 1, '#a8483a'); px(4, 1, 6, 1, '#8a8070'); // tampon et lignes
    },
  },
  {
    id: 'deskPhone', name: 'Téléphone fixe', room: 'office', w: 16, h: 9,
    draw(g) {
      const px = P(g);
      g.fillStyle = 'rgba(16,10,24,0.3)'; g.fillRect(3, 7, 14, 2);
      px(0, 3, 16, 6, '#2c283a'); px(0, 3, 16, 1, '#545068');
      px(1, 0, 5, 8, '#3e3a50'); px(1, 0, 5, 1, '#6c6884'); // combiné
      for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) px(8 + k * 2, 4 + r * 2, 1, 1, '#c4d0dc');
      px(14, 4, 1, 1, '#7ee081');
    },
  },
  {
    id: 'binders', name: 'Classeurs', room: 'office', w: 14, h: 15,
    draw(g) {
      const px = P(g);
      g.fillStyle = 'rgba(16,10,24,0.3)'; g.fillRect(3, 13, 12, 2);
      const cols = ['#a8483a', '#2e5a9a', '#2c8a4a'];
      cols.forEach((col, k) => { px(k * 4, 1, 4, 13, col); px(k * 4, 1, 1, 13, '#ffffff30'); px(k * 4 + 1, 9, 2, 1, '#e8dcc0'); });
      px(12, 3, 2, 11, '#f2c14e'); px(12, 3, 2, 1, '#fff4b0'); // le jaune, un peu penché
    },
  },
  {
    id: 'smartphone', name: 'Smartphone', room: 'office', w: 11, h: 4,
    draw(g) {
      const px = P(g);
      g.fillStyle = 'rgba(16,10,24,0.3)'; g.fillRect(2, 2, 10, 2);
      px(0, 0, 10, 3, '#1b1424'); px(1, 0, 8, 2, '#2e4a6e'); px(2, 0, 3, 1, '#5ef0ff');
    },
  },
  {
    id: 'postits', name: 'Post-it', room: 'office', w: 9, h: 8,
    draw(g) {
      const px = P(g);
      px(0, 1, 5, 5, '#f2e070'); px(0, 1, 5, 1, '#fff4b0'); px(1, 3, 3, 1, '#8a7a40');
      px(4, 3, 5, 5, '#ff9ad0'); px(4, 3, 5, 1, '#ffd0e8'); px(5, 5, 3, 1, '#8a4a6a');
    },
  },
  {
    id: 'smartSpeaker', name: 'Enceinte connectée', room: 'office', w: 8, h: 12, anim: true,
    draw(g, c) {
      const px = P(g);
      g.fillStyle = 'rgba(16,10,24,0.3)'; g.fillRect(2, 10, 8, 2);
      px(0, 1, 8, 10, '#dce6f0'); px(0, 1, 1, 10, '#ffffff'); px(7, 1, 1, 10, '#8a9ab0');
      for (let y = 4; y < 10; y += 2) px(1, y, 6, 1, '#c4d0dc');
      const k = 0.5 + 0.5 * Math.sin(c.t * 2);
      g.fillStyle = `rgba(94,240,255,${0.5 + 0.5 * k})`; g.fillRect(1, 0, 6, 1);
    },
  },
  {
    id: 'wasteBin', name: 'Corbeille à papier', room: 'office', w: 14, h: 16, pad: 4, anim: true,
    draw(g, c) {
      const px = P(g);
      const lv = c.lv;
      const [body, hi, lo] = lv === 5 ? ['#dce6f0', '#ffffff', '#8a9ab0'] : lv === 4 ? ['#5a6878', '#8a96a6', '#3a4250'] : lv === 1 ? ['#8a6a3c', '#b08a50', '#5a3a1c'] : ['#3e3a50', '#6c6884', '#2c283a'];
      floorShadow(g, 7, 15, 8, 2);
      // les boulettes des commandes expirées ces dernières 24 h, qui débordent
      const game = c.game;
      const n = c.preview ? 4 : game ? Math.min(7, game.expiredAt.filter((x) => x > game.time - 86400).length) : 0;
      trap(g, 4, 15, 0, 14, 2, 12, body);
      px(0, 4, 14, 1, hi);
      for (let x = 3; x < 12; x += 3) px(x, 6, 1, 8, lo); // le treillis
      // les boulettes dépassent du bord
      const balls = [[3, 2], [8, 2], [11, 3], [5, 0], [9, -1], [2, 0], [6, -2]] as const;
      for (let i = 0; i < n; i++) {
        const [bx, by] = balls[i]!;
        g.fillStyle = '#f6ecd6'; g.beginPath(); g.arc(bx + 0.5, by + 1.5, 2, 0, Math.PI * 2); g.fill();
        px(bx, by + 1, 1, 1, '#c8bca4'); px(bx + 1, by + 2, 1, 1, '#c8bca4');
      }
      px(2, 14, 10, 1, lo);
    },
  },
];

/** Les deux affiches encadrées du bar : une bouteille, une chope. */
function poster(g: CanvasRenderingContext2D, c: DecorCtx, i: number): void {
  const px = P(g);
  const lv = c.lv;
  const frame = lv === 5 ? ['#dce6f0', '#ffffff'] : lv === 4 ? ['#2c283a', '#545068'] : ['#5a3a1c', '#8a5a2c'];
  const [bg, a, b] = [['#e8553a', '#f2c14e', '#7a4a24'], ['#2c6a3a', '#f6ecd6', '#f2c14e']][i]!;
  wallShadow(g, 0, 0, 12, 15);
  px(0, 0, 12, 15, frame[0]!); px(0, 0, 12, 1, frame[1]!);
  px(2, 2, 8, 11, lv === 1 ? '#c8b894' : bg!);
  if (i === 0) { px(5, 3, 2, 3, b!); px(4, 6, 4, 6, b!); px(4, 8, 4, 2, a!); }
  else { px(3, 5, 5, 6, a!); px(3, 4, 5, 2, '#ffffff'); px(8, 6, 1, 3, a!); }
  if (lv === 1) { g.fillStyle = 'rgba(90,80,70,0.35)'; g.fillRect(2, 2, 8, 11); }
}
