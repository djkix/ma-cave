# Cases numérotées par casier et emplacement visuel — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codes de cases `<lettre><n>` par casier (A1…A48), positions des cases gardées après acceptation et dessinées sur le plan, vignette du plan recadrée sur la case de la bouteille dans la fiche vin (2.27.0).

**Architecture:** Une lettre par zone à grille (`cave_zone.cell_prefix`) et les cadres des cases (`cave_zone.cell_boxes`) ; un seul calcul des codes par côté (`gridCodes` api, `cellNames` web), qui prend la lettre. Les repères rendus par `GET /caves/current/plans` portent les cases de la zone (cadres + noms), ce qui suffit à `PlanView` et à la vignette ; `Place` gagne son `casier` pour trouver la case de la bouteille.

**Tech Stack:** NestJS + Prisma 5 + PostgreSQL (api, jest), React 18 + TanStack Query + Vitest (web).

**Spec:** `docs/superpowers/specs/2026-10-22-ma-cave-cases-visuelles-design.md` (à lire en entier avant chaque tâche).

## Global Constraints

- Travailler uniquement dans `le worktree de la branche` (branche `feat/cases-visuelles`) ; ne jamais toucher `le dossier principal du dépôt`.
- Code d'une case : `<lettre><n>`, `n = i × cols + j + 1` (rangée `i`, colonne `j`, à partir de 0), rangée par rangée.
- Lettre : une majuscule A–Z, NULL sans grille ; unique parmi les zones non archivées d'une cave.
- Messages exacts : 409 « Cette lettre est déjà prise par une autre zone » ; 409 « Plus de lettre libre pour les cases (26 casiers au plus) ».
- Résumé de grille : « Cases C1 à C48 », « Case C1 » pour une seule case.
- Zone à grille sans lettre (d'avant la 2.27) : codes calculés avec « A », rien n'est recalculé en base.
- Migration `20261025000000_cases_visuelles`, additive uniquement.
- Vignette : marge 4 % (fraction de l'image) autour des cases ; fenêtre 40 % × 40 % autour d'un repère ; texte alternatif « Plan : <libellé> ».
- Textes visibles et commentaires en français, dans le style et la densité de commentaires du code voisin.
- Tests api : `cd api && npx jest <fichier>` ; e2e base : préfixer `DATABASE_URL=postgresql://postgres:dev@localhost:5432/cave_test REDIS_URL=redis://localhost:6379` (base de test seulement, jamais `cave`). Web : `cd web && npx vitest run <fichier>` et `npx tsc -b`. Jamais d'appel réel à Gemini.
- Commits : préfixes conventionnels en français (`feat(api): …`, `feat(web): …`, `docs: …`), terminés par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ne pas toucher au CHANGELOG ni aux entrées datées du « Journal des modifications » du README.

## Décisions prises là où la spec se tait

- **Lettre de la proposition** : `nameBlocks` saute aussi les lettres déjà prises comme `cell_prefix` (pas seulement les noms) et enregistre la lettre choisie dans `PlanSuggestion.cellPrefix` (null au-delà de Z). La feuille *Proposition* l'utilise pour ses codes et l'envoie à l'acceptation (`cellPrefix` facultatif) : même si le nom est changé dans la feuille, la lettre montrée est celle enregistrée.
- **Noms des cases détectées** : calculés par `nameBlocks` (avec la lettre), plus par `unitsToBlocks` (qui rend `name: null`). La feuille recalcule le nom des points à partir de `row`/`col` et de la grille saisie, comme l'acceptation.
- **Modifier la zone** envoie toujours la lettre quand il y a une grille : le champ « Lettre des cases » est prérempli avec la lettre de la zone, sinon par la même règle que l'api (`suggestPrefix`, lettres des autres zones). L'api garde le choix automatique pour un client qui n'en envoie pas. Changer la lettre dans le formulaire renomme aussi les noms saisis (clés).
- **Changer la grille** = lignes ou colonnes différentes des actuelles ; renvoyer la même grille (ce que fait toujours le formulaire) ne touche pas aux positions.
- **Déplacer le repère** sur un autre plan efface les positions de cases ; sur le même plan, elles restent.
- **Renommage des emplacements** au changement de lettre : `casier` qui correspond à `^<ancienne>[1-9][0-9]*$` (casse ignorée), même hors de la grille actuelle ; rien pour une zone sans lettre auparavant. Collision avec un emplacement existant de la zone (casier libre « C5 » déjà là) → 409 « Des bouteilles sont déjà rangées sous ces codes dans cette zone », rien n'est écrit.
- **Bornage** : la marge de 4 % est coupée aux bords de l'image ; la fenêtre de 40 % autour d'un repère est décalée pour rester dans l'image (elle garde sa taille).
- **Fenêtre « Emplacement »** (icône de l'en-tête) : vignette affichée ; la toucher montre le plan entier en dessous (au lieu du plan toujours affiché).

## Review Focus

- Zone d'avant la 2.27 (grille, `cell_prefix` NULL) ouverte dans *Modifier la zone* puis enregistrée sans changer la grille : elle reçoit une lettre, les noms de type « B3 » qui ne sont plus des codes sont perdus, aucune erreur — test e2e Task 2.
- Enregistrer *Modifier la zone* sans rien changer (même grille renvoyée) ne doit pas effacer `cell_boxes` — test e2e Task 2.
- Zone archivée qui avait la lettre C : une nouvelle zone peut prendre C (index partiel) — test e2e Task 2.
- Bouteille rangée sous un casier libre (« Loire ») ou un code hors grille dans une zone à cases : la vignette se recadre sur le casier sans case en évidence, pas de plantage — test Task 5.
- Proposition d'avant la 2.27 (sans `cellPrefix`, cases nommées « B3 ») : acceptée avec la lettre automatique, positions calculées par `row`/`col` — test e2e Task 2.

---

### Task 1: Migration, lettre et codes linéaires côté api

**Files:**
- Create: `api/prisma/migrations/20261025000000_cases_visuelles/migration.sql`
- Modify: `api/prisma/schema.prisma` (modèle `CaveZone`)
- Modify: `api/src/zones/zone.ts`, `api/src/zones/plan-suggestions.ts`, `api/src/queue/plan-analysis.processor.ts`
- Modify (appelants, pour compiler) : `api/src/zones/zones.service.ts`, `api/src/zones/plan.service.ts`
- Test: `api/src/zones/zone.spec.ts`, `api/src/zones/plan-suggestions.spec.ts`, `api/src/queue/plan-analysis.processor.spec.ts`

**Interfaces:**
- Produces (plan-suggestions.ts) : `cellCode(prefix: string, row: number, col: number, cols: number): string` ; `PlanSuggestion.cellPrefix?: string | null` ; `nameBlocks(blocks: RawBlock[], takenNames: string[], takenPrefixes: string[]): PlanSuggestion[]`.
- Produces (zone.ts) : `gridCodes(grid, prefix: string | null): string[]` (null → « A ») ; `cellNamesFor(input, grid, prefix: string | null)` ; `keptCellNames(names, grid, prefix: string | null)` ; `suggestPrefix(name: string, taken: Iterable<string>): string | null` ; `renamePrefix<T>(map: Record<string, T>, from: string, to: string): Record<string, T>` ; `type CellBox = [number, number, number, number]` ; `type CellBoxes = Record<string, CellBox>` ; `ZoneView.cellPrefix: string | null`, `ZoneView.cellBoxes: CellBoxes` ; constantes `CELL_PREFIX_TAKEN`, `NO_FREE_PREFIX`, `INVALID_CELL_PREFIX = 'La lettre des cases est une lettre de A à Z'`, `CELL_CODES_TAKEN = 'Des bouteilles sont déjà rangées sous ces codes dans cette zone'` ; `cellPrefix` facultatif (`^[A-Za-z]$`, mis en majuscule) dans `updateZoneSchema` et `acceptSuggestionSchema`.

- [ ] **Step 1: Migration et schéma**

`migration.sql`, en tête un commentaire dans le style de `20261024000000_noms_cases` :
```sql
ALTER TABLE "cave_zone" ADD COLUMN "cell_prefix" TEXT;
ALTER TABLE "cave_zone" ADD CONSTRAINT "cave_zone_cell_prefix_check" CHECK ("cell_prefix" IS NULL OR "cell_prefix" ~ '^[A-Z]$');
CREATE UNIQUE INDEX "cave_zone_cave_id_cell_prefix_key" ON "cave_zone" ("cave_id", "cell_prefix") WHERE "archived_at" IS NULL AND "cell_prefix" IS NOT NULL;
ALTER TABLE "cave_zone" ADD COLUMN "cell_boxes" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "cave_zone" ADD CONSTRAINT "cave_zone_cell_boxes_check" CHECK (jsonb_typeof("cell_boxes") = 'object');
```
Schéma : `cellPrefix String? @map("cell_prefix")` et `cellBoxes Json @default("{}") @map("cell_boxes")` avec `///` comme les voisins ; mettre à jour le commentaire de `gridRows` (codes `<lettre><n>`). Puis `cd api && npx prisma generate`.

- [ ] **Step 2: Tests unitaires qui échouent**

`zone.spec.ts` (adapter les appels existants à la nouvelle signature, grille 3 × 4 → codes `C1…C12` avec la lettre « C ») :
```ts
expect(gridCodes({ rows: 2, cols: 3 }, 'C')).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
expect(gridCodes({ rows: 4, cols: 12 }, 'A').at(-1)).toBe('A48');
expect(gridCodes({ rows: 1, cols: 2 }, null)).toEqual(['A1', 'A2']);
expect(gridCodes(null, 'A')).toEqual([]);
// suggestPrefix
expect(suggestPrefix('Casier C', [])).toBe('C');
expect(suggestPrefix('casier c', [])).toBe('C');
expect(suggestPrefix('Casier C', ['C'])).toBe('A');
expect(suggestPrefix('Champagnes', ['A', 'B'])).toBe('C');
expect(suggestPrefix('Mur AB', [])).toBe('A');          // pas une lettre seule
expect(suggestPrefix('X', [])).toBe('A');               // pas précédée d'une espace
expect(suggestPrefix('Casier Z', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))).toBeNull();
// renamePrefix : seules les clés <from><n> changent
expect(renamePrefix({ A1: 'x', A12: 'y', B3: 'z' }, 'A', 'C')).toEqual({ C1: 'x', C12: 'y', B3: 'z' });
// cellNamesFor / keptCellNames avec lettre
expect(cellNamesFor({ c5: ' Loire ' }, { rows: 2, cols: 3 }, 'C')).toEqual({ C5: 'Loire' });
fails(() => cellNamesFor({ A1: 'x' }, { rows: 2, cols: 3 }, 'C'), UNKNOWN_CELL);
expect(updateZoneSchema.parse({ cellPrefix: 'c' }).cellPrefix).toBe('C');
// 'CC', '1', 'É' → INVALID_CELL_PREFIX
```
`plan-suggestions.spec.ts` :
```ts
expect(cellCode('C', 1, 0, 12)).toBe('C13');
const [s] = nameBlocks([{ ...block('CASIER', 0.1), rows: 2, cols: 3, cells: [
  { box: [0, 0, 0.1, 0.1], row: 1, col: 2, name: null }, { box: [0.2, 0, 0.3, 0.1], row: null, col: 0, name: null }] }], [], ['A']);
expect(s.name).toBe('Casier B');
expect(s.cellPrefix).toBe('B');
expect(s.cells!.map((c) => c.name)).toEqual(['B6', null]);
```
Les tests `unitsToBlocks` qui comparaient des noms comparent désormais `[row, col]` (et `name` vaut `null`). Processeur : `nameBlocks` reçoit les lettres des zones actives.

- [ ] **Step 3: Vérifier l'échec**

Run: `cd api && npx jest src/zones/zone.spec.ts src/zones/plan-suggestions.spec.ts src/queue/plan-analysis.processor.spec.ts`
Expected: FAIL (fonctions absentes ou mauvaise signature).

- [ ] **Step 4: Implémenter**

- `cellCode` dans `plan-suggestions.ts` (zone.ts l'importe déjà de là : pas d'import circulaire) ; `gridCodes` s'appuie dessus.
- `suggestPrefix` : `/\s([A-Za-z])$/` sur le nom sans espaces autour ; lettre libre → elle ; sinon première libre de A à Z ; aucune → null.
- `nameBlocks` : une lettre est « employée » si un nom `<Type> <lettre>` est pris (règle actuelle) **ou** si elle figure dans `takenPrefixes` ; `cellPrefix` = la lettre si elle fait un caractère, sinon null ; nom de chaque case = `cellCode(prefix, row, col, b.cols)` quand `prefix`, `row`, `col` sont connus et dans la grille, sinon null.
- `unitsToBlocks` rend `name: null` (mettre à jour son commentaire et celui de `DetectedCell`).
- `zoneView` : `cellPrefix`, `cellBoxes` (objet JSON garanti par le CHECK) ; commentaire de `ZoneView` mis à jour.
- Appelants : `zones.service.ts` et `plan.service.ts` passent `current.cellPrefix` / `null` pour l'instant (la logique complète vient en Task 2) ; le processeur lit `select: { name: true, cellPrefix: true }`.

- [ ] **Step 5: Vérifier**

Run: `cd api && npx jest src/zones/zone.spec.ts src/zones/plan-suggestions.spec.ts src/queue/plan-analysis.processor.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, aucune erreur de type.

- [ ] **Step 6: Commit**

```bash
git add api/prisma api/src/zones api/src/queue
git commit -m "feat(api): lettre des cases et codes numérotés par casier (migration cases_visuelles)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Règles api — acceptation, modification, repère, plan, repères et emplacements

**Files:**
- Modify: `api/src/zones/plan.service.ts` (`acceptSuggestion`, `remove`, `list`), `api/src/zones/zones.service.ts` (`update`, `setMarker`, `removeMarker`), `api/src/zones/zone.ts` (`PlanMarker`), `api/src/locations/location.ts` (`Place`, `placesOf`)
- Test: `api/src/zones/plan.e2e.spec.ts`, `api/src/zones/zones.e2e.spec.ts`, `api/src/locations/location.spec.ts` (et les e2e qui comparent des `Place` entiers : ajouter `casier`)

**Interfaces:**
- Consumes: Task 1 (helpers, constantes, `ZoneView`).
- Produces: `PlanMarker` gagne `cellBoxes: CellBoxes; cellNames: CellNames` ; `Place` gagne `casier: string | null` (null pour « Sans emplacement ») ; `POST …/suggestions/:sid/accept` accepte `cellPrefix?` ; `PATCH …/zones/:id` accepte `cellPrefix?`.

- [ ] **Step 1: Tests e2e qui échouent**

Dans `plan.e2e.spec.ts` (bloc « propositions de zones » ; donner des `cells` à une proposition de test, ex. 2 × 3 avec une case `row: 1, col: 2`, une `row: null`, une `row: 5`) :
- `accepter avec cellPrefix « C » : zone cellPrefix C, cellBoxes { C6: <cadre> } seulement (case sans rangée et hors grille ignorées), repère au centre du cadre`.
- `accepter avec des colonnes changées (3 → 2) : la case row 1, col 1 est enregistrée sous C4`.
- `accepter sans cellPrefix, nom « Casier D » : lettre D ; nom « Champagnes » avec A et B prises : lettre C`.
- `proposition d'avant la 2.27 (sans cellPrefix, cases « B3 ») : lettre automatique, positions par row/col`.
- `lettre prise : 409 « Cette lettre est déjà prise par une autre zone », rien n'est écrit (proposition toujours là)`.
- `26 lettres prises : 409 « Plus de lettre libre pour les cases (26 casiers au plus) »`.
- `GET plans : le repère d'une zone acceptée porte cellBoxes et cellNames`.
- `supprimer le plan efface repère et cellBoxes des zones`.

Dans `zones.e2e.spec.ts` (ajouter `cellPrefix`, `cellBoxes` à la liste de clés et au `toEqual` existants) :
- `PATCH grid sur une zone sans lettre : lettre choisie (« Casier F » → F)` ; `PATCH grid null : cellPrefix null, cellNames {}, cellBoxes {}`.
- `PATCH cellPrefix A → C : clés de cellNames et cellBoxes renommées, emplacements « a5 » et « A40 » de la zone deviennent C5 et C40, « Loire » inchangé, emplacement d'une autre zone inchangé ; le stock suit (GET wine places)`.
- `PATCH cellPrefix vers une lettre où un emplacement « C5 » existe déjà dans la zone : 409 « Des bouteilles sont déjà rangées sous ces codes dans cette zone », rien ne change`.
- `PATCH même grille (rows et cols identiques) + name : cellBoxes gardées` ; `PATCH grille 4 × 12 → 4 × 10 : cellBoxes {}, noms des codes encore présents gardés`.
- `PATCH name seul : la lettre ne change pas`.
- `deux zones actives ne partagent pas une lettre (409) ; une zone archivée libère sa lettre`.
- `zone d'avant la 2.27 (lettre NULL posée en base, grille 2 × 2, noms { B2: 'x', A1: 'y' }) : PATCH de la même grille → lettre L attribuée (200), noms gardés = ceux dont la clé est un code de L (« B2 » n'en est jamais un pour une grille de 4 cases avec L ≠ B)`.
- `DELETE marker : cellBoxes {}` ; `PUT marker sur un autre plan : cellBoxes {}` ; `PUT marker sur le même plan : cellBoxes gardées`.
- `PATCH cellPrefix 'CC' : 400 « La lettre des cases est une lettre de A à Z »`.

`location.spec.ts` : `placesOf` rend `casier` (null pour « Sans emplacement »).

- [ ] **Step 2: Vérifier l'échec**

Run: `cd api && DATABASE_URL=postgresql://postgres:dev@localhost:5432/cave_test REDIS_URL=redis://localhost:6379 npx jest src/zones src/locations/location.spec.ts`
Expected: FAIL sur les nouveaux cas.

- [ ] **Step 3: Implémenter**

- **Lettres prises** : dans chaque transaction qui pose une lettre, lire les `cell_prefix` des zones actives de la cave sauf celle-ci ; lettre demandée prise → `ConflictException(CELL_PREFIX_TAKEN)` ; choix automatique par `suggestPrefix(name, taken)`, null → `ConflictException(NO_FREE_PREFIX)`. Course entre deux écritures : P2002 sur l'index `cave_zone_cave_id_cell_prefix_key` → `CELL_PREFIX_TAKEN` (vérifier dans un test ce que Prisma met dans `e.meta.target` pour cet index partiel, et distinguer de `cave_zone_cave_id_name_key` → `ZONE_NAME_TAKEN`).
- **`acceptSuggestion`** : lettre = `input.cellPrefix ?? s.cellPrefix ?? suggestPrefix(input.name, taken)` (la vérification de `cellNamesFor` passe après le choix, avec cette lettre) ; `cellBoxes` = pour chaque case `row`/`col` entiers, `row < input.rows`, `col < input.cols` → `cellCode(prefix, row, col, input.cols)`: `box`.
- **`update`** (passe en `$transaction` sous `lockOwn`, la zone est relue sous verrou) :
  - `grid'` = `input.grid` si fourni, sinon la grille actuelle ; `gridChanged` = fourni et lignes ou colonnes différentes.
  - `prefix'` = null sans grille ; sinon `input.cellPrefix ?? current.cellPrefix ?? suggestPrefix(name', taken)`.
  - `prefixChanged` = `current.cellPrefix != null && prefix' != null && prefix' !== current.cellPrefix`.
  - `cellNames'` = `input.cellNames` vérifiés avec `prefix'` ; sinon, si grille ou lettre changent, `keptCellNames(prefixChanged ? renamePrefix(current, old, new) : current, grid', prefix')`.
  - `cellBoxes'` = `{}` sans grille ou si `gridChanged` ; renommées si `prefixChanged` ; sinon inchangées.
  - Si `prefixChanged` : `UPDATE location SET casier = ${new} || substring(casier from 2) WHERE zone_id = ${id} AND casier ~* ${'^' + old + '[1-9][0-9]*$'}` ; P2002 sur `location` → `ConflictException(CELL_CODES_TAKEN)`.
- **`setMarker`** : `cellBoxes: {}` quand `marker.planId` diffère du plan actuel ; **`removeMarker`** et **`PlanService.remove`** : `cellBoxes: {}` avec le repère.
- **`PlanService.list`** : chaque repère porte `cellBoxes` et `cellNames` de sa zone.
- **`placesOf`** : `casier: g.location.casier` (et `casier: null` pour « Sans emplacement ») ; commentaire de `Place` mis à jour.

- [ ] **Step 4: Vérifier**

Run: `cd api && DATABASE_URL=postgresql://postgres:dev@localhost:5432/cave_test REDIS_URL=redis://localhost:6379 npx jest && npx tsc --noEmit -p tsconfig.json`
Expected: toute la suite PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src
git commit -m "feat(api): positions des cases gardées à l'acceptation, lettre modifiable et emplacements renommés" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Web — codes, types et formulaires (Modifier la zone, Proposition, rangement)

**Files:**
- Modify: `web/src/lib/grid.ts`, `web/src/lib/api-client.ts`, `web/src/components/CellNamesFields.tsx`, `web/src/components/LocationFields.tsx`, `web/src/pages/MaCavePage.tsx` (`GridFields`, `ZoneForm`, `ZoneRow`, `ZonesCard`, `ProposalForm`, appel `acceptSuggestion`)
- Test: `web/src/lib/grid.test.ts`, `web/src/pages/MaCavePage.test.tsx`, `web/src/components/LocationFields.test.tsx`

**Interfaces:**
- Consumes: Task 2 (formes JSON).
- Produces (grid.ts) : `cellNames(rows: number, cols: number, prefix: string): string[]` ; `cellsPreview(rows: number, cols: number, prefix: string): string` ; `cleanCellNames(names, grid, prefix: string)` ; `cellCode(prefix: string, row: number, col: number, cols: number): string` ; `suggestPrefix(name: string, taken: Iterable<string>): string | null` ; `renamePrefix(names: CellNameMap, from: string, to: string): CellNameMap` (mêmes règles que l'api). `prefix` est obligatoire : chaque appelant passe `zone.cellPrefix ?? 'A'`.
- Produces (api-client.ts) : `Zone.cellPrefix?: string | null`, `Zone.cellBoxes?: Record<string, [number, number, number, number]>` ; `PlanMarker.cellBoxes?`, `PlanMarker.cellNames?` ; `PlanSuggestion.cellPrefix?: string | null` ; `Place.casier?: string | null` ; `updateZone` et `acceptSuggestion` acceptent `cellPrefix?: string`. Champs facultatifs : une api d'avant la 2.27 ne les rend pas.

- [ ] **Step 1: Tests qui échouent**

`grid.test.ts` :
```ts
expect(cellNames(2, 3, 'C')).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
expect(cellNames(26, 30, 'A').at(-1)).toBe('A780');
expect(cellsPreview(4, 12, 'C')).toBe('Cases C1 à C48');
expect(cellsPreview(1, 1, 'B')).toBe('Case B1');
expect(cellCode('C', 1, 0, 12)).toBe('C13');
expect(cleanCellNames({ C1: ' x ', A1: 'y' }, { rows: 1, cols: 2 }, 'C')).toEqual({ C1: 'x' });
expect(suggestPrefix('Casier C', ['C'])).toBe('A');
expect(renamePrefix({ A1: 'x', B3: 'z' }, 'A', 'C')).toEqual({ C1: 'x', B3: 'z' });
```
`MaCavePage.test.tsx` :
- `Modifier la zone : champ « Lettre des cases » prérempli (C), aperçu « Cases C1 à C48 », noms « Nom de la case C1 »… ; changer en D renomme les champs (le nom saisi en C5 passe en D5) et envoie { grid, cellPrefix: 'D', cellNames: { D5: … } }`.
- `zone sans lettre, nommée « Casier F », F libre : le champ est prérempli F` ; `lettre « 1 » : Enregistrer désactivé` ; `sans grille : pas de champ lettre`.
- `Proposition (cellPrefix C, cases row/col) : aperçu « Cases C1 à C6 », points nommés C1…, Accepter envoie cellPrefix 'C'` ; `colonnes changées : les points se renomment (row 1, col 1 → C4 pour 2 colonnes)`.

`LocationFields.test.tsx` : zone `cellPrefix: 'C'`, grille 2 × 2 → boutons « Case C1 »…« Case C4 », datalist avec C1…C4 ; zone sans `cellPrefix` → A1…A4.

- [ ] **Step 2: Vérifier l'échec**

Run: `cd web && npx vitest run src/lib/grid.test.ts src/pages/MaCavePage.test.tsx src/components/LocationFields.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

- `grid.ts` : signatures ci-dessus ; commentaire d'en-tête du calcul (linéaire, comme `api/src/zones/zone.ts`).
- `CellNamesFields` et `CellNamesEditor` reçoivent `prefix: string` (l'éditeur le lit sur `zone.cellPrefix ?? 'A'`).
- `LocationFields` : `cellNames(grid.rows, grid.cols, selected.cellPrefix ?? 'A')`.
- `GridFields` reçoit `prefix` pour l'aperçu. `ZoneForm` (« Modifier » seulement, avec grille) : champ « Lettre des cases » (`maxLength={1}`, `autoCapitalize="characters"`, mis en majuscule), prérempli `initial.cellPrefix ?? suggestPrefix(name, takenPrefixes) ?? ''` ; lettre courante valide = `/^[A-Z]$/` ; un changement de lettre valide applique `renamePrefix` aux noms en cours ; lettre invalide → bouton désactivé ; envoi `{ grid, cellPrefix, cellNames }`. `ZonesCard` passe à `ZoneRow` les lettres des autres zones (`takenPrefixes`).
- `ProposalForm` : `prefix = suggestion.cellPrefix ?? suggestPrefix(name, takenPrefixes) ?? 'A'` ; la suggestion passée à `PlanView` a ses `cells` renommées par `cellCode(prefix, row, col, grid.cols)` (null hors grille ou grille invalide) ; `onAccept` envoie `cellPrefix: prefix`.

- [ ] **Step 4: Vérifier**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: PASS, aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): cases numérotées par casier et champ « Lettre des cases »" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: PlanView — les cases d'une zone acceptée au lieu de son repère

**Files:**
- Modify: `web/src/components/PlanView.tsx`, `web/src/styles/base.css`, `web/src/pages/MaCavePage.tsx` (recadrage de `ProposalForm` repris par `PlanCrop`)
- Test: `web/src/components/PlanView.test.tsx`

**Interfaces:**
- Consumes: `PlanMarker.cellBoxes`, `PlanMarker.cellNames` (Task 3).
- Produces: `PlanView` prop `highlightCell?: string | null` (code mis en évidence, dans la zone `highlightZoneId`) ; `export function PlanCrop({ box, plan, maxHeight, children }: { box: [number, number, number, number]; plan: Pick<CavePlan, 'width' | 'height'>; maxHeight?: string; children: ReactNode })` — le recadrage CSS actuel de `ProposalForm` (classes `plan-crop`, `plan-crop__inner`), réutilisé tel quel par `ProposalForm` et la Task 5.

- [ ] **Step 1: Tests qui échouent**

- `repère avec cellBoxes : un point par case, nommé par son nom donné sinon son code, au centre du cadre en pourcentage ; pas de repère numéroté`.
- `avec onMarkerClick : chaque case est un bouton « Zone 2 : Casier C, case Champagnes (C1) » qui appelle onMarkerClick(zoneId), sans toucher au plan`.
- `sans action : les cases d'une zone sont dans une image nommée « Zone 2 : Casier C », pas des boutons`.
- `highlightZoneId : les cases de la zone portent la classe de mise en avant ; highlightCell « C5 » : cadre de la case, point plus gros, nom affiché (classe plan-view__zone-cell--current)`.
- `repère sans cellBoxes ({} ou absent) : repère numéroté comme avant`.

- [ ] **Step 2: Vérifier l'échec**

Run: `cd web && npx vitest run src/components/PlanView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

Repère dont `Object.keys(cellBoxes ?? {}).length > 0` → ses cases (point au centre, nom ; mêmes styles que les cases d'une proposition ouverte, classe `plan-view__zone-cell`) au lieu du repère ; la case `highlightCell` de la zone mise en évidence (couleur d'accent existante). Extraire `PlanCrop` de `ProposalForm` sans changer son rendu. Mettre à jour le commentaire de `PlanView`.

- [ ] **Step 4: Vérifier**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): les cases d'une zone restent sur le plan après acceptation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Vignette de l'emplacement sur la fiche vin

**Files:**
- Modify: `web/src/components/PlanView.tsx` (nouvelle `PlaceThumbnail`), `web/src/components/LocationsBlock.tsx` (`PlaceItem`, `PlaceDetails`), `web/src/styles/base.css`
- Test: `web/src/pages/WinePage.locations.test.tsx` (et `web/src/components/PlanView.test.tsx` pour le calcul du cadre)

**Interfaces:**
- Consumes: `PlanCrop`, `highlightCell` (Task 4), `Place.casier`, `cellCodeOf` (`web/src/lib/grid.ts`).
- Produces: `thumbnailBox(marker: PlanMarker): [number, number, number, number]` (exportée pour test) et `PlaceThumbnail({ zoneId, casier, label }: { zoneId: string; casier: string | null; label: string })` qui rend `null` quand la zone n'a pas de repère.

- [ ] **Step 1: Tests qui échouent**

`thumbnailBox` :
```ts
// cases : englobant + 0,04, coupé à l'image
expect(thumbnailBox({ ...m, cellBoxes: { C1: [0.1, 0.2, 0.2, 0.3], C2: [0.5, 0.6, 0.98, 0.7] } })).toEqual([0.06, 0.16, 1, 0.74]);
// repère seul : 40 % × 40 % centré, décalé pour rester dans l'image
expect(thumbnailBox({ ...m, x: 0.5, y: 0.5, cellBoxes: {} })).toEqual([0.3, 0.3, 0.7, 0.7]);
expect(thumbnailBox({ ...m, x: 0.05, y: 0.9, cellBoxes: {} })).toEqual([0, 0.6, 0.4, 1]);
```
(Comparer avec `toBeCloseTo` élément par élément si les flottants l'exigent.)
`WinePage.locations.test.tsx` :
- `case connue (casier « champagnes », nommée C15) : vignette « Plan : Casier C / Champagnes (C15) » affichée sans toucher, case C15 en évidence, légende « … × 2 »`.
- `casier « Loire » (hors grille) : même recadrage, aucune case en évidence`.
- `zone avec repère sans cases : vignette autour du repère, repère en évidence`.
- `zone sans repère, ou « Sans emplacement » : texte seul, plans non lus`.
- `toucher la vignette montre l'indication, la photo et le plan entier de la zone ; membre en lecture seule : idem`.
- `fenêtre « Emplacement » : vignette, la toucher montre le plan entier`.

- [ ] **Step 2: Vérifier l'échec**

Run: `cd web && npx vitest run src/pages/WinePage.locations.test.tsx src/components/PlanView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

`PlaceThumbnail` lit `usePlans()` (déjà activé seulement si `zone.marker`), trouve le repère et le plan, `code = cellCodeOf(casier, marker.cellNames)?.trim().toUpperCase()`, `highlightCell = code && marker.cellBoxes?.[code] ? code : null` ; rend `PlanCrop` (hauteur bornée, ex. 40vh) contenant un `PlanView` sans action avec ce seul repère, `highlightZoneId`, `highlightCell`, `alt="Plan : <label>"`. Dans `PlaceItem`, quand la vignette existe, elle (avec la légende `label × quantité`) devient le bouton du dépliant (`aria-expanded`) ; sinon comportement actuel. `PlaceDetails` : vignette en bouton qui montre `ZonePlan` dessous.

- [ ] **Step 4: Vérifier**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): vignette du plan recadrée sur la case de la bouteille dans la fiche vin" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: README

**Files:**
- Modify: `README.md` (Fonctionnalités : lignes ~160–210 « grille », « Noms des cases », analyse lignes ~295–310, Emplacements de la fiche ; « Mise à jour »)

- [ ] **Step 1: Décrire la fonctionnalité**

Remplacer partout la description « A1, A2… pour la première ligne, B1… » par les codes `<lettre><n>` rangée par rangée (A1 en haut à gauche, A13 au début de la 2ᵉ rangée pour 12 colonnes), l'aperçu « Cases C1 à C48 », le champ « Lettre des cases » (choix automatique, unicité, renommage des noms, positions et emplacements, effacement au retrait de la grille), les points gardés sur le plan après acceptation, et la vignette de la fiche vin (trois cas, légende, toucher = plan entier).

- [ ] **Step 2: Section « Passage à la 2.27.0 (cases numérotées par casier) »**

Insérer avant « Passage à la 2.24.0 », dans le style de celle-ci : migration additive `20261025000000_cases_visuelles` (colonnes `cell_prefix`, `cell_boxes`, index unique partiel, contraintes), commande de sauvegarde `cave-avant-2.27.0.sql.gz`, puis **à faire après la mise à jour** : supprimer dans *Ma cave › Zones* les zones à grille existantes, puis relancer l'analyse du plan (menu ⋯ › Relancer l'analyse) et accepter les propositions ; tant qu'elles existent, ces zones montrent leurs cases avec la lettre A. Retour arrière vers 2.26.x : colonnes ignorées, codes lus comme « rangée + colonne ».

- [ ] **Step 3: Vérifier**

Run: `git diff --stat README.md && grep -n "Passage à la 2.27.0" README.md`
Expected: seule `README.md` modifiée ; aucune entrée datée du journal ni `CHANGELOG.md` touchés.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: cases numérotées par casier, points gardés sur le plan et passage à la 2.27.0" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
