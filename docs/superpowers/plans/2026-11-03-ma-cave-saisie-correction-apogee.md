# Saisie fiable, correction des vins, filtres, stats et apogée IA — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plus aucun vin silencieusement sans région ni apogée, la quantité choisie dès la photo, un vin mal saisi corrigeable (avec fusion des doublons), un filtre région et un filtre millésime sur une année, des stats par année et « Hors de France ».

**Architecture:** La caractérisation par lots existante (`wine_traits`, usage Gemini `CARACTERISATION`) renvoie en plus une région (liste fermée des 12 régions) et une garde (années). La région publiée et l'apogée restent calculées à la lecture (`CaveService.allWithStock` → `apogeeOf`), dans l'ordre manuelle > référentiel > IA. Une route de modification du vin recalcule `matchKey` et fusionne sur demande ; une route de suggestions d'appellations alimente les formulaires.

**Tech Stack:** NestJS 10, Prisma + PostgreSQL (`pg_trgm`, `unaccent_lower`), zod, React 18 + Vite + TanStack Query, Vitest, Jest.

**Spec:** `docs/superpowers/specs/2026-11-03-ma-cave-saisie-correction-apogee-design.md` (lire aussi sa section « Précisions »).

## Global Constraints

- Gemini : modèles Flash / Flash-Lite seulement, jamais Pro ; aucun nouvel usage (la caractérisation `CARACTERISATION` est étendue, pas dupliquée).
- Une analyse IA qui échoue ne bloque jamais la saisie ; producteur et appellation non vides restent les seules exigences d'un vin.
- Un champ corrigé à la main (`wine_traits.manual_fields`, apogée `MANUEL`) n'est jamais écrasé par une génération.
- Toute estimation de l'IA est signalée à l'écran : « estimée par l'IA ».
- Liste fermée des régions, exactement : `Alsace, Beaujolais, Bordeaux, Bourgogne, Champagne, Jura, Languedoc-Roussillon, Loire, Provence, Rhône, Savoie, Sud-Ouest`.
- Libellé « Hors de France » partout ; valeur d'api `HORS_FRANCE` (existe dans `api/src/cave/cave-filter.ts`).
- Textes en français, apostrophe typographique ’ dans l'interface comme le reste de l'appli.
- Tout sur `main`, commits signés `djkix <202098449+djkix@users.noreply.github.com>`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, messages conventionnels en français (`feat(api): …`).
- Vérifications : api `cd api && DATABASE_URL=postgresql://postgres:dev@localhost:5432/cave_test REDIS_URL=redis://localhost:6379 npx tsc --noEmit && npx eslint src --quiet && npx jest` (les variables sont obligatoires, sinon les suites base sont sautées) ; web `cd web && npx vitest run && npx tsc --noEmit -p . && npx eslint src --quiet && npm run build`.
- Base locale `cave_test` seulement ; aucune donnée personnelle dans le dépôt (example.com).

## Review Focus

1. Fusion : un vin cible ayant déjà des caractéristiques, un accord, des cotes → rien ne doit violer les contraintes uniques `wine_traits.wine_id` / `pairing.wine_id` ; aucune bouteille ni mouvement perdu (test Task 4).
2. Modification d'un vin vers sa propre identité (rien changé, ou casse différente) → pas de faux doublon avec lui-même (test Task 4).
3. Vin non millésimé sans aucun mouvement IN non annulé → année de base = année de `created_at`, jamais de crash (test Task 2).
4. Région manuelle « Hors de France » sur un vin dont l'appellation est reconnue (donc française d'après le référentiel) → la correction manuelle gagne (test Task 2).
5. Photo envoyée hors ligne puis rejouée par la file : la quantité choisie voyage avec elle (test Task 6).

---

### Task 1: Caractérisation étendue — région et garde par l'IA

**Files:**
- Create: `api/prisma/migrations/20261103120000_region_garde_quantite/migration.sql`
- Modify: `api/prisma/schema.prisma` (modèles `WineTraits`, `Photo`)
- Modify: `api/src/traits/traits.ts`, `api/src/traits/traits.spec.ts` (ou le spec existant de `parseTraitsOutput`)
- Modify: `api/src/vision/traits-provider.interface.ts`, `api/src/vision/gemini-vision.provider.ts` (`traitsBatchPrompt`)
- Modify: `api/src/traits/traits-batch.processor.ts` (`Out`, `save`) et son spec

**Interfaces:**
- Produces: colonnes `wine_traits.region TEXT NULL`, `wine_traits.guard_min INT NULL`, `wine_traits.guard_max INT NULL` (Prisma `region`, `guardMin`, `guardMax`) ; `photo.requested_quantity INT NULL` (Prisma `requestedQuantity`, utilisé Task 5).
- Produces: `export const REGIONS: readonly string[]` (les 12, dans l'ordre des Global Constraints) dans `traits.ts`.
- Produces: `parseTraitsOutput(raw)` renvoie `{ tannin, aromas, country, region: string | null, guard: { min: number; max: number } | null }` ; `TraitsBatchItem` gagne `region` et `guard`.

- [ ] **Step 1: Tests `parseTraitsOutput`**

```ts
it('région de la liste fermée (sans accents ni casse), sinon null ; garde entière cohérente, sinon null', () => {
  expect(parseTraitsOutput({ pays: 'France', region: 'rhone', garde: { min: 3, max: 10 } })).toMatchObject({ region: 'Rhône', guard: { min: 3, max: 10 } });
  expect(parseTraitsOutput({ pays: 'Italie', region: 'Toscane' })).toMatchObject({ country: 'AUTRE', region: null, guard: null });
  expect(parseTraitsOutput({ garde: { min: 8, max: 2 } }).guard).toBeNull();
  expect(parseTraitsOutput({ garde: { min: -1, max: 2 } }).guard).toBeNull();
  expect(parseTraitsOutput({ garde: { min: 0, max: 61 } }).guard).toBeNull();
  expect(parseTraitsOutput({ garde: { min: 1.6, max: 4.2 } }).guard).toEqual({ min: 2, max: 4 });
});
```
Bornes : `0 ≤ min ≤ max ≤ 60`, arrondi à l'entier ; un pays « AUTRE » force `region: null`.

- [ ] **Step 2: Lancer, voir échouer** — `npx jest src/traits` → FAIL.
- [ ] **Step 3: Implémenter** `REGIONS` et l'extension de `parseTraitsOutput` (comparaison par `normalizeLabel`).
- [ ] **Step 4: Consigne** — `traitsBatchPrompt` demande en plus `"region": <une de REGIONS>|null` (null hors de France) et `"garde": {"min": number, "max": number}` = années après le millésime pendant lesquelles le vin est à boire (pour un non millésimé : après l'achat). Mettre à jour la forme JSON du prompt et le spec du provider qui l'asserte, s'il existe.
- [ ] **Step 5: Migration + schéma** — colonnes ci-dessus ; puis remise en file des vins à rattraper (spec : sans apogée OU sans région) : `UPDATE wine_traits SET status='PENDING', requested_at=now(), attempts=0, next_attempt_at=NULL, reserved_until=NULL WHERE status <> 'PENDING'` limité aux vins `appellation_id IS NULL OR vintage IS NULL OR` appellation sans `guard_min_years`, et `INSERT INTO wine_traits (id, wine_id) SELECT gen_random_uuid(), w.id FROM wine w WHERE NOT EXISTS (…)` pour les vins sans ligne. Les `manual_fields` restent intacts.
- [ ] **Step 6: Processeur** — `save` écrit `region` sauf si `'region'` ∈ `manualFields`, et `guardMin`/`guardMax` toujours. Test du processeur : une ligne avec `manualFields: ['region']` garde sa région.
- [ ] **Step 7: Vérifier** — `npx prisma generate && npx tsc --noEmit && npx jest src/traits src/vision` → PASS.
- [ ] **Step 8: Commit** `feat(api): la caractérisation devine aussi la région et la garde des vins`

### Task 2: Région publiée et apogée estimée par l'IA

**Files:**
- Modify: `api/src/apogee/apogee.ts` (+ spec), `api/src/cave/cave.service.ts` (`allWithStock`, `apogeeOf`, `setTraits`, détail), `api/src/cave/cave-filter.ts` (`countryOf`), `api/src/traits/traits.dto.ts`, `api/src/export/export.service.ts`
- Modify: `api/src/stats/stats.ts` (+ spec), `api/src/stats/stats.service.ts`
- Modify: `web/src/lib/api-client.ts` (types `Apogee.source`, `WineTraits`, `Stats`)

**Interfaces:**
- Consumes: Task 1 colonnes `wine_traits.region/guard_min/guard_max`, `REGIONS`.
- Produces: `ApogeeWineInput` gagne `aiGuardMin: number | null; aiGuardMax: number | null; firstEntryYear: number | null` ; `Apogee.source: 'MANUEL' | 'REGLE' | 'IA' | null` (confiance `FAIBLE` pour `IA`).
- Produces: `CaveRow.region` = région **publiée** ; nouveau `CaveRow.regionSource?: 'MANUEL' | 'REFERENTIEL' | 'IA' | null`.
- Produces: `PUT wines/:id/traits` accepte `region: string | null` (une de `REGIONS` ; null = effacer) → `manualFields` gagne `'region'` ; réponse traits gagne `region`.
- Produces: `Stats.byYear: Share[]` (clé = année en texte, ou `'Non millésimé'` en dernier, ordre croissant) remplace `byDecade` ; `byRegion` contient `'Hors de France'` comme clé.

- [ ] **Step 1: Tests `estimateApogee`** (spec existant)

```ts
it('IA quand le référentiel ne sait pas : millésime + garde IA', () => {
  const a = estimateApogee({ ...base, appellationId: null, vintage: 2018, aiGuardMin: 3, aiGuardMax: 10, firstEntryYear: 2024 }, EMPTY_APOGEE_RULES, 2026);
  expect(a).toMatchObject({ min: 2021, max: 2028, source: 'IA', confidence: 'FAIBLE', status: 'A_BOIRE' });
});
it('non millésimé : garde IA comptée depuis la première entrée', () => {
  expect(estimateApogee({ ...base, vintage: null, aiGuardMin: 0, aiGuardMax: 3, firstEntryYear: 2025 }, EMPTY_APOGEE_RULES, 2026))
    .toMatchObject({ min: 2025, max: 2028, source: 'IA' });
});
it('la règle passe devant l’IA ; sans garde IA, les raisons actuelles', () => {
  expect(estimateApogee({ ...base, referenceGuardMin: 2, referenceGuardMax: 5, aiGuardMin: 9, aiGuardMax: 20 }, EMPTY_APOGEE_RULES, 2026).source).toBe('REGLE');
  expect(estimateApogee({ ...base, vintage: null }, EMPTY_APOGEE_RULES, 2026).reason).toBe('NON_MILLESIME');
});
```
(`base` : appellation reconnue, aucun champ IA, `firstEntryYear: null`.)

- [ ] **Step 2: Implémenter** dans `estimateApogee` : MANUEL → (millésime null : IA depuis `firstEntryYear` sinon `NON_MILLESIME`) → règle → IA depuis le millésime → raison actuelle. Pas de facteur de qualité de millésime sur l'IA.
- [ ] **Step 3: SQL `allWithStock`** — sélectionner `t.region AS "aiRegion"`, `t.guard_min AS "aiGuardMin"`, `t.guard_max AS "aiGuardMax"`, `t.manual_fields AS "traitsManual"`, et `"firstEntryYear"` = `EXTRACT(YEAR FROM COALESCE((SELECT MIN(m.occurred_at) FROM movement m WHERE m.wine_id = w.id AND m.type = 'IN' AND NOT EXISTS (SELECT 1 FROM movement r WHERE r.reverses_id = m.id)), w.created_at))::INT`. Calcul en TypeScript (fonction pure exportée `publishedRegion(row): { region: string | null; source: … }`) : `'region'` manuel → `t.region` (null + pays manuel AUTRE = hors de France) ; sinon `a.region` ; sinon `aiRegion`. `countryOf` : pays manuel (`'country'` ∈ manualFields) d'abord, puis appellation reconnue → FR, puis pays IA. Le filtre `region` et la carte utilisent ces valeurs publiées. Faire la même chose dans `export.service.ts` (même entrée d'apogée).
- [ ] **Step 4: Tests région publiée** (spec de `cave-filter` ou `cave.service`) : manuel > référentiel > IA ; Review Focus 4 : appellation reconnue + `country` manuel `AUTRE` → `countryOf` = `AUTRE`, filtre `HORS_FRANCE` le trouve.
- [ ] **Step 5: Test e2e de lecture** (suite base existante de la cave) : non millésimé sans mouvement IN (Review Focus 3) → apogée IA depuis l'année de création.
- [ ] **Step 6: `setTraits` + DTO** — `region` validé contre `REGIONS` (400 sinon), ajouté à `manualFields`.
- [ ] **Step 7: Stats** — `byYear` (clé année) remplace `byDecade` ; région = publiée, pays `AUTRE` → clé `'Hors de France'`, absente → `NO_REGION`. Tests : `[2015, 2019, null]` → `['2015','2019','Non millésimé']` ; un vin `country AUTRE` compte dans `'Hors de France'`.
- [ ] **Step 8: Types web** — `api-client.ts` : `source` + `'IA'`, `WineTraits.region`, `Stats.byYear`. Adapter `StatsPage.tsx` minimalement pour compiler (le rendu final est Task 9).
- [ ] **Step 9: Vérifier** — api complet + `cd web && npx tsc --noEmit -p .` → PASS.
- [ ] **Step 10: Commit** `feat(api): région publiée (manuelle, référentiel, IA) et apogée estimée par l'IA`

### Task 3: Suggestions d'appellations

**Files:**
- Modify: `api/src/appellations/appellations.service.ts` (+ spec), créer `api/src/appellations/appellations.controller.ts`, `appellations.module.ts`
- Modify: `web/src/lib/api-client.ts`
- Create: `web/src/components/AppellationField.tsx` (+ test)

**Interfaces:**
- Produces: `AppellationsService.suggest(q: string, limit = 8): Promise<Array<{ name: string; region: string | null; similarity: number }>>` — même `normalizeLabel` + `similarity(unaccent_lower(canonical_name), needle)` que `resolve`, plus correspondance par préfixe/contenu (`unaccent_lower(canonical_name) LIKE '%' || needle || '%'`), triées par similarité, `q` vide → `[]`.
- Produces: `GET /api/appellations?q=` (utilisateur connecté, toute cave) → ce tableau.
- Produces: `RECOGNIZED_SIMILARITY = 0.5` exporté du service (le seuil sous lequel `resolve` donne `none`) et répété côté web dans `AppellationField`.
- Produces: `<AppellationField id value onChange />` — `<input list>` + `<datalist>` alimenté par `getAppellations(q)` (anti-rebond 250 ms, `q` ≥ 2 caractères) ; message sous le champ quand `value` non vide et aucune suggestion ≥ 0.5 : « Appellation inconnue du référentiel : la région et l’apogée seront estimées par l’IA. »

- [ ] **Step 1: Test service (base)** — `suggest('chateauneuf')` contient « Châteauneuf-du-Pape » en tête ; `suggest('')` → `[]`.
- [ ] **Step 2: Implémenter** service + contrôleur (garde d'authentification utilisée par les autres routes connectées).
- [ ] **Step 3: Test composant** — suggestions affichées en options ; `value` « Barolo » + réponse vide → message ; `value` « Pommard » + suggestion 0.9 → pas de message.
- [ ] **Step 4: Implémenter** `AppellationField` et `getAppellations`.
- [ ] **Step 5: Vérifier** api + web → PASS.
- [ ] **Step 6: Commit** `feat: suggestions d'appellations du référentiel et appellation inconnue signalée`

### Task 4: Modifier un vin, fusion des doublons (api)

**Files:**
- Create: `api/src/wines/wine-edit.service.ts` (+ `wine-edit.service.spec.ts` sur base)
- Modify: `api/src/cave/cave.controller.ts`, module qui fournit le service, `api/src/movements/dto.ts` (réutiliser le schéma de brouillon)

**Interfaces:**
- Consumes: `computeMatchKey` (`api/src/wines/match-key.ts`), `AppellationsService.resolve`, le schéma zod du brouillon de vin de `movements/dto.ts`.
- Produces: `PUT /api/wines/:id` (OWNER) corps = brouillon (`producer, cuvee, appellationRaw, vintage, color, formatCl`) + `merge?: boolean`.
  - Pas de doublon → 200 `{ id }` (même id).
  - Doublon (autre vin de la cave avec le même `matchKey`) et `merge` absent → 409 `{ message: 'Ce vin existe déjà', duplicate: { id, producer, cuvee, vintage, quantity } }`.
  - Doublon et `merge: true` → 200 `{ id: <id du vin existant>, merged: true }`.
- Produces: `WineEditService.edit(caveId, id, input): Promise<{ id: string; merged?: true } | { duplicate: … }>`.

Comportement :
- Appellation re-résolue comme `matchOrCreate` (nom canonique si exact) ; `apogee_min/max/source` intacts si `MANUEL`.
- Si domaine ou appellation changent : `wine_traits` repassent `PENDING` (champs manuels gardés), et l'accord (`pairing`) aussi.
- Fusion, en une transaction : `movement.wine_id`, `price_quote.wine_id`, `image_search_cost.wine_id` → cible ; note : la plus récente (`rated_at`) gagne ; `wine_traits` : cible gardée, champs de `manual_fields` de la source copiés seulement s'ils ne sont pas manuels sur la cible, puis ligne source supprimée ; `pairing` source supprimé ; vignette de référence : celle de la cible, sinon celle de la source ; puis `DELETE wine` source.

- [ ] **Step 1: Tests (base)** — (a) correction simple : `Pommard 2081` → `2018`, même id, apogée recalculée ; (b) Review Focus 2 : enregistrer sans rien changer (ou casse différente du producteur) → pas de 409 ; (c) doublon sans `merge` → `duplicate` ; (d) Review Focus 1 : fusion où les deux vins ont `wine_traits`, `pairing`, cotes et 3 + 2 bouteilles réparties sur deux emplacements → cible à 5 bouteilles, stocks par emplacement additionnés, une seule ligne `wine_traits`, source supprimée ; (e) vin d'une autre cave → 404.
- [ ] **Step 2: Lancer, voir échouer.**
- [ ] **Step 3: Implémenter** service + route (`@CaveRole('OWNER')`, `CaveAccessGuard` comme `PUT wines/:id/traits`).
- [ ] **Step 4: Vérifier** api complet → PASS.
- [ ] **Step 5: Commit** `feat(api): modifier un vin, avec fusion quand il en double un autre`

### Task 5: Quantité choisie à la photo (api)

**Files:**
- Modify: `api/src/photos/photos.controller.ts`, `api/src/photos/photos.service.ts` (`ingest`, réponses `entryInbox`, `listPendingReview`, détail `GET photos/:id`) et leurs specs

**Interfaces:**
- Consumes: colonne `photo.requested_quantity` (Task 1).
- Produces: `POST /photos` accepte le champ multipart facultatif `quantity` (entier 1 à 120 ; autre → 400 « Quantité invalide ») ; stocké en `requestedQuantity` (absent → null). Une photo en doublon garde sa valeur d'origine.
- Produces: toute réponse photo exposée au web porte `requestedQuantity: number | null`.

- [ ] **Step 1: Tests** — upload avec `quantity=6` → `requestedQuantity` 6 dans `entry-inbox` ; `quantity=0` → 400 ; sans champ → null.
- [ ] **Step 2: Implémenter.**
- [ ] **Step 3: Vérifier** → PASS. **Step 4: Commit** `feat(api): quantité de bouteilles transmise avec la photo`

### Task 6: Quantité à la prise de vue (web)

**Files:**
- Modify: `web/src/pages/EntreeCapturePage.tsx` (+ test), `web/src/lib/offline-queue.ts` (+ test), le code qui vide la file et appelle `uploadPhoto`, `web/src/lib/api-client.ts` (`uploadPhoto`, `PhotoDto.requestedQuantity`), `web/src/pages/AConfirmerPage.tsx`, `web/src/pages/EntreeConfirmationPage.tsx` (+ tests)

**Interfaces:**
- Consumes: Task 5.
- Produces: `QueuedPhoto.quantity?: number` ; `enqueuePhoto(blob, mode, userId?, quantity?)` ; `uploadPhoto(file, purpose, quantity?)` ajoute `quantity` au formulaire si défini.
- Règle de pré-remplissage, une fonction pure `initialQuantity(requested: number | null, detected: number | null): number` dans `web/src/lib/extraction-to-draft.ts` : `requested && requested !== 1 ? requested : (detected ?? requested ?? 1)`.

- [ ] **Step 1: Tests** — `initialQuantity(6, 2)` = 6 ; `(1, 6)` = 6 ; `(null, null)` = 1 ; Review Focus 5 : une photo mise en file avec `quantity: 4` est envoyée avec `quantity=4` au vidage ; capture : le sélecteur « Bouteilles » (`QuantityPicker`, défaut 1) est visible avant le déclencheur et revient à 1 après une prise ; il n'apparaît pas en mode sortie.
- [ ] **Step 2: Implémenter** (sélecteur seulement pour une entrée, pas pour la sortie).
- [ ] **Step 3: Vérifier** web → PASS. **Step 4: Commit** `feat(web): nombre de bouteilles choisi dès la prise de photo`

### Task 7: Appellation à la confirmation (web)

**Files:**
- Modify: `web/src/pages/AConfirmerPage.tsx`, `web/src/pages/EntreeConfirmationPage.tsx` (+ tests)

**Interfaces:**
- Consumes: `<AppellationField>` (Task 3).

- [ ] **Step 1: Tests** — sur les deux écrans, le champ appellation propose les suggestions ; une appellation inconnue affiche le message et **n'empêche pas** l'enregistrement.
- [ ] **Step 2: Remplacer** les champs appellation par `<AppellationField>`.
- [ ] **Step 3: Vérifier** → PASS. **Step 4: Commit** `feat(web): suggestions d'appellations à la confirmation d'un vin`

### Task 8: Fiche vin — modifier, fusionner, corriger la région

**Files:**
- Create: `web/src/components/WineEditForm.tsx` (+ test)
- Modify: `web/src/pages/WinePage.tsx` (+ test), `web/src/components/TraitsBlock.tsx` (+ test), `web/src/lib/api-client.ts`

**Interfaces:**
- Consumes: `PUT /api/wines/:id` (Task 4), `PUT wines/:id/traits` avec `region` (Task 2), `<AppellationField>` (Task 3), `REGIONS` recopiée côté web dans `web/src/lib/traits.ts`.
- Produces: `updateWine(id, body): Promise<{ id: string; merged?: true }>` ; un 409 lève une `ApiError` dont le corps porte `duplicate`.

- [ ] **Step 1: Tests** — bouton « Modifier » visible pour le propriétaire, absent en lecture seule ; enregistrer appelle `updateWine` et rafraîchit la fiche ; 409 → message « Ce vin existe déjà : Pommard 2018, 3 bouteilles » + bouton « Fusionner les deux » → renvoi avec `merge: true` puis navigation vers `/cave/<id cible>` ; « Annuler » ferme sans appel. TraitsBlock : région affichée avec « (estimée par l’IA) » quand `regionSource === 'IA'`, sélecteur de région (12 + « Hors de France ») dans « Corriger ». Fiche : apogée de source `IA` libellée « estimée par l’IA ». Fiche d'un vin supprimé par une fusion (404) : « Vin introuvable » avec un lien « Voir la cave » (vérifier l'existant, l'ajouter s'il manque).
- [ ] **Step 2: Implémenter** — le formulaire s'ouvre dans la carte d'en-tête comme la correction du stock (`.stock-edit`), champs : domaine, cuvée, appellation, millésime, couleur, format.
- [ ] **Step 3: Vérifier** web → PASS. **Step 4: Commit** `feat(web): modifier un vin depuis sa fiche, fusion des doublons, région corrigeable`

### Task 9: Filtres de la cave et stats (web)

**Files:**
- Modify: `web/src/pages/CavePage.tsx` (+ test), `web/src/pages/StatsPage.tsx` (+ test)

**Interfaces:**
- Consumes: filtre api `region` / `vintageMin` / `vintageMax` existants, `Stats.byYear` (Task 2).

- [ ] **Step 1: Tests** — un seul champ « Millésime » : saisir 2015 envoie `vintageMin=2015&vintageMax=2015` ; vide → aucun des deux. Pastilles de région = régions présentes dans la cave (dérivées de la liste chargée) + « Hors de France » s'il y a des vins hors de France ; toucher une pastille pose `region` dans l'URL (comme la carte), retoucher l'enlève ; placée juste après « Millésime ». Stats : barres « 2015 », « 2019 », « Non millésimé » (plus de « Années ») et une ligne « Hors de France ».
- [ ] **Step 2: Implémenter.**
- [ ] **Step 3: Vérifier** web → PASS. **Step 4: Commit** `feat(web): filtre région, filtre millésime sur une année, stats par année et hors de France`

### Task 10: Documentation

**Files:**
- Modify: `README.md` (section des fonctionnalités concernées), `docs/guide-detaille.md` (saisie, fiche vin, filtres, stats, apogée, caractérisation)

- [ ] **Step 1:** Décrire en français chaque comportement livré (quantité à la photo, suggestions et appellation inconnue, région devinée et corrigeable, modification et fusion, filtres, stats par année, apogée « estimée par l’IA », rattrapage du stock par la migration).
- [ ] **Step 2: Commit** `docs: saisie fiable, modification des vins, filtres, stats et apogée par l'IA`
