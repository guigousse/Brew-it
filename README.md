# Brew It 🍺

Simulation de brassage en pixel art, en portrait : toute la brasserie tient sur un écran, du moulin à l'embouteillage.
On règle chaque machine pour créer ses bières, on goûte, on construit sa gamme et on la vend à des distributeurs ;
chaque machine s'améliore sur 3 niveaux pour brasser plus et mieux.

**Plateforme prioritaire : iOS (App Store).** Android viendra ensuite avec le même code.

## Démarrage

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # tests de la simulation (Vitest)
npm run typecheck
```

## iOS

Il faut un Mac avec Xcode 16 ou plus récent. Le projet Xcode se trouve dans `ios/` et utilise Swift Package Manager, donc CocoaPods n'est pas nécessaire.

```bash
npm run ios:sync     # build web + copie dans le projet Xcode
npm run ios:open     # ouvre Xcode → choisir l'équipe de signature → Run sur iPhone
```

Avant la première soumission :
1. le Bundle ID est `com.guigousse.brewit` (`capacitor.config.ts`) ;
2. configurer les icônes et le launch screen dans `ios/App/App/Assets.xcassets` ;
3. Product → Archive → Distribute → TestFlight.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) : choix de la stack, structure du code, état, sauvegarde, boucle de jeu
- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) : piliers, mécaniques déjà en place et feuille de route
- [`docs/TESTFLIGHT.md`](docs/TESTFLIGHT.md) : publier sur TestFlight sans Mac (GitHub Actions)
