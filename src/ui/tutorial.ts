/**
 * Le tuto d'introduction : Gaston fait visiter la brasserie, pièce par pièce (bureau, atelier, stockage, bar, magasin).
 * Un doigt en pixel art se déplace jusqu'à l'élément dont il parle, mis en surbrillance (le reste de l'écran
 * s'assombrit). Certaines étapes attendent un geste du joueur (toucher l'onglet d'une pièce, lancer le premier
 * brassin, goûter la bière, programmer des fûts, en brancher un au bar) ; les autres avancent avec « Suivant ».
 * Gaston offre un boost des machines au premier brassin, et donne un coup de main (×4) aux brassins de la visite :
 * on goûte, puis on branche son premier fût, sans longue attente.
 *
 * Pendant que les fûts se remplissent, une lettre arrive au bureau : on livre sa première commande depuis l'ordinateur.
 * À la fin (ou si on passe la visite), Gaston offre 25 diamants : le joueur part de zéro.
 *
 * Seul l'élément montré (et la bulle de Gaston) répond au doigt : des caches transparents couvrent le reste de
 * l'écran, pour que le joueur ne se perde pas en touchant n'importe où.
 *
 * Une étape se cache quand une fiche ou une fenêtre s'ouvre, sauf celles qu'elle guide (`sheets`, `modals`) :
 * l'assistant « Brasser », l'ordinateur et le changement de fût sont guidés de l'intérieur.
 *
 * L'étape en cours est `game.tips` (sauvegardée) ; TUTO_DONE quand la visite est finie ou passée.
 */
import { TUTO_DONE, type Game } from '../core/game';
import { STATION_ORDER } from '../core/stations';
import { tl } from '../i18n';

export type TourView = 'office' | 'workshop' | 'storage' | 'bar' | 'shop';

/** Ce que le doigt peut montrer. */
export type TourTarget =
  | 'computer' | 'display' | 'officePlaque' | 'mill' | 'mash' | 'brewBtn' | 'racks' | 'counter' | 'barBtns'
  | 'money' | 'taste' | 'boost' | 'planAdd' | 'planList' | 'wizBeer' | 'wizKeg' | 'wizBack' | 'wizPlus' | 'wizGo'
  | 'tapLine' | 'kegBeer' | 'pcOrders' | 'orderSend' | 'trialGo' | 'tasteKeep' | 'labelCard' | 'wizBottle' | 'cheapMachine' | 'stationUp' | 'storagePlaque' | `nav:${TourView}`;

/** L'assistant « Brasser » ouvert : son étape et le format choisi. */
export interface TourWiz { step: 'beer' | 'format' | 'count' | 'trial'; format: 'bottle' | 'keg'; count: number }

export interface TourHost {
  game(): Game;
  view(): TourView;
  goView(v: TourView): void;
  /** L'élément montré (ou plusieurs : la surbrillance les entoure tous). */
  target(t: TourTarget): HTMLElement | HTMLElement[] | null;
  /** La fiche ouverte (« station » pour une machine, « brew », « bar »…), ou null. */
  sheet(): string | null;
  /** La fenêtre ouverte (« kegSwap » pour le changement de fût, « computer » pour l'ordinateur, « other » pour les autres), ou null. */
  modal(): string | null;
  /** L'application ouverte sur l'ordinateur (null : le menu). */
  pcApp(): string | null;
  /** Ferme la fiche et la fenêtre ouvertes. */
  close(): void;
  /** Fin de la visite : Gaston offre ses diamants. */
  finish(): void;
  /** L'assistant de la fiche « Brasser » (null : la file des brassins). */
  wiz(): TourWiz | null;
  /** Ouvre le cadeau de bienvenue de Gaston. */
  gift(): void;
  /** Avatar de Gaston (canvas) à placer dans la bulle. */
  avatar(): HTMLCanvasElement;
  tap(): void;
}

interface Step {
  /** La pièce où se passe l'étape ; ailleurs, le doigt montre l'onglet pour y revenir. */
  view?: TourView;
  target?: TourTarget | TourTarget[] | ((g: Game, host: TourHost) => TourTarget | TourTarget[] | undefined);
  text: string | ((g: Game, host: TourHost) => string);
  /** Bouton pour avancer ; sans bouton, l'étape attend `done`. */
  next?: string;
  /** Ce que fait le bouton avant d'avancer. */
  action?: (g: Game, host: TourHost) => void;
  done?: (g: Game, host: TourHost) => boolean;
  /** Les fiches et fenêtres où l'étape reste affichée (ailleurs, elle attend qu'on les ferme). */
  sheets?: readonly string[];
  modals?: readonly string[];
}

/** Pause entre deux leçons (s) : on ne les enchaîne pas. */
const LESSON_REST = 45;

const ROOM_NAME: Record<TourView, string> = { office: tl('au bureau'), workshop: tl('à l\'atelier'), storage: tl('au stockage'), bar: tl('au bar'), shop: tl('au magasin') };

const brewed = (g: Game) => !!g.trial || g.batches.length > 0 || g.beers.length > 0;
/** Brassins en fûts déjà programmés, sur la ligne, au stockage ou branchés. */
const kegBrews = (g: Game) =>
  g.plan.reduce((n, p) => n + (p.format === 'keg' ? p.count : 0), 0)
  + g.batches.filter((b) => b.format === 'keg' && b.beerId != null).length
  + g.beers.reduce((n, b) => n + b.kegs.length, 0)
  + g.taps.filter((t) => t.beerId != null).length;
/** Brassins en fûts que la visite fait programmer. */
const KEG_BREWS = 2;
const flowing = (g: Game) => g.taps.some((t) => t.beerId != null && t.glasses > 0);
const hasKeg = (g: Game) => g.beers.some((b) => b.kegs.length > 0);

/** Programmer des fûts : le doigt suit l'assistant « Brasser », écran après écran. */
const planTarget = (g: Game, h: TourHost): TourTarget | TourTarget[] => {
  if (h.sheet() !== 'brew') return 'brewBtn';
  const w = h.wiz();
  if (!w) return 'planAdd';
  if (w.step === 'beer') return 'wizBeer';
  if (w.step === 'format') return 'wizKeg';
  if (w.step === 'count' && w.format === 'keg') return kegBrews(g) + w.count < KEG_BREWS ? 'wizPlus' : 'wizGo';
  return 'wizBack';
};
const planText = (g: Game, h: TourHost): string => {
  if (h.sheet() !== 'brew') return tl('Maintenant, programme plusieurs brassins d\'un coup, en fûts pour le bar. Touche « Brasser ».');
  const w = h.wiz();
  if (!w) return kegBrews(g) > 0 ? tl('Encore un ! Touche « + Programmer des brassins ».') : tl('Touche « + Programmer des brassins ».');
  if (w.step === 'beer') return tl('Choisis ta bière.');
  if (w.step === 'format') return tl('Choisis « Fûts » : c\'est ce que sert le bar.');
  if (w.step === 'count' && w.format === 'keg') {
    return kegBrews(g) + w.count < KEG_BREWS
      ? tl('Touche « + » : on en programme {0} d\'un coup.', KEG_BREWS)
      : tl('Puis « Programmer » : ils partiront l\'un après l\'autre, tout seuls.');
  }
  return tl('Reviens en arrière et choisis « Fûts ».');
};

/** Brancher le premier fût : du comptoir à la tireuse, puis au choix de la bière. */
const plugTarget = (g: Game, h: TourHost): TourTarget | undefined => {
  if (h.modal() === 'kegSwap') return 'kegBeer';
  if (h.sheet() === 'bar') return hasKeg(g) ? 'tapLine' : undefined;
  return hasKeg(g) ? 'counter' : undefined;
};
const plugText = (g: Game, h: TourHost): string => {
  if (!hasKeg(g)) return tl('Tes fûts sont en route : avec le coup de main de Gaston, ils arrivent dans un instant…');
  if (h.modal() === 'kegSwap') return tl('Choisis ta bière : le fût se branche.');
  if (h.sheet() === 'bar') return tl('Touche la tireuse pour y brancher un fût.');
  return tl('Ton premier fût est prêt ! Touche le comptoir pour le brancher.');
};

/** Livrer la première commande : l'ordinateur, l'application Commandes, puis « Envoyer ». */
const orderTarget = (g: Game, h: TourHost): TourTarget | undefined => {
  g.tourLetter();
  if (h.modal() !== 'computer') return 'computer';
  if (!g.orders.length) return undefined;
  if (h.pcApp() !== 'orders') return 'pcOrders';
  return g.readyOrders.length ? 'orderSend' : undefined;
};
const orderText = (g: Game, h: TourHost): string => {
  if (!g.orders.length) return tl('Une lettre arrive… Les clients écrivent à l\'ordinateur du bureau.');
  if (h.modal() !== 'computer') return tl('Une lettre vient d\'arriver : un client veut ta bière ! Touche l\'ordinateur.');
  if (h.pcApp() !== 'orders') return tl('Ouvre « Commandes ».');
  if (!g.readyOrders.length) return tl('Tes bouteilles finissent d\'arriver au stockage… encore un instant.');
  return tl('Ta bière convient : touche « Envoyer ». Le client paie tout de suite.');
};

/** Programmer des brassins en bouteilles (la leçon de la file) : l'assistant « Brasser », écran après écran. */
const QUEUE_BREWS = 3;
/** Le joueur a réglé ses 3 brassins dans l'assistant : la leçon attend qu'il les programme. */
let queueArmed = false;
const queueTarget = (g: Game, h: TourHost): TourTarget | undefined => {
  if (h.sheet() !== 'brew') return 'brewBtn';
  const w = h.wiz();
  if (!w) return 'planAdd';
  if (w.step === 'beer') return 'wizBeer';
  if (w.step === 'format') return 'wizBottle';
  if (w.step === 'count' && w.format === 'bottle') {
    queueArmed = w.count >= QUEUE_BREWS;
    return queueArmed ? 'wizGo' : 'wizPlus';
  }
  queueArmed = false;
  return 'wizBack';
};
/** Les brassins sont programmés : l'assistant s'est refermé sur la file, après les 3 brassins réglés. */
const queued = (_: Game, h: TourHost) => queueArmed && h.sheet() === 'brew' && !h.wiz();
const queueText = (g: Game, h: TourHost): string => {
  if (h.sheet() !== 'brew') return tl('Touche « Brasser ».');
  const w = h.wiz();
  if (!w) return tl('Touche « + Programmer des brassins ».');
  if (w.step === 'beer') return tl('Choisis ta bière.');
  if (w.step === 'format') return tl('Choisis « Bouteilles » : c\'est ce que livrent tes commandes.');
  if (w.step === 'count' && w.format === 'bottle') {
    return w.count < QUEUE_BREWS ? tl('Touche « + » : on en programme {0} d\'un coup.', QUEUE_BREWS) : tl('Puis « Programmer ».');
  }
  return tl('Reviens en arrière et choisis « Bouteilles ».');
};

/** Somme des niveaux des machines (pour voir qu'une amélioration a eu lieu). */
const machineLevels = (g: Game) => STATION_ORDER.reduce((n, id) => n + g.levelNumber(id), 0);

/**
 * La visite d'accueil : l'essentiel, en une minute. Brasser un essai, le goûter, livrer sa première commande,
 * puis le cadeau de 25 diamants. Le reste vient plus tard, avec les leçons.
 */
export const TOUR: readonly Step[] = [
  { view: 'office', text: tl('Bienvenue chez toi ! Moi c\'est Gaston, vieux maître brasseur. Cette brasserie est la tienne, et on va en faire la meilleure du pays ! Touche simplement ce que je te montre du doigt.'), next: tl('C\'est parti !') },
  { view: 'office', target: 'nav:workshop', text: tl('Allons à l\'atelier, là où naît la bière.'), done: (_, h) => h.view() === 'workshop' },
  {
    view: 'workshop', sheets: ['brew'], done: brewed,
    target: (_, h) => (h.sheet() === 'brew' ? 'trialGo' : 'brewBtn'),
    text: (_, h) => (h.sheet() === 'brew' ? tl('Un essai, avec les réglages de ma blonde : touche « Brasser l\'essai ».') : tl('Ici, le grain passe de machine en machine jusqu\'à la bouteille. Lance ton premier brassin !')),
  },
  {
    view: 'workshop', modals: ['taste', 'label'], done: (g) => g.beers.length > 0,
    target: (g, h) => {
      if (!g.giftTaken) h.gift(); // le cadeau arrive tout seul : 30 min de Plein régime
      return h.modal() === 'taste' ? 'tasteKeep' : h.modal() === 'label' ? 'labelCard' : g.tastable ? 'taste' : undefined;
    },
    text: (g, h) => (h.modal() === 'taste' ? tl('Le verdict du jury… euh, le mien ! Garde-la dans ta gamme.')
      : h.modal() === 'label' ? tl('Ton étiquette : choisis un nom et des couleurs si tu veux, puis « Valider l\'étiquette ».')
      : g.tastable ? tl('Ta première bouteille est sortie : goûte-la !') : tl('Cadeau : 30 min de « Plein régime », tes machines tournent 3× plus vite ! Ta bière descend déjà la chaîne…')),
  },
  { target: 'nav:office', text: (g) => { g.tourLetter(); return tl('Bravo ! Un client t\'a déjà écrit : allons au bureau.'); }, done: (_, h) => h.view() === 'office' },
  { view: 'office', target: orderTarget, text: orderText, modals: ['computer'], done: (g) => g.ordersDone > 0 },
  {
    modals: ['computer'], text: tl('Première commande livrée ! Les commandes paient bien mieux que le grossiste : surveille ton ordinateur.'),
    next: tl('Suivant'), action: (_, h) => h.close(),
  },
  {
    target: 'money',
    text: tl('Tu sais l\'essentiel ! Voici 25 diamants, là-haut à côté de ton argent : le magasin les échange contre des boosts. Je repasserai t\'apprendre la suite au bon moment. Bonne brasse !'),
    next: tl('🎁 Récupérer 25 💎'), action: (_, h) => h.finish(),
  },
];

/** Une leçon de Gaston : quelques étapes, présentées quand elles deviennent utiles. */
export interface Lesson {
  id: string;
  /** Quand la proposer (la visite d'accueil finie, rien d'ouvert à l'écran). */
  when: (g: Game) => boolean;
  steps: readonly Step[];
}

export const LESSONS: readonly Lesson[] = [
  {
    // la brasserie tourne pendant l'absence tant que la file n'est pas vide
    id: 'queue', when: (g) => g.ordersDone >= 2 && g.beers.length > 0,
    steps: [
      { target: 'nav:workshop', text: tl('Ta brasserie peut tourner sans toi, même appli fermée : programme des brassins d\'avance. Allons à l\'atelier.'), done: (_, h) => h.view() === 'workshop' },
      { view: 'workshop', target: queueTarget, text: queueText, sheets: ['brew'], done: queued },
      {
        view: 'workshop', target: (_, h) => (h.sheet() === 'brew' && !h.wiz() ? 'planList' : undefined), sheets: ['brew'],
        text: tl('Voilà ta file : les brassins partent l\'un après l\'autre, et quand elle est vide, je relance le dernier. Remplis-la avant de partir !'),
        next: tl('Compris'), action: (_, h) => h.close(),
      },
    ],
  },
  {
    // la première amélioration : quand la mission la demande et que la caisse le permet
    id: 'upgrade', when: (g) => g.mission?.def.id === 'upgrade1' && STATION_ORDER.some((id) => g.money >= g.upgradeCost(id)) && machineLevels(g) === STATION_ORDER.length,
    steps: [
      { target: 'nav:workshop', text: tl('Ta caisse permet d\'améliorer une machine ! Allons à l\'atelier.'), done: (_, h) => h.view() === 'workshop' },
      { view: 'workshop', target: 'cheapMachine', text: tl('Touche cette machine : c\'est l\'amélioration la moins chère.'), done: (_, h) => h.sheet() === 'station' },
      {
        view: 'workshop', target: 'stationUp', sheets: ['station'], done: (g) => machineLevels(g) > STATION_ORDER.length,
        text: tl('Améliore-la : plus de volume, plus vite, plus précis. La flèche verte, sur le nom de la pièce, te dira quand une autre est à ta portée.'),
      },
      { view: 'workshop', sheets: ['station'], text: tl('Bien joué ! Améliore toutes les machines pour faire grandir la brasserie.'), next: tl('Compris'), action: (_, h) => h.close() },
    ],
  },
  {
    // le bar : quand la mission demande d'y servir des verres
    id: 'bar', when: (g) => g.mission?.def.id === 'bar20',
    steps: [
      { target: 'nav:bar', text: tl('Ton bar t\'attend ! Allons-y.'), done: (_, h) => h.view() === 'bar' },
      { view: 'bar', target: 'counter', text: tl('Au bar, tes clients boivent ta bière en fût : c\'est là que ta marque se fait connaître. Il lui faut des fûts.'), next: tl('Suivant') },
      { target: 'nav:workshop', text: tl('Les fûts se brassent à l\'atelier.'), done: (_, h) => h.view() === 'workshop' },
      { view: 'workshop', target: planTarget, text: planText, sheets: ['brew'], done: (g) => kegBrews(g) >= KEG_BREWS },
      { view: 'workshop', sheets: ['brew'], text: tl('Parfait ! Dès qu\'un fût sort, je te montre comment le brancher.'), next: tl('Compris'), action: (_, h) => h.close() },
    ],
  },
  {
    // brancher : dès qu'un fût plein attend au stockage
    id: 'plug', when: (g) => g.lessonsDone.includes('bar') && hasKeg(g) && !g.taps.some((t) => t.beerId != null),
    steps: [
      { target: 'nav:bar', text: tl('Ton premier fût est prêt ! Allons le brancher.'), done: (_, h) => h.view() === 'bar' },
      { view: 'bar', target: plugTarget, text: plugText, sheets: ['bar'], modals: ['kegSwap'], done: flowing },
      { view: 'bar', sheets: ['bar'], text: tl('Ta bière coule au bar ! Quand un fût se vide, rebranches-en un ici. Un barman peut le faire pour toi, contre quelques diamants : il est dans « Personnel », sur l\'ordinateur.'), next: tl('Compris'), action: (_, h) => h.close() },
    ],
  },
  {
    // le stockage, quand il commence à déborder
    // (ou dès que le grossiste a dû reprendre le surplus : le stockage plein, il le vide aussitôt)
    id: 'storage', when: (g) => g.stored >= g.storageCap * 0.8 || g.wholesaleLiters > 0,
    steps: [
      { target: 'nav:storage', text: tl('Ton stockage se remplit ! Allons voir.'), done: (_, h) => h.view() === 'storage' },
      { view: 'storage', target: 'racks', text: tl('Quand il est plein, le grossiste rachète le surplus tout seul, mais à petit prix. Mieux vaut livrer des commandes.'), next: tl('Suivant') },
      { view: 'storage', target: 'storagePlaque', text: tl('Pour stocker plus, agrandis-le : touche le nom de la pièce.'), next: tl('Compris') },
    ],
  },
  {
    // une nouvelle recette, quand la mission demande une 2e bière
    id: 'recipe', when: (g) => g.mission?.def.id === 'beers2',
    steps: [
      { target: 'nav:workshop', text: tl('Et si on créait une nouvelle bière ? Allons à l\'atelier.'), done: (_, h) => h.view() === 'workshop' },
      { view: 'workshop', target: 'mash', text: tl('Touche une machine pour voir ses réglages.'), done: (_, h) => h.sheet() === 'station' },
      {
        view: 'workshop', sheets: ['station'],
        text: tl('Les réglages changent le goût : plus de houblon, une autre température… Change-en un, puis « Brasser » → « Nouvel essai ». On goûte, et si elle est bonne, elle rejoint ta gamme.'),
        next: tl('Compris'), action: (_, h) => h.close(),
      },
    ],
  },
  {
    // les événements du bar, à l'achat de la cible de fléchettes
    id: 'events', when: (g) => g.owns('darts'),
    steps: [
      { target: 'nav:bar', text: tl('Ta cible de fléchettes est installée ! Allons au bar.'), done: (_, h) => h.view() === 'bar' },
      { view: 'bar', target: 'barBtns', text: tl('Lance un tournoi ici : beaucoup plus de clients pendant une heure. Prévois des fûts d\'avance !'), next: tl('Compris') },
    ],
  },
];
export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);

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
  /** Les caches autour de l'élément montré (haut, bas, gauche, droite) : le reste de l'écran ne répond pas. */
  private blocks = [0, 1, 2, 3].map(() => document.createElement('div'));
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
    for (const b of this.blocks) {
      b.className = 'tour-block hidden';
      // toucher ailleurs : Gaston rappelle d'un signe ce qu'il faut toucher
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.nudge();
      });
      b.addEventListener('click', (e) => e.stopPropagation());
    }
    root.append(...this.blocks, this.spot, this.finger, this.bubble);
  }

  private nudge(): void {
    for (const el of [this.bubble, this.finger]) {
      el.classList.remove('nudge');
      void el.offsetWidth; // relance l'animation
      el.classList.add('nudge');
    }
  }

  /** Les caches couvrent tout l'écran sauf `hole` (rien de touchable sans élément montré, hormis la bulle). */
  private block(hole: DOMRect | null): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const [top, bottom, left, right] = this.blocks as [HTMLDivElement, HTMLDivElement, HTMLDivElement, HTMLDivElement];
    const place = (el: HTMLDivElement, l: number, t: number, w: number, h: number) => {
      Object.assign(el.style, { left: `${l}px`, top: `${t}px`, width: `${Math.max(0, w)}px`, height: `${Math.max(0, h)}px` });
      el.classList.toggle('hidden', w <= 0 || h <= 0);
    };
    if (!hole) {
      place(top, 0, 0, W, H);
      for (const el of [bottom, left, right]) el.classList.add('hidden');
      return;
    }
    const l = Math.max(0, hole.left);
    const t = Math.max(0, hole.top);
    const r = Math.min(W, hole.right);
    const b = Math.min(H, hole.bottom);
    place(top, 0, 0, W, t);
    place(bottom, 0, b, W, H - b);
    place(left, 0, t, l, b - t);
    place(right, r, t, W - r, b - t);
  }

  /** Fin de la dernière leçon (s, horloge de la page) : on laisse souffler le joueur avant la suivante. */
  private restUntil = 0;

  /** La visite d'accueil, ou une leçon, est en cours. */
  get active(): boolean {
    const g = this.host.game();
    return g.tips < TOUR.length || !!g.lesson;
  }

  /** Les étapes en cours (la visite ou la leçon) et l'indice de l'étape. */
  private seq(): { steps: readonly Step[]; i: number; lesson: boolean } | null {
    const g = this.host.game();
    if (g.tips < TOUR.length) return { steps: TOUR, i: g.tips, lesson: false };
    const l = g.lesson && lessonById(g.lesson.id);
    if (l && g.lesson) return { steps: l.steps, i: g.lesson.step, lesson: true };
    return null;
  }

  private step(): Step | undefined {
    const q = this.seq();
    return q?.steps[q.i];
  }

  /** Passe à l'étape suivante ; la dernière termine la visite ou la leçon. */
  private next(): void {
    const g = this.host.game();
    const q = this.seq();
    if (!q) return;
    this.key = '';
    if (!q.lesson) {
      g.tips = g.tips + 1 >= TOUR.length ? TUTO_DONE : g.tips + 1;
      if (g.tips >= TUTO_DONE) this.restUntil = performance.now() / 1000 + LESSON_REST;
      return;
    }
    if (q.i + 1 < q.steps.length) g.lesson = { id: g.lesson!.id, step: q.i + 1 };
    else this.endLesson();
  }

  private endLesson(): void {
    const g = this.host.game();
    if (g.lesson && !g.lessonsDone.includes(g.lesson.id)) g.lessonsDone.push(g.lesson.id);
    g.lesson = null;
    this.key = '';
    this.restUntil = performance.now() / 1000 + LESSON_REST;
  }

  private advance(): void {
    const g = this.host.game();
    this.step()?.action?.(g, this.host);
    this.next();
    this.host.tap();
  }

  /** Après la visite : la prochaine leçon dont le moment est venu, quand rien n'est ouvert à l'écran. */
  private pickLesson(): void {
    const g = this.host.game();
    if (g.tips < TUTO_DONE || g.lesson || g.lessonsDone.includes('*')) return;
    if (performance.now() / 1000 < this.restUntil || this.host.modal() || this.host.sheet()) return;
    const l = LESSONS.find((x) => !g.lessonsDone.includes(x.id) && x.when(g));
    if (l) g.lesson = { id: l.id, step: 0 };
  }

  /** La pièce dont parle la leçon en cours (sa pastille « Nouveau » dans la barre du bas), ou null. */
  get lessonRoom(): TourView | null {
    const g = this.host.game();
    if (!g.lesson) return null;
    const s = this.step();
    const t = typeof s?.target === 'string' ? s.target : undefined;
    return t?.startsWith('nav:') ? (t.slice(4) as TourView) : null;
  }

  /** À chaque image : avance si l'étape est accomplie, puis place le doigt, la surbrillance et la bulle. */
  frame(): void {
    const g = this.host.game();
    // une partie arrêtée au milieu de l'ancienne visite, plus longue : elle est finie
    if (g.tips >= TOUR.length && g.tips < TUTO_DONE) this.host.finish();
    this.pickLesson();
    let s = this.step();
    // les étapes déjà accomplies passent toutes seules (une ancienne partie, un joueur en avance)
    for (let n = 0; s?.done && s.done(g, this.host) && n < 50; n++) {
      this.next();
      s = this.step();
    }
    if (!s) return this.hide();
    // une fiche ou une fenêtre ouverte : la visite attend qu'elle se ferme, sauf si l'étape s'y passe
    const modal = this.host.modal();
    const sheet = this.host.sheet();
    if (modal ? !s.modals?.includes(modal) : sheet && !s.sheets?.includes(sheet)) return this.hide();
    // le tout début : la visite commence au bureau
    if (g.tips === 0 && this.host.view() !== 'office' && this.key === '') this.host.goView('office');
    // hors de la pièce de l'étape : on montre l'onglet pour y revenir
    const away = s.view && this.host.view() !== s.view;
    const text = away ? tl('Reviens {0} pour continuer la visite.', ROOM_NAME[s.view!]) : typeof s.text === 'function' ? s.text(g, this.host) : s.text;
    const tid = away ? (`nav:${s.view}` as TourTarget) : typeof s.target === 'function' ? s.target(g, this.host) : s.target;
    const els = (Array.isArray(tid) ? tid : tid ? [tid] : []).flatMap((t) => {
      const e = this.host.target(t);
      return Array.isArray(e) ? e : e ? [e] : [];
    });
    const el = els.length ? els : null;
    const key = `${g.tips}|${g.lesson?.id}|${g.lesson?.step}|${text}|${away}`;
    if (key !== this.key) {
      this.key = key;
      // dans une fiche qui défile, l'élément montré vient à l'écran
      for (const e of els) if (e.closest('.sheet-body')) e.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      this.text.textContent = text;
      this.actions.replaceChildren();
      if (s.next && !away) {
        const b = document.createElement('button');
        b.className = 'btn primary small';
        b.textContent = s.next;
        b.onclick = () => this.advance();
        this.actions.append(b);
      }
      const q = this.seq()!;
      if (q.i < q.steps.length - 1) {
        const skip = document.createElement('button');
        skip.className = 'tour-skip';
        skip.textContent = q.lesson ? tl('Passer') : tl('Passer la visite');
        skip.onclick = () => {
          if (q.lesson) {
            this.host.close();
            this.endLesson();
          } else this.host.finish();
          this.hide();
        };
        this.actions.append(skip);
      }
    }
    this.bubble.classList.remove('hidden');
    const r = union(el);
    const visible = !!r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    if (!visible) {
      this.block(null);
      this.spot.classList.add('hidden');
      this.finger.classList.add('hidden');
      this.bubble.classList.remove('low');
      return;
    }
    // la surbrillance : un cadre doré autour de l'élément, le reste de l'écran assombri
    const pad = 6;
    // une étape à « Suivant » montre sans laisser toucher ; une étape qui attend un geste laisse toucher l'élément
    this.block(s.next && !away ? null : new DOMRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2));
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
    for (const b of this.blocks) b.classList.add('hidden');
    this.spot.classList.add('hidden');
    this.finger.classList.add('hidden');
    this.bubble.classList.add('hidden');
  }
}
