# Brew It : simulation de brassage

## Concept
Un seul écran en **portrait** montre toute la brasserie. Le procédé descend du haut vers le bas :

**Moulin → Cuve d'empâtage → Cuve d'ébullition → Refroidisseur → Fermenteur → Cuve de garde → Embouteillage**

Le joueur crée ses bières en **réglant les machines** (des molettes à tourner), brasse, goûte le résultat, ajoute les réussites à sa **gamme** et les **vend** à des distributeurs. Il améliore chaque machine individuellement, sur **3 niveaux**, pour brasser **mieux** (précision, moins de défauts) et **plus** (volume, vitesse).

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
3. **Goûter** : dès que la **première bouteille** d'un essai sort de la remplisseuse, un bouton **« Goûter »** apparaît au-dessus de la ligne. La dégustation affiche un verdict (d'Imbuvable à Excellente), une note sur 20, le style, l'alcool, l'amertume, la couleur, l'arôme, la limpidité, les bulles, et les **défauts expliqués**. Le joueur choisit alors **Garder** ou **Recommencer**, ce qui jette le brassin et libère la ligne. Un essai sans décision attend en fin de ligne.
4. **Nommer et étiqueter** : garder une bière ouvre l'**éditeur d'étiquette**, avec le nom, la forme (rectangle, ovale, écusson, banderole), la couleur de fond, le motif (rayures, pois, losanges, vagues, damier, soleil) et sa couleur, l'emblème (houblon, épi, tonneau, étoile, couronne, ancre, montagne), la police et la couleur du texte. Un aperçu en direct montre l'étiquette et une bouteille. Ensuite, **chaque bouteille est étiquetée en fin de ligne avant d'être mise en carton**.
5. **Gamme** : une bière de la gamme peut être rebrassée, à la main ou **en continu**, et ses bouteilles étiquetées vont dans son stock. L'étiquette reste modifiable.
6. **Vendre** : les distributeurs sous contrat achètent en continu les bières qui leur conviennent.
7. **Progresser** : signer des distributeurs ajoute des places dans la gamme, et améliorer les machines augmente le volume et la qualité.
8. **Hors ligne** : la brasserie continue de tourner (jusqu'à 8 h). Au retour, la fenêtre « Pendant ton absence » permet de récolter les gains.

## Les machines et leurs réglages
| Étape | Réglages | Niveaux 1 → 3 |
|---|---|---|
| Concassage | Malt (kg/20 L), finesse de mouture | Moulin à main → à rouleaux → broyeur industriel |
| Empâtage | Température, durée | Marmite isotherme → cuve inox chauffée → cuve pro |
| Ébullition | Houblon amer, houblon aromatique, durée | Marmite sur gaz → chaudière inox → cuve à vapeur |
| Refroidissement | Température de sortie | Serpentin → échangeur à plaques → double étage |
| Fermentation | Levure (américaine, anglaise, saison, lager), température, durée | Seau → conique → régulé |
| Garde | Température, durée | Dame-jeanne → cuve de garde → cuve réfrigérée |
| Embouteillage | Sucre de refermentation (g/L) | Canne → tireuse 4 becs → ligne automatique |

Effet des niveaux :
- **Volume des lots :** 20 L, 60 L ou 200 L. Le plus petit appareil fixe la taille du brassin.
- **Précision des températures :** ± 2 °C, ± 0,8 °C ou ± 0,2 °C.
- **Vitesse :** ×1, ×1,33 ou ×2.
- **Défauts réduits :** risque d'infection au refroidissement (12 %, 4 %, 0 %), oxydation à l'embouteillage, goût de maïs cuit, astringence, limpidité.

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
Le Bar du coin est sous contrat dès le départ. Les suivants se débloquent selon le nombre de bouteilles vendues, puis se signent contre un droit d'entrée :

| Distributeur | Bouteilles vendues | Particularité |
|---|---|---|
| Épicerie fine | 150 | Qualité min. Correcte |
| Caviste | 500 | Aime les bières aromatiques |
| Restaurant | 1 500 | Aime les bières limpides et légères |
| Supermarché | 4 000 | Gros volumes, petits prix |
| Export | 15 000 | Qualité Excellente ; aime les bières fortes |

Chaque distributeur signé ajoute **une place dans la gamme** (6 au maximum).

## Accompagnement
Gaston accueille le joueur, l'invite à toucher une machine, à lancer son premier brassin avec sa recette de blonde préréglée, puis à l'ajouter à sa gamme.
