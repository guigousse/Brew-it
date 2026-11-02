# Architecture

**TypeScript + Canvas 2D (pixel art à résolution native) + interface DOM, packagé pour iOS avec Capacitor.**

```
src/
├── core/                 logique pure, testée (Vitest)
│   ├── brewing/model.ts  modèle de brassage réaliste (recette + niveaux + températures réelles → dégustation)
│   ├── brewing/strains.ts levures
│   ├── stations.ts       les 7 machines : réglages, niveaux, durées
│   ├── market.ts         distributeurs, prix
│   ├── game.ts           état de la partie : lots dans la chaîne, gamme, ventes, améliorations, hors-ligne
│   └── save.ts           sauvegarde JSON (emplacement « brewit-sim-1 »)
├── render/
│   ├── painter.ts        peintre pixel « 32-bit » (palettes, tramage, contours colorés)
│   ├── sprites.ts        les 21 sprites (7 machines × 3 niveaux) et leurs points d'accroche
│   └── scene.ts          la brasserie verticale (canvas 200 × 304 agrandi au pixel près)
├── ui/                   interface DOM : header, étiquettes sur la scène, barre du bas, panneaux, dégustation, Gaston
├── platform/             Capacitor : stockage fichier, cycle de vie, haptique
└── main.ts               boucle à pas fixe (20 ticks/s), sauvegarde auto, production hors-ligne
```

- **Simulation :** à pas fixe, déterministe (PRNG sérialisé). Chaque lot porte une copie de sa recette. La température réelle de chaque étape est tirée à l'entrée dans la machine, selon la précision de son niveau.
- **Rendu :** un canvas de 200 px de large, agrandi au pixel près (`image-rendering: pixelated`). Les sprites sont peints une seule fois puis mis en cache, et les effets sont redessinés à chaque image.
- **iOS :** chaque push sur la branche lance `.github/workflows/testflight.yml`, qui compile, signe et envoie le build sur TestFlight (voir `docs/TESTFLIGHT.md`).
