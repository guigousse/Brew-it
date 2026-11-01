# Game design

## Fantasme
« Je suis parti d'un garage avec une marmite. Aujourd'hui, mon usine tourne toute seule et ma triple fruitée vient de gagner une médaille. »

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
| Garage | 10×7 | — | Stand de rue (12 bouteilles, ~6 clients/min) |
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
