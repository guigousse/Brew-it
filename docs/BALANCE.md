# Brew It : audit d'équilibrage

## Le rythme visé

| Critère | Cible | Résultat (rééquilibrage de novembre 2026) |
|---|---|---|
| Durée pour tout débloquer (4 visites/jour) | 4 semaines environ | **28 à 31 jours** selon le tirage |
| Durée pour un joueur occasionnel (2 visites/jour) | 5 à 6 semaines | **45 jours** (un peu long, voir plus bas) |
| Visites où l'on peut acheter quelque chose | au moins 1 sur 2 | **82 %** (94 % à 2 visites/jour) |
| Plus longue période sans rien acheter | 1 journée au plus | **3 visites** (2 à 2 visites/jour) |
| Premier jour | beaucoup de récompenses | ~20 achats, niveau 2 en 4 h 30 de jeu (inchangé) |
| Machines (4 visites/jour) | des paliers réguliers | niveau 3 à J4, niveau 4 à J10, niveau 5 à J18 |

Avant ce rééquilibrage, le joueur simulé réparé mettait **plus de 120 jours** (voir « Rééquilibrage de novembre 2026 », en fin de document).

**À 2 visites par jour, le jeu reste plus long que la cible** : la brasserie ne tourne que 8 h pendant l'absence, et deux visites espacées de 12 h perdent environ 8 h de production par jour. Pour s'en rapprocher sans toucher au rythme des joueurs assidus, on pourrait porter l'absence à 12 h, éventuellement dans une offre premium.

Le jeu ne doit pas se terminer en une semaine, mais on ne doit jamais être bloqué plus d'une journée. Revenir plusieurs fois par jour fait avancer, sans qu'il faille « farmer » : la brasserie tourne seule jusqu'à 8 h.

## Méthode : un joueur simulé

`npm run balance` lance `scripts/balance.ts`. Ce script joue une vraie partie avec le moteur du jeu :

- 4 visites par jour (8 h, 12 h 30, 18 h 30, 22 h 30), dont 10 minutes de jeu actif, et le hors-ligne simulé entre deux visites ;
- à chaque visite, il récolte, achète ce qui est disponible du moins cher au plus cher, et crée une nouvelle bière dès qu'il a une place libre (recettes dans `scripts/recipes.ts`) ;
- en sortie, il donne la chronologie des achats, le chiffre d'affaires par jour, la date de chaque contrat et le nombre de visites sans achat.

Les profils se changent avec des variables d'environnement : `SESSIONS=8,20 npm run balance` (2 visites par jour), `ACTIVE=30` (30 minutes de jeu actif par visite).

## Constats de l'audit

Avant les corrections, avec 5 niveaux mais l'ancienne économie, le joueur simulé terminait le jeu **en 3 jours**. L'analyse montrait :

1. **La production écrasait la demande.** La ligne sortait environ 10 bouteilles/min dès le départ, contre 1/min pour le bar. Améliorer les machines ne rapportait donc rien : seuls les contrats comptaient.
2. **Le stockage ne servait à rien.** Avec le brassage continu, les bouteilles partaient aussitôt produites.
3. **La gamme n'avait aucun intérêt économique.** Une seule bière suffisait à fournir tous les distributeurs. Les places à acheter n'étaient que cosmétiques.
4. **Le revenu progressait en escalier.** Il faisait de grands sauts à chaque contrat, puis restait plat une semaine (jours 3 à 7) : rien à acheter, frustrant.
5. **La fin de partie était plafonnée.** La cadence d'embouteillage (250 btl/min) limitait le revenu. Les négociations et l'export ne rapportaient plus rien : 18 visites d'affilée sans achat.
6. **Trois blocages définitifs étaient possibles :**
   - un brassin plus gros que tout le stockage (600 L = 1 818 bouteilles pour 1 800 places) : le brassage continu ne repartait jamais ;
   - tout dépenser en améliorations avant de brasser : plus d'argent pour les ingrédients, rien à vendre, la partie était bloquée pour toujours ;
   - un essai non goûté bloquait toute la ligne pendant l'absence : jusqu'à 8 h sans production.
7. **Des frictions :**
   - il fallait attendre qu'une machine soit vide pour l'améliorer, ce qui n'arrive presque jamais avec le brassage continu ;
   - le bouton ×2/×4 multipliait les gains et cassait tout l'équilibrage ;
   - le brassage continu ne gérait qu'une seule bière.

## Ce qui a changé

**Niveaux des machines (5 au lieu de 3)**
- Niveau 1 : verrerie d'alchimiste (mortier, ballon sur bec Bunsen, alambic, réfrigérant de Liebig, erlenmeyer, bocal, entonnoir). Lots de 5 L, ± 3 °C.
- Niveaux 2 à 4 : les anciens niveaux 1 à 3.
- Niveau 5 : labo futuriste (broyeur laser, bioréacteur, induction, cryo-échangeur, cuve de stase, ligne robotisée). Lots de 600 L, température exacte.
- Les anciennes sauvegardes passent automatiquement aux niveaux 2 à 4.

**Offre et demande qui se rattrapent**
- La fermentation et la garde prennent du vrai temps : 1 jour de fermentation = 30 s, soit 6 à 7 min pour la blonde de Gaston au niveau 1.
- La cadence monte à chaque niveau, puis les contrats rattrapent la production :

| Niveau | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Cadence (btl/min) | 4 | 20 | 75 | 336 | 1 500 |

- L'onglet Ventes affiche les commandes face à la cadence de la ligne, pour savoir s'il faut vendre plus ou produire plus.

**Stockage utile**
- Les distributeurs commandent par lots : 1 bouteille pour le bar, 240 pour le supermarché, 480 pour l'export.
- Il faut donc du stock et un stockage assez grand : l'onglet Ventes prévient si le stockage est trop petit pour un client.

**Gamme utile**
- Chaque bière qui plaît à un distributeur augmente ses commandes de 25 % (variété).
- Le brassage continu fait tourner toute la gamme, en commençant par la bière la moins en stock.

**Progression plus fine**
- 2 nouveaux distributeurs : Festival et Export (repensé).
- Négociation de chaque contrat sur 5 niveaux, +40 % de commandes par niveau.
- Le jeu compte maintenant 77 achats au lieu de 44.

**Prix recalés tier par tier**
- Chaque contrat ouvre un palier de 4 à 5 jours.
- Les achats d'un palier coûtent entre 0,2 et 1,5 jour de revenu de ce palier.

**Garde-fous**
- Si le joueur n'a plus d'argent ni de stock, Gaston avance les ingrédients : la partie ne peut jamais se bloquer.
- Le brassage continu repart toujours quand le stockage est vide.
- Un essai non goûté est mis de côté et ne bloque plus la ligne.

**Moins de frictions**
- On peut améliorer une machine pendant un brassin.
- Un essai lancé quand le moulin est occupé passe au tour suivant, avant le brassage continu.
- Le tout premier brassin va 4 fois plus vite (2 min au lieu de 7) et ne peut pas être infecté.
- L'accélération du temps est rangée dans Options, en « mode test ».

## Résultat (4 visites par jour)

```
Fin : J33 · 125 visites · 30 % sans achat · pire série sans achat : 3 visites
2 visites par jour : fin J45 · 13 % sans achat · pire série : 2
Popularité de la marque : ~30 % au début, 50-60 % en milieu de partie, 70 % et plus en fin
```

## Finesse et popularité plus exigeantes

- **Finesse** : la note est plafonnée par la finesse de la recette. Une recette sans défaut ne dépasse plus 14/20 si elle n'est pas affinée. Au-dessus de 18/20, tout doit être juste.
- **Popularité** : sa cible suit la qualité au carré (ou presque), elle est plafonnée par le niveau de la brasserie, et elle monte trois fois moins vite. Une bière « Bonne » d'un garage ne dépasse plus 2,5 ★.
- Une marque moins populaire est moins bien payée : le grossiste remonte à 1,60 € pour garder la fin vers le J33.

## Volume progressif et cuves en parallèle

- Chaque appareil amélioré grossit **tout de suite** les brassins (1/7 du palier suivant) : il n'y a plus de longs paliers où l'on attend que les 7 appareils soient au même niveau.
- Les **cuves en parallèle** (fermentation et garde) multiplient la cadence. D'abord trop bon marché, elles faisaient finir le jeu en 8 jours. Elles coûtent désormais le prix de l'appareil du niveau suivant × le nombre de cuves, et améliorer un appareil coûte autant de fois que de cuves.
- Pour compenser la production plus forte, le **grossiste** est descendu à 1,50 € de base (puis remonté à 1,60 €, voir plus haut).

## Tableau de commandes, grossiste (v7)

- Les **contrats et négociations** ont disparu, au profit d'un tableau de commandes variées : moins nombreuses, plus petites au début, et toujours payées le montant annoncé.
- Le **grossiste automatique** écoule le surplus en continu (au-delà de la moitié du stockage). Sans lui, la production des absences était perdue et la partie dépassait 60 jours.
- Les **améliorations de l'ordinateur** (places au tableau) remplacent une partie des achats que représentaient les contrats.
- **Achats intermédiaires** : sans contrats, 62 % des visites se passaient sans achat. Les fêtes, les campagnes de pub et les cuves en parallèle ramènent ce chiffre à 31 % (16 % à 2 visites par jour). Le joueur simulé lance une campagne quand il a quatre fois son prix en trop, et une fête quand il a trois fûts d'avance par tireuse.

## Où régler quoi

| Pour… | Modifier |
|---|---|
| Allonger ou raccourcir tout le jeu | `WHOLESALE_PRICE` (le gros du revenu) et les prix des machines |
| Changer le prix des machines | `TIER_COST` et `baseCost` (`src/core/stations.ts`) |
| Changer le rythme du brassage | `DAY_S`, `SPEED`, `BOTTLE_S` (`src/core/stations.ts`) |
| Changer la place des bières dans la gamme | `VARIETY` (`market.ts`) et `SLOT_COSTS` (`src/core/warehouse.ts`) |
| Changer le stockage | `STORAGE` (`warehouse.ts`) |
| Changer le bar | `BAR`, `BAR_BASE_SHARE`, `GLASS_PRICE`, `kegLiters`, `PARTY`, `PARTY_COST` (`market.ts`) |
| Changer la publicité | `AD`, `AD_COST` (`market.ts`) |
| Changer la popularité et les tendances | `popTarget`, `POP_CAP`, `POP_PER_GLASS`, `POP_PER_BOTTLE`, `POP_DECAY`, `TREND_*` (`src/core/trends.ts`) |
| Changer la finesse | fin de `brew()` et `finish()` (`src/core/brewing/model.ts`) |
| Changer les commandes | `CLIENT_TYPES`, `ORDER_BASE`, `KIND_PAY`, `ORDER_GAP_*`, `ORDER_LIFE_*`, `COMPUTERS` (`src/core/orders.ts`) |
| Changer le grossiste | `WHOLESALE_PRICE`, `WHOLESALE_KEEP` (`orders.ts`) |

Après chaque réglage, relancer `npm run balance` et vérifier :
- la durée totale ;
- le pourcentage de visites sans achat ;
- la pire série sans achat.

## Pistes pour la suite (pas encore faites)

1. ~~Des commandes spéciales~~ : c'est fait en partie. Les clients envoient des commandes à remplir, parfois avec un style exigé. On pourrait ajouter des commandes rares, avec une prime, qui demandent une recette précise.
2. **Des notifications locales** : essai prêt à goûter, stockage plein, plafond des 8 h atteint. Elles ramènent le joueur au bon moment.
3. ~~Faire peser davantage la qualité~~ : c'est fait. La précision du matériel fait varier la qualité de 0,58 en moyenne au niveau 1 à 1,00 au niveau 5 (voir GAME_DESIGN.md et `npm run quality`). Le rythme reste de 28 jours.
4. **Le palier du niveau 5.** Le volume de 600 L n'arrive qu'avec les 7 machines au niveau 5. C'est le passage le plus lent (J13 à J19). On pourrait donner à chaque machine de niveau 5 un bonus immédiat (vitesse, qualité).
5. **Une rejouabilité après la fin** (nouvelle brasserie, prestige) pour les joueurs qui finissent en un mois.
6. **Valider avec de vrais joueurs sur TestFlight** : le joueur simulé achète toujours au mieux, alors qu'un vrai joueur hésite et se trompe de recette. On peut s'attendre à 20 à 30 % de temps en plus.

## Fin du brassage continu

- Le **brassage continu** disparaît : tout passe par la file de brassins programmés. C'est elle qui fait tourner la brasserie pendant l'absence.
- Avec les premières tailles de file (10 à 200 brassins), la production des absences s'effondrait : au niveau 1, 10 brassins ne tiennent qu'environ 40 min (≈ 17 brassins/h). Le joueur simulé ne finissait plus en 45 jours.
- Le joueur simulé remplit désormais la file avant chaque absence. Essais : 150–600 → J28, 100–600 → J29, **50–400 → J31**, 30–300 → J38. On garde **50, 80, 150, 250, 400**, au plus près de l'ancien rythme (J33).

## Événements à débloquer

- La fête demande maintenant une **boule à facettes** (150 €). Le joueur simulé l'achète au premier jour. Il finit en J30, contre J31 avant (les écarts d'un jour viennent du hasard des commandes).

## Étude : lancer un brassin seulement s'il ne bloquera pas les machines

Aujourd'hui, le moulin lance un brassin dès qu'il est libre. Les brassins s'accumulent alors dans les machines chaudes (moulin, cuve d'empâtage, ébullition, refroidissement) en attendant une cuve de fermentation : ces machines sont bloquées 76 à 88 % du temps. Simulation sur 6 h, file de 400 brassins (`brassins/h` · machines chaudes bloquées · durée d'un brassin) :

| Niveau, cuves | Actuel | Lancement à cuve libre | Lancement anticipé | Une ligne = un brassin à la fois |
|---|---|---|---|---|
| 1, 1 cuve | 15,7 · 88 % · 19 min | 10,8 · 0 % · 7 min | **15,8 · 0 % · 7 min** | 8,2 · 0 % |
| 2, 2 cuves | 39,5 · 76 % · 10 min | 26,8 · 0 % · 6 min | **39,3 · 0 % · 6 min** | 10,0 · 0 % |
| 3, 2 cuves | 49,3 · 76 % · 9 min | 33,5 · 0 % · 5 min | **49,3 · 0 % · 5 min** | 11,7 · 0 % |
| 5, 4 cuves | 66,7 · 76 % · 8 min | 66,7 · 0 % · 5 min | 66,7 · 68 % · 7 min | 21,5 · 0 % |

- *Lancement à cuve libre* : on ne lance que si une cuve de fermentation est libre. Plus de blocage, mais un tiers de cadence en moins (la cuve attend le brassage chaud).
- *Lancement anticipé* : on lance quand une cuve se sera libérée à l'arrivée du moût. Même cadence qu'aujourd'hui, plus de blocage, et chaque brassin dure 2 à 3 fois moins longtemps. Au niveau 5, le goulot n'est plus la fermentation mais la garde : la règle doit regarder tout le trajet, pas seulement la première cuve.
- *Une ligne, un brassin à la fois* : la cadence chute de 50 à 75 %. Il faudrait des lignes supplémentaires à acheter, et la place manque à l'écran.

**Retenu : le lancement anticipé, vérifié sur tout le trajet.** Avant de lancer un brassin, le jeu prévoit son passage dans chaque appareil (en tenant compte des brassins déjà sur la ligne et des cuves) et attend s'il devait patienter quelque part. Mesures avec le vrai moteur : 15,8 / 39,5 / 48,7 / 66,7 brassins/h aux mêmes niveaux, **0 % d'appareils bloqués partout** (niveau 5 compris), et un brassin dure 2,8 à 6,7 min au lieu de 7,8 à 19. Le joueur simulé finit en J32 (J30 avant).

## Objets en série, barman en renfort

- Les objets du magasin s'achètent dans l'ordre : cible (300 €), télé (5 000 €), boule à facettes (60 000 €), au rythme des agrandissements du bar (400 €, 6 000 €, 120 000 €). La fête devient l'événement le plus fort (45 min, ×60 clients, ×1,5 le prix de référence).
- Barman en renfort : 8 h à rebrancher les fûts, de 40 € à 150 000 € selon le bar. Le joueur simulé l'embauche avant de partir quand il a des fûts et dix fois son prix ; il lance le meilleur événement débloqué.
- Le joueur simulé finit en J34 (J32 avant) : au début, il n'a plus que le tournoi de fléchettes, plus faible que l'ancienne fête bon marché.

### Prix du barman

Mesure sur l'état réel d'une partie juste après chaque agrandissement du bar, 8 h de bar avec et sans barman. Avec 6 fûts prévus par tireuse, il rapporte 446 € (bistrot), 1 913 € (pub), 7 146 € (taproom), 14 126 € (bar du futur) ; avec les fûts que le joueur simulé avait réellement, presque rien. Les premiers prix (jusqu'à 150 000 €) ne remboursaient jamais le barman passé le bistrot. Nouvelle grille, pour environ 2,5 fois son prix quand on prépare des fûts : 30, 150, 700, 2 500, 5 000 €. Le joueur simulé finit toujours en J34.

## Économie des diamants

Les diamants seront vendus en packs. Le réglage cherche donc un équilibre : un joueur gratuit goûte aux boosts et avance un peu plus vite, mais **acheter fait clairement gagner du temps**, sans que dépenser sans fin fasse tout.

**Ce qu'un diamant fait gagner.** Mesuré avec des parties complètes (`npm run balance`, profils ci-dessous), après une correction indispensable : pendant un boost de production, le quota du grossiste suit la cadence. Avant, un joueur qui gardait « Machines ×2 » toute la partie ne gagnait que 2,7 jours pour 2 250 💎, et la Levure express 1 jour pour 2 550 💎 : le grossiste refusait le surplus, et les boosts de production ne servaient à rien.

| Boost gardé actif toute la partie (avant la correction) | Diamants | Jours gagnés |
|---|---|---|
| Grossiste généreux | 1 048 | ~6 |
| Bouche-à-oreille | 1 155 | ~2 |
| Machines ×2 | 2 250 | ~2,7 |
| Levure express | 2 552 | ~1 |

Après la correction, machines ×2 en continu : 8 jours de moins pour 1 770 💎 ; tous les boosts : 15 jours de moins pour 3 000 💎. **Un jour gagné vaut environ 200 💎.** Les prix des boosts n'ont pas changé.

**Gains sans payer.** 25 au départ ; les lettres portent leurs diamants (difficiles : 1 à 3 ; simples : 1 diamant une fois sur trois, toujours pour les 3 commandes de démarrage ; +1 client exigeant) ; 15 / 25 / 40 / 60 aux niveaux 2 à 5. Avant ce réglage, une partie en rapportait 634 (~22 par jour, et ~34 avec le livreur, qui livrait tout et faisait tourner le tableau) : de quoi garder des boosts presque en continu, donc aucune raison d'en acheter.

**Profils mesurés** (4 visites par jour, moyenne de 2 à 3 tirages, `SEED`) :

| Profil | Diamants gagnés | Diamants dépensés | Fin de partie |
|---|---|---|---|
| Gratuit, ne dépense rien | ~430 (~14,5 par jour, dont 165 de départ et de niveaux) | 0 | J28 à J31 (~J30) |
| Gratuit avec livreur en continu | ~540 | 0 | ~J29 |
| Gratuit, dépense tout en boosts (`GEMS=spend`) | ~420 | ~410 | **~J26** (−13 %) |
| + 500 💎 achetés (`BUY=500`, ~5 €) | ~420 | ~880 | **~J23,5** (−21 %) |
| + 1 500 💎 achetés (`BUY=1500`, ~15 €) | ~420 | ~1 850 | **~J17,5** (−41 %) |
| Diamants illimités (`GEMS=whale`) | — | ~3 300 | **~J15,5** (plafond) |

Le joueur simulé dépense ses diamants à chaque visite pour couvrir l'absence suivante : grossiste généreux, puis le meilleur boost des machines, puis la levure express.

**Packs proposés** (environ 100 💎 par euro, soit environ 2 € le jour gagné) :

| Pack | Diamants | Prix |
|---|---|---|
| Poignée | 80 | 0,99 € |
| Bourse | 450 | 4,99 € |
| Coffre | 1 000 | 9,99 € |
| Malle | 2 200 | 19,99 € |
| Pack de démarrage (une seule fois) | 500 | 1,99 € |

Le pack de démarrage est volontairement généreux : le premier achat doit se sentir. La courbe fait que les petits achats rapportent moins, proportionnellement, que les gros (les boosts payent surtout quand ils couvrent toutes les absences).

**À surveiller avec de vrais joueurs (TestFlight)** : la part des joueurs gratuits qui dépensent leurs diamants, l'écart réel entre un joueur gratuit et un acheteur à 5 €, et les cosmétiques premium (150 💎 pour les quatre), qui se paient en environ 10 jours de jeu gratuit.

## Joueur simulé réparé (novembre 2026)

Depuis l'arrivée de la piste de décoration du bar (meubles et objets d'événement dans un ordre imposé), `npm run balance` n'achetait plus rien après le premier jour : il visait l'objet d'événement le moins cher (la cible de fléchettes) alors que les Plantes vertes devaient passer avant. L'achat échouait et le script cessait d'acheter pour le reste de la partie.

Corrections du script :
- il achète la **prochaine pièce de la piste** (`nextDecor`), comme le joueur ;
- un achat refusé ne bloque plus les suivants : il passe à l'option suivante ;
- il ne lance une **campagne de pub** que si elle coûte au plus un dixième du prochain achat. Avant, il la relançait dès qu'il avait 4 fois son prix, et la pub mangeait l'épargne des machines (30 000 € la campagne au niveau 3).

Mesures (`npm run balance 120`, puis `SESSIONS=8,20 npm run balance 150`) : voir le tableau en tête de document. Le revenu passe d'environ 10 k€ par jour (J3) à 80 k€ (J31), 325 k€ (J61) et 1,4 M€ (J106).

## Rééquilibrage de novembre 2026

**Machines.** `TIER_COST` passe de ×1, ×250, ×2 500, ×10 000 à **×1, ×40, ×400, ×2 000** (niveaux 2 à 5). Le saut de ×250 au niveau 3 coûtait 137 500 € pour les 7 appareils, alors que le joueur gagnait environ 15 000 € par jour. Il reste un palier régulier d'environ ×10, comme pour le bar, le stockage et l'ordinateur.

**Fin de partie.** Places de gamme 7 et 8 : 1,5 M€ et 3 M€ (au lieu de 3 M€ et 8 M€) ; ordinateur 5 : 2 M€ (au lieu de 3 M€) ; bar 5 : 900 000 € (au lieu de 1,2 M€) ; stockage 5 : 800 000 € (au lieu de 1 M€).

**Événements du bar.** Mesure : on reprend l'état de la partie simulée au dernier passage à chaque niveau du bar, on joue 24 h avec et sans l'événement (6 fûts prévus par tireuse), en moyenne sur plusieurs tirages. Un événement ne crée presque pas de ventes : il vide plus vite les fûts, qui se seraient vendus de toute façon. Son bénéfice vient du **prix des verres pendant l'événement** (fléchettes ×1,3, foot ×1,5, fête ×2). Les anciens prix (jusqu'à 900 000 € la fête) ne rapportaient que 3 à 35 % de leur prix. Nouveau prix de référence : 80, 450, 2 000, 4 000, 12 000 € ; un événement rapporte maintenant de 1,3 à 3,3 fois son prix quand la cave est prête, rien quand elle est vide.

| Bar | Fléchettes | Foot | Fête |
|---|---|---|---|
| 1 | ×3,3 | ×1,9 | ×1,7 |
| 2 | ×1,9 | ×1,8 | ×2,8 |
| 3 | ×3,3 | ×2,0 | ×1,7 |
| 4 | ×1,7 | ×1,4 | ×1,9 |
| 5 | ×1,8 | ×1,3 | ×1,6 |

**Campagnes de pub.** Cinq campagnes, une par niveau de l'ordinateur (voir GAME_DESIGN.md). Prix = part d'une journée de revenus typique au niveau de la brasserie (`AD_REF` : 1 500, 12 000, 90 000, 500 000, 1,8 M€ ; parts de 4 à 13 %). L'ancienne campagne coûtait 30 000 € au niveau 3, soit une journée de revenus, pour un rendement d'environ ×0,2. Mesure à 24 h, en livrant toutes les 30 min : de ×1,2 à ×4,5 à partir du niveau 2 de la brasserie, avec un bruit d'environ ±50 % (les commandes sont tirées au hasard) ; au niveau 1, les affiches ne rapportent rien faute de stock. Dans la partie complète à 4 visites par jour, les pubs sont à peu près neutres : les lettres en plus attendent la visite suivante. Elles récompensent le joueur actif.

**Mesurer la rentabilité.** `SNAP=/tmp/snaps npm run balance 45` garde l'état de la partie à chaque niveau, puis `npm run roi /tmp/snaps ev` (événements) ou `npm run roi /tmp/snaps ad` (pubs) rejoue 24 h avec et sans chaque action.

**Joueur simulé.** Il lance la meilleure campagne débloquée dès le niveau 2, quand il a deux fois son prix, et un événement seulement s'il ne retarde pas son prochain achat (au plus un dixième de son prix). Avant ce garde-fou, il enchaînait des fêtes à perte qui mangeaient son épargne.
