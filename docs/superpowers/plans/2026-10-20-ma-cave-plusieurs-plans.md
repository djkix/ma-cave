# Plusieurs plans par cave — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** une cave a jusqu'à 20 plans nommés (onglets dans « Ma cave › Réglages »), chaque zone a son repère sur l'un d'eux.

**Architecture:** nouvelle table `cave_plan` ; `cave_zone.plan_id` (FK composite vers le plan de la même cave) ; migration SQL à la main qui reprend le plan actuel en « Plan principal » et retire les colonnes `plan_*` de `cave`. L'api remplace `/caves/current/plan` par `/caves/current/plans[/:id]` et `/caves/plans/:planId/image`. Le web passe à des onglets et `ZonePlan` affiche le plan de la zone avec son nom.

**Tech Stack:** NestJS + Prisma + PostgreSQL (api), React 18 + TanStack Query + Vitest (web).

**Spec:** `docs/superpowers/specs/2026-10-20-ma-cave-plusieurs-plans-design.md`

## Global Constraints

- Textes en français, messages d'erreur exacts : « Plan introuvable », « Un plan porte déjà ce nom », « 20 plans au plus par cave », « Le nom du plan doit faire de 1 à 40 caractères », « Photo trop lourde (15 Mo au plus) ».
- Nom de plan : 1 à 40 caractères après `trim`, unique par cave sur `lower(name)`. 20 plans au plus par cave.
- Image : mêmes règles que le plan actuel (15 Mo, 30 envois/min, `PLAN_MAX_SIDE` 2400, `placeImage` sous verrou, `Cache-Control: private, no-cache`). Nouveaux fichiers en `plans/<planId>.jpg`.
- Ordre des plans = `created_at`, puis `id`.
- Migration écrite à la main, appliquée par `prisma migrate deploy` ; base de test `cave_test` uniquement (`DATABASE_URL=postgresql://postgres:dev@localhost:5432/cave_test REDIS_URL=redis://localhost:6379`).
- Vérifs api : `npx tsc --noEmit && npx eslint src --quiet && npx jest && npm run build` ; web : `npx vitest run && npx tsc --noEmit -p . && npx eslint src --quiet && npm run build`.
- Commits en français, style conventionnel, terminés par l'unique ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Export Excel inchangé.

## Review Focus

1. Supprimer un plan dont une zone **archivée** a un repère : la FK NO ACTION ne doit pas bloquer → le service efface les repères de toutes les zones du plan, archivées comprises (test Task 1).
2. Renommer un plan avec la même casse différente de lui-même (« cellier » → « Cellier ») : accepté, pas « Un plan porte déjà ce nom » (test Task 1).
3. `deleteTestCaves` et la suppression en cascade : `cave_plan` doit être vidé après `cave_zone`, avant `cave` (Task 1, `test-utils/cave.ts`).
4. Onglet affiché qui disparaît (plan supprimé, ou changement de cave) : l'écran retombe sur le premier plan restant, sans écran vide (test Task 3).
5. Repère posé pendant qu'on change d'onglet : le « + » en attente et le mode Déplacer sont annulés au changement d'onglet (test Task 3).

---

### Task 1: Données et api des plans

**Files:**
- Create: `api/prisma/migrations/20261020000000_plusieurs_plans/migration.sql`
- Modify: `api/prisma/schema.prisma` (modèle `Cave` : retirer `planPath`, `planWidth`, `planHeight`, `planUpdatedAt`, ajouter `plans CavePlan[]` ; nouveau modèle `CavePlan` mappé `cave_plan` ; `CaveZone` : `planId String? @map("plan_id") @db.Uuid` et la relation composite)
- Modify: `api/src/zones/zone.ts`, `api/src/zones/plan.service.ts`, `api/src/zones/plan.controller.ts`, `api/src/zones/zones.service.ts`, `api/src/zones/zones.controller.ts`, `api/src/zones/zones.module.ts`, `api/src/test-utils/cave.ts`
- Test: `api/src/zones/plan.e2e.spec.ts` (réécrit), `api/src/zones/zones.e2e.spec.ts` (repères)

**Interfaces:**
- Produces (HTTP, consommé par Task 2 et Task 3) :
  - `GET /api/caves/current/plans` (VIEWER) → `{ plans: PlanMeta[]; markers: PlanMarker[] }`
  - `POST /api/caves/current/plans` (OWNER, multipart `file`, champ `name`) → 201 `PlanMeta`
  - `PATCH /api/caves/current/plans/:id` (OWNER, `{ name }`) → `PlanMeta`
  - `PUT /api/caves/current/plans/:id/image` (OWNER, multipart `file`) → `PlanMeta`
  - `DELETE /api/caves/current/plans/:id` (OWNER) → 204
  - `GET /api/caves/plans/:planId/image` (connecté) → JPEG
  - `PUT /api/caves/current/zones/:id/marker` body `{ planId, x, y }` → `ZoneView`
- Produces (types, `zone.ts`) :
  - `interface PlanMeta { id: string; name: string; width: number; height: number; updatedAt: string }`
  - `interface PlanMarker { zoneId: string; planId: string; name: string; number: number; x: number; y: number }`
  - `ZoneView.marker: { planId: string; x: number; y: number } | null`
  - constantes `PLAN_NAME_TAKEN`, `PLAN_LIMIT` (« 20 plans au plus par cave »), `INVALID_PLAN_NAME`, `PLAN_MAX_COUNT = 20`, `PLAN_NAME_MAX = 40` ; `planPath(planId)` ; `planNameSchema` ; `markerSchema` gagne `planId: z.string().uuid()` (message `PLAN_NOT_FOUND` si invalide).
- Supprime : `PLAN_MISSING`, `CavePlanController` sur `caves/current/plan`.

- [ ] **Step 1: Écrire la migration**

Ordre : `CREATE TABLE cave_plan` (colonnes de la spec, `cave_id` FK `cave(id)` ON DELETE RESTRICT comme `cave_zone`), index unique `(cave_id, lower(name))`, index unique `(id, cave_id)` ; `INSERT … SELECT gen_random_uuid(), id, 'Plan principal', plan_path, plan_width, plan_height, plan_updated_at, plan_updated_at FROM cave WHERE plan_path IS NOT NULL` ; `ALTER TABLE cave_zone ADD COLUMN plan_id uuid` ; `UPDATE cave_zone z SET plan_id = p.id FROM cave_plan p WHERE p.cave_id = z.cave_id AND z.plan_x IS NOT NULL` ; `UPDATE cave_zone SET plan_x = NULL, plan_y = NULL WHERE plan_x IS NOT NULL AND plan_id IS NULL` ; FK `(plan_id, cave_id) REFERENCES cave_plan(id, cave_id)` (NO ACTION) ; `DROP CONSTRAINT cave_zone_plan_position_check` puis recréé : les trois nuls, ou les trois renseignés avec x et y entre 0 et 1 (mêmes précautions `IS NOT NULL` que la migration 2.8.0) ; `ALTER TABLE cave DROP COLUMN plan_path, plan_width, plan_height, plan_updated_at`. En tête, commentaire en français comme les migrations précédentes.

- [ ] **Step 2: Rejouer la migration sur une copie de `cave_test`**

Avant `migrate deploy`, poser dans `cave_test` : une cave avec plan et une zone à repère, une cave sans plan avec une zone à repère. Après :
```sql
SELECT name, path FROM cave_plan WHERE cave_id = '<cave avec plan>';        -- Plan principal | plans/<caveId>.jpg
SELECT plan_id IS NOT NULL, plan_x FROM cave_zone WHERE id = '<zone 1>';   -- t | 0.5
SELECT plan_id, plan_x FROM cave_zone WHERE id = '<zone sans plan>';       -- NULL | NULL
```
Run: `cd api && npx prisma migrate deploy && npx prisma generate`. Expected : les trois résultats ci-dessus.

- [ ] **Step 3: Réécrire `plan.e2e.spec.ts` (tests qui échouent)**

Garder l'installation actuelle (A propriétaire, membre VIEWER de A, B propriétaire, compte qui possède C et est membre de A). Cas :
- `GET /plans` sans plan → `{ plans: [], markers: [] }`.
- `POST /plans` name `Cellier` + JPEG → 201, `{ id, name: 'Cellier', width, height, updatedAt }` ; fichier `plans/<id>.jpg` présent.
- Second plan `cellier` → 409 « Un plan porte déjà ce nom » ; name `''` ou 41 caractères → 400 « Le nom du plan doit faire de 1 à 40 caractères ».
- 21e plan (20 créés directement par Prisma) → 409 « 20 plans au plus par cave ».
- `PATCH` `{ name: 'CELLIER' }` sur lui-même → 200 (Review Focus 2) ; vers le nom d'un autre plan → 409.
- `PUT /plans/:id/image` → `updatedAt` change, repères inchangés.
- Repères : zones Z1, Z2 sur le plan P1, Z3 sur P2 → `markers` numérotés `1, 2` sur P1 et `1` sur P2, dans l'ordre d'affichage des zones ; zone archivée absente.
- `PUT zones/:id/marker` avec le `planId` d'un plan de B → 404 « Plan introuvable » ; `planId` non uuid → 404 « Plan introuvable ».
- `DELETE /plans/:id` avec une zone active et une zone **archivée** à repère sur ce plan → 204 ; les deux zones existent, `marker: null` ; fichier effacé (Review Focus 1).
- Plan de B via `PATCH`/`PUT image`/`DELETE` depuis A → 404 « Plan introuvable ».
- `GET /api/caves/plans/:planId/image` : membre de A → 200 `image/jpeg` ; compte qui possède C, cave courante C → 200 ; propriétaire de B → 404 « Plan introuvable ».
- Membre VIEWER : `POST`, `PATCH`, `PUT image`, `DELETE` → 403 (message existant du garde).

Run: `cd api && DATABASE_URL=… REDIS_URL=… npx jest src/zones/plan.e2e.spec.ts`. Expected : FAIL (routes absentes).

- [ ] **Step 4: Implémenter**

- `PlanService` : `list(caveId)`, `create(caveId, name, input: Buffer)`, `rename(caveId, id, name)`, `replaceImage(caveId, id, input: Buffer)`, `remove(caveId, id)`, `image(userId, planId)`. Création et limite de 20 vérifiées sous verrou de la cave (`SELECT id FROM cave WHERE id = … FOR UPDATE`) ; nom pris → attraper la violation d'unicité Prisma (`P2002`) → 409. `remove` : dans une transaction, `caveZone.updateMany({ where: { planId: id }, data: { planId: null, planX: null, planY: null } })` puis `cavePlan.delete` ; fichier effacé après validation (`unlinkIgnoringMissing`).
- `CavePlansController` sur `caves/current/plans` (garde, rôles, throttle, `PhotoTooLargeFilter`, `FileInterceptor` repris du contrôleur actuel ; `:id` validé `ParseUUIDPipe` → 404 « Plan introuvable »), `CavePlanImageController` sur `caves/plans/:planId/image`.
- `ZonesService.setMarker(caveId, id, { planId, x, y })` : plan introuvable dans la cave → 404 `PLAN_NOT_FOUND` ; `removeMarker` remet les trois colonnes à null. `zoneView` lit `planId`.
- `test-utils/cave.ts` : `prisma.cavePlan.deleteMany({ where: inCaves })` après `caveZone`, avant `cave`.

- [ ] **Step 5: Adapter `zones.e2e.spec.ts` aux repères `{ planId, x, y }` et lancer les vérifs api**

Run: `cd api && npx tsc --noEmit && npx eslint src --quiet && npx jest && npm run build`. Expected : tout vert sauf la matrice d'isolation (Task 2) si elle échoue sur les anciennes routes.

- [ ] **Step 6: Commit** — `feat(api): plusieurs plans par cave, repère rattaché à un plan`

### Task 2: Matrice d'isolation

**Files:**
- Modify: `api/src/caves.isolation.e2e.spec.ts` (bloc « Plan de la cave et repères des zones », installation des données lignes ~360-380)

**Interfaces:**
- Consumes : les routes de Task 1.

- [ ] **Step 1: Remplacer les entrées des anciennes routes**

Chaque nouvelle route classée : `GET /api/caves/current/plans` `cave-viewer-read` (lit le plan et le repère de A : `plans: [{ id: i.planA, name: 'Plan A', width: 120, height: 160, updatedAt }]`, `markers: [{ zoneId: i.zoneA, planId: i.planA, name: 'Cave A', number: 1, x: 0.5, y: 0.5 }]`) ; `POST /plans`, `PATCH /plans/:id`, `PUT /plans/:id/image`, `DELETE /plans/:id` `cave-owner` (sur un plan de A : `foreign` = 404 « Plan introuvable » quand B vise le plan de A) ; `GET /api/caves/plans/:planId/image` `photo-image` (foreign `NOT_FOUND_PLAN`). `PUT zones/:id/marker` reçoit `{ planId: i.planA, x, y }`. Installation : créer `planA` par Prisma (`plans/<planA>.jpg`) au lieu des colonnes de `cave`.

- [ ] **Step 2: Lancer la matrice puis toutes les vérifs api**

Run: `cd api && DATABASE_URL=… REDIS_URL=… npx jest src/caves.isolation.e2e.spec.ts && npx jest`. Expected : PASS, aucune route non classée.

- [ ] **Step 3: Commit** — `test(api): matrice d'isolation des plans`

### Task 3: Web — client, affichage et onglets

**Files:**
- Modify: `web/src/lib/api-client.ts`, `web/src/lib/locations.ts`, `web/src/components/PlanView.tsx`, `web/src/components/LocationsBlock.tsx`, `web/src/pages/ABoirePage.tsx`, `web/src/pages/MaCavePage.tsx`, `web/src/styles/base.css`
- Test: `web/src/components/PlanView.test.tsx`, `web/src/components/LocationsBlock.test.tsx` (ou le test qui couvre `ZonePlan`), `web/src/pages/MaCavePage.test.tsx`, `web/src/pages/ABoirePage.test.tsx`

**Interfaces:**
- Consumes : HTTP de Task 1.
- Produces (`api-client.ts`) : `CavePlan { id; name; width; height; updatedAt }` ; `PlanMarker` avec `planId` ; `Zone.marker: { planId; x; y } | null` ; `getPlans()`, `createPlan(name: string, file: File | Blob)`, `renamePlan(id, name)`, `replacePlanImage(id, file)`, `deletePlan(id)`, `planImageUrl(planId, updatedAt)`, `setZoneMarker(id, planId, x, y)`. Supprime `getPlan`, `uploadPlan`, `removePlan`. `locations.ts` : `usePlans(enabled = true)` (clé `['plans']`) remplace `usePlan` ; les invalidations `'plan'` deviennent `'plans'`.

- [ ] **Step 1: Tests `ZonePlan` (échouent)**

Avec deux plans « Plan principal » et « Cellier », zone Z3 sur « Cellier » : `ZonePlan zoneId="z3"` montre l'image de Cellier (`src` = `planImageUrl('p2', …)`), légende visible « Cellier », seuls les repères de Cellier, Z3 en `aria-current`. Zone sans repère → rien. `mini` : légende aussi.

- [ ] **Step 2: Tests des onglets dans `MaCavePage.test.tsx` (échouent)**

- Deux plans → `tablist` « Plans de la cave » avec onglets `Plan principal`, `Cellier`, `+ Ajouter un plan` ; le premier sélectionné (`aria-selected`).
- Cliquer `Cellier` → image de Cellier, ses repères.
- `+ Ajouter un plan` → champ « Nom du plan » puis fichier ; envoi → `createPlan('Garage', file)` ; l'onglet Garage devient sélectionné.
- *Renommer* → champ prérempli → `renamePlan('p2', 'Cave du fond')`.
- *Remplacer la photo* (input fichier libellé ainsi) → `replacePlanImage('p2', file)`.
- *Supprimer le plan* : `window.confirm` reçoit exactement « Supprimer le plan « Cellier » ? Les zones et leurs bouteilles sont gardées. » ; oui → `deletePlan('p2')`, puis l'onglet `Plan principal` sélectionné (Review Focus 4).
- Toucher le plan de l'onglet Cellier, nommer, *Enregistrer* → `createZone({ name })` puis `setZoneMarker(newId, 'p2', x, y)` ; raccourci zone sans repère → `setZoneMarker('z2', 'p2', x, y)`.
- « + » en attente puis changement d'onglet → plus de « Nouveau repère », plus de groupe « Nommer cet endroit » (Review Focus 5).
- Aucun plan → texte actuel « Photographiez la pièce… » et l'onglet `+ Ajouter un plan`.
- Carte Zones : avec un plan, « Pour ajouter une zone, touchez un plan ci-dessus à son endroit. ».

Run: `cd web && npx vitest run src/pages/MaCavePage.test.tsx src/components`. Expected : FAIL.

- [ ] **Step 3: Implémenter**

- `ZonePlan` : cherche le repère de la zone dans `usePlans().data.markers`, le plan correspondant, affiche `PlanView` avec les repères de ce plan et une légende `<p className="plan-caption">{plan.name}</p>` sous le plan (mini compris).
- `PlanCard` : état `tab: string | 'new'` ; onglet affiché = plan dont l'id vaut `tab`, sinon le premier plan (Review Focus 4) ; changer d'onglet remet `mode` à `idle`. Onglets = boutons `role="tab"` dans un `role="tablist"` `aria-label="Plans de la cave"`. Formulaire d'ajout : nom puis `input type="file" accept="image/*"` (sans `capture`), image réduite par `shrinkPhoto(file, PLAN_MAX_SIDE)` comme aujourd'hui. Actions du plan affiché : *Renommer* (formulaire en ligne), *Remplacer la photo*, *Supprimer le plan*.
- `LocationsBlock`, `ABoirePage` : `usePlans` ; `zone.marker` reste le test d'affichage.
- CSS : `.plan-tabs` (rangée défilable horizontalement, `overflow-x: auto`, sans casser la largeur de page), `.plan-caption`.

- [ ] **Step 4: Vérifs web**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . && npx eslint src --quiet && npm run build`. Expected : tout vert.

- [ ] **Step 5: Commit** — `feat(web): plusieurs plans par cave, en onglets`

### Task 4: Documentation et vérification dans le navigateur

**Files:**
- Modify: `README.md` (paragraphe « Plan de la cave » ~l. 94-125 ; nouvelle section « ### Passage à la 2.14.0 (plusieurs plans) » avant « Passage à Ma Cave »)

- [ ] **Step 1: README**

Décrire les onglets, l'ajout, le renommage, le remplacement, la suppression (zones gardées sans repère), la légende sur la fiche vin, la limite de 20, les nouvelles routes (remplacer la description de `/caves/current/plan`). Section de passage : sauvegarde avant (`pg_dump` comme dans « Passage à Ma Cave »), migration automatique au démarrage de l'api, plan actuel → « Plan principal », repères orphelins d'un plan retiré effacés.

- [ ] **Step 2: Vérifier dans le navigateur**

Api locale sur `cave_test` (`node dist/main.js`), web via preview « web ». Dans « Ma cave › Réglages » : créer « Cellier », y nommer une zone d'un toucher, changer d'onglet, supprimer « Cellier » ; ouvrir une fiche vin rangée dans une zone placée : plan et légende. Capture d'écran.

- [ ] **Step 3: Commit** — `docs: plusieurs plans par cave`
