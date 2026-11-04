# Brew It : audit d'équilibrage

## Le rythme visé

| Critère | Cible | Résultat |
|---|---|---|
| Durée pour tout débloquer (4 visites/jour) | 4 semaines environ | **28 jours** |
| Durée pour un joueur occasionnel (2 visites/jour) | 5 à 6 semaines | **38 jours** |
| Visites où l'on peut acheter quelque chose | au moins 1 sur 2 | **52 %** (69 % à 2 visites/jour) |
| Plus longue période sans rien acheter | 1 journée au plus | **4 visites** (3 à 2 visites/jour) |
| Premier jour | beaucoup de récompenses | ~20 achats, 1er contrat dès la 2e visite |
| Revenir plus souvent | aide, sans obliger | 9 visites/jour : 26 jours au lieu de 28 |

Le jeu ne se termine pas en une semaine, mais on n'est jamais bloqué plus d'une journée. Revenir plusieurs fois par jour fait avancer, sans qu'il faille « farmer » : la brasserie tourne seule jusqu'à 8 h.

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
