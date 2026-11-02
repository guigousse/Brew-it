import { kindOf, type BuildingType, type MachineKind, type ParamValue } from '../content/buildings';
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
  /** Onglet du bas à mettre en avant. */
  tab?: 'shop' | 'supplier' | 'brews';
  onComplete?: (w: World) => void;
}

/** Premier appareil d'une famille (miniature ou pro). */
const first = (w: World, kind: MachineKind) => w.list.find((b) => kindOf(b.type) === kind);
const statusOf = (w: World, kind: MachineKind) => {
  const b = first(w, kind);
  return b ? describe(w, b).status : '';
};

/** Montant offert à la fin du tutoriel pour lancer la brasserie. */
export const TUTORIAL_REWARD = 1200;

/**
 * Le tutoriel : monter une petite brasserie de garage raccordée par des tuyaux, composer son brassin,
 * acheter et charger les ingrédients, puis livrer sa première caisse. Plan du garage (10 × 7) :
 *
 *   y0          [Robinet]
 *   y1          [tuyau↓]
 *   y2  .  [Conc][Empât][→][→][Ébull][Serp→][→][Dame-j.]
 *   y3                                         [tuyau↓]
 *   y4                               [tapis↓][←][Embout.]
 *   y5                               [Caisse]
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'intro', chapter: 'Bienvenue', ack: true,
    text: 'Salut ! Moi c\'est Gaston, j\'ai brassé pendant quarante ans. On va monter ta brasserie de garage avec du petit matériel, brasser ta toute première bière de A à Z, et livrer une caisse de 12 bouteilles au bar du coin.',
  },
  {
    id: 'mill', chapter: 'Le concassage', tab: 'shop',
    text: 'Une bière, c\'est de l\'eau, du malt, du houblon et de la levure. Le malt, c\'est de l\'orge germée puis séchée. Le concasseur casse ses grains pour libérer l\'amidon. Ouvre le Magasin, choisis-le, puis touche la case qui clignote.',
    places: [{ type: 'mill', x: 1, y: 2 }],
  },
  {
    id: 'mash_tun', chapter: 'L\'empâtage', tab: 'shop',
    text: 'La marmite d\'empâtage : on y fait infuser le malt concassé dans de l\'eau chaude, comme un thé. L\'amidon devient du sucre. Pose-la juste à droite du concasseur, qui la remplira directement.',
    places: [{ type: 'mash_tun_mini', x: 2, y: 2 }],
  },
  {
    id: 'water', chapter: 'L\'empâtage', tab: 'shop',
    text: 'Une bière, c\'est 90 % d\'eau ! Installe le robinet contre le mur, puis un tuyau qui descend jusqu\'à la marmite.',
    places: [{ type: 'water_tap', x: 2, y: 0 }, { type: 'conduit', x: 2, y: 1, rot: 1 }],
  },
  {
    id: 'pipe_kettle', chapter: 'L\'ébullition', tab: 'shop',
    text: 'Le liquide sucré qui sort de l\'empâtage s\'appelle le moût. Trace un tuyau vers la droite : glisse ton doigt sur les deux cases.',
    places: [{ type: 'conduit', x: 3, y: 2, rot: 0 }, { type: 'conduit', x: 4, y: 2, rot: 0 }],
  },
  {
    id: 'kettle', chapter: 'L\'ébullition', tab: 'shop',
    text: 'Au bout du tuyau, la marmite d\'ébullition : on fait bouillir le moût une heure pour le stériliser, et c\'est là qu\'on ajoute le houblon.',
    places: [{ type: 'kettle_mini', x: 5, y: 2 }],
  },
  {
    id: 'cooler', chapter: 'Le refroidissement', tab: 'shop',
    text: 'Point crucial : après l\'ébullition le moût est à 100 °C, et la levure meurt au-dessus de 35 °C ! Branche ce serpentin refroidisseur à la sortie de la marmite.',
    places: [{ type: 'cooler', x: 6, y: 2, rot: 0 }],
  },
  {
    id: 'fermenter', chapter: 'La fermentation', tab: 'shop',
    text: 'Un bout de tuyau, puis la dame-jeanne : la levure y mange le sucre et fabrique l\'alcool et les bulles.',
    places: [{ type: 'conduit', x: 7, y: 2, rot: 0 }, { type: 'fermenter_mini', x: 8, y: 2 }],
  },
  {
    id: 'bottler', chapter: 'L\'embouteillage', tab: 'shop',
    text: 'Quand la bière est prête, elle descend par un tuyau jusqu\'à l\'embouteilleuse.',
    places: [{ type: 'conduit', x: 8, y: 3, rot: 1 }, { type: 'bottler_mini', x: 8, y: 4 }],
  },
  {
    id: 'conveyor', chapter: 'La livraison', tab: 'shop',
    text: 'Les bouteilles partent sur un tapis roulant. Trace-le avec un virage : glisse vers la gauche, puis vers le bas.',
    places: [{ type: 'conveyor', x: 7, y: 4, rot: 2 }, { type: 'conveyor', x: 6, y: 4, rot: 1 }],
  },
  {
    id: 'crate', chapter: 'La livraison', tab: 'shop',
    text: 'Au bout du tapis, la caisse : dès qu\'elle contient 12 bouteilles, elle part chez le bar du coin.',
    places: [{ type: 'crate', x: 6, y: 5 }],
  },
  {
    id: 'recipe', chapter: 'Ton brassin', signal: 'recipe:created', action: 'recipe',
    text: 'Ta brasserie est prête ! Pour ta première bière, je te prête ma recette, une blonde qui ne rate jamais. Regarde bien chaque réglage : plus tard, tu inventeras les tiens.',
  },
  {
    id: 'stock_malt', chapter: 'Le fournisseur', signal: 'stock:malt', tab: 'supplier',
    text: 'Il faut des ingrédients ! Ouvre l\'onglet Fournisseur et achète un sac de malt de 5 kg. Il ira dans ta réserve, et les machines s\'y serviront toutes seules.',
  },
  {
    id: 'stock_rest', chapter: 'Le fournisseur', tab: 'supplier',
    until: (w) => ['hops', 'yeast', 'bottle'].every((i) => w.tutorial.signals.includes(`stock:${i}`)),
    text: (w) => {
      const left = [['hops', 'du houblon'], ['yeast', 'de la levure'], ['bottle', 'des bouteilles']]
        .filter(([i]) => !w.tutorial.signals.includes(`stock:${i}`)).map(([, l]) => l);
      return `Parfait. Achète aussi ${left.join(', ')}. Surveille tes réserves : si l'une est vide, la machine concernée s'arrête et clignote en rouge.`;
    },
  },
  {
    id: 'wait_brew', chapter: 'Ça brasse !', fastForward: true,
    until: (w) => first(w, 'fermenter')?.machine?.phase === 'processing',
    text: (w) => {
      const m = first(w, 'mash_tun')?.machine?.phase;
      const k = first(w, 'kettle')?.machine?.phase;
      const f = first(w, 'fermenter');
      if (f?.machine?.phase === 'failed') return 'Aïe… le moût était trop chaud et la levure est morte. Pas grave, ça arrive aux meilleurs : on recommence avec le prochain brassin.';
      if (f && f.fluidIn!.amount > 0) return `Le moût refroidi coule dans la dame-jeanne. ${statusOf(w, 'fermenter')}.`;
      if (k === 'heating' || k === 'processing') return `${statusOf(w, 'kettle')}. Ça sent bon le pain chaud et l'herbe coupée !`;
      if (m === 'heating' || m === 'processing') return `${statusOf(w, 'mash_tun')}. Tu peux accélérer le temps si tu veux.`;
      return 'Le malt passe au concasseur, l\'eau remplit la marmite… Ton brassin démarre !';
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
      return `Ta première caisse est livrée !${profile} Je t'offre ${TUTORIAL_REWARD} € pour lancer ta brasserie. À toi d'inventer tes recettes dans l'onglet Brassins : chaque nouvelle recette passe par une fournée d'essai.`;
    },
    onComplete: (w) => {
      w.money += TUTORIAL_REWARD;
    },
  },
];
