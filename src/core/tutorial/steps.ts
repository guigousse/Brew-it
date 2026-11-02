import type { BuildingType, ParamValue } from '../content/buildings';
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
  /** Action proposée par Gaston dans son panneau (ex. ouvrir l'assistant de brassin). */
  action?: 'recipe';
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
 * Le tutoriel : construire sa ligne de brassage, composer son brassin, ajouter les ingrédients,
 * puis livrer sa première caisse au bar du coin. Plan du garage (10 × 7) :
 *
 *   y0      [Empât ][Ébull ]
 *   y1  [Co][Empât ][Ébull ][R↓]
 *   y2      [Eau]           [Ferm ]
 *   y3                      [Ferm ]
 *   y4          [↓][←]      [Embout]
 *   y5          [Caisse]    [Embout]
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'intro', chapter: 'Bienvenue', ack: true,
    text: 'Salut ! Moi c\'est Gaston, j\'ai brassé pendant quarante ans. Ton garage est parfait pour démarrer. On va monter ta brasserie, brasser ta toute première bière de A à Z, et livrer une caisse de 12 bouteilles au bar du coin.',
  },
  {
    id: 'mill', chapter: 'Le concassage',
    text: 'Une bière, c\'est de l\'eau, du malt, du houblon et de la levure. Le malt, c\'est de l\'orge qu\'on a fait germer puis sécher. Le concasseur casse ses grains pour libérer l\'amidon. Choisis-le en bas, puis touche la case qui clignote.',
    places: [{ type: 'mill', x: 1, y: 1 }],
  },
  {
    id: 'mash_tun', chapter: 'L\'empâtage',
    text: 'Voici la cuve d\'empâtage : on y fait infuser le malt concassé dans de l\'eau chaude, comme un thé. L\'amidon s\'y transforme en sucre. Pose-la collée au concasseur : les machines voisines se passent tout.',
    places: [{ type: 'mash_tun', x: 2, y: 0 }],
  },
  {
    id: 'water', chapter: 'L\'empâtage',
    text: 'Une bière, c\'est 90 % d\'eau ! Pose l\'arrivée d\'eau juste sous la cuve.',
    places: [{ type: 'water_tap', x: 2, y: 2 }],
  },
  {
    id: 'kettle', chapter: 'L\'ébullition',
    text: 'Le liquide sucré qui sort de l\'empâtage s\'appelle le moût. On le fait bouillir une heure pour le stériliser, et c\'est là qu\'on ajoute le houblon. Pose la cuve d\'ébullition.',
    places: [{ type: 'kettle', x: 4, y: 0 }],
  },
  {
    id: 'cooler', chapter: 'Le refroidissement',
    text: 'Point crucial : après l\'ébullition le moût est à 100 °C, et la levure meurt au-dessus de 35 °C ! Ce refroidisseur fera tomber le moût à 20 °C.',
    places: [{ type: 'cooler', x: 6, y: 1, rot: 1 }],
  },
  {
    id: 'fermenter', chapter: 'La fermentation',
    text: 'Le moût refroidi coule dans le fermenteur. La levure y mange le sucre et fabrique l\'alcool et les bulles. Pose-le sous le refroidisseur.',
    places: [{ type: 'fermenter', x: 6, y: 2 }],
  },
  {
    id: 'bottler', chapter: 'L\'embouteillage',
    text: 'Une fois la bière prête, l\'embouteilleuse la met en bouteilles. Pose-la sous le fermenteur.',
    places: [{ type: 'bottler', x: 6, y: 4 }],
  },
  {
    id: 'conveyor', chapter: 'La livraison',
    text: 'Les bouteilles doivent rejoindre la caisse de livraison. Trace un tapis roulant avec un virage : glisse ton doigt sur les cases qui clignotent, vers la gauche puis vers le bas.',
    places: [{ type: 'conveyor', x: 5, y: 4, rot: 2 }, { type: 'conveyor', x: 4, y: 4, rot: 1 }],
  },
  {
    id: 'crate', chapter: 'La livraison',
    text: 'Au bout du tapis, la caisse : dès qu\'elle contient 12 bouteilles, elle part chez le bar du coin.',
    places: [{ type: 'crate', x: 4, y: 5 }],
  },
  {
    id: 'recipe', chapter: 'Ton brassin', signal: 'recipe:created', action: 'recipe',
    text: 'Ta brasserie est prête ! Maintenant, compose ta recette : c\'est ton brassin. Je t\'explique chaque choix, et tu lui donneras un nom.',
  },
  {
    id: 'buy_malt', chapter: 'Les ingrédients', signal: 'buy:malt',
    text: 'La production est lancée, mais il manque les ingrédients ! Touche le sac de malt « + » qui clignote au-dessus du concasseur : il achète juste ce qu\'il faut.',
  },
  {
    id: 'buy_hops', chapter: 'Les ingrédients', signal: 'buy:hops',
    text: 'Parfait. Ajoute aussi le houblon à la cuve d\'ébullition : touche son icône « + ».',
  },
  {
    id: 'buy_yeast', chapter: 'Les ingrédients', signal: 'buy:yeast',
    text: 'Puis un sachet de levure pour le fermenteur.',
  },
  {
    id: 'buy_bottles', chapter: 'Les ingrédients', signal: 'buy:bottle',
    text: 'Et des bouteilles vides pour l\'embouteilleuse. Plus tard, tu pourras acheter des réserves pour que tout ça se remplisse tout seul.',
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
      return 'Le malt passe au concasseur, l\'eau remplit la cuve… Ton brassin démarre !';
    },
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
      return `Ta bière est prête ! Les bouteilles filent vers la caisse : ${c?.itemsIn?.length ?? 0} / 12.`;
    },
  },
  {
    id: 'finale', chapter: 'Bravo !', ack: true,
    text: (w) => {
      const b = w.firstBeer;
      const name = b?.name ? `« ${b.name} »` : 'Ta bière';
      const profile = b ? ` ${name} fait ${b.abv.toFixed(1)} % d'alcool, ${Math.round(b.ibu)} d'amertume (IBU), avec une qualité de ${Math.round(b.quality * 100)} %.` : '';
      return `Ta première caisse est livrée !${profile} Tu sais maintenant brasser de A à Z. Je t'offre ${TUTORIAL_REWARD} € pour lancer ta brasserie. À toi de jouer !`;
    },
    onComplete: (w) => {
      w.money += TUTORIAL_REWARD;
    },
  },
];
