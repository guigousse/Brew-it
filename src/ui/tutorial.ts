/**
 * Le tuto d'introduction : Gaston fait visiter la brasserie, pièce par pièce (bureau, atelier, stockage, bar, magasin).
 * Un doigt en pixel art se déplace jusqu'à l'élément dont il parle, mis en surbrillance (le reste de l'écran
 * s'assombrit). Certaines étapes attendent un geste du joueur (toucher l'onglet d'une pièce, lancer le premier
 * brassin, goûter la bière) ; les autres avancent avec « Suivant ».
 *
 * L'étape en cours est `game.tips` (sauvegardée) ; TUTO_DONE quand la visite est finie ou passée.
 */
import { TUTO_DONE, type Game } from '../core/game';
import { tl } from '../i18n';

export type TourView = 'office' | 'workshop' | 'storage' | 'bar' | 'shop';

/** Ce que le doigt peut montrer. */
export type TourTarget =
  | 'computer' | 'display' | 'officePlaque' | 'mill' | 'mash' | 'brewBtn' | 'racks' | 'counter' | 'barBtns'
  | 'money' | 'taste' | `nav:${TourView}`;

export interface TourHost {
  game(): Game;
  view(): TourView;
  goView(v: TourView): void;
  /** L'élément montré (ou plusieurs : la surbrillance les entoure tous). */
  target(t: TourTarget): HTMLElement | HTMLElement[] | null;
  /** Une fiche ou une fenêtre est ouverte : la visite attend qu'elle se ferme. */
  busy(): boolean;
  /** La fiche ouverte (« station » pour une machine), ou null. */
  sheet(): string | null;
  /** Avatar de Gaston (canvas) à placer dans la bulle. */
  avatar(): HTMLCanvasElement;
  tap(): void;
}

interface Step {
  /** La pièce où se passe l'étape ; ailleurs, le doigt montre l'onglet pour y revenir. */
  view?: TourView;
  target?: TourTarget | ((g: Game) => TourTarget | undefined);
  text: string | ((g: Game) => string);
  /** Bouton pour avancer ; sans bouton, l'étape attend `done`. */
  next?: string;
  done?: (g: Game, host: TourHost) => boolean;
}

const ROOM_NAME: Record<TourView, string> = { office: tl('au bureau'), workshop: tl('à l\'atelier'), storage: tl('au stockage'), bar: tl('au bar'), shop: tl('au magasin') };

const brewed = (g: Game) => !!g.trial || g.batches.length > 0 || g.beers.length > 0;

export const TOUR: readonly Step[] = [
  // ---- le bureau
  { view: 'office', text: tl('Salut, moi c\'est Gaston ! Je vais te faire visiter ta brasserie. On commence par le bureau.'), next: tl('C\'est parti') },
  { view: 'office', target: 'computer', text: tl('L\'ordinateur : tes clients y envoient leurs commandes. Tu y trouves aussi le grossiste et les tendances.'), next: tl('Suivant') },
  { view: 'office', target: 'display', text: tl('Le présentoir montre ta gamme : les bières que tu as créées.'), next: tl('Suivant') },
  { view: 'office', target: 'officePlaque', text: tl('Chaque pièce s\'améliore : touche son nom, en haut, pour voir ce que tu peux acheter.'), next: tl('Suivant') },
  { view: 'office', target: 'nav:workshop', text: tl('Allons à l\'atelier, là où naît la bière. Touche « Atelier ».'), done: (_, h) => h.view() === 'workshop' },
  // ---- l'atelier
  { view: 'workshop', target: 'mill', text: tl('Le grain entre en haut et passe de machine en machine jusqu\'à la bouteille, en bas.'), next: tl('Suivant') },
  { view: 'workshop', target: 'mash', text: tl('Touche une machine pour voir ses réglages.'), done: (_, h) => h.sheet() === 'station' },
  { view: 'workshop', text: tl('Les réglages changent le goût de la bière. J\'ai tout réglé pour ma blonde : garde-les pour l\'instant.'), next: tl('Suivant') },
  { view: 'workshop', target: 'brewBtn', text: tl('Lance ton premier brassin avec ce bouton.'), done: brewed },
  { view: 'workshop', target: 'nav:storage', text: tl('Bravo ! La bière descend de machine en machine. Pendant ce temps, allons voir le stockage.'), done: (_, h) => h.view() === 'storage' },
  // ---- le stockage
  { view: 'storage', target: 'racks', text: tl('Tes bouteilles arrivent ici, en caisses. Le surplus part chez le grossiste, qui te le rachète.'), next: tl('Suivant') },
  { view: 'storage', target: 'nav:bar', text: tl('Maintenant, le bar !'), done: (_, h) => h.view() === 'bar' },
  // ---- le bar
  { view: 'bar', target: 'counter', text: tl('Au bar, tes clients boivent ta bière en fût. Touche le comptoir pour brancher tes fûts.'), next: tl('Suivant') },
  { view: 'bar', target: 'barBtns', text: tl('Ici, lance des soirées : plus de clients, plus de ventes. Les fûts vides se changent tout seuls.'), next: tl('Suivant') },
  { view: 'bar', target: 'nav:shop', text: tl('Au magasin : de la déco pour le bar, des boosts et de nouvelles étiquettes.'), next: tl('Suivant') },
  { target: 'money', text: tl('En haut, ton argent et tes diamants. Les commandes livrées rapportent des diamants.'), next: tl('Suivant') },
  // ---- la première bière
  { target: 'nav:workshop', text: tl('Retournons à l\'atelier : ta bière va bientôt sortir !'), done: (_, h) => h.view() === 'workshop' },
  {
    view: 'workshop',
    target: (g) => (g.tastable ? 'taste' : undefined),
    text: (g) => (g.tastable ? tl('Ta première bouteille est sortie : goûte-la !') : tl('Ta bière arrive au bout de la chaîne… encore un instant.')),
    done: (g) => g.beers.length > 0,
  },
  { target: 'nav:office', text: tl('Ta première bière est dans ta gamme ! Livre-la à tes clients depuis l\'ordinateur du bureau. Bonne brasse !'), next: tl('Terminer') },
];

/** Le doigt pixelisé (gant blanc, manchette bleue), pointé vers le haut : le bout de l'index est en (4, 0). */
const FINGER = [
  '...##.......',
  '..#ww#......',
  '..#ww#......',
  '..#ww#......',
  '..#ww###....',
  '..#ww#ww###.',
  '###ww#ww#ww#',
  '#ww#wwwww#w#',
  '#wwwwwwwwwws#',
  '#wwwwwwwwwss#',
  '.#wwwwwwwss#.',
  '..#wwwwwss#..',
  '..#cccccccc#.',
  '..##########.',
];
const FINGER_COLORS: Record<string, string> = { '#': '#1b1424', w: '#f6ecd6', s: '#c8bca4', c: '#3f88d4' };
const SCALE = 3;
/** Milieu du bout de l'index, en pixels du dessin. */
const TIP_X = 4;

/** Le rectangle qui entoure un ou plusieurs éléments visibles. */
function union(el: HTMLElement | HTMLElement[] | null): DOMRect | null {
  const rs = (Array.isArray(el) ? el : el ? [el] : []).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (!rs.length) return null;
  const l = Math.min(...rs.map((r) => r.left));
  const t = Math.min(...rs.map((r) => r.top));
  return new DOMRect(l, t, Math.max(...rs.map((r) => r.right)) - l, Math.max(...rs.map((r) => r.bottom)) - t);
}

function drawFinger(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const w = Math.max(...FINGER.map((r) => r.length));
  c.width = w;
  c.height = FINGER.length;
  const g = c.getContext('2d')!;
  FINGER.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = FINGER_COLORS[ch];
    if (!col) return;
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }));
  c.style.width = `${w * SCALE}px`;
  c.style.height = `${FINGER.length * SCALE}px`;
  return c;
}

export class Tour {
  private spot = document.createElement('div');
  private finger = document.createElement('div');
  private bubble = document.createElement('div');
  private text = document.createElement('p');
  private actions = document.createElement('div');
  private key = '';

  constructor(private host: TourHost, root: HTMLElement) {
    this.spot.className = 'tour-spot hidden';
    this.finger.className = 'tour-finger hidden';
    const inner = document.createElement('div');
    inner.className = 'tour-finger-tap';
    inner.append(drawFinger());
    this.finger.append(inner);
    this.bubble.className = 'tour-bubble hidden';
    const body = document.createElement('div');
    body.className = 'tour-body';
    const name = document.createElement('strong');
    name.className = 'tour-name';
    name.textContent = 'Gaston';
    this.text.className = 'tour-text';
    this.actions.className = 'tour-actions';
    body.append(name, this.text, this.actions);
    this.bubble.append(host.avatar(), body);
    root.append(this.spot, this.finger, this.bubble);
  }

  get active(): boolean {
    return this.host.game().tips < TOUR.length;
  }

  private step(): Step | undefined {
    return TOUR[this.host.game().tips];
  }

  private advance(): void {
    const g = this.host.game();
    g.tips = g.tips + 1 >= TOUR.length ? TUTO_DONE : g.tips + 1;
    this.key = '';
    this.host.tap();
  }

  /** À chaque image : avance si l'étape est accomplie, puis place le doigt, la surbrillance et la bulle. */
  frame(): void {
    const g = this.host.game();
    let s = this.step();
    // les étapes déjà accomplies passent toutes seules (une ancienne partie, un joueur en avance)
    while (s?.done && s.done(g, this.host)) {
      g.tips = g.tips + 1 >= TOUR.length ? TUTO_DONE : g.tips + 1;
      this.key = '';
      s = this.step();
    }
    if (!s || this.host.busy()) return this.hide();
    // le tout début : la visite commence au bureau
    if (g.tips === 0 && this.host.view() !== 'office' && this.key === '') this.host.goView('office');
    // hors de la pièce de l'étape : on montre l'onglet pour y revenir
    const away = s.view && this.host.view() !== s.view;
    const text = away ? tl('Reviens {0} pour continuer la visite.', ROOM_NAME[s.view!]) : typeof s.text === 'function' ? s.text(g) : s.text;
    const tid = away ? (`nav:${s.view}` as TourTarget) : typeof s.target === 'function' ? s.target(g) : s.target;
    const el = tid ? this.host.target(tid) : null;
    const key = `${g.tips}|${text}|${away}`;
    if (key !== this.key) {
      this.key = key;
      this.text.textContent = text;
      this.actions.replaceChildren();
      if (s.next && !away) {
        const b = document.createElement('button');
        b.className = 'btn primary small';
        b.textContent = s.next;
        b.onclick = () => this.advance();
        this.actions.append(b);
      }
      if (g.tips < TOUR.length - 1) {
        const skip = document.createElement('button');
        skip.className = 'tour-skip';
        skip.textContent = tl('Passer la visite');
        skip.onclick = () => {
          g.tips = TUTO_DONE;
          this.hide();
        };
        this.actions.append(skip);
      }
    }
    this.bubble.classList.remove('hidden');
    const r = union(el);
    const visible = !!r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    if (!visible) {
      this.spot.classList.add('hidden');
      this.finger.classList.add('hidden');
      this.bubble.classList.remove('low');
      return;
    }
    // la surbrillance : un cadre doré autour de l'élément, le reste de l'écran assombri
    const pad = 6;
    Object.assign(this.spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    this.spot.classList.remove('hidden');
    // le doigt : sous l'élément et pointé vers le haut ; au-dessus et pointé vers le bas s'il est en bas de l'écran
    const low = r.top + r.height / 2 > window.innerHeight * 0.62;
    const cx = r.left + r.width / 2;
    const fh = FINGER.length * SCALE;
    const y = low ? r.top + Math.min(10, r.height / 3) - fh : r.bottom - Math.min(10, r.height / 3);
    Object.assign(this.finger.style, { left: `${Math.round(cx - TIP_X * SCALE)}px`, top: `${Math.round(y)}px` });
    this.finger.classList.toggle('down', low);
    this.finger.classList.remove('hidden');
    // la bulle ne cache pas ce qu'elle montre
    this.bubble.classList.toggle('low', r.top + r.height / 2 < window.innerHeight * 0.5);
  }

  hide(): void {
    this.spot.classList.add('hidden');
    this.finger.classList.add('hidden');
    this.bubble.classList.add('hidden');
  }
}
