# Brew It : simulation de brassage

## Concept
Un seul écran en **portrait** montre toute la brasserie. Le procédé descend du haut vers le bas :

**Moulin → Cuve d'empâtage → Cuve d'ébullition → Refroidisseur → Fermenteur → Cuve de garde → Embouteillage**

Le joueur crée ses bières en **réglant les machines** (des molettes à tourner), brasse, goûte le résultat, ajoute les réussites à sa **gamme** et les **vend** à des distributeurs. Il améliore chaque machine individuellement, sur **5 niveaux** (de la verrerie d'alchimiste au laboratoire futuriste), pour brasser **mieux** (précision, moins de défauts) et **plus** (volume, vitesse).

Le rendu est en pixel art détaillé, de style « 32-bit » : palettes riches, tramage, contours colorés et animations (flammes, vapeur, bulles, liquide dans les tuyaux). Les appareils sont serrés sur 3 niveaux de passerelles.

En bas, au **premier plan**, la ligne d'embouteillage déroule le parcours de chaque bouteille :
- elle arrive vide ;
- elle se remplit sous le bec, et l'on voit le niveau monter ;
- elle est capsulée, puis étiquetée ;
- elle est rangée dans un carton, qui se ferme une fois rempli de 12 bouteilles ;
- une palette de cartons montre le stock.

## Boucle de jeu
1. **Régler** : toucher une machine ouvre ses réglages.
2. **Brasser** : les ingrédients sont achetés automatiquement au lancement. Le lot descend de machine en machine, chaque machine ne traitant qu'un lot à la fois, si bien que plusieurs brassins peuvent s'enchaîner.
3. **Goûter** : dès que la **première bouteille** d'un essai sort de la remplisseuse, un bouton **« Goûter »** apparaît au-dessus de la ligne. La dégustation affiche un verdict (d'Imbuvable à Excellente), une note sur 20, le style, l'alcool, l'amertume, la couleur, l'arôme, la limpidité, les bulles, et les **défauts expliqués**. Le joueur choisit alors **Garder** ou **Recommencer**, ce qui jette le brassin. Un essai sans décision est mis de côté en fin de ligne : il ne bloque pas la production.
4. **Nommer et étiqueter** : garder une bière ouvre l'**éditeur d'étiquette**, avec le nom, la forme (rectangle, ovale, écusson, banderole), la couleur de fond, le motif (rayures, pois, losanges, vagues, damier, soleil) et sa couleur, l'emblème (houblon, épi, tonneau, étoile, couronne, ancre, montagne), la police et la couleur du texte. Un aperçu en direct montre l'étiquette et une bouteille. Ensuite, **chaque bouteille est étiquetée en fin de ligne avant d'être mise en carton**.
5. **Gamme** : une bière de la gamme peut être rebrassée à la main. Le **brassage continu** fait tourner toute la gamme (la bière qui a le moins de bouteilles d'abord). Un essai lancé par le joueur passe toujours en priorité, et s'il trouve le moulin occupé, il attend son tour. L'étiquette reste modifiable.
6. **Vendre** : les distributeurs sous contrat passent commande en continu, par lots, pour les bières qui leur conviennent.
7. **Progresser** : améliorer les machines (volume, cadence, qualité), signer et négocier des contrats, agrandir le stockage, ouvrir de nouvelles places dans la gamme. On peut améliorer une machine même pendant un brassin.
8. **Hors ligne** : la brasserie continue de tourner (jusqu'à 8 h). Au retour, la fenêtre « Pendant ton absence » permet de récolter les gains.

## Les machines et leurs réglages
| Étape | Réglages | Niveaux 1 → 5 |
|---|---|---|
| Concassage | Malt (kg/20 L), finesse de mouture | Mortier et pilon → moulin à main → à rouleaux → broyeur industriel → broyeur laser |
| Empâtage | Température, durée | Ballon sur bec Bunsen → marmite isotherme → cuve inox chauffée → cuve pro → bioréacteur enzymatique |
| Ébullition | Houblon amer, houblon aromatique, durée | Alambic de cuivre → marmite sur gaz → chaudière inox → cuve à vapeur → bouilloire à induction |
| Refroidissement | Température de sortie | Réfrigérant en verre → serpentin → échangeur à plaques → double étage → cryo-échangeur |
| Fermentation | Levure (américaine, anglaise, saison, lager), température, durée | Grande fiole → seau → conique → régulé → bioréacteur piloté |
| Garde | Température, durée | Bocal à bouchon → dame-jeanne → cuve de garde → cuve réfrigérée → cuve de stase |
| Embouteillage | Sucre de refermentation (g/L) | Entonnoir et pipette → canne → tireuse 4 becs → ligne automatique → ligne robotisée |

Effet des niveaux (1 → 5) :
- **Volume des lots :** 5, 20, 60, 200, 600 L. Le plus petit appareil fixe la taille du brassin.
- **Précision des températures :** ± 3, ± 2, ± 0,8, ± 0,2 °C, puis exacte.
- **Durée des étapes :** ×1,2, ×1, ×0,8, ×0,6, ×0,4. Une journée de fermentation ou deux journées de garde durent 30 s au niveau 2.
- **Embouteillage :** 0,7 s, 0,5 s, 0,25 s, 0,08 s, puis 0,02 s par bouteille.
- **Défauts réduits :** infection au refroidissement (15 %, 10 %, 4 %, 0 %, 0 %), oxydation à l'embouteillage (de 8 % à 0), goût de maïs cuit, astringence, limpidité (bonus aux niveaux 4 et 5).
- **Prix :** prix de base de l'appareil (60 à 100 €) × 1, 250, 2 500, puis 10 000 pour les niveaux 2 à 5.

**Niveau de la brasserie** : la brasserie prend le niveau de son appareil le moins avancé. Dès que les 7 appareils sont au niveau 2, elle passe niveau 2, et ainsi de suite. Chaque niveau change tout le décor et ouvre de nouveaux distributeurs :

| Niveau | Décor | Ouvre |
|---|---|---|
| 1 · Labo d'alchimiste | cave en pierre, poutres, bougies, lucarne au clair de lune, bocaux | Bar du coin, Épicerie fine |
| 2 · Garage | mur de briques, fenêtres hautes, passerelles en caillebotis | Caviste |
| 3 · Microbrasserie | carreaux blancs, poutres en bois, baies en arc, ardoise, sol en tomettes | Restaurant, Festival |
| 4 · Usine | tôle ondulée, verrière, poutres rouges, bandes de sécurité, béton | Supermarché |
| 5 · Labo du futur | panneaux blancs, néons cyan, baie sur la ville de nuit | Export |

Une plaque en haut à gauche de la scène montre le niveau. La toucher ouvre la fiche de la brasserie : quels appareils il reste à améliorer, et ce que débloquera le niveau suivant. Le passage de niveau déclenche un éclair et cette fiche.

Le tout premier brassin du tutoriel va 4 fois plus vite et ne peut pas être infecté : Gaston donne un coup de main. Si le joueur n'a plus d'argent, plus de stock et rien en cours, Gaston avance les ingrédients : la partie ne peut jamais se bloquer.

## Modèle de brassage réaliste (`src/core/brewing/model.ts`)
| Cause | Effet |
|---|---|
| Mouture trop grossière / trop fine | Faible rendement / filtration colmatée, bière âpre |
| Empâtage < 60 °C ou > 72 °C, ou trop court | Conversion incomplète ; au-delà de 78 °C, enzymes détruites : bière aqueuse et farineuse |
| Température d'empâtage | 62 °C donne une bière sèche, 72 °C une bière ronde |
| Houblon amer / aromatique | Amertume (formule de Tinseth) / arôme ; rapport BU:GU déséquilibré : amertume agressive ou bière écœurante |
| Ébullition trop courte | Goût de maïs cuit (DMS) |
| Moût > 35 °C à l'ensemencement | La levure meurt : pas de fermentation |
| Fermentation trop chaude / trop froide / trop courte | Fusels (solvant) / fermentation bloquée / bière sucrée |
| Trop de sucre pour la levure | Elle abandonne : bière sirupeuse |
| Garde trop courte, lager gardée chaude | Pomme verte et beurre / notes soufrées ; une garde au froid donne de la limpidité |
| Sucre de refermentation | Plate (< 1,8 vol), débordante (> 3,2 vol), puis bouteilles qui explosent (> 4,2 vol) |

## Distributeurs
Le Bar du coin est sous contrat dès le départ. Les suivants demandent **un niveau de brasserie et un nombre de bouteilles vendues**, puis se signent contre un droit d'entrée.

| Distributeur | Brasserie · vendues | Signature | Commandes | Lot | Aime |
|---|---|---|---|---|---|
| Bar du coin | — | — | 1/min | 1 | tout ce qui est buvable |
| Épicerie fine | niv. 1 · 60 btl | 200 € | 2/min | 6 | qualité Correcte min. |
| Caviste | niv. 2 · 8 000 | 25 000 € | 4/min | 12 | bières aromatiques |
| Restaurant | niv. 3 · 60 000 | 120 000 € | 8/min | 24 | limpides et légères |
| Festival | niv. 3 · 150 000 | 350 000 € | 18/min | 60 | bières fortes |
| Supermarché | niv. 4 · 600 000 | 900 000 € | 45/min | 240 | gros volumes, petits prix |
| Export | niv. 5 · 2 500 000 | 4 000 000 € | 110/min | 480 | bières excellentes |

- **Commandes par lots** : une commande ne part que si une bière qui convient en a assez en stock. Il faut donc un stockage assez grand pour les gros clients.
- **Variété** : chaque bière supplémentaire de la gamme qui plaît au distributeur augmente ses commandes de 25 %.
- **Négociation** : 5 niveaux par contrat, +40 % de commandes chacun. Prix : 0,25, 0,5, 0,9, 1,5 puis 2,5 × le droit d'entrée (150 € minimum).
- L'onglet Ventes compare les commandes totales à la cadence de la ligne, pour savoir s'il faut vendre plus ou produire plus.

## Gamme : l'étagère
La gamme est une étagère de grandes bouteilles portant leur étiquette. À côté de la dernière, une silhouette « + » permet d'acheter une nouvelle place (8 au maximum) ; un essai gardé vient la remplir. Prix des places : 150 €, 8 000 €, 50 000 €, 200 000 €, 600 000 €, 3 M€ puis 8 M€.

## Stockage
Les bouteilles embouteillées rejoignent le stockage en caisses de 12. Quand il est plein, l'embouteillage s'arrête jusqu'à ce que des ventes libèrent de la place. Le brassage continu attend d'avoir la place pour un brassin de plus, mais repart toujours quand tout est vide, même si un brassin est plus gros que le stockage.

| Niveau | Capacité | Prix |
|---|---|---|
| Coin du garage | 10 caisses (120 btl) | — |
| Cave voûtée | 30 caisses | 500 € |
| Chambre froide | 80 caisses | 30 000 € |
| Entrepôt | 200 caisses | 200 000 € |
| Plateforme logistique | 600 caisses | 1,2 M€ |

## Équilibrage
Voir [BALANCE.md](BALANCE.md) : l'audit, les objectifs de rythme et le joueur simulé (`npm run balance`).

## Accompagnement
Gaston accueille le joueur, l'invite à toucher une machine, à lancer son premier brassin avec sa recette de blonde préréglée, puis à l'ajouter à sa gamme, et enfin à activer le brassage continu.
