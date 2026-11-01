import type { BuildingType, MachineKind, ParamValue } from '../content/buildings';
import type { Dir } from '../dir';
import { describe } from '../describe';
import type { World } from '../world';

export interface PlaceTarget {
  type: BuildingType;
  x: number;
  y: number;
  rot?: Dir;
  params?: Record<string, ParamValue>;
}

export interface TutorialStep {
  id: string;
  /** Étape du brassage (affichée en titre). */
  chapter: string;
  text: string | ((w: World) => string);
  /** Bâtiments à poser : seules ces constructions sont permises pendant l'étape. */
  places?: PlaceTarget[];
  /** Signal envoyé par l'interface (ouvrir une machine, faire un choix, « Continuer »…). */
  signal?: string;
  until?: (w: World) => boolean;
  /** Affiche un bouton « Continuer ». */
  ack?: boolean;
  /** Propose d'accélérer le temps pendant l'attente. */
  fastForward?: boolean;
  /** Machine à mettre en avant (l'interface peut l'ouvrir). */
  focus?: { x: number; y: number };
  /** Machines autorisées à démarrer une fois cette étape franchie. */
  allowStart?: MachineKind[];
  onComplete?: (w: World) => void;
}

const first = (w: World, type: BuildingType) => w.list.find((b) => b.type === type);
const statusOf = (w: World, type: BuildingType) => {
  const b = first(w, type);
  return b ? describe(w, b).status : '';
};

/** Montant offert à la fin du tutoriel pour lancer la brasserie. */
export const TUTORIAL_REWARD = 1200;

/**
 * Le tutoriel : brasser sa première bière de A à Z, puis livrer une caisse au bar du coin.
 * Plan du garage (10 × 7) :
 *
 *   y0      . . . [Empât ] [Ébull ] .
 *   y1  [M]→[C][Empât ] [Ébull ] [R↓]
 *   y2      . . . [Eau]   . [Houb]  . [Ferm ] [Lev]
 *   y3                              [Ferm ]
 *   y4                      [Caisse][Embout] [Bout]
 *   y5                              [Embout]
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'intro', chapter: 'Bienvenue', ack: true,
    text: 'Salut ! Moi c\'est Gaston, j\'ai brassé pendant quarante ans. Ton garage est parfait pour démarrer. Ensemble, on va brasser ta toute première bière, de A à Z, et livrer une caisse de 12 bouteilles au bar du coin.',
  },
  {
    id: 'malt', chapter: 'Le malt',
    text: 'Tout commence par le malt : de l\'orge qu\'on a fait germer puis sécher. Il donne le sucre, la couleur et le goût de pain. Choisis « Livraison » en bas, puis touche la case qui clignote.',
    places: [{ type: 'supplier', x: 0, y: 1, params: { item: 'malt' } }],
  },
  {
    id: 'conveyor', chapter: 'Le malt',
    text: 'Pose un tapis roulant juste à droite pour faire avancer les sacs de malt.',
    places: [{ type: 'conveyor', x: 1, y: 1, rot: 0 }],
  },
  {
    id: 'mill', chapter: 'Le concassage',
    text: 'Le concasseur casse les grains pour libérer l\'amidon qu\'ils contiennent. Sans ça, l\'eau ne pourrait pas en extraire le sucre.',
    places: [{ type: 'mill', x: 2, y: 1 }],
  },
  {
    id: 'mash_tun', chapter: 'L\'empâtage',
    text: 'Voici la cuve d\'empâtage. On y fait infuser le malt concassé dans de l\'eau chaude, comme un thé. Pose-la collée au concasseur : les machines voisines se passent les ingrédients toutes seules.',
    places: [{ type: 'mash_tun', x: 3, y: 0 }],
  },
  {
    id: 'water', chapter: 'L\'empâtage',
    text: 'Une bière, c\'est 90 % d\'eau ! Pose l\'arrivée d\'eau juste sous la cuve.',
    places: [{ type: 'water_tap', x: 3, y: 2 }],
  },
  {
    id: 'open_mash', chapter: 'L\'empâtage', signal: 'open:mash_tun', focus: { x: 3, y: 0 },
    text: 'C\'est le moment de faire tes premiers choix de brasseur. Touche la cuve d\'empâtage.',
  },
  {
    id: 'choose_grain', chapter: 'L\'empâtage', signal: 'choice:grainKg', focus: { x: 3, y: 0 },
    text: 'Combien de malt ? Plus il y en a, plus il y aura de sucre… et donc d\'alcool. Pour une première, 5 kg donne une bière classique.',
  },
  {
    id: 'choose_mash_temp', chapter: 'L\'empâtage', signal: 'choice:mashTemp', focus: { x: 3, y: 0 }, allowStart: ['mash_tun'],
    text: 'Et la température ? Dans le malt, des enzymes coupent l\'amidon en sucres. À 63 °C, ils font des sucres que la levure mange tous : bière sèche. À 69 °C, il en reste : bière ronde et douce.',
  },
  {
    id: 'kettle', chapter: 'L\'ébullition',
    text: 'L\'empâtage est lancé ! Le liquide sucré qui en sort s\'appelle le moût. Il faut ensuite le faire bouillir une heure : ça le stérilise. Pose la cuve d\'ébullition à droite.',
    places: [{ type: 'kettle', x: 5, y: 0 }],
  },
  {
    id: 'hops', chapter: 'Le houblon',
    text: 'C\'est pendant l\'ébullition qu\'on ajoute le houblon, une fleur qui apporte l\'amertume et les arômes. Pose une livraison de houblon sous la cuve.',
    places: [{ type: 'supplier', x: 5, y: 2, params: { item: 'hops' } }],
  },
  {
    id: 'choose_hops', chapter: 'Le houblon', signal: 'choice:hopsItems', focus: { x: 5, y: 0 }, allowStart: ['kettle'],
    text: 'Touche la cuve d\'ébullition et choisis ta dose de houblon. Peu de houblon : bière douce. Beaucoup : bière amère et parfumée, comme une IPA.',
  },
  {
    id: 'cooler', chapter: 'Le refroidissement',
    text: 'Attention, point crucial ! Après l\'ébullition, le moût est à 100 °C. La levure meurt au-dessus de 35 °C. Pose ce refroidisseur à droite de la cuve : il fera passer le moût à 20 °C.',
    places: [{ type: 'cooler', x: 7, y: 1, rot: 1 }],
  },
  {
    id: 'fermenter', chapter: 'La fermentation',
    text: 'Le moût refroidi coulera dans le fermenteur. C\'est là que la magie opère. Pose-le sous le refroidisseur.',
    places: [{ type: 'fermenter', x: 7, y: 2 }],
  },
  {
    id: 'yeast', chapter: 'La fermentation',
    text: 'La levure est un champignon minuscule : elle mange le sucre et fabrique de l\'alcool et des bulles. Pose sa livraison à droite du fermenteur.',
    places: [{ type: 'supplier', x: 9, y: 2, params: { item: 'yeast', interval: 10 } }],
  },
  {
    id: 'choose_strain', chapter: 'La fermentation', signal: 'choice:strain', focus: { x: 7, y: 2 },
    text: 'Touche le fermenteur et choisis ta levure. C\'est elle qui donne le caractère : nette, fruitée ou épicée.',
  },
  {
    id: 'choose_garde', chapter: 'La garde', signal: 'choice:gardeDays', focus: { x: 7, y: 2 }, allowStart: ['fermenter'],
    text: 'Après la fermentation vient la garde : la bière se repose au calme et devient plus fine. Plus c\'est long, meilleur c\'est… mais plus il faut attendre.',
  },
  {
    id: 'wait_brew', chapter: 'Ça brasse !', fastForward: true,
    until: (w) => first(w, 'fermenter')?.machine?.phase === 'processing',
    text: (w) => {
      const m = first(w, 'mash_tun')?.machine?.phase;
      const k = first(w, 'kettle')?.machine?.phase;
      const f = first(w, 'fermenter');
      if (f?.machine?.phase === 'failed') return 'Aïe… le moût était trop chaud et la levure est morte. Pas grave, ça arrive aux meilleurs : on recommence avec le prochain brassin.';
      if (f && f.fluidIn!.amount > 0) return `Le moût refroidi coule dans le fermenteur. ${statusOf(w, 'fermenter')}.`;
      if (k === 'heating' || k === 'processing') return `${statusOf(w, 'kettle')}. Ça sent bon le pain chaud et l'herbe coupée !`;
      if (m === 'heating' || m === 'processing') return `${statusOf(w, 'mash_tun')}. Tu peux accélérer le temps si tu veux.`;
      return 'Ton brassin avance. Regarde les machines travailler !';
    },
  },
  {
    id: 'bottler', chapter: 'L\'embouteillage',
    text: 'La levure est au travail ! Pendant ce temps, prépare la suite : l\'embouteilleuse, juste sous le fermenteur.',
    places: [{ type: 'bottler', x: 7, y: 4 }],
  },
  {
    id: 'bottles', chapter: 'L\'embouteillage',
    text: 'Il lui faut des bouteilles vides. Pose une livraison de bouteilles à sa droite.',
    places: [{ type: 'supplier', x: 9, y: 4, params: { item: 'bottle' } }],
  },
  {
    id: 'crate', chapter: 'La livraison',
    text: 'Dernière pièce : la caisse de livraison, à gauche de l\'embouteilleuse. Dès qu\'elle contient 12 bouteilles, elle part chez le bar du coin.',
    places: [{ type: 'crate', x: 6, y: 4 }],
  },
  {
    id: 'wait_ferment', chapter: 'Patience…', fastForward: true,
    until: (w) => w.stats.fermentations >= 1,
    text: (w) => {
      const f = first(w, 'fermenter');
      const p = f ? describe(w, f) : undefined;
      const percent = p?.progress != null ? ` (${Math.round(p.progress * 100)} %)` : '';
      return `${p?.status ?? 'Fermentation en cours'}${percent}. Un vrai brasseur sait attendre… mais tu peux accélérer !`;
    },
  },
  {
    id: 'wait_crate', chapter: 'La livraison', fastForward: true,
    until: (w) => w.stats.crates >= 1,
    text: (w) => {
      const c = first(w, 'crate');
      return `Ta bière est prête ! Mise en bouteille : ${c?.itemsIn?.length ?? 0} / 12.`;
    },
  },
  {
    id: 'finale', chapter: 'Bravo !', ack: true,
    text: (w) => {
      const b = w.firstBeer;
      const profile = b ? ` Ta bière fait ${b.abv.toFixed(1)} % d'alcool, ${Math.round(b.ibu)} d'amertume (IBU), avec une qualité de ${Math.round(b.quality * 100)} %.` : '';
      return `Ta première caisse est livrée !${profile} Tu sais maintenant brasser de A à Z. Je t'offre ${TUTORIAL_REWARD} € pour lancer ta brasserie. À toi de jouer !`;
    },
    onComplete: (w) => {
      w.money += TUTORIAL_REWARD;
    },
  },
];
