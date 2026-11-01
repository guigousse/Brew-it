# Game design

## Fantasme
« Je suis parti d'un garage avec une marmite. Aujourd'hui, mon usine tourne toute seule et ma triple fruitée vient de gagner une médaille. »

## Principe d'accessibilité
Pas de curseurs ni de mode expert. Le joueur réalise **chaque étape réelle du brassage** et prend à chacune **une décision de brasseur simple**, 2 ou 3 options expliquées. Il doit sentir qu'il *sait* brasser, sans jamais affronter un tableau de réglages.

| Étape | Machine | Choix du joueur |
|---|---|---|
| Malt | Livraison | — |
| Concassage | Concasseur | — |
| Empâtage | Cuve d'empâtage | Malt : 4 / 5 / 6 kg (légère, normale, forte) · Température : 63 / 66 / 69 °C (sèche, équilibrée, ronde) |
| Ébullition et houblonnage | Cuve d'ébullition | Houblon : 50 / 100 / 200 g (douce, équilibrée, très amère) |
| Refroidissement | Refroidisseur | — (comprendre le danger des 35 °C) |
| Fermentation | Fermenteur | Levure : américaine (nette), anglaise (fruitée), saison (épicée) |
| Garde | Fermenteur | 1 / 3 / 7 jours (rapide, bonne, excellente) |
| Embouteillage | Embouteilleuse | — |
| Livraison | Caisse (12 bouteilles) | — |

Les volumes s'adaptent tout seuls : chaque machine traite le lot entier qui arrive de l'étape précédente. L'eau d'empâtage est fixe (24 L), si bien que la quantité de malt règle directement la force de la bière (≈ 4 %, 5 % ou 6,5 %).

## Tutoriel : « Ta première bière » (24 étapes, environ 5 min, 2 min en accéléré)
Il est guidé par **Gaston**, un brasseur retraité. Le joueur construit lui-même toute la ligne dans le garage : chaque bâtiment est offert, et sa case clignote. Gaston explique le rôle de chaque étape, puis le joueur fait ses choix dans l'inspecteur.
- Une machine ne lance son premier lot qu'**après** les choix du joueur : la première bière est bien *la sienne*.
- Pendant les attentes (empâtage, ébullition, fermentation), Gaston commente ce qui se passe et propose d'accélérer le temps.
- La fin arrive avec la livraison de la **première caisse de 12 bouteilles** au bar du coin. Le profil de la bière s'affiche (alcool, amertume, qualité), et Gaston offre 1 200 €.
- Il est possible de passer le tutoriel depuis le menu.

## Piliers

### 1. La chaîne de production (« Mindustry-like »)
On construit, on observe, on repère le goulot d'étranglement, on corrige.

**Chaîne de référence actuellement jouable :**
```
Livraison malt → Concasseur → Cuve d'empâtage ← Arrivée d'eau
                                   ↓ moût (chaud)
            Livraison houblon → Cuve d'ébullition (100 °C)
                                   ↓ moût houblonné bouillant
                          Refroidisseur × 2 (en série)
                                   ↓ < 35 °C sinon la levure meurt
             Livraison levure → Fermenteur (temp. réglée, garde)
                                   ↓ bière
           Livraison bouteilles → Embouteilleuse → Stand de rue → €
```

| Mécanique | État | Conséquence pour le joueur |
|---|---|---|
| Débit max des tuyaux et convoyeurs | ✅ | Goulots visibles, à dédoubler |
| Pression, pompes, surpression, casse et fuite | ✅ | Une pompe mal placée détruit un tuyau ; la réparation coûte de l'argent |
| Température des fluides, déperdition | ✅ | Le moût refroidit dans les cuves tampon |
| Refroidisseurs (efficacité selon le débit) | ✅ | Un seul ne suffit pas à fort débit |
| Ensemencement trop chaud → lot perdu | ✅ | Erreur coûteuse, alerte rouge et toast |
| Sortie bloquée → machine à l'arrêt | ✅ | Indicateur jaune |
| Fluides incompatibles | ✅ | Le réseau se bloque |
| Contamination (moût tiède qui stagne) | 🔜 | Lot dégradé si le moût reste entre 30 et 60 °C trop longtemps |
| Énergie (gaz, électricité) | 🔜 | Coût d'exploitation des chauffes |
| Usure et pannes aléatoires, maintenance | 🔜 | Ressource « techniciens » |

### 2. La création sur mesure
Il n'y a pas de recette figée : ce sont les **curseurs** qui produisent un profil.

| Curseur | Machine | Effet (implémenté) |
|---|---|---|
| Malt (kg) / eau (L) | Empâtage | Densité initiale ; un ratio eau/malt extrême pénalise la qualité |
| Température d'empâtage | Empâtage | 63 °C donne une bière sèche et forte ; 70 °C une bière ronde, plus faible en alcool |
| Durée d'empâtage | Empâtage | Rendement d'extraction |
| Houblon / durée d'ébullition | Ébullition | IBU (formule de Tinseth), évaporation, qualité réduite si l'ébullition dure moins de 30 min |
| Souche de levure | Fermenteur | Atténuation, plage de température, fruité |
| Température de fermentation | Fermenteur | Plus chaud = plus fruité ; hors plage, alcools de fusel |
| Temps de garde | Fermenteur | Bonus de qualité (une lager en demande beaucoup plus) |

**Marché :** une tendance (IPA mania, Session légère, Fruitée…) change toutes les 5 min. L'attrait d'une bière (adéquation à la tendance × qualité) fixe le **rythme d'achat**, et la même adéquation fixe le **prix**.
**Labels :** des bonus de prix temporaires existent déjà dans le modèle (`MarketState.labels`). 🔜 Les **concours** : on inscrit un lot, un jury compare son profil à une catégorie (ex. « Saison ») et attribue une médaille, qui devient un label temporaire et apporte de la réputation.

### 3. La vente et l'expansion
| Palier | Taille | Coût | Débouché visé |
|---|---|---|---|
| Garage | 10×7 | — | Caisse de livraison au bar du coin, stand de rue |
| Arrière-cour | 16×11 | 2 500 € | 🔜 Marché local |
| Entrepôt | 24×16 | 15 000 € | 🔜 Bars (fûts) |
| Micro-brasserie | 36×24 | 80 000 € | 🔜 Cavistes, épiceries fines |
| Usine | 56×36 | 400 000 € | 🔜 Grande distribution (contrats de volume) |

## Temps réel et rythme
- Les durées de brassage sont compressées (`TIME_SCALE`) : 1 minute de brassage dure 0,5 s, et 1 jour de fermentation dure 20 s.
- La production hors-ligne est plafonnée à 2 h. 🔜 Le plafond augmentera avec des améliorations (« contremaître »).
- 🔜 Améliorations d'infrastructure : convoyeurs et tuyaux de niveaux 2 et 3, cuves plus grandes, chauffe plus rapide, fermenteurs à glycol.

## Monétisation (piste à valider, App Store)
Achat premium unique, ou free-to-play léger sans publicité intrusive : accélérateur ×2 permanent et cosmétiques (skins de cuves, étiquettes). Il faudra respecter les règles IAP Apple (StoreKit via RevenueCat ou un plugin Capacitor).

## Feuille de route proposée
1. **Prototype jouable** (fait) : simulation, construction tactile, sauvegarde, projet iOS.
2. **Premier quart d'heure** : tutoriel du garage, équilibrage économique, sprites 16×16, sons et haptique.
3. **Profondeur** : contamination, énergie, concours, bars et fûts, améliorations.
4. **Version TestFlight** : écran titre, réglages, emplacements de sauvegarde, iCloud, analytics.
5. **Lancement App Store**, puis Android.
