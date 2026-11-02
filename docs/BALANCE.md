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
Contrats : Épicerie J1 · Caviste J4 · Restaurant J6 · Festival J13 · Supermarché J21 · Export J29
Chiffre d'affaires par jour :
  J2 68k · J5 197k · J8 317k · J13 924k · J16 868k · J26 2,6M · J30 4,0M · J34 4,4M
Fin : J36 · 120 visites · 48 % sans achat · pire série sans achat : 7 visites
2 visites par jour : fin J48 · 42 % sans achat · pire série : 6
```

## Refonte des ventes : bar et commandes

Le « Bar du coin » est devenu une pièce, et les distributeurs sont devenus des clients qui envoient des commandes à remplir à la main. Les ventes ont changé de nature :
- **Le bar** vend en continu, y compris hors ligne : c'est le revenu passif. Ses niveaux 4 et 5 sont forts (90 puis 450 btl/min × variété), pour écouler la production pendant l'absence.
- **Les commandes** sont le revenu actif : elles paient 40 % de plus, mais n'avancent que quand le joueur les envoie. Elles s'accumulent hors ligne (3 par client au plus). Le stock disponible les limite, d'où un **stockage bien plus grand** (jusqu'à 4 000 caisses).
- **La négociation** agrandit les commandes (+40 %) et améliore leur prix (+10 %). Sans ce bonus de prix, les négociations de fin de partie ne rapportaient plus rien : une fois le stock épuisé, une commande plus grosse ne fait pas vendre plus.

Par rapport à l'ancienne économie (fin au J33, J42 à 2 visites par jour), la partie est 10 à 15 % plus longue. Elle récompense un peu plus le jeu actif, sans l'imposer : en fin de partie, le bar fait environ 60 % du chiffre d'affaires.

## Où régler quoi

| Pour… | Modifier |
|---|---|
| Allonger ou raccourcir tout le jeu | Prix des contrats et seuils `unlockSold` (`src/core/market.ts`) : ce sont les grandes étapes |
| Changer le prix des machines | `TIER_COST` et `baseCost` (`src/core/stations.ts`) |
| Changer le rythme du brassage | `DAY_S`, `SPEED`, `BOTTLE_S` (`src/core/stations.ts`) |
| Changer la place des bières dans la gamme | `VARIETY` (`market.ts`) et `SLOT_COSTS` (`src/core/warehouse.ts`) |
| Changer les négociations | `DEAL_BONUS`, `DEAL_PRICE`, `DEAL_COST`, `MAX_DEAL` (`market.ts`) |
| Changer le stockage | `STORAGE` (`warehouse.ts`) |
| Changer le bar | `BAR`, `BAR_PRICE` (`market.ts`) |
| Changer les commandes | `ORDER_MINUTES`, `ORDER_GAP_S`, `MAX_PENDING`, `ORDER_LIFE_S`, `ORDER_PREMIUM`, `LIKE_BONUS` (`market.ts`) |

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
