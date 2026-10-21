# Propositions de zones à partir de la photo du plan — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemini analyse chaque photo de plan et propose des zones (blocs) avec leur grille de cases ; on les accepte d'un toucher, puis on range une bouteille en touchant une case.

**Architecture:** colonnes `analysis_status` / `suggestions` sur `cave_plan`, `grid_rows` / `grid_cols` sur `cave_zone` ; tâche BullMQ `plan-analysis` exécutée par le worker avec le fournisseur Gemini existant ; routes accepter / rejeter / cases occupées ; web : cadres en pointillés, feuille de proposition, grille dans `LocationFields`.

**Tech Stack:** NestJS, Prisma, PostgreSQL, BullMQ, Gemini (`@google/genai` déjà utilisé par `gemini-vision.provider.ts`), React 18, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-ma-cave-propositions-zones-design.md`

## Global Constraints

- Textes exacts de la spec : « Analyse du plan en cours… », « Les zones n’ont pas pu être proposées. Placez-les à la main. », « N zones proposées : touchez-les pour les accepter. » (« 1 zone proposée : touchez-la pour l’accepter. »), « Casier A · 24 cases », « Proposition », « Accepter », « Rejeter », « Proposition introuvable », usage « Analyse du plan ».
- Noms : `CASIER` → « Casier X », `ETAGERE` → « Étagère X », `AUTRE` → « Rangement X » ; cases ligne `A+i`, colonne `j+1`.
- Bornes : lignes 1–26, colonnes 1–30, au plus 12 blocs, `box` en fractions 0–1 avec `x0 < x1`, `y0 < y1`.
- L'analyse ne bloque jamais rien : erreurs visibles seulement par l'état du plan.
- Gemini : réutiliser le fournisseur, le journal (`GeminiJournal`), la pause commune et le budget existants ; nouvel usage `ANALYSE_PLAN`.
- Base de test : uniquement `postgresql://postgres:dev@localhost:5432/cave_test_plans` ; migration SQL à la main appliquée par `prisma migrate deploy`.
- Vérifs api : `npx tsc --noEmit && npx eslint src --quiet && npx jest && npm run build` ; web : `npx vitest run && npx tsc --noEmit -p . && npx eslint src --quiet && npm run build`.
- Commits en français, style conventionnel, une seule ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Photo remplacée pendant qu'une analyse tourne : l'ancienne analyse n'écrase jamais les propositions de la nouvelle photo (test Task 2).
2. Accepter la même proposition deux fois (double toucher, deux appareils) : une seule zone créée, le second appel reçoit 404 « Proposition introuvable » (test Task 1).
3. Réponse de Gemini avec un cadre hors bornes, inversé ou 0 case : bloc ignoré, les autres gardés (test Task 2).
4. Zone avec grille dont on réduit la grille alors que des bouteilles sont dans une case disparue : rien n'est perdu, la case occupée reste lisible dans la grille de rangement comme valeur libre (test Task 4 : la grille affiche les cases de la grille, et le champ garde la valeur libre).
5. Lettre déjà prise par une zone archivée : n'est pas sautée (seules les zones actives comptent) ; lettre prise par une zone active de casse différente (« casier a ») : sautée (test Task 1, nommage).

---

### Task 1: Données, nommage, accepter / rejeter, grille, cases occupées (api)

**Files:**
- Create: `api/prisma/migrations/20261021000000_propositions_zones/migration.sql`, `api/src/zones/plan-suggestions.ts` (nommage et validation, + spec unitaire), `api/src/prisma/propositions-zones.migration.integration.spec.ts`
- Modify: `api/prisma/schema.prisma`, `api/src/zones/zone.ts`, `api/src/zones/plan.service.ts`, `api/src/zones/plan.controller.ts`, `api/src/zones/zones.service.ts`, `api/src/zones/zones.controller.ts`, `api/src/zones/plan.e2e.spec.ts`, `api/src/zones/zones.e2e.spec.ts`, `api/src/caves.isolation.e2e.spec.ts`

**Interfaces:**
- Produces :
  - `type SuggestionKind = 'CASIER' | 'ETAGERE' | 'AUTRE'`; `interface RawBlock { kind: SuggestionKind; box: [number, number, number, number]; rows: number; cols: number }`; `interface PlanSuggestion extends RawBlock { id: string; name: string }`.
  - `validBlocks(raw: unknown): RawBlock[]` (ignore les invalides, garde 12 au plus) ; `nameBlocks(blocks: RawBlock[], takenNames: string[]): PlanSuggestion[]` (tri `x0` puis `y0`, lettres libres, id uuid) — utilisés par Task 2.
  - `PlanMeta` gagne `analysis: 'NONE' | 'PENDING' | 'DONE' | 'FAILED'` et `suggestions: PlanSuggestion[]`.
  - `ZoneView.grid: { rows: number; cols: number } | null`.
  - Routes de la spec (accept, delete suggestion, PATCH zone `grid`, GET cells).
  - `PlanService.setAnalysis(planId, expectedUpdatedAt, result: { status: 'DONE'; suggestions } | { status: 'FAILED' })` : écrit seulement si `updated_at` du plan vaut encore `expectedUpdatedAt` — utilisé par Task 2.

- [ ] **Step 1: Migration** (ajout seulement : `analysis_status TEXT NOT NULL DEFAULT 'NONE'` avec CHECK des quatre valeurs, `suggestions JSONB NOT NULL DEFAULT '[]'`, `grid_rows`, `grid_cols` INTEGER avec CHECK tous deux nuls ou bornés 1–26 / 1–30), spec d'intégration au modèle des précédentes.
- [ ] **Step 2: Tests unitaires de `plan-suggestions.ts`** : tri, « Casier A » puis « Étagère B », saut de « Casier A » pris par une zone active « casier a », lettre d'une zone archivée non sautée (l'appelant ne passe que les zones actives), bloc invalide ignoré, 13 blocs → 12.
- [ ] **Step 3: Tests e2e** : `GET plans` expose `analysis`/`suggestions` ; accept (zone créée en fin de liste, repère au centre du cadre, grille, proposition retirée, 201) ; double accept → 404 « Proposition introuvable » (Review Focus 2) ; nom pris → 409 ; reject 204 ; PATCH grid et `grid: null` ; GET cells `[{ casier: 'B3', quantity: 2 }]` ; autre cave → 404 « Plan introuvable » ; membre → 403. Matrice d'isolation : toutes les nouvelles routes classées.
- [ ] **Step 4: Lancer** → FAIL ; **Step 5: Implémenter** (accept sous verrou du plan, `FOR UPDATE`, retrait de la proposition et création de la zone dans la même transaction) ; **Step 6: Vérifs api** → vertes ; **Step 7: Commit** — `feat(api): propositions de zones sur un plan, grille des zones`

### Task 2: Analyse par Gemini (api, worker)

**Files:**
- Create: `api/src/queue/plan-analysis.ts` (file, tâche, traitement) + specs
- Modify: `api/src/vision/vision-provider.interface.ts`, `api/src/vision/gemini-vision.provider.ts` (+ spec), `api/src/vision/gemini-journal.ts` (`ANALYSE_PLAN`), `api/src/queue/queue.module.ts`, `api/src/worker.ts` si besoin, `api/src/zones/plan.service.ts` (mise en file après création / remplacement), `api/src/admin/*` si la liste des usages y est validée

**Interfaces:**
- Consumes : `validBlocks`, `nameBlocks`, `PlanService.setAnalysis` (Task 1).
- Produces : `VisionProvider.analyzePlan(image: Buffer, mimeType: string): Promise<{ blocks: unknown; costCents: number }>` (sortie brute, validée par l'appelant) ; usage `ANALYSE_PLAN`.

- [ ] **Step 1: Tests (échouent)** : le fournisseur envoie l'image avec le schéma de sortie et journalise `ANALYSE_PLAN` ; le traitement : succès → `DONE` + propositions nommées (zones actives prises en compte) ; zéro bloc → `DONE` + `[]` ; réponse inexploitable → `FAILED` ; bloc invalide parmi d'autres ignoré (Review Focus 3) ; plan supprimé → abandon sans erreur ; photo remplacée entre la mise en file et l'écriture → rien écrit (Review Focus 1) ; pause Gemini active → tâche reportée sans appel ; refus 503/429 → reprise patiente comme les autres tâches (réutiliser `transient-failure.ts`) puis `FAILED` après épuisement ; création et remplacement de plan → `PENDING` + une tâche en file.
- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** (consigne Gemini en français ou anglais, sortie structurée `{ blocks: [{ kind, box: [x0,y0,x1,y1], rows, cols }] }`, coordonnées normalisées 0–1) ; **Step 4: Vérifs api** → vertes ; **Step 5: Commit** — `feat(api): analyse du plan par Gemini en arrière-plan`

### Task 3: Web — propositions sur le plan, grille d'une zone, coûts

**Files:**
- Modify: `web/src/lib/api-client.ts`, `web/src/components/PlanView.tsx`, `web/src/pages/MaCavePage.tsx`, `web/src/components/admin/GeminiUsageSection.tsx`, `web/src/styles/base.css` (+ tests)

**Interfaces:**
- Consumes : HTTP de Task 1 ; `BottomSheet` existant.
- Produces : `acceptSuggestion(planId, sid, { name, rows, cols })`, `rejectSuggestion(planId, sid)`, `getZoneCells(zoneId)`, `updateZone(id, { …, grid })` ; `cellNames(rows, cols): string[]` dans `web/src/lib/grid.ts` (utilisé par Task 4).

- [ ] **Step 1: Tests (échouent)** : `PENDING` → texte et relecture toutes les 10 s (fake timers) ; `FAILED` → texte ; `DONE` → cadres (bouton « Proposition Casier A », étiquette « Casier A · 24 cases »), phrase « 3 zones proposées… » / singulier ; feuille « Proposition » (Nom, Lignes, Colonnes, aperçu « Cases A1 à F4 ») → Accepter appelle `acceptSuggestion` avec les valeurs modifiées ; Rejeter → `rejectSuggestion` ; erreur 409 dans la feuille ; toucher hors cadre pose toujours un « + » ; Modifier la zone : Lignes / Colonnes → `updateZone(..., { grid: { rows, cols } })`, vides → `grid: null` ; `cellNames(2, 3)` → `['A1','A2','A3','B1','B2','B3']` ; coûts : usage « Analyse du plan » avec sa couleur et sa légende.
- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** ; **Step 4: Vérifs web** → vertes ; **Step 5: Commit** — `feat(web): propositions de zones sur le plan et grille des zones`

### Task 4: Web — ranger une bouteille dans une case

**Files:**
- Modify: `web/src/components/LocationFields.tsx` (+ test), `web/src/styles/base.css`

**Interfaces:**
- Consumes : `cellNames` (Task 3), `getZoneCells` (Task 3), `Zone.grid`.

- [ ] **Step 1: Tests (échouent)** : zone avec grille 2 × 3 choisie → grille de 6 boutons (« A1 »…), case occupée « B3 · 2 », toucher « A2 » remplit Casier = « A2 » et le marque `aria-pressed` ; datalist du champ Casier contient les cases plus les valeurs déjà utilisées ; zone sans grille → aucune grille ; saisie libre conservée ; valeur hors grille (« Z9 ») gardée dans le champ (Review Focus 4) ; la requête des cases n'est lancée que pour une zone avec grille.
- [ ] **Step 2: Lancer** → FAIL ; **Step 3: Implémenter** (grille en CSS grid, cibles 48 px, défilement horizontal interne) ; **Step 4: Vérifs web** → vertes ; **Step 5: Commit** — `feat(web): ranger une bouteille en touchant une case`

### Task 5: Documentation et vérification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README** — propositions de zones (analyse automatique, états, accepter / rejeter), grille des zones, grille de rangement, nouvel usage dans les coûts, nouvelles routes, section « Passage à la 2.16.0 » (migration automatique, ajout seulement). Pas de modification des entrées datées ni du CHANGELOG.
- [ ] **Step 2: Vérification navigateur** (contrôleur) : plan d'essai, propositions injectées en base si Gemini n'est pas disponible localement, acceptation, grille de rangement à 375 px.
- [ ] **Step 3: Commit** — `docs: propositions de zones à partir de la photo du plan`
