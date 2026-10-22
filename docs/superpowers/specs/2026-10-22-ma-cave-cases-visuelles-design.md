# Ma Cave — cases numérotées par casier, points gardés sur le plan, emplacement visuel sur la fiche vin

Date : 22 octobre 2026 · version visée : 2.27.0

## Pourquoi

djkix a relancé l'analyse du plan « Cave Droite » en 2.26 : le mur de droite donne bien
48 cases (12 × 4). Trois manques en usage réel :

1. **Les points disparaissent après acceptation.** Une fois la proposition acceptée et ses
   cases renommées, le plan ne montre plus qu'un seul repère pour la zone : la position
   de chaque case repérée sur la photo n'est pas gardée.
2. **Les noms ne se suivent pas.** Le code d'une case est « rangée + colonne » (A1 à D12
   pour 4 × 12). djkix veut une suite : A1 … A48 pour un casier de 48 cases.
3. **La fiche vin n'est pas visuelle.** L'emplacement est du texte ; il veut voir la photo
   du plan recadrée sur le bon casier, la case de la bouteille mise en évidence.

## Décisions de djkix

- **Une lettre par casier, numérotation qui repart à 1** : Casier A → A1…A48, Casier B →
  B1…B16 (pas de suite continue sur toute la cave).
- **Rangée par rangée, comme on lit** : A1 en haut à gauche, A12 en haut à droite (12
  colonnes), A13 au début de la 2ᵉ rangée, A48 en bas à droite.
- **Pas de migration des données existantes** : djkix supprime lui-même ses zones à grille
  actuelles puis relance l'analyse du plan. Le « Passage à la 2.27.0 » du README le dit.
- Hors périmètre : déplacer à la main un point mal placé ; conversion des anciens
  emplacements en texte libre ; cote multi-sites (sujet séparé).

## 1. Numérotation et lettre du casier

- **Code d'une case** : `<lettre><n>`, `n` de 1 à `rows × cols`, rangée par rangée :
  case (rangée `i`, colonne `j`, à partir de 0) → `n = i × cols + j + 1`. Une seule
  fonction par côté calcule les codes (api `gridCodes` dans `api/src/zones/zone.ts`, web
  `web/src/lib/grid.ts`), qui prennent désormais la lettre en paramètre ; tout le reste
  (noms de cases, saisie par le nom, libellé « Nom (C15) », sélecteur de grille, datalist)
  passe par elles. Le résumé de grille devient « Cases C1 à C48 » (« Case C1 » pour une
  seule case).
- **Lettre du casier** : nouvelle colonne `cave_zone.cell_prefix` (texte, une lettre
  majuscule A–Z, NULL quand la zone n'a pas de grille ; CHECK en migration : NULL ou
  `^[A-Z]$`). Une zone avec grille a toujours une lettre ; une zone sans grille n'en a pas.
- **Unicité** : la lettre est unique parmi les zones **actives** (non archivées) d'une
  cave (index unique partiel `(cave_id, cell_prefix) WHERE archived_at IS NULL AND
  cell_prefix IS NOT NULL`). Lettre déjà prise → 409 « Cette lettre est déjà prise par
  une autre zone ».
- **Choix automatique** (à la pose d'une grille, par acceptation d'une proposition ou par
  *Modifier la zone*, quand la zone n'a pas encore de lettre et que la saisie n'en
  fournit pas) : la lettre finale du nom de la zone quand le nom finit par une lettre
  seule précédée d'une espace (« Casier C » → C, casse ignorée) et qu'elle est libre ;
  sinon la première lettre libre de A à Z. Plus aucune lettre libre → 409 « Plus de
  lettre libre pour les cases (26 casiers au plus) ».
- **Modifiable** dans *Modifier la zone* (champ « Lettre des cases », une lettre). La
  changer renomme, dans la même transaction : les clés de `cell_names` et de `cell_boxes`
  de la zone, et le `casier` des emplacements de la zone dont la valeur est un code de
  l'ancienne lettre (casse ignorée), pour que les bouteilles suivent. Renommer la zone ne
  change pas sa lettre.
- **Retirer la grille** efface la lettre, les noms et les positions des cases.
- **Changer la grille** (lignes ou colonnes) : les noms gardés suivent la règle actuelle
  (`keptCellNames` : codes encore présents) ; les positions des cases (`cell_boxes`) sont
  effacées, car un même code désigne alors une autre case sur la photo.
- Les propositions d'analyse (`nameBlocks`, `DetectedCell.name`) nomment leurs cases avec
  la lettre de la proposition (« Casier C » → C1…C48) : ce qui est montré dans la feuille
  *Proposition* est ce qui sera enregistré.
- La grille reste bornée à 26 lignes × 30 colonnes (CHECK existant), soit 780 cases au
  plus.

## 2. Les points restent sur le plan

- Nouvelle colonne `cave_zone.cell_boxes` (JSONB, `'{}'` par défaut, CHECK objet JSON) :
  `{ code: [x0, y0, x1, y1] }` en fractions de l'image du plan de la zone.
- **Acceptation d'une proposition** : chaque case repérée dont la rangée et la colonne
  sont connues et tiennent dans la grille acceptée (lignes et colonnes éventuellement
  modifiées dans la feuille) est enregistrée sous son code (lettre de la zone). Les
  cases sans rangée/colonne ou hors grille sont ignorées. Le repère unique (`plan_x`,
  `plan_y`, centre du cadre) reste enregistré comme aujourd'hui.
- **Vue** : `ZoneView` gagne `cellPrefix: string | null` et `cellBoxes: Record<string,
  [number, number, number, number]>`.
- **Plan** (`PlanView`, écrans Ma cave et fiche vin) : une zone qui a des positions de
  cases et un repère sur ce plan est dessinée par ses cases — un point au centre de
  chaque case et son nom (nom donné, sinon code), comme les cases d'une proposition
  ouverte aujourd'hui — au lieu de son repère numéroté. Toucher une case d'une zone
  (là où toucher un repère agissait) a le même effet que toucher son repère. Une zone
  sans positions de cases garde son repère numéroté.
- Effacer le repère d'une zone, ou supprimer son plan, efface aussi ses positions de
  cases (elles n'ont de sens que sur ce plan).

## 3. Emplacement visuel sur la fiche vin

Dans le bloc *Emplacements* de la fiche (et la fenêtre de l'icône d'emplacement de
l'en-tête), chaque endroit affiche directement, sans toucher, une vignette du plan :

- **Zone avec positions de cases et case connue** (le `casier` de l'emplacement, ramené
  à son code par `cellCodeOf`, a une position) : image du plan **recadrée sur le casier**
  (rectangle englobant toutes les cases de la zone, marge de 4 % de chaque côté, bornée
  à l'image), toutes les cases du casier en points discrets, **la case de la bouteille
  en évidence** (point plus gros, couleur d'accent, cadre de la case, nom affiché).
- **Zone avec positions de cases, case inconnue** (casier vide ou hors grille) : même
  recadrage, aucune case en évidence.
- **Zone avec un repère sans positions de cases** : image recadrée autour du repère
  (fenêtre de 40 % de la largeur et de la hauteur du plan, bornée à l'image), repère en
  évidence.
- **Zone sans repère, ou sans zone** : texte seul, comme aujourd'hui.
- Légende sous la vignette : le libellé actuel (« Casier C · Champagnes (C15) × 2 »).
- Le recadrage se fait en CSS (image positionnée et mise à l'échelle dans un cadre au
  format du rectangle), sans nouvelle image côté serveur. Texte alternatif : « Plan :
  <libellé> ».
- Toucher la vignette ouvre le plan entier (comportement actuel du dépliant : plan avec
  la zone en évidence) ; l'indication et la photo de la zone restent dans ce dépliant.
- Accès : comme aujourd'hui, pour tous les rôles qui voient la fiche (membre en lecture
  seule compris) ; les plans ne sont lus que si une zone du vin a un repère.

## Données et compatibilité

- Migration `20261025000000_cases_visuelles`, additive : `cell_prefix` (NULL), index
  unique partiel, CHECK, `cell_boxes` (`'{}'`, CHECK). Aucune donnée existante modifiée.
- Les zones à grille existantes n'ont pas de lettre : à la lecture, leurs codes ne sont
  pas recalculés (leur `cell_prefix` NULL) ; tant qu'elles existent, leur grille est
  présentée sans lettre (codes calculés avec la lettre « A »). Le « Passage à la
  2.27.0 » demande de les supprimer puis de relancer l'analyse ; *Modifier la zone* sur
  une telle zone lui attribue une lettre au prochain enregistrement de grille.
- Retour à la 2.26 : les colonnes sont ignorées ; les codes enregistrés (C15) sont lus
  comme des codes « rangée + colonne » de l'ancienne grille.

## Tests attendus

- api : codes linéaires (`gridCodes` avec lettre), choix de lettre (nom finissant par
  une lettre, lettre prise, plus de lettre libre), acceptation (positions gardées, cases
  hors grille ignorées, lettre de la proposition), changement de lettre (noms, positions
  et emplacements renommés), changement de grille (positions effacées), retrait du
  repère ou suppression du plan (positions effacées), unicité (409), e2e sur la base de
  test.
- web : `grid.ts` (codes, résumé), `PlanView` (cases d'une zone au lieu du repère),
  vignette de la fiche vin (trois cas de recadrage, case en évidence, repli texte),
  *Modifier la zone* (champ lettre).
