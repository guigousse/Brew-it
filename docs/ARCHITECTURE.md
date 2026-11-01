# Architecture technique

## 1. Choix de la stack

**TypeScript + PixiJS 8 (WebGL), packagé en natif avec Capacitor 8. Cible prioritaire : iOS.**

| Couche | Choix | Pourquoi |
|---|---|---|
| Simulation | TypeScript pur, aucune dépendance | Déterministe, testable en CI en quelques ms, indépendant du moteur de rendu |
| Rendu | PixiJS 8 (WebGL) | Le moteur 2D le plus rapide du web : batching de sprites, filtre `nearest` pour le pixel art, sans le poids d'un moteur complet |
| UI | DOM + CSS par-dessus le canvas | Les curseurs, listes et panneaux sont bien plus simples à faire en HTML qu'en UI de moteur ; accessibilité et safe areas iOS gérées nativement |
| Natif | Capacitor 8 (WKWebView) | Projet Xcode standard (SPM), plugins officiels : fichiers, cycle de vie, haptique ; IAP, Game Center et iCloud via plugins |
| Build / tests | Vite 7, Vitest 3 | Rechargement instantané, mêmes modules pour les tests et le jeu |

### Alternatives écartées

- **Godot 4.** C'est le meilleur concurrent : rendu natif et bon export iOS. Il a été écarté parce que l'export iOS demande un Mac à chaque build, que l'UI (formulaires, curseurs) y est plus lourde à produire et que tester la logique en CI est moins simple. **Si les performances deviennent un vrai problème** (plusieurs dizaines de milliers d'entités), la simulation est isolée et ses règles sont documentées et testées, ce qui permet de la porter.
- **React Native / Expo + Skia.** Il faut faire un pont entre le thread JS et le rendu, et ce n'est pas taillé pour une simulation à 20 ticks/s avec des milliers d'objets animés.
- **Flutter + Flame.** C'est viable, mais Dart a un écosystème de jeu plus réduit et on n'y gagne rien par rapport à Pixi pour de la 2D en pixel art.
- **SpriteKit (Swift).** C'est excellent sur iOS, mais tout serait à réécrire pour Android.

### Spécificités iOS prises en compte

- WKWebView a WebGL 2 et le JIT activés. Le rendu est limité à `devicePixelRatio ≤ 3` et le canvas est `autoDensity` pour rester net sur Retina.
- Les **safe areas** (encoche, Dynamic Island, barre home) sont gérées par `env(safe-area-inset-*)` et `viewport-fit=cover`.
- Les cibles tactiles font au moins 44 pt (HIG Apple). Le zoom navigateur et le rebond de scroll sont désactivés.
- Les **sauvegardes** sont dans `Library/`, donc incluses dans iCloud Backup et invisibles dans l'app Fichiers. L'écriture est atomique (fichier temporaire puis renommage).
- **Cycle de vie** : au passage en arrière-plan (`pause`), on sauvegarde et on arrête le ticker. Au retour (`resume`), on calcule la production hors-ligne.
- Les polices sont **embarquées** (`@fontsource`) : le jeu fonctionne entièrement hors-ligne.
- Le chargement du code par la WebView respecte la règle App Store 2.5.2, puisque tout est livré dans le bundle.

## 2. Structure du projet

```
src/
├── core/                  ← SIMULATION (TS pur, zéro DOM / Pixi) — tout est testé ici
│   ├── content/           données de jeu : bâtiments, objets, fluides, levures, paliers de carte, curseurs
│   ├── grid/grid.ts       grille d'occupation + agrandissement de la carte
│   ├── building.ts        type Building (données pures, sérialisables) + alertes
│   ├── systems/           comportements : items (convoyeurs), fluids (pression), heat, machines
│   ├── brewing/           formules de brassage (empâtage, Tinseth, fermentation) + registre des lots
│   ├── economy/market.ts  tendances, attrait, prix de vente, labels
│   ├── save/              sérialisation JSON versionnée, migrations, abstraction de stockage
│   ├── sim/loop.ts        boucle à pas fixe + simulation hors-ligne
│   ├── world.ts           état autoritaire + commandes (place, remove, setParam, expand…)
│   └── testing/           scénarios de référence pour les tests d'intégration et la démo
├── render/                ← RENDU Pixi (lit le World, ne le modifie jamais)
├── ui/                    ← HUD DOM, gestes tactiles, styles
├── platform/              ← adaptateurs Capacitor (stockage, cycle de vie, haptique)
└── main.ts                assemblage
ios/                       projet Xcode généré par Capacitor (versionné)
```

**Règle de dépendance :** `core` n'importe rien d'autre que `core`. `render` et `ui` lisent `core`. `platform` implémente des interfaces de `core`.

## 3. Gestion de l'état

- **Source de vérité unique : `World`.** C'est un objet mutable, avancé par `world.step(dt)`.
- **Données ≠ comportements.** Un `Building` est un objet JSON pur (réservoirs, files d'objets, état de machine). La logique vit dans les `systems/*`. La sauvegarde se fait donc avec un simple `JSON.stringify`, sans mapping.
- **Mutations par commandes.** L'UI appelle `world.place / remove / rotate / setParam / repair / expand`, qui valident et renvoient `{ ok, reason }`. Ce point d'entrée unique permettra plus tard l'annulation, des replays et les analytics.
- **Événements.** `world.events` (`sale`, `batchLost`, `broken`, `expanded`…) alimente les toasts, les sons et l'haptique sans que la simulation connaisse l'UI.
- **L'UI tire l'état** à environ 4 Hz (HUD) ou à chaque frame (canvas). Il n'y a pas de store réactif global pour l'instant. Quand les écrans se multiplieront (recettes, concours, boutique), on ajoutera **Preact + signals** pour le HUD, sans toucher à `core`.

## 4. Boucle de jeu

- La **simulation tourne à pas fixe, 20 ticks/s** (`FixedStepLoop`), indépendamment du framerate (60 ou 120 Hz ProMotion). Elle est plafonnée à 8 ticks par frame pour éviter la « spirale de la mort ».
- Le **déterminisme** repose sur un ordre de mise à jour stable (ordre de création) et un PRNG sérialisé (`Rng`). Un test vérifie qu'une partie rechargée évolue *exactement* comme l'originale.
- La **production hors-ligne** simule le temps écoulé avec un pas de 0,25 s, plafonnée à 2 h (`MAX_OFFLINE_SECONDS`). Pour des usines géantes, il faudra passer à une estimation analytique des débits : c'est noté dans la feuille de route.

## 5. Modèle de simulation

### Grille
Elle est allouée à la taille maximale (56×36) dès le départ. Un rectangle ancré en (0,0) se déverrouille au fil des paliers (Garage 10×7, puis Arrière-cour, Entrepôt, Micro-brasserie, Usine). **Les coordonnées ne bougent jamais**, ce qui est indispensable pour les sauvegardes. Les bâtiments font N×N cases. Les voisins de chaque bâtiment sont mis en cache, et le cache est invalidé à chaque construction ou démolition.

### Objets (convoyeurs)
Comme dans Mindustry, chaque convoyeur porte jusqu'à 3 objets avec une position comprise entre 0 et 1, un espacement minimal et une vitesse en cases/s. L'objet de tête passe au bâtiment situé devant si celui-ci l'accepte. Les machines « déversent » leur sortie vers leurs voisins à tour de rôle (round-robin). Un convoyeur refuse les objets venant du bâtiment vers lequel il pointe.

### Fluides (pression)
- **Pression = taux de remplissage.** Le fluide va du plus plein au moins plein, et le débit par bâtiment est plafonné (`maxFlow`) : c'est ce qui crée les **goulots d'étranglement**.
- Les tuyaux et pompes sont **directionnels**. Les cuves et machines déversent vers tous leurs voisins.
- **Les entrées de machines aspirent** : leur pression perçue est nulle tant qu'elles ne sont pas pleines. Sans ça, une sortie et une entrée de même taille s'équilibreraient à mi-niveau et la chaîne stagnerait (bug trouvé par le test d'intégration).
- **Pompe** : elle ajoute une hauteur manométrique et peut remplir un tuyau au-delà de 100 %. Cette **surpression** abîme le tuyau, qui finit par **casser et fuir**.
- Deux fluides différents ne se mélangent jamais (alerte). Pour un même fluide, la température et le **lot** sont mélangés au prorata des volumes.
- **Refroidisseur = échangeur à plaques**, calculé par la méthode ε-NTU au moment du transfert. Plus le débit est fort, moins il refroidit, d'où l'intérêt de les mettre en série. Comme le calcul a lieu au transfert, le résultat ne dépend pas de l'ordre de mise à jour.

### Lots (recettes libres)
Chaque moût ou bière référence un `BatchProfile` (densité, fermentescibilité, IBU, ABV, fruité, qualité, souche, garde). Les machines créent et transforment ces profils à partir des curseurs du joueur, qui sont **figés au lancement du lot**. Les assemblages créent un nouveau lot, sauf si les profils sont quasi identiques ou s'il ne s'agit que de traces (pour limiter le nombre de lots). Les lots qui ne sont plus référencés sont supprimés toutes les 5 s et avant chaque sauvegarde.

## 6. Sauvegarde

- Format `SaveFile { version, savedAt, world }` en JSON.
- `migrations.ts` : une migration par incrément de version. On ne modifie jamais une migration déjà publiée.
- `SaveStorage` est une interface implémentée trois fois : `NativeFileStorage` (iOS), `LocalStorageAdapter` (navigateur) et `MemoryStorage` (tests).
- La sauvegarde est automatique toutes les 30 s et au passage en arrière-plan.
- Prévu : plusieurs emplacements, sauvegarde cloud (iCloud Key-Value ou CloudKit via plugin) et sauvegarde de secours avant migration.

## 7. Pixel art et assets (prochaine étape)

- Tuiles de **16×16**, avec un zoom entier privilégié (`snapZoom`) et `scaleMode = 'nearest'`.
- Pipeline prévu : **Aseprite**, export en *sprite sheet* JSON, puis `Assets.load` dans Pixi. Les animations (bulles des fermenteurs, vapeur des cuves, objets sur les convoyeurs) seront jouées par `AnimatedSprite`.
- Le rendu actuel utilise des formes de couleur provisoires. `GameRenderer.drawBuilding` est le seul endroit à remplacer.
- Performance : passer à des sprites persistants (un par bâtiment) avec un `ParticleContainer` pour les objets des convoyeurs, au lieu de redessiner un `Graphics` à chaque frame.
