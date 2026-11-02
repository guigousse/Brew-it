# Game design

## Fantasme
« Je suis parti d'un garage avec une marmite. Aujourd'hui, mon usine tourne toute seule et ma triple fruitée vient de gagner une médaille. »

## Brassage : apprendre, puis expérimenter
- **Tutoriel :** le joueur brasse la **recette de Gaston**, une blonde réussie. Chaque réglage est expliqué sur une fiche en lecture seule.
- **Ensuite :** il invente ses recettes avec une **molette par réglage**. Aucune prévision n'est affichée : c'est la **fournée d'essai** qui révèle le résultat.

| Étape | Molettes | Plage |
|---|---|---|
| Empâtage | Malt (par lot de 25 L) · Température · Durée | 1–10 kg · 45–85 °C · 10–120 min |
| Ébullition | Houblon · Durée | 0–300 g · 5–120 min |
| Fermentation | Levure (ale américaine, ale anglaise, saison, lager) · Température · Garde | 4–36 °C · 0–30 j |

### Fournée d'essai et dégustation
Un nouveau brassin ne lance **qu'un seul lot**. À la fin de la fermentation, la production se met en pause et la **dégustation** s'affiche : verdict (Imbuvable, Médiocre, Correcte, Bonne, Excellente), note sur 20, alcool, amertume, couleur, fruité, et la **liste des défauts expliqués**. Le joueur valide et lance la production, jette la fournée, ou corrige sa recette. **Une bière imbuvable ne peut pas être produite**, et le bar refuse les caisses imbuvables.

### Modèle réaliste (src/core/brewing/profile.ts)
| Cause | Effet |
|---|---|
| Empâtage < 60 °C ou > 72 °C, ou trop court | Enzymes lentes ou détruites (> 78 °C) : peu de sucre, bière trouble au goût de farine, aqueuse |
| Température d'empâtage | 62 °C donne un moût très fermentescible (bière sèche) ; 72 °C laisse des dextrines (bière ronde) |
| Houblon (formule de Tinseth, alpha 6 %) | Amertume en IBU ; rapport BU:GU > 1,6 → amertume agressive ; < 0,12 → bière écœurante |
| Ébullition < 30 min | Goût de maïs cuit (DMS) |
| Fermentation trop chaude | Fruité excessif, puis alcools de fusel (goût de solvant) |
| Fermentation trop froide | Fermentation incomplète, puis bloquée : bière sucrée et plate |
| Trop de sucre pour la levure | Elle abandonne au-delà de sa tolérance : bière sirupeuse |
| Garde trop courte | Pomme verte et beurre ; une lager demande 14 jours |
| Moût à plus de 35 °C au moment d'ajouter la levure | La levure meurt : lot perdu |

## Le brassin (recette)
- Le brassin est **sauvegardé** et s'applique à toute la ligne. Pour changer de bière, on met la **production en pause** (les lots en cours se terminent), puis on reprend un ancien brassin ou on en compose un nouveau.
- Le nom suit chaque lot jusqu'aux bouteilles et aux caisses. 🔜 Une étiquette personnalisée sera apposée sur les bouteilles.

## Matériel : miniature → professionnel → industriel
- **Au départ, version miniature** (une case, matériel de garage) : mini-concasseur à manivelle, marmite d'empâtage, marmite d'ébullition sur réchaud, serpentin, dame-jeanne et embouteilleuse manuelle. Les lots font 25 L.
- **Versions pro** au Magasin, débloquées après 5 caisses livrées : moulin à rouleaux (×2,5), cuves de 50 L (lots ×2, vitesse ×1,3), échangeur à plaques (×3), fermenteur conique et embouteilleuse semi-automatique (×3).
- **Versions industrielles**, débloquées après 20 caisses et une fois le local agrandi jusqu'à l'Entrepôt : broyeur à silo (2 × 2 cases, ×6), cuves de 100 L (3 × 3 cases, lots ×4, vitesse ×1,6), échangeur industriel (15 L/s), fermenteur industriel de 120 L et ligne d'embouteillage (×10).
- Les appareils sont **raccordés par des tuyaux** visibles, comme dans une vraie brasserie.

## Interface
- **Header :** nom de l'appli, argent, options.
- **Onglets du bas :** **Magasin** (appareils, agrandissement, suppression), **Fournisseur** (malt, houblon, levure, bouteilles mis en stock) et **Brassins** (production, recettes).

## Stockage (3 niveaux)
Bac de stockage (mini, 30 unités) → Silo 150 (pro) → Silo industriel (600). Chaque réserve se **règle sur un ingrédient** (malt, houblon, levure, bouteilles). Elle **alimente toute seule les appareils collés à elle**, qui n'affichent alors plus d'icône « + ». Elle se remplit avec son propre « + », depuis le stock ou en complétant par un achat. Changer d'ingrédient rend son contenu au stock.

## Ingrédients
- On achète les ingrédients au **Fournisseur** : ils vont dans le **stock**. Quand une machine en manque pour le prochain lot, une **icône « + » pulse** au-dessus d'elle (malt pour le concasseur, houblon pour la marmite d'ébullition, levure pour le fermenteur, bouteilles pour l'embouteilleuse). Un toucher la charge depuis le stock. S'il n'y en a pas assez, le complément est acheté au prix du fournisseur.
- 🔜 Des **réserves** (silo à malt, chambre froide à houblon…) rempliront automatiquement les machines voisines. Il faudra quand même les réapprovisionner.

## Construction
- Les tapis et tuyaux **suivent le doigt**, virages compris, et se raccordent visiblement aux machines.
- **Déplacer** un élément le repose ailleurs avec son contenu, gratuitement.
- **Supprimer** : les éléments touchés passent en rouge, puis un bouton **Confirmer** les supprime (75 % remboursés).

## Tutoriel : « Ta première bière » (19 étapes, environ 5 min, 2 min en accéléré)
Il est guidé par **Gaston**, un brasseur retraité. Le joueur construit lui-même toute la ligne dans le garage : chaque bâtiment est offert, et sa case clignote. Gaston explique le rôle de chaque étape. Le joueur compose ensuite son premier brassin, puis ajoute les ingrédients avec les icônes « + ».
- Rien ne démarre avant que le brassin soit composé : la première bière est bien *la sienne*.
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
