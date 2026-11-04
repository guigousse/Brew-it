# Brew It : simulation de brassage

## Concept
La brasserie compte **quatre pièces** (le bureau, l'atelier, le stockage et le bar), chacune en plein écran et en **portrait**. Chaque pièce tient entière à l'écran, sans défilement. Le décor, lui, est peint d'un seul tenant jusqu'aux bords de l'écran, quel que soit son format : murs, passerelles et sols continuent, sans bandes rajoutées. Dans toutes les pièces, le sol fuit vers un point à hauteur des yeux (planches, pavés, dalles, damier, tomettes, tapis en perspective), et les ombres donnent la profondeur : coins et pied des murs plus sombres, halos des lampes, ombres des meubles au sol et sur le mur, dessus des meubles, du comptoir et des étagères vus d'en haut, embrasure de la fenêtre du bureau. À l'atelier, chaque appareil projette sa silhouette tramée sur le mur, et les passerelles ont de l'épaisseur (le dessus de la plus basse, le dessous des deux autres) ; au bar, tabourets, tables et fûts ont leur ombre. On passe de l'un à l'autre en **glissant le doigt**, du bureau au magasin, ou par la **barre de navigation en bas de l'écran** :

**Bureau ↔ Atelier ↔ Stockage ↔ Bar** : on gère la brasserie depuis le bureau, puis on suit le trajet de la bière, de la cuve au verre.

La barre de navigation compte cinq onglets : **Bureau · Atelier · Stockage · Bar · Magasin**. On agit surtout **en touchant le décor** :
- **Bureau** : une grande **fenêtre donne sur l'atelier**, où l'on voit les machines tourner en direct (la toucher mène à l'atelier). Le **panneau de liège** porte une feuille par commande en attente, cochée en vert quand on peut la livrer ; le toucher ouvre les commandes. L'horloge donne l'heure du jeu. Le **présentoir** expose la gamme actuelle (une petite bouteille par bière, une silhouette par place libre) et ouvre **Ma gamme**. Sur le bureau, l'**ordinateur** : son écran affiche toujours une **enveloppe** avec le nombre de commandes en attente, dorée et scintillante quand on peut en livrer. Le décor du bureau suit le niveau de l'ordinateur (5 décors). Ses murs ne rappellent jamais ceux de l'atelier (pierre, brique, carreaux blancs, tôle, panneaux blancs) : lambris de bois clair, papier peint à rayures sur soubassement de noyer, vert anglais et boiseries, plâtre bleu-gris à bandeau orange, panneaux bleu nuit à tasseaux de noyer. Au sol : planches, parquet en vannerie, moquette et tapis, dalles de moquette, résine noire.
- **Atelier** : les machines (réglages, amélioration). En bas à droite, deux petits boutons carrés à icône en pixel art : la bouteille pour **Ma gamme**, la cuve de cuivre pour **Brasser** (sa pastille donne le nombre de brassins programmés ; il est doré et pulse quand rien n'est programmé alors qu'on pourrait brasser).
- **Stockage** : les rayonnages ouvrent le **stock**. Au premier plan, un diable de caisses vides, et la palette des commandes prêtes à partir.
- **Bar** : les **fûts** de la cave (ou le comptoir) ouvrent le menu des fûts. Un petit bouton carré à l'étoile ouvre les **événements** (sa pastille donne le temps restant de celui en cours). Pendant un événement, son objet apparaît en haut à droite du bar, et le toucher ouvre aussi les événements.
- **Améliorer** : dans chaque pièce, un petit bouton carré à **flèche verte** se trouve à gauche du nom de la pièce. Il ouvre l'amélioration de l'ordinateur (bureau), la fiche de la brasserie (atelier), l'agrandissement du stockage ou celui du bar. Il pulse quand on a de quoi payer une amélioration.

Les boutons s'effacent quand un panneau est ouvert, et au magasin.

**Confort et accessibilité**
- Les notifications s'affichent en bas à gauche, au-dessus de la navigation (ou du panneau ouvert), deux au plus à la fois : elles ne cachent plus Gaston ni les titres. Les ventes rapprochées se cumulent dans une seule.
- Toute zone à toucher fait au moins 44 × 44 px, même quand le bouton paraît plus petit.
- Texte en police pixel : 12 px au minimum. Le nom des machines a un fond sombre, lisible sur tous les décors.
- Un bouton payant reste touchable quand l'argent manque : il est grisé et dit « Il te manque x € ».
- Les actions sans retour demandent un second appui (retirer une bière de la gamme, jeter un essai, refuser une commande). Retirer un groupe de la file propose « Annuler » pendant 5 s.
- Le tutoriel désigne les boutons par leur place (« la cuve de cuivre, en bas à droite ») et fait briller celui dont il parle.
- La vitesse du « mode test » n'apparaît que pendant le développement.

- **L'ordinateur du bureau** : un écran de **taille fixe**, quel que soit le téléphone. Le fond d'écran (l'atelier) est **flouté** ; par-dessus, le **menu** de « Brew OS » : une icône par application (**Tableau de bord, Messages, Commandes, Personnel, Tendances, Grossiste**), avec leur pastille (messages non lus, commandes en attente, dorée quand une commande peut partir). La dernière nouvelle s'affiche sous les icônes. Chaque application s'ouvre dans une fenêtre, avec « ‹ » pour revenir au menu ; le bouton ⏻ éteint l'ordinateur.
- **Messages** : la boîte de réception de la brasserie, la plus récente en haut (60 au plus) : commandes reçues et expirées, tendances, nouveaux clients, brassins terminés ou ratés, niveaux de la brasserie, bilan d'une absence. Les non-lus sont encadrés ; ouvrir la boîte les marque comme lus. Elle n'est pas sauvegardée : elle repart d'un mot de Gaston à chaque lancement.
- **Tableau de bord** (application de l'ordinateur) : un aperçu des ventes en direct. On y trouve les recettes de la dernière heure et les recettes totales, la marque et les brassins. Un graphique montre les ventes minute par minute sur 60 min, réparties entre bar, commandes et grossiste. Viennent ensuite la répartition des recettes depuis le début, l'état de la brasserie (chaque brassin avec son temps restant, le stockage, le bar, les commandes) et la gamme classée par recettes.
- **Personnel** (application de l'ordinateur) : des postes selon le niveau de la brasserie (1 aux niveaux ★1 et ★2, 2 aux niveaux ★3 et ★4, 3 au niveau ★5). Chaque employé signe un contrat de **8 h**, que l'on prolonge jusqu'à 24 h d'avance ; un nouveau demande un poste libre. **Barman** (rebranche les fûts vides, prix selon le niveau du bar), **Livreur** (envoie toutes les 30 s les commandes que le stock peut remplir, même pendant l'absence ; 40 € à 30 k€ selon le niveau de la brasserie), **Apprenti brasseur** (quand la file est vide, il reprogramme le dernier brassin ; 30 € à 25 k€). Le bouton du barman au bar partage ces postes.
- **Magasin** : une pièce en pixel art avec des étagères. Sur la plus haute, la cible de fléchettes, puis la télévision, puis la boule à facettes, en vente l'une après l'autre ; elles débloquent les événements du bar. Dessous, trois rayons, chacun ouvre son catalogue :
  - **Boosts**, en trois groupes. *Brasserie* : Coup de feu (machines ×2, 15 min), Cadence ×2 (1 h), Plein régime (×3, 30 min), Équipe de nuit (×2, 4 h), Levure express (fermentation et garde ×3, 1 h). *Bar* : Happy hour (clients ×2, verres −20 %, 1 h), Bouche-à-oreille (clients ×1,5, 4 h). *Généraux* : Campagne de pub, Prospection (une commande tout de suite), Grossiste généreux (prix ×1,5, 2 h). Seules les machines accélèrent, pas le temps du jeu. Un boost par canal (brasserie, levure, bar, grossiste) : le même se prolonge jusqu'à 24 h d'avance, un autre attend la fin. Ils continuent pendant l'absence. **Prix** : 40 % de ce que le boost rapporte avec la production et le bar du moment, avec un plancher selon le niveau de la brasserie (15 € à 15 k€). L'étiquette du rayon affiche le temps restant.
  - **Mobilier** du bar, un meuble après l'autre, chacun dessiné dans le bar aux 5 niveaux et à ses couleurs : Plantes vertes (400 € ; la gamme se fait connaître 20 % plus vite au bar), Affiches encadrées (2 500 € ; +5 % de clients), Enseigne lumineuse sur la façade du comptoir (12 k€ ; +15 %), Banquettes derrière les tables (50 k€ ; +2 places à table, +10 %), Juke-box dans le coin (200 k€ ; verres 10 % plus chers).
  - **Étiquettes** : de nouvelles formes de bouteilles (long col, trapue, bouchon mécanique, champenoise), d'étiquettes (arrondie, arche, coins coupés), des logos (feuille, abeille, soleil, poisson, château, crâne) et des motifs (zigzag, écailles, chevrons, tartan), de 300 € à 250 k€. Ils apparaissent dans l'éditeur d'étiquettes ; ce qui n'est pas débloqué y porte un cadenas. La bouteille choisie se voit sur l'étagère de la gamme et au présentoir du bureau.
  - Un dernier emplacement reste sous son drap : « Bientôt ».

**Brasser** ouvre la file des brassins programmés : des groupes « bière × format × nombre » qui partent dans l'ordre. Comme chez un vrai brasseur, un brassin ne part que s'il pourra aller jusqu'au bout **sans attendre devant aucun appareil** : le jeu prévoit son trajet (cuves de fermentation et de garde comprises) et le lance juste à temps pour qu'il arrive quand la place se libère. Aucun appareil ne reste donc bloqué par un brassin fini, et la cadence est celle de l'appareil le plus lent. Il faut aussi l'argent et la place nécessaires. Le groupe en tête dit ce qui le retient. On peut changer le nombre d'un groupe, le monter ou le descendre dans la file, ou le retirer. « + Programmer des brassins » ouvre un assistant en trois étapes : 1. la bière de la gamme (ou un nouvel essai avec les réglages des machines), 2. le format (bouteilles pour le stock et les commandes, fûts pour le bar), 3. le nombre de brassins. Cette dernière étape montre une caisse ou un fût par brassin, la production, le coût, la place au stockage, et dans combien de temps ces brassins seraient prêts. En haut de la file, **« Production restante »** donne le temps jusqu'à la fin du dernier brassin (ceux déjà sur la ligne, puis toute la file), et chaque groupe affiche « prêt dans … ». Ces temps sont calculés en rejouant la brasserie sur une copie, ventes comprises : ils tiennent compte des cuves, des appareils et de l'attente d'argent ou de place. Si la file va se bloquer (stockage plein, souvent de fûts que seul le bar écoule, ou plus d'argent), la production restante l'indique (« ⏸ stockage plein ») et explique après combien de brassins ; les groupes qui ne sortiront pas affichent la même chose au lieu d'un temps. Il n'y a **plus de brassage continu** : quand la file est vide, la brasserie s'arrête. On ne peut pas programmer plus que la file n'en accepte, ni plus que le stockage ne peut recevoir : les fûts (qui ne partent qu'au bar, aux commandes ou pendant un événement) doivent tenir dans la place libre, en comptant ceux déjà sur la ligne et dans la file ; les bouteilles aussi, sauf si le grossiste écoule le surplus automatiquement. L'assistant affiche ce maximum et sa raison. Chaque groupe de la file n'indique que son format (Bouteilles ou Fûts) ; le groupe en tête ne signale que ce qui le bloque (argent, stockage).

La file s'allonge avec le niveau de la brasserie : **50, 80, 150, 250, puis 400 brassins**. C'est elle qui fait tourner la brasserie pendant l'absence : de 2 à 4 h de production selon le matériel. Il faut donc remplir la file avant de partir. Avec ces valeurs, le joueur simulé finit le jeu vers le 31e jour, comme avec l'ancien brassage continu (33e jour).

Au-dessus de chaque appareil, l'étape en cours affiche son **temps restant** (m:ss, ou h:mm:ss au-delà d'une heure). Avec plusieurs cuves, c'est celle qui finit la première qui compte.

Chaque pièce évolue sur 5 niveaux, dans le même style pixel art.

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
5. **Gamme** : une bière de la gamme se rebrasse en la programmant dans la file. Un essai lancé par le joueur passe toujours en priorité, et s'il trouve le moulin occupé, il attend son tour. L'étiquette reste modifiable.
6. **Vendre**, de deux façons :
   - des **commandes** arrivent sur l'ordinateur du bureau, envoyées par une clientèle variée. On les remplit et on les envoie : elles sont payées aussitôt, et bien mieux que le reste ;
   - le **grossiste** reprend automatiquement le surplus, à petit prix ;
   - le **bar** sert des verres tirés des **fûts** branchés dans sa cave, même appli fermée. Il fait surtout connaître la marque.
   Chaque brassin se fait **en bouteilles ou en fûts**, et on peut **programmer les prochains brassins**.
7. **Progresser** : améliorer les machines (volume, cadence, qualité), agrandir le stockage, le bar et l'ordinateur, ouvrir de nouvelles places dans la gamme. On peut améliorer une machine même pendant un brassin.
8. **Hors ligne** : la brasserie et le bar continuent de tourner (jusqu'à 8 h), tant qu'il reste des brassins dans la file et que les fûts branchés ne sont pas vides. Les commandes s'accumulent sur l'ordinateur et le stock s'entasse pour les remplir. Au retour, pas de fenêtre qui bloque l'écran : une petite bourse « 💰 +x € » attend sous l'argent, et on la touche quand on veut. L'argent défile alors dans le compteur, et une notification résume l'absence (durée, bouteilles vendues). Les gains de plusieurs absences s'additionnent tant qu'on ne les a pas récoltés.

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
- **Volume des lots :** 5, 20, 60, 200, 600 L. L'appareil le moins avancé fixe le palier, mais chaque appareil déjà au-dessus apporte tout de suite 1/7 du palier suivant : une amélioration rapporte dès qu'elle est faite (par exemple, 7 L au lieu de 5 avec un seul appareil au niveau 2).
- **Cuves en parallèle :** la fermentation et la garde, les étapes lentes, peuvent avoir jusqu'à 4 cuves. Plusieurs brassins, de bières différentes, y travaillent alors en même temps, et les cuves supplémentaires apparaissent en rangée derrière la principale. Une cuve de plus coûte le prix de l'appareil du niveau suivant × le nombre de cuves déjà installées. Améliorer l'appareil améliore toutes ses cuves : son prix est multiplié par le nombre de cuves.
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
- **La finesse** : au-delà de l'absence de défauts, une grande bière est parfaitement réglée. Six points comptent : empâtage vers 66 °C ; fermentation dans le bas de la plage de la levure ; pétillance juste pour le style (2,3 vol., 2,6 pour une lager, 3 pour une saison) ; garde longue et froide (2 °C, deux fois la durée minimale) ; équilibre entre amertume et malt ; ébullition d'au moins 75 min. La finesse **plafonne** la note : 14/20 sans finesse, 18/20 pour une finesse de 0,8, et 20/20 seulement pour une bière parfaite en tout point (avec un matériel assez précis pour tenir les réglages). La dégustation indique « Pour plus de finesse » ce qu'il faut affiner. C'est la base des futurs concours de bières.
- **Ce que donne la recette de Gaston**, d'après `npm run quality` (Monte-Carlo) :

| Niveau | Résultat typique | Excellente |
|---|---|---|
| 1 | surtout Correcte, un quart Médiocre ou pire | 0 % |
| 2 | surtout Bonne | 8 % |
| 3 | Bonne ou Excellente | 31 % |
| 4 | Excellente aux trois quarts | 76 % |
| 5 | Excellente, mais plafonnée à 17/20 par sa finesse | 100 % |

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

- **Programmer** ajoute des brassins à une file d'attente (50 à 400 selon le niveau de la brasserie, voir plus haut). Les brassins programmés partent dans l'ordre dès que le moulin est libre. Chacun attend d'avoir l'argent et la place au stockage. Quand la file est vide, la brasserie s'arrête.
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

**Barman en renfort** (bouton carré au barman, dans le bar, ou application Personnel du bureau ; il occupe un poste de personnel) : on l'embauche pour **8 h**. Pendant ce temps, il rebranche tout seul les fûts vides avec ceux du stockage, même pendant l'absence. On peut prolonger son contrat d'avance, jusqu'à 24 h. Il faut ensuite le réembaucher. Il coûte 30 € au comptoir poussiéreux, puis 150 €, 700 €, 2 500 € et 5 000 € selon le niveau du bar : il rapporte environ 2,5 fois son prix quand on a prévu des fûts (6 par tireuse), presque rien sinon. Il apparaît derrière le comptoir, en gilet sombre et nœud papillon, et la pastille du bouton donne les heures qui lui restent.

**Événements** (bouton à l'étoile, ou l'objet de l'événement dans le bar). Un seul à la fois, puis 6 h de repos avant le suivant. Pendant un événement, les fûts vides sont rebranchés tout seuls avec ceux du stockage : il faut donc **prévoir des fûts d'avance**. Ils se débloquent **l'un après l'autre**, en achetant leur objet au magasin. Chaque objet débloque l'achat du suivant, et les prix suivent les agrandissements du bar. Le prix d'un événement est un multiple d'un prix de référence, qui vaut 100 € au comptoir poussiéreux, puis 1 000 €, 10 000 €, 80 000 € et 600 000 € selon le niveau du bar.

| Événement | Durée | Effet | Prix | Objet (magasin) |
|---|---|---|---|---|
| Tournoi de fléchettes | 1 h | 15 fois plus de clients, la gamme se fait 3 fois plus vite connaître | ×0,5 | **Cible de fléchettes**, 300 € (vers le bistrot) |
| Soirée foot | 1 h 30 | 20 fois plus de clients, verres 20 % plus chers | ×1 | **Télévision**, 5 000 € (vers le pub) |
| Fête | 45 min | 60 fois plus de clients, la gamme se fait 1,5 fois plus vite connaître | ×1,5 | **Boule à facettes**, 60 000 € (vers la taproom) |

Le **magasin** est une pièce en pixel art, comme le bar : sous l'enseigne, des étagères en bois et le comptoir du marchand avec sa caisse. Sur l'étagère du haut trône le seul objet en vente, avec son étiquette de prix (dorée quand on peut se l'offrir) ; à côté, une caisse « ? » cache l'objet suivant. Les étagères du dessous gardent sous des draps les rayons à venir (décorations, mobilier, enseignes, ambiance). Toucher l'objet ouvre sa fiche (ce qu'il débloque, son prix, « Acheter »). Les objets achetés disparaissent des étagères. Les parties qui avaient déjà la boule à facettes la gardent.

L'objet d'un événement n'apparaît que pendant cet événement, toujours au même endroit : en haut à droite du bar, une place que le décor de chaque niveau laisse libre.
- **Fête** : la boule à facettes tourne et scintille. Des projecteurs balaient la salle et des confettis tombent ; ces effets sont réservés à la fête.
- **Soirée foot** : une grande télé suspendue diffuse le match. Elle est cathodique en bois aux niveaux 1 et 2, à écran plat aux niveaux 3 et 4, blanche et néon au niveau 5.
- **Tournoi de fléchettes** : la cible est montée sur un panneau (liège, bois sombre, puis blanc laqué), et les fléchettes s'y plantent.

## Popularité et tendances
**Popularité d'une bière (0 à 5 ★).** Chaque verre servi au bar (+0,4 % de l'écart à la cible) et chaque bouteille livrée sur commande (vingt fois moins) rapprochent sa popularité d'une **cible**. Cette cible dépend fortement de la qualité : ((qualité − 0,3) / 0,7) puissance 1,6, +10 % par tendance suivie.

| Verdict | Cible |
|---|---|
| Correcte (0,6) | 1 ★ environ |
| Bonne (0,75) | 2 ★ environ |
| Excellente (0,9) | 4 ★ environ |
| Parfaite (1) | 5 ★ |

- **La notoriété de la brasserie plafonne la cible** : 1,5 ★ au labo d'alchimiste, puis 2,5 ★ au garage, 3 ★ en microbrasserie, 4 ★ à l'usine et 5 ★ au labo du futur.
- **Sans ventes, la popularité s'érode** : elle perd la moitié de sa valeur en 2 jours de jeu.

**Popularité de la marque** : c'est la moyenne de la gamme pondérée par la popularité de chaque bière ; une nouvelle bière inconnue ne la fait donc pas chuter. Elle fixe :
- l'affluence du bar ;
- le paiement des commandes (×0,8 à ×1,2) et leur fréquence (jusqu'à 1,5 fois plus souvent) ;
- l'arrivée de nouveaux profils de clients.

**Tendances.** Trois tendances sont actives à la fois. Chacune dure de 8 à 16 h de jeu, puis une autre la remplace. Elles portent sur un style (IPA, lager, saison, blonde, pale ale, bières d'abbaye, fruitée) ou un caractère (léger < 5 %, fort ≥ 7 %, amer, doux, aromatique, limpide, ambré). Une bière dans la tendance vise une popularité plus haute, attire plus de clients au bar et s'y vend 15 % plus cher par tendance suivie.

L'application **Tendances** de l'ordinateur montre la popularité de la marque, les tendances du moment (avec les bières de la gamme qui les suivent) et la popularité de chaque bière. Les commandes « style recherché » reprennent souvent une tendance du moment. La fiche d'une bière de la gamme affiche aussi ses étoiles et ses tendances.

**Campagne de pub** (application Tendances de l'ordinateur) : toute la gamme gagne 10 % de popularité, et les commandes arrivent deux fois plus souvent pendant 6 h. Une seule campagne à la fois. Prix selon le niveau de la brasserie : 150 €, 2 500 €, 30 000 €, 250 000 €, puis 2 M€.

## Commandes
L'ordinateur du bureau rassemble les applications **Commandes**, **Tendances** et **Grossiste** (avec le Tableau de bord et les Messages).

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

**L'ordinateur** (amélioré depuis la flèche verte du bureau, ou au pied du tableau des commandes ; chaque niveau change aussi le décor du bureau)

| Niveau | Places au tableau | Prix |
|---|---|---|
| Vieux minitel | 2 | — |
| PC d'occasion | 3 | 1 500 € |
| Poste de bureau | 4 | 40 000 € |
| Logiciel de gestion | 5 | 400 000 € |
| Intelligence logistique | 6 | 3 M€ |

## Le grossiste
Le grossiste reprend n'importe quelle bouteille buvable, à environ la moitié du prix d'une commande : 1,60 € × (0,6 + 0,8 × qualité). Par défaut, il reprend **automatiquement le surplus**, même appli fermée : tout ce qui dépasse la moitié du stockage, la bière la plus en stock d'abord. L'autre moitié reste pour les commandes. L'application Grossiste permet de couper cette vente automatique, ou de vendre à la main une caisse ou tout le stock d'une bière.

## Gamme : l'étagère
La gamme est une étagère de grandes bouteilles portant leur étiquette. À côté de la dernière, une silhouette « + » permet d'acheter une nouvelle place (8 au maximum) ; un essai gardé vient la remplir. Prix des places : 150 €, 8 000 €, 50 000 €, 200 000 €, 600 000 €, 3 M€ puis 8 M€.

## Stockage
Le stockage est une pièce à part entière. Ses rayonnages se remplissent de caisses aux couleurs des étiquettes ; dans les grands stockages, chaque case affichée est une palette de plusieurs caisses. L'ordinateur des commandes est au bureau.

Les bouteilles embouteillées rejoignent le stockage en caisses de 12. Quand il est plein, l'embouteillage s'arrête jusqu'à ce que des ventes libèrent de la place. Un brassin programmé attend d'avoir la place pour lui, mais repart toujours quand tout est vide, même s'il est plus gros que le stockage. Le stock accumulé pendant l'absence sert à honorer les commandes au retour : un grand stockage permet d'en remplir davantage.

| Niveau | Décor | Capacité | Prix |
|---|---|---|---|
| Coin du garage | briques, ampoule nue, planches sur parpaings, vieux moniteur | 10 caisses (120 btl) | — |
| Cave voûtée | murs de pierre, voûte, lanternes, sol de terre battue et de pavés | 60 caisses | 250 € |
| Chambre froide | panneaux isothermes, givre, brume au sol, écran plat | 400 caisses | 8 000 € |
| Entrepôt | tôle, verrière, racks à palettes orange | 2 500 caisses | 120 000 € |
| Plateforme logistique | néons, bras robotisé, terminal holographique | 12 000 caisses | 1 M€ |

Les fûts pleins y sont rangés à côté des caisses : ce sont de petits fûts inox, cerclés à la couleur de l'étiquette.

## Équilibrage
Voir [BALANCE.md](BALANCE.md) : l'audit, les objectifs de rythme et le joueur simulé (`npm run balance`).

## Accompagnement
Gaston accueille le joueur, l'invite à toucher une machine, à lancer son premier brassin avec sa recette de blonde préréglée, puis à l'ajouter à sa gamme. Enfin, il explique que les bouteilles vont au stockage pour remplir les commandes, et que pour le bar il faut brasser en fûts puis les brancher dans la cave. Il invite alors à glisser l'écran pour visiter les pièces.

Si le joueur n'a plus d'argent et que rien ne peut en rapporter (aucun brassin en cours, aucun fût qui coule, aucune commande remplissable avec le stock), Gaston avance les ingrédients, y compris pour les brassins programmés.
