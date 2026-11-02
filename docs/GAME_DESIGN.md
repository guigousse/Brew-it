# Brew It : simulation de brassage

## Concept
La brasserie compte **trois pièces**, chacune en plein écran et en **portrait**. On passe de l'une à l'autre en **glissant le doigt** ou par les onglets sous le header :

**Atelier ↔ Stockage ↔ Bar** : le trajet de la bière, de la cuve au verre.

La barre du bas propose les actions de la pièce affichée : Gamme et Brasser à l'atelier, Stock et Commandes au stockage, Agrandir et La carte au bar. Chaque pièce évolue sur 5 niveaux, dans le même style pixel art.

### L'atelier
L'atelier montre toute la chaîne de brassage. Le procédé descend du haut vers le bas :

**Moulin → Cuve d'empâtage → Cuve d'ébullition → Refroidisseur → Fermenteur → Cuve de garde → Embouteillage**

Le joueur crée ses bières en **réglant les machines** (des molettes à tourner), brasse, goûte le résultat, ajoute les réussites à sa **gamme**, les **sert au bar** et **remplit les commandes** de ses clients. Il améliore chaque machine individuellement, sur **5 niveaux** (de la verrerie d'alchimiste au laboratoire futuriste), pour brasser **mieux** (précision, moins de défauts) et **plus** (volume, vitesse).

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
6. **Vendre**, de deux façons :
   - le **bar** sert en continu les bières à la carte, même appli fermée ;
   - les **clients** sous contrat envoient des **commandes** sur l'ordinateur du stockage. On les remplit avec les bières qui conviennent et on les envoie : elles sont payées aussitôt.
7. **Progresser** : améliorer les machines (volume, cadence, qualité), agrandir le stockage et le bar, signer et négocier des contrats, ouvrir de nouvelles places dans la gamme. On peut améliorer une machine même pendant un brassin.
8. **Hors ligne** : la brasserie et le bar continuent de tourner (jusqu'à 8 h), et les commandes s'accumulent sur l'ordinateur. Au retour, la fenêtre « Pendant ton absence » permet de récolter les gains du bar.

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
- **Précision :** voir « Précision du matériel et qualité ».
- **Durée des étapes :** ×1,2, ×1, ×0,8, ×0,6, ×0,4. Une journée de fermentation ou deux journées de garde durent 30 s au niveau 2.
- **Embouteillage :** 0,7 s, 0,5 s, 0,25 s, 0,08 s, puis 0,02 s par bouteille.
- **Défauts réduits :** infection au refroidissement (10 %, 6 %, 2 %, 0, 0), oxydation à l'embouteillage (de 8 % à 0), goût de maïs cuit, astringence, limpidité (bonus aux niveaux 4 et 5).
- **Prix :** prix de base de l'appareil (60 à 100 €) × 1, 250, 2 500, puis 10 000 pour les niveaux 2 à 5.

**Niveau de la brasserie** : la brasserie prend le niveau de son appareil le moins avancé. Dès que les 7 appareils sont au niveau 2, elle passe niveau 2, et ainsi de suite. Chaque niveau change tout le décor et ouvre de nouveaux clients :

| Niveau | Décor | Ouvre |
|---|---|---|
| 1 · Labo d'alchimiste | cave en pierre, poutres, bougies, lucarne au clair de lune, bocaux | Épicerie fine |
| 2 · Garage | mur de briques, fenêtres hautes, passerelles en caillebotis | Caviste |
| 3 · Microbrasserie | carreaux blancs, poutres en bois, baies en arc, ardoise, sol en tomettes | Restaurant, Festival |
| 4 · Usine | tôle ondulée, verrière, poutres rouges, bandes de sécurité, béton | Supermarché |
| 5 · Labo du futur | panneaux blancs, néons cyan, baie sur la ville de nuit | Export |

Une plaque en haut à gauche de la scène montre le niveau. La toucher ouvre la fiche de la brasserie : quels appareils il reste à améliorer, et ce que débloquera le niveau suivant. Le passage de niveau déclenche un éclair et cette fiche.

Le tout premier brassin du tutoriel va 4 fois plus vite et ne peut pas être infecté : Gaston donne un coup de main. Si le joueur n'a plus d'argent, plus de stock et rien en cours, Gaston avance les ingrédients : la partie ne peut jamais se bloquer.

## Précision du matériel et qualité
Chaque appareil exécute ta recette avec sa propre précision (`src/core/brewing/execution.ts`). La bière obtenue s'écarte donc plus ou moins de ce que tu as réglé.

| Niveau | Températures | Doses (malt, houblon, sucre) | Infection |
|---|---|---|---|
| 1 | ± 4,5 °C | ± 30 %, mouture irrégulière | 10 % |
| 2 | ± 2,5 °C | ± 14 % | 6 % |
| 3 | ± 1 °C | ± 6 % | 2 % |
| 4 | ± 0,3 °C | ± 2 % | 0 |
| 5 | précision moléculaire | exactes | 0 |

- **Les écarts coûtent de la qualité** et sont expliqués à la dégustation, par exemple « Empâtage à 69 °C au lieu de 66 °C : le corps n'est pas celui de ta recette ».
- **Le matériel rudimentaire ajoute un manque de netteté.** Un tirage « bon ou mauvais jour » par brassin le rend plus ou moins marqué.
- **Ce que donne la recette de Gaston**, d'après `npm run quality` (Monte-Carlo) :

| Niveau | Résultat typique | Excellente |
|---|---|---|
| 1 | surtout Correcte, un quart Médiocre ou pire | 1 % |
| 2 | surtout Bonne | 24 % |
| 3 | Bonne ou Excellente | 59 % |
| 4 et 5 | Excellente | 100 % |

- **Une recette aux réglages limites** reste Correcte ou Bonne jusqu'au niveau 4. Seul le niveau 5 l'amène à Excellente.
- **Une recette incohérente reste mauvaise**, quel que soit le matériel.
- **Chaque lot d'une bière de la gamme varie.** La bière prend la dégustation de son dernier lot buvable, et un lot imbuvable est jeté.
- **Le tout premier brassin, guidé par Gaston, est exact.**

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

## Le bar
Le bar vend en continu, une bouteille à la fois, les bières **à la carte**. Il y a une bière par tireuse, et on choisit lesquelles en touchant le comptoir ou avec « La carte ». Il sert la bière à la carte dont il reste le plus en stock. Chaque bière de plus à la carte attire 25 % de clients en plus (variété). Le prix dépend de la qualité de la bière et du niveau du bar.

| Niveau | Décor | Places | Tireuses | Clients | Prix | Coût |
|---|---|---|---|---|---|---|
| 1 · Comptoir poussiéreux | bois grisé, toiles d'araignée, une ampoule, pancarte « OUVERT » de travers, tonneau | 2 | 1 | 1 btl/min | ×1 | — |
| 2 · Bistrot de quartier | suspensions, ardoise, carrelage en damier | 4 | 2 | 5 | ×1,15 | 400 € |
| 3 · Pub | vert anglais, lambris, cible de fléchettes, lampes en laiton, tables | 7 | 3 | 20 | ×1,3 | 6 000 € |
| 4 · Taproom | briques, enseigne néon « BREW IT », comptoir inox | 10 | 5 | 90 | ×1,5 | 120 000 € |
| 5 · Bar du futur | baie sur la ville de nuit, néons, comptoir lumineux | 12 | 8 | 450 | ×1,8 | 1,2 M€ |

- Prix d'une bouteille : 2,50 € × (0,6 + 0,8 × qualité) × prix du niveau.
- Gaston tient le comptoir. Les clients s'assoient, vident leur verre et laissent la place. S'il n'y a rien à servir, le bar est vide et un écriteau « À SEC » est posé sur le comptoir.

## Clients et commandes
L'ordinateur du stockage (sur le bureau, ou le bouton « Commandes ») ouvre une fenêtre à deux onglets.

**Commandes** : les clients sous contrat envoient ponctuellement des commandes, comme des missions. Chacune indique :
- un nombre de bouteilles ;
- une qualité minimale ;
- parfois un style exigé (♥), mieux payé ;
- un délai : elle expire au bout de 4 h.

On coche les bières qui conviennent (les plus en stock sont présélectionnées), puis on envoie. Le paiement est immédiat. On peut aussi refuser une commande.

- Un client envoie une commande toutes les 4 à 8 min environ, et en garde **3 en attente au plus** : elles s'accumulent pendant l'absence.
- Taille d'une commande : 45 min du débit du client (arrondi à la demi-caisse), +40 % par niveau de négociation.
- Prix par bouteille : prix du client × (0,6 + 0,8 × qualité) × 1,4 (livraison groupée) × 1,3 si le style est exigé × (1 + 10 % par niveau de négociation).
- Sur l'écran de l'ordinateur, une enveloppe clignote quand une commande attend, et la pastille de l'onglet Stockage indique leur nombre. Quand une commande peut être remplie, ses caisses attendent, filmées sur la palette.

**Clients** : on y signe les contrats, puis on les négocie. Un client demande un niveau de brasserie et un nombre de bouteilles vendues, puis se signe contre un droit d'entrée.

| Client | Brasserie · vendues | Signature | Débit de réf. | Prix | Aime |
|---|---|---|---|---|---|
| Épicerie fine | niv. 1 · 40 btl | 150 € | 2/min | 3,60 € | qualité Correcte min. |
| Caviste | niv. 2 · 6 000 | 25 000 € | 4/min | 5 € | bières aromatiques |
| Restaurant | niv. 3 · 50 000 | 120 000 € | 8/min | 4,20 € | limpides et légères |
| Festival | niv. 3 · 120 000 | 350 000 € | 18/min | 3,20 € | bières fortes |
| Supermarché | niv. 4 · 500 000 | 900 000 € | 45/min | 2,20 € | gros volumes, petits prix |
| Export | niv. 5 · 2 000 000 | 3 000 000 € | 110/min | 3,60 € | bières excellentes |

- **Négociation** : 5 niveaux par contrat. Prix : 0,25, 0,5, 0,9, 1,5 puis 2,5 × le droit d'entrée (150 € minimum).
- L'ancien « Bar du coin » est devenu la pièce Bar. Les sauvegardes précédentes sont reprises : ses contrats et négociations disparaissent, et les autres clients commencent à envoyer des commandes.

## Gamme : l'étagère
La gamme est une étagère de grandes bouteilles portant leur étiquette. À côté de la dernière, une silhouette « + » permet d'acheter une nouvelle place (8 au maximum) ; un essai gardé vient la remplir. Prix des places : 150 €, 8 000 €, 50 000 €, 200 000 €, 600 000 €, 3 M€ puis 8 M€.

## Stockage
Le stockage est une pièce à part entière. Ses rayonnages se remplissent de caisses aux couleurs des étiquettes ; dans les grands stockages, chaque case affichée est une palette de plusieurs caisses. Le bureau porte l'ordinateur des commandes.

Les bouteilles embouteillées rejoignent le stockage en caisses de 12. Quand il est plein, l'embouteillage s'arrête jusqu'à ce que des ventes libèrent de la place. Le brassage continu attend d'avoir la place pour un brassin de plus, mais repart toujours quand tout est vide, même si un brassin est plus gros que le stockage. Le stock accumulé pendant l'absence sert à honorer les commandes au retour : un grand stockage permet d'en remplir davantage.

| Niveau | Décor | Capacité | Prix |
|---|---|---|---|
| Coin du garage | briques, ampoule nue, planches sur parpaings, vieux moniteur | 10 caisses (120 btl) | — |
| Cave voûtée | pierre, voûte, lanternes, dalles | 40 caisses | 500 € |
| Chambre froide | panneaux isothermes, givre, brume au sol, écran plat | 150 caisses | 8 000 € |
| Entrepôt | tôle, verrière, racks à palettes orange | 600 caisses | 120 000 € |
| Plateforme logistique | néons, bras robotisé, terminal holographique | 4 000 caisses | 1 M€ |

## Équilibrage
Voir [BALANCE.md](BALANCE.md) : l'audit, les objectifs de rythme et le joueur simulé (`npm run balance`).

## Accompagnement
Gaston accueille le joueur, l'invite à toucher une machine, à lancer son premier brassin avec sa recette de blonde préréglée, puis à l'ajouter à sa gamme. Enfin, il explique que les bouteilles vont au stockage et que le bar les vend, puis invite à glisser l'écran pour visiter les pièces et à activer le brassage continu. La première bière passe automatiquement à la carte du bar.
