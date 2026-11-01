/** Portrait pixel art de Gaston, le vieux brasseur (14 × 14). */
const PIXELS = [
  '..............',
  '....hhhhhh....',
  '...hhhhhhhh...',
  '..hhssssssh...',
  '..hsssssssss..',
  '..ssewssewss..',
  '..sssssssssss.',
  '.rsssssnsssr..',
  '..smmmmmmmms..',
  '..ssmmssmmss..',
  '...ssssssss...',
  '..aaaasaaaaa..',
  '.aaaaaaaaaaaa.',
  'aaaaaaaaaaaaaa',
];
const COLORS: Record<string, string> = {
  h: '#e8e4dc', // cheveux blancs
  s: '#e0a77f', // peau
  e: '#2b2135', // yeux
  w: '#ffffff',
  n: '#c98563', // nez
  r: '#d97d6a', // joues
  m: '#f3efe6', // moustache
  a: '#4f7a5a', // tablier
};

export function drawGaston(canvas: HTMLCanvasElement): void {
  const size = PIXELS.length;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  PIXELS.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const color = COLORS[c];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
}
