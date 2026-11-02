# Brew It : simulation de brassage

## Concept
La brasserie compte **trois pièces**, chacune en plein écran et en **portrait**. On passe de l'une à l'autre en **glissant le doigt** ou par les onglets sous le header :

**Atelier ↔ Stockage ↔ Bar** : le trajet de la bière, de la cuve au verre.

La barre du bas propose les actions de la pièce affichée : Gamme et Brasser à l'atelier, Stock et Commandes au stockage, Agrandir et Les fûts au bar. Chaque pièce évolue sur 5 niveaux, dans le même style pixel art.

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
   - des **commandes** arrivent sur l'ordinateur du stockage, envoyées par une clientèle variée. On les remplit et on les envoie : elles sont payées aussitôt, et bien mieux que le reste ;
   - le **grossiste** reprend automatiquement le surplus, à petit prix ;
   - le **bar** sert des verres tirés des **fûts** branchés dans sa cave, même appli fermée. Il fait surtout connaître la marque.
   Chaque brassin se fait **en bouteilles ou en fûts**, et on peut **programmer les prochains brassins**.
7. **Progresser** : améliorer les machines (volume, cadence, qualité), agrandir le stockage, le bar et l'ordinateur, ouvrir de nouvelles places dans la gamme. On peut améliorer une machine même pendant un brassin.
8. **Hors ligne** : la brasserie et le bar continuent de tourner (jusqu'à 8 h), tant que les fûts branchés ne sont pas vides. Les commandes s'accumulent sur l'ordinateur et le stock s'entasse pour les remplir. Au retour, la fenêtre « Pendant ton absence » permet de récolter les gains du bar.

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

| Niveau | Décor | Nouveaux clients (selon la popularité) |
|---|---|---|
| 1 · Labo d'alchimiste | cave en pierre, poutres, bougies, lucarne au clair de lune, bocaux | particuliers, bistrots, épiceries fines |
| 2 · Garage | mur de briques, fenêtres hautes, passerelles en caillebotis | cavistes, restaurants |
| 3 · Microbrasserie | carreaux blancs, poutres en bois, baies en arc, ardoise, sol en tomettes | fêtes de village, festivals |
| 4 · Usine | tôle ondulée, verrière, poutres rouges, bandes de sécurité, béton | supermarchés, grandes tables |
| 5 · Labo du futur | panneaux blancs, néons cyan, baie sur la ville de nuit | export |

Une plaque en haut à gauche de la scène montre le niveau. La toucher ouvre la fiche de la brasserie : quels appareils il reste à améliorer, et ce que débloquera le niveau suivant. Le passage de niveau déclenche un éclair et cette fiche.

Le tout premier brassin du tutoriel va 4 fois plus vite et ne peut pas être infecté : Gaston donne un coup de main. La partie ne peut jamais se bloquer (voir « Accompagnement »).

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

## Brassins : bouteilles ou fûts, et programmation
Dans « Brasser », une bière de la gamme se brasse **en bouteilles** (pour le stock et les commandes) ou **en fûts** (pour le bar). Un essai est toujours en bouteilles, puisqu'on goûte la première.

- **Programmer** ajoute le brassin à une file d'attente (6 au plus). Les brassins programmés partent dans l'ordre dès que le moulin est libre, avant le brassage continu. Chacun attend d'avoir l'argent et la place au stockage.
- Le **brassage continu** prend le relais quand la file est vide. Il met en bouteilles la bière de la gamme la moins en stock.
- Sur la ligne, les fûts se remplissent sous le bec, puis sont rangés au **stockage**.
- **Taille des fûts**, selon le volume des brassins (donc le matériel) : 5 L (20 verres) au début, puis 10, 20, 30 et 50 L (200 verres). Un fût plein prend au stockage environ la place de son volume en bouteilles : celui de 5 L occupe à peu près une caisse.

## Le bar
L'écran du bar est coupé en deux :
- **en haut (2/3)**, la salle : le comptoir, les tireuses aux couleurs des étiquettes, Gaston derrière le comptoir, et les clients qui s'assoient, vident leur verre puis repartent ;
- **en bas (1/3)**, la **cave** : un fût par tireuse, relié au comptoir par un tuyau, avec une jauge qui baisse à chaque verre.

**Changer un fût** se fait toujours à la main. On touche le fût dans la cave, ou une tireuse dans « Les fûts », puis on choisit une bière qui a des fûts pleins au stockage. On branche alors le plus gros disponible ; s'il restait des verres dans l'ancien, ils sont perdus. Un fût vide est assombri, un « ! » rouge clignote au-dessus, et l'onglet Bar affiche une pastille quand un fût plein peut le remplacer. Quand plus rien ne coule, le bar est vide et un écriteau « À SEC » est posé sur le comptoir.

**Affluence.** Au tout début, il vient **1 client toutes les 10 minutes**. L'affluence augmente avec la popularité de la marque et le niveau du bar : clients/min = affluence max × (10 % + 90 % × popularité de la marque). Chaque bière différente aux tireuses ajoute 25 % (variété). Un client choisit parmi les bières qui coulent, attiré par les plus populaires et celles dans la tendance.

**Prix d'un verre (25 cl)** : 3 € × (0,6 + 0,8 × qualité) × prix du niveau × (1 + 15 % par tendance suivie).

| Niveau | Décor | Places | Tireuses | Affluence max | Prix | Coût |
|---|---|---|---|---|---|---|
| 1 · Comptoir poussiéreux | bois grisé, toiles d'araignée, une ampoule, pancarte « OUVERT » de travers, tonneau ; cave en pierre avec soupirail | 2 | 1 | 1 client/min | ×1 | — |
| 2 · Bistrot de quartier | suspensions, ardoise, carrelage en damier | 4 | 2 | 1,5 | ×1,15 | 400 € |
| 3 · Pub | vert anglais, lambris, cible de fléchettes, lampes en laiton, tables | 7 | 3 | 3 | ×1,3 | 6 000 € |
| 4 · Taproom | briques, enseigne néon « BREW IT », comptoir inox ; cave en béton | 10 | 5 | 5 | ×1,5 | 120 000 € |
| 5 · Bar du futur | baie sur la ville de nuit, néons, comptoir lumineux ; cave aux néons | 12 | 8 | 10 | ×1,8 | 1,2 M€ |

Un jeu complet de fûts tient environ 2 à 5 heures quand la marque est au sommet, et bien plus au début. Le bar rapporte peu (environ 1 % du chiffre d'affaires) : c'est là que la marque se fait connaître.

**Améliorer le bar** : agrandir (niveau suivant), et installer de la **décoration**. Ce sont des achats uniques, visibles dans la salle, qui attirent du monde.

| Décoration | Prix | Clients |
|---|---|---|
| Juke-box | 300 € | +15 % |
| Plantes vertes | 1 200 € | +10 % |
| Cible de fléchettes | 5 000 € | +15 % |
| Flipper | 25 000 € | +20 % |
| Écran géant | 120 000 € | +25 % |
| Petite scène (enceintes, micro) | 600 000 € | +30 % |
| Enseigne lumineuse | 2,5 M€ | +35 % |

**Organiser une fête** (bouton « Fête ») : pendant 30 min, **50 fois plus de clients**. Le personnel de la fête rebranche tout seul les fûts vides avec ceux du stockage : il faut donc **prévoir des fûts d'avance**, car ils se vident très vite. Une fête coûte 100 € au comptoir poussiéreux, puis 1 000 €, 10 000 €, 80 000 € et 600 000 € selon le niveau du bar. Il faut ensuite attendre 6 h avant la suivante. Pendant la fête, des projecteurs de couleur balaient la salle et des confettis tombent.

## Popularité et tendances
**Popularité d'une bière (0 à 5 ★).** Chaque verre servi au bar, et chaque bouteille livrée sur commande (dans une bien moindre mesure), rapproche sa popularité d'une cible. Cette cible est sa qualité, portée par les tendances qu'elle suit. Sans ventes, la popularité s'érode : elle perd la moitié de sa valeur en 2 jours de jeu.

**Popularité de la marque** : c'est la moyenne de la gamme pondérée par la popularité de chaque bière ; une nouvelle bière inconnue ne la fait donc pas chuter. Elle fixe :
- l'affluence du bar ;
- le paiement des commandes (×0,8 à ×1,2) et leur fréquence (jusqu'à 1,5 fois plus souvent) ;
- l'arrivée de nouveaux profils de clients.

**Tendances.** Trois tendances sont actives à la fois. Chacune dure de 8 à 16 h de jeu, puis une autre la remplace. Elles portent sur un style (IPA, lager, saison, blonde, pale ale, bières d'abbaye, fruitée) ou un caractère (léger < 5 %, fort ≥ 7 %, amer, doux, aromatique, limpide, ambré). Une bière dans la tendance vise une popularité plus haute, attire plus de clients au bar et s'y vend 15 % plus cher par tendance suivie.

L'onglet **Tendances** de l'ordinateur montre la popularité de la marque, les tendances du moment (avec les bières de la gamme qui les suivent) et la popularité de chaque bière. Les commandes « style recherché » reprennent souvent une tendance du moment. La fiche d'une bière de la gamme affiche aussi ses étoiles et ses tendances.

**Campagne de pub** (onglet Tendances de l'ordinateur) : toute la gamme gagne 10 % de popularité, et les commandes arrivent deux fois plus souvent pendant 6 h. Une seule campagne à la fois. Prix selon le niveau de la brasserie : 150 €, 2 500 €, 30 000 €, 250 000 €, puis 2 M€.

## Commandes
L'ordinateur du stockage (sur le bureau, ou le bouton « Commandes ») a trois onglets : **Commandes**, **Tendances** et **Grossiste**.

**Le tableau des commandes.** Il compte un nombre limité de places : 2 au début, 6 au plus, une de plus par amélioration de l'ordinateur. Une nouvelle commande arrive toutes les 30 à 60 minutes de jeu, un peu plus souvent quand la marque est connue, tant qu'il reste une place. Une commande reste valable 8 à 12 h (2 h pour une urgente). Refuser une commande libère sa place, sans pénalité.

**Une clientèle variée, sans contrats.** Chaque commande vient d'un client tiré au hasard parmi les profils ouverts. De nouveaux profils se présentent à mesure que la brasserie grandit et que la marque se fait connaître (« Nouveaux clients : les festivals »).

| Profil | Brasserie · popularité | Exemples | Commandes |
|---|---|---|---|
| Particuliers | ★1 | Anniversaire de Lucie, Mariage de Paul & Inès | classiques, style, fûts, urgentes |
| Bistrots | ★1 | Bistrot Chez Lulu, Le Zinc | classiques, style, fûts, urgentes |
| Épiceries fines | ★1 · 15 % | Épicerie Le Panier | classiques, style, assortiments |
| Cavistes | ★2 · 30 % | Le Houblon d'Or | style, assortiments, prestige |
| Restaurants | ★2 · 40 % | Brasserie de la Gare | classiques, style, urgentes |
| Fêtes de village | ★3 · 40 % | Comité des fêtes, Club de rugby | fûts, classiques, urgentes |
| Festivals | ★3 · 60 % | Festival Rock en Fût | fûts, style |
| Supermarchés | ★4 · 50 % | Hypermarché du Rond-Point | classiques, assortiments |
| Grandes tables | ★4 · 80 % | Le Grand Cerf (étoilé) | prestige, style |
| Export | ★5 · 70 % | Importateur de Tokyo, Pub de Dublin | style, assortiments, prestige |

**Les types de commandes**

| Type | Demande | Paiement |
|---|---|---|
| Commande | des bouteilles d'une qualité minimale | ×1 |
| Style recherché | un style ou un caractère, souvent une tendance du moment | ×1,3 |
| Fûts | des fûts pleins, pour une fête | ×1,15 |
| Assortiment | 2 ou 3 bières différentes, en parts égales | ×1,25 |
| Urgent | délai de 2 h, quantité réduite | ×1,5 |
| Prestige | qualité « Excellente », petite quantité, gros bond de popularité | ×2,5 |

- **Quantités à la mesure de la brasserie** : 6 à 24 bouteilles au niveau 1, puis de plus en plus. Une commande ne dépasse jamais les trois quarts du stockage.
- **Le paiement est fixe et annoncé.** Il dépend du volume, du client et du type de commande, et augmente avec la popularité de la marque (×0,8 à ×1,2).
- **On envoie en un geste.** Les bières qui conviennent sont choisies d'office (les plus en stock) ; « Changer » permet d'en choisir d'autres.
- **Une commande livrée fait connaître les bières envoyées**, une commande de prestige beaucoup.

**L'ordinateur**

| Niveau | Places au tableau | Prix |
|---|---|---|
| Vieux minitel | 2 | — |
| PC d'occasion | 3 | 1 500 € |
| Poste de bureau | 4 | 40 000 € |
| Logiciel de gestion | 5 | 400 000 € |
| Intelligence logistique | 6 | 3 M€ |

## Le grossiste
Le grossiste reprend n'importe quelle bouteille buvable, à environ la moitié du prix d'une commande : 2,40 € × (0,6 + 0,8 × qualité). Par défaut, il reprend **automatiquement le surplus**, même appli fermée : tout ce qui dépasse la moitié du stockage, la bière la plus en stock d'abord. L'autre moitié reste pour les commandes. L'onglet Grossiste permet de couper cette vente automatique, ou de vendre à la main une caisse ou tout le stock d'une bière.

## Gamme : l'étagère
La gamme est une étagère de grandes bouteilles portant leur étiquette. À côté de la dernière, une silhouette « + » permet d'acheter une nouvelle place (8 au maximum) ; un essai gardé vient la remplir. Prix des places : 150 €, 8 000 €, 50 000 €, 200 000 €, 600 000 €, 3 M€ puis 8 M€.

## Stockage
Le stockage est une pièce à part entière. Ses rayonnages se remplissent de caisses aux couleurs des étiquettes ; dans les grands stockages, chaque case affichée est une palette de plusieurs caisses. Le bureau porte l'ordinateur des commandes.

Les bouteilles embouteillées rejoignent le stockage en caisses de 12. Quand il est plein, l'embouteillage s'arrête jusqu'à ce que des ventes libèrent de la place. Le brassage continu attend d'avoir la place pour un brassin de plus, mais repart toujours quand tout est vide, même si un brassin est plus gros que le stockage. Le stock accumulé pendant l'absence sert à honorer les commandes au retour : un grand stockage permet d'en remplir davantage.

| Niveau | Décor | Capacité | Prix |
|---|---|---|---|
| Coin du garage | briques, ampoule nue, planches sur parpaings, vieux moniteur | 10 caisses (120 btl) | — |
| Cave voûtée | pierre, voûte, lanternes, dalles | 60 caisses | 250 € |
| Chambre froide | panneaux isothermes, givre, brume au sol, écran plat | 400 caisses | 8 000 € |
| Entrepôt | tôle, verrière, racks à palettes orange | 2 500 caisses | 120 000 € |
| Plateforme logistique | néons, bras robotisé, terminal holographique | 12 000 caisses | 1 M€ |

Les fûts pleins y sont rangés à côté des caisses : ce sont de petits fûts inox, cerclés à la couleur de l'étiquette.

## Équilibrage
Voir [BALANCE.md](BALANCE.md) : l'audit, les objectifs de rythme et le joueur simulé (`npm run balance`).

## Accompagnement
Gaston accueille le joueur, l'invite à toucher une machine, à lancer son premier brassin avec sa recette de blonde préréglée, puis à l'ajouter à sa gamme. Enfin, il explique que les bouteilles vont au stockage pour remplir les commandes, et que pour le bar il faut brasser en fûts puis les brancher dans la cave. Il invite alors à glisser l'écran pour visiter les pièces.

Si le joueur n'a plus d'argent et que rien ne peut en rapporter (aucun brassin en cours, aucun fût qui coule, aucune commande remplissable avec le stock), Gaston avance les ingrédients, y compris pour le brassage continu et les brassins programmés.
