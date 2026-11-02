# Accords par vin, page Domaine, arômes et tanin, filtres, carte de France — Plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer les cinq évolutions de la conception du 2 novembre 2026 : entrée « J'ai un vin » dans Accords, page Domaine en cinq champs, tanin/arômes/pays par vin, nouveaux filtres de cave, carte de France sur l'accueil.

**Architecture:**
- **Caractéristiques des vins.** Elles vivent dans une nouvelle table `wine_traits`, qui sert aussi de file. Elle est traitée par un nouveau `TraitsBatchProcessor`, sur le modèle de `PairingBatchProcessor` : même `GenerationBatchProcessor`, mêmes quotas, une boucle de plus dans le worker.
- **Domaine.** `ProducerProfile` gagne cinq colonnes et `manual_fields`. Son traitement par lots fusionne la réponse sans toucher les champs corrigés.
- **Carte et filtres.** La carte se calcule côté web à partir de `GET /api/cave`, enrichi de `region`, `country`, `tannin` et `aromas`. Aucune route dédiée.

**Tech Stack:** NestJS, Prisma, PostgreSQL, BullMQ (worker), React/Vite, TanStack Query, Jest (api), Vitest + Testing Library (web).

**Spec:** `docs/superpowers/specs/2026-11-02-ma-cave-accords-domaine-aromes-carte-design.md`

## Global Constraints

- Migrations additives uniquement : pas de `DROP`, pas de colonne existante renommée. La production garde ses volumes.
- Jamais de modèle Gemini Pro. Tout appel passe par `GeminiVisionProvider.call()` (quotas par modèle, bascule).
- Aucun appel Gemini déclenché par un affichage. Seules des lignes en attente sont posées, et le worker les traite par lots de 10.
- Une correction manuelle (champ dans `manualFields`) n'est jamais écrasée par la génération automatique. Seul « Régénérer » (domaine, administrateur) la remplace.
- Une génération qui échoue ne bloque rien et n'alerte pas : le vin reste sans tanin ni arôme.
- Isolation par cave : listes et filtres lus avec `caveId`. Les domaines sont partagés, mais leurs vins sont listés dans la cave courante seulement.
- Textes, commentaires et documentation en français, dans le style du code voisin. Pas de nouvelle dépendance (carte en SVG écrit à la main).
- Liste fermée des arômes, ordre et libellés exacts : fruits rouges, fruits noirs, agrumes, fruits blancs, fruits exotiques, fruits secs, noisette, floral, épicé, poivré, vanille, boisé, toasté, beurré, miel, minéral, végétal, sous-bois, cuir, réglisse. Cinq au plus par vin.
- Tanin : `LEGER` | `MOYEN` | `PUISSANT` | null. Libellés : léger, moyen, puissant.
- Pays : `FR` | `AUTRE` | null. Un vin dont l'appellation est reconnue (`appellationId` non nul) vaut toujours `FR`.
- Ordre des filtres de la cave : recherche, couleur, arômes, millésime, tanin, emplacement, à boire en priorité, sans apogée, vins épuisés, plat.
- Travail sur `main`, commits `djkix <202098449+djkix@users.noreply.github.com>`, conventionnels (`feat:`, `fix:`, `docs:`), avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Vérification api : `cd api && DATABASE_URL=postgresql://postgres:dev@localhost:5432/cave_test REDIS_URL=redis://localhost:6379 npx tsc --noEmit && npx eslint src --quiet && npx jest && npm run build`. Ne toucher que la base `cave_test`.
- Vérification web : `cd web && npx vitest run && npx tsc --noEmit -p . && npx eslint src --quiet && npm run build`.
- Après toute modification d'un `package.json` (aucune n'est prévue) : `npx -y npm@10 install --package-lock-only --ignore-scripts`.

## Review Focus

1. **Vin sans appellation reconnue et sans caractéristiques encore générées** : il n'apparaît ni dans une région ni dans « Hors de France ». Il est compté dans « dont N sans région ». Test : Task 9, `regionCounts`.
2. **Correction manuelle pendant qu'un lot est en vol** : la réponse du lot n'écrase pas le champ corrigé. Test : Task 3, `save garde les champs manuels`. Même chose pour le domaine, Task 6.
3. **Filtre millésime avec une seule borne, et vins non millésimés** : `vintageMin` seul garde les années ≥ min et exclut les vins sans millésime. Test : Task 4.
4. **Clé de domaine avec accents ou espaces dans l'URL** (`/domaine/ch%C3%A2teau%20x`) : la page charge et ne renvoie pas 404. Test : Task 7, avec `encodeURIComponent` de la clé.
5. **Cave vide ou toutes bouteilles épuisées** : la carte affiche « Aucune bouteille pour l'instant » sans planter. Test : Task 9.

---

### Task 1: Schéma et migration

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/20261102120000_traits_domaine/migration.sql`

**Interfaces:**
- Produces:
  - `model WineTraits` (`@@map("wine_traits")`) :
    - colonnes : `id`, `wineId @unique` (relation `Wine`, `onDelete: Cascade`), `status PairingStatus @default(PENDING)`, `tannin String?`, `aromas String[] @default([])`, `country String?`, `manualFields String[] @default([]) @map("manual_fields")`, `model String?`, `costCents Int?`, `errorMessage String?`, `generatedAt DateTime?`, `updatedAt @updatedAt` ;
    - colonnes de file, identiques à `Pairing` : `requestedAt`, `attempts`, `nextAttemptAt`, `reservedUntil` ;
    - `@@index([status, requestedAt])`.
  - `Wine.traits WineTraits?`.
  - `ProducerProfile` gagne `histoire`, `terroir`, `cepages`, `style`, `nez` (tous `String?`) et `manualFields String[] @default([]) @map("manual_fields")`.

- [ ] **Step 1:** Écrire les modèles, puis générer la migration avec `npx prisma migrate dev --create-only --name traits_domaine` contre `cave_test`. Renommer le dossier en `20261102120000_traits_domaine`.
- [ ] **Step 2:** Ajouter à la fin du SQL la reprise des domaines existants :
  ```sql
  UPDATE producer_profile SET
    histoire = description,
    manual_fields = CASE WHEN source = 'MANUEL' AND description IS NOT NULL THEN ARRAY['histoire'] ELSE '{}' END,
    source = 'GEMINI', status = 'PENDING', requested_at = now(), attempts = 0, next_attempt_at = NULL, reserved_until = NULL;
  ```
  Pas d'insertion dans `wine_traits` : c'est le rattrapage du worker (Task 3) qui crée ces lignes.
- [ ] **Step 3:** `npx prisma migrate deploy` sur `cave_test`, puis `npx prisma generate` et `npx tsc --noEmit`. Attendu : aucune erreur.
- [ ] **Step 4:** Commit `feat(api): tables des caractéristiques de vin et champs du domaine`.

### Task 2: Arômes, tanin, sortie Gemini des caractéristiques

**Files:**
- Create: `api/src/traits/traits.ts`, `api/src/traits/traits.spec.ts`, `api/src/vision/traits-provider.interface.ts`
- Modify:
  - `api/src/vision/gemini-vision.provider.ts`
  - `api/src/vision/gemini-journal.ts` (`GeminiUsage` + `GEMINI_USAGES` : `'CARACTERISATION'`)
  - `api/prisma/schema.prisma` (commentaire de la liste des usages)
  - `api/src/vision/vision.module.ts` (fournir `TRAITS_PROVIDER`, comme `PRODUCER_PROVIDER`)
  - `web/src/lib/api-client.ts` (`GeminiUsageKind`)
  - `web/src/components/admin/GeminiUsageSection.tsx` (libellé « Caractéristiques », couleur au choix parmi les variables existantes)

**Interfaces:**
- Produces, in `traits.ts` :
  - `AROMAS: readonly string[]` : la liste exacte des Global Constraints.
  - `TANNINS = ['LEGER','MOYEN','PUISSANT'] as const` ; `type Tannin`.
  - `type Country = 'FR' | 'AUTRE'`.
  - `MAX_AROMAS = 5`.
  - `parseTraitsOutput(raw: unknown): { tannin: Tannin | null; aromas: string[]; country: Country | null }`. Il lève `TraitsInvalidOutputError` (message commençant par « Sortie du modèle invalide ») si `raw` n'est pas un objet.
- Produces, in `traits-provider.interface.ts` :
  - `TRAITS_PROVIDER` ;
  - `TraitsWine { producer; cuvee: string|null; appellation: string; vintage: number|null; color: string }` ;
  - `TraitsBatchItem { index; tannin; aromas; country }` ;
  - `TraitsBatchResult { items; model; costCents }` ;
  - `TraitsProvider.characterizeWinesBatch(wines: TraitsWine[]): Promise<TraitsBatchResult>`.
- Produces : `GeminiVisionProvider.characterizeWinesBatch`, usage `'CARACTERISATION'`, construit comme `describeProducersBatch` (`indexedItems(..., 'vin', ...)`).

- [ ] **Step 1: Tests de `parseTraitsOutput`** dans `traits.spec.ts` :
  - `{tanin:'moyen', aromes:['Boisé','noisette','inventé'], pays:'France'}` donne `{tannin:'MOYEN', aromas:['boisé','noisette'], country:'FR'}`. Libellés comparés sans casse ni accents (`normalizeLabel`), arôme inconnu ignoré.
  - Sept arômes valides : seuls les cinq premiers sont gardés.
  - `{tanin:null, aromes:[], pays:'Italie'}` donne `{tannin:null, aromas:[], country:'AUTRE'}`.
  - Un `tanin` inconnu donne `null`. `pays` absent donne `null`.
  - `parseTraitsOutput('x')` lève une erreur dont le message commence par « Sortie du modèle invalide ».
- [ ] **Step 2:** `cd api && npx jest src/traits` → FAIL (module absent).
- [ ] **Step 3:** Implémenter `traits.ts`, l'interface et `characterizeWinesBatch`. Ajouter le prompt `traitsBatchPrompt(wines)` à côté de `pairingsBatchPrompt`. Il demande un tableau JSON `{"vin": n, "tanin": "léger"|"moyen"|"puissant"|null, "aromes": [...], "pays": "France"|"<autre pays>"}`. Il cite la liste fermée des arômes, au plus 5, et précise : « tanin null pour un blanc, un rosé ou un effervescent sauf exception ».
- [ ] **Step 4:** `npx jest src/traits src/vision` → PASS.
- [ ] **Step 5:** Commit `feat(api): caractéristiques d'un vin par Gemini (tanin, arômes, pays)`.

### Task 3: File des caractéristiques (worker, rattrapage, nouveau vin)

**Files:**
- Create:
  - `api/src/traits/traits-batch.processor.ts` (+ `.spec.ts`)
  - `api/src/traits/traits-recovery.ts` (+ `.spec.ts`)
  - `api/src/traits/traits.module.ts`
- Modify:
  - `api/src/pairing/generation-requests.ts` (ajouter `requestTraits`)
  - `api/src/worker.ts` (boucle + rattrapage au démarrage, comme `requeueMissingPairings` et `pairingLoop`)
  - `api/src/movements/movements.service.ts` (nouveau vin → `requestTraits`, même bloc `void …catch` que les accords)
  - `api/src/app.module.ts`, et le module du worker s'il diffère

**Interfaces:**
- Consumes : `TRAITS_PROVIDER`, `parseTraitsOutput` (Task 2) ; `GenerationBatchProcessor` (`api/src/pairing/generation-batch.processor.ts`).
- Produces :
  - `requestTraits(prisma, wineIds: string[], now?): Promise<number>` (`createMany skipDuplicates`) ;
  - `requeueMissingTraits(prisma, log?)` : tout vin sans ligne `wine_traits` en reçoit une ;
  - `TraitsBatchProcessor` (`tableName 'wine_traits'`, `label 'Caractéristiques'`).

- [ ] **Step 1: Tests**, sur le modèle de `pairing-batch.processor.spec.ts` :
  - `save écrit tanin, arômes, pays et passe DONE` ;
  - `save garde les champs manuels` : avec `manualFields: ['tannin']` et `tannin: 'PUISSANT'`, une réponse `LEGER` laisse `PUISSANT` mais met à jour `aromas`. La fusion se fait en lisant la ligne puis en écrivant seulement les champs absents de `manualFields`, sous la condition `reservedUntil: deadline` ;
  - `requeueMissingTraits crée une ligne pour chaque vin qui n'en a pas, et rien au second passage`.
- [ ] **Step 2:** `npx jest src/traits` → FAIL.
- [ ] **Step 3:** Implémenter. Dans `prepare` : `appellation = appellation.canonicalName ?? appellationRaw`, `color` = la couleur du vin.
- [ ] **Step 4:** Lancer la vérification api complète → PASS.
- [ ] **Step 5:** Commit `feat(api): caractéristiques des vins générées par lots, rattrapage des vins existants`.

### Task 4: Lecture, correction et filtres côté API

**Files:**
- Modify:
  - `api/src/cave/cave-filter.ts` (+ `cave-filter.spec.ts`)
  - `api/src/cave/cave.service.ts` (`allWithStock` joint `wine_traits` ; `toItem` publie les nouveaux champs ; la fiche renvoie `traits`)
  - `api/src/cave/cave.controller.ts` (schéma de requête ; `PUT wines/:id/traits` réservé au propriétaire, avec la même garde que `setRating`)
- Create: `api/src/traits/traits.dto.ts` (+ spec)

**Interfaces:**
- Produces on `CaveRow` (public) :
  - `region: string | null` (`appellation.region`) ;
  - `country: 'FR' | 'AUTRE' | null`, via `countryOf(row)` : `'FR'` si `appellationId` est présent, sinon `wine_traits.country` ;
  - `tannin: Tannin | null` ;
  - `aromas: string[]` ;
  - `producerKey: string` (`producerKeyOf(producer)`, pour les liens vers la page Domaine).
- Produces on `CaveFilter` :
  - `aromas?: string[]` : tous requis ;
  - `vintageMin?: number`, `vintageMax?: number` ;
  - `tannin?: Tannin` ;
  - `region?: string` : nom de région exact, ou `HORS_FRANCE` (correspond à `country === 'AUTRE'`).
- Query string : `aromas` répété (`?aromas=boisé&aromas=noisette`, le schéma zod accepte une chaîne ou un tableau), `vintageMin`, `vintageMax`, `tannin`, `region`.
- Produces on wine detail : `traits: { status; tannin; aromas; country; manualFields } | null`.
- Produces : `PUT /api/wines/:id/traits`, corps `{ tannin?: Tannin|null; aromas?: string[]; country?: 'FR'|'AUTRE'|null }` (arômes validés contre `AROMAS`, 5 au plus). Effets :
  - upsert de la ligne ;
  - chaque clé présente est ajoutée à `manualFields` ;
  - la réservation est levée (`reservedUntil: null`).

  Réponse : `traits`.
- `export const HORS_FRANCE = 'HORS_FRANCE'`.

- [ ] **Step 1: Tests** dans `cave-filter.spec.ts` :
  - `aromas` : ['boisé','noisette'] ne garde que les vins qui ont les deux ;
  - `vintageMin: 2015` seul garde 2015 et 2018, exclut 2012 et un vin sans millésime ;
  - `vintageMax: 2015` seul garde 2012 et 2015 ;
  - `tannin: 'MOYEN'` ;
  - `region: 'Bourgogne'` ;
  - `region: 'HORS_FRANCE'` ne garde que `country === 'AUTRE'`.

  Ajouter un test de `traits.dto` : un arôme hors liste est refusé, six arômes sont refusés.
- [ ] **Step 2:** `npx jest src/cave src/traits` → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** Lancer la vérification api complète. Elle inclut `caves.isolation.e2e.spec.ts` : ajouter un cas montrant que `PUT wines/:id/traits` d'une autre cave répond 404.
- [ ] **Step 5:** Commit `feat(api): tanin, arômes et pays lisibles, corrigeables et filtrables`.

### Task 5: Sortie Gemini du domaine en cinq champs

**Files:**
- Modify:
  - `api/src/vision/producer-output.ts` (+ spec)
  - `api/src/vision/producer-provider.interface.ts`
  - `api/src/vision/gemini-vision.provider.ts` (`producersBatchPrompt`, `producersBatch`)

**Interfaces:**
- Produces :
  - `type ProducerFields = { histoire: string; terroir: string; cepages: string; style: string; nez: string }` ;
  - `PRODUCER_FIELDS = ['histoire','terroir','cepages','style','nez'] as const` ;
  - `ProducerOutput = { known: true; fields: ProducerFields } | { known: false }` ;
  - `ProducerBatchItem = { index; known; fields: ProducerFields | null }`.
- Bornes : chaque champ fait de 20 à 600 caractères après rognage. Remplacer `MIN/MAX_PRODUCER_DESCRIPTION` par `MIN_PRODUCER_FIELD = 20` et `MAX_PRODUCER_FIELD = 600`.

- [ ] **Step 1:** Réécrire `producer-output.spec.ts` :
  - objet complet accepté ;
  - un champ manquant ou trop court → « Sortie du modèle invalide » ;
  - `{connu:false}` → `known:false`.
- [ ] **Step 2:** FAIL, puis implémenter. Le prompt demande pour chaque domaine `{"domaine": n, "connu": true, "histoire": …, "terroir": …, "cepages": …, "style": …, "nez": …}`, chaque champ en 1 à 3 phrases, le nez décrivant les arômes typiques des vins du domaine.
- [ ] **Step 3:** `npx jest src/vision` → PASS.
- [ ] **Step 4:** Commit `feat(api): descriptif de domaine en cinq champs`.

### Task 6: Domaine : file, page, correction champ par champ

**Files:**
- Modify:
  - `api/src/producers/producer-batch.processor.ts` (+ spec)
  - `api/src/producers/producers.service.ts` (+ spec)
  - `api/src/producers/producers.controller.ts`
  - `api/src/producers/producer-profile.view.ts`
  - `api/src/producers/producer-description.dto.ts` → renommer en `producer-field.dto.ts`

**Interfaces:**
- Consumes : `ProducerFields`, `PRODUCER_FIELDS` (Task 5).
- Produces :
  - `ProducerProfileView` gagne `fields: Record<ProducerField, string|null>` et `manualFields: string[]`. `description` reste dans la vue pour les clients en cache, sans être lu par le nouveau web.
  - `ProducersService.page(caveId, producerKey, role)` renvoie `{ profile: ProducerProfileView|null; wines: Array<{ id; cuvee; vintage; color; quantity; referencePhotoId }> }`. Les vins sont ceux de la cave courante, par `producerKeyOf`, y compris les épuisés (`quantity` 0). La réponse est 404 si aucun vin de cette cave ne porte la clé.

    Effet de bord unique : s'il n'existe pas de profil, appeler `requestProducerProfiles`. Si le profil existe sans aucun des cinq champs et que son statut n'est pas `PENDING`, le repasser en `PENDING`. Aucun appel Gemini.
  - `ProducersService.setField(producerKey, field: ProducerField, value: string, userId)` écrit le champ, l'ajoute à `manualFields` et pose `updatedById`. Le statut et `source` restent inchangés.
  - `regenerate` vide `manualFields` et repasse en `PENDING`, comportement actuel conservé.
  - `ProducerBatchProcessor.save` : `known` → écrit chaque champ absent de `manualFields`. `!known` → `status UNKNOWN`, champs intacts.

    Le filtre de file `source: 'GEMINI'` reste. Pour qu'il ne bloque pas un profil saisi à la main avant cette version, la migration de la Task 1 a remis tous les profils sur `GEMINI`.
  - Routes :
    - `GET /api/producers/:key` : tout membre de la cave, `@CurrentCave()`. La garde `AdminGuard` passe au niveau de chaque méthode.
    - `PUT /api/producers/:key/fields/:field`, corps `{ value }` (1 à 600 caractères), administrateur seulement.
    - `POST /api/producers/:key/regenerate` : inchangé.
    - Supprimer `PUT :key/description`.

- [ ] **Step 1: Tests** :
  - `save n'écrase pas un champ manuel` : `manualFields: ['histoire']`, puis réponse complète. `histoire` est inchangé, les quatre autres champs sont écrits ;
  - `page met le domaine en file une seule fois` : deux appels créent une seule ligne `PENDING` ;
  - `page renvoie 404 pour une clé absente de la cave` ;
  - `setField ajoute le champ à manualFields sans doublon`.
- [ ] **Step 2:** FAIL, puis implémenter.
- [ ] **Step 3:** Lancer la vérification api complète → PASS.
- [ ] **Step 4:** Commit `feat(api): page Domaine et correction champ par champ`.

### Task 7: Web, client API et page Domaine

**Files:**
- Modify: `web/src/lib/api-client.ts`, `web/src/router.tsx`, `web/src/components/DomaineBlock.tsx` (+ test)
- Create: `web/src/pages/DomainePage.tsx` (+ `DomainePage.test.tsx`)

**Interfaces:**
- Produces, in `api-client.ts` :
  - types `Tannin`, `Country`, `WineTraits` ;
  - `CaveRow` gagne `region`, `country`, `tannin`, `aromas` et `producerKey` ;
  - `CaveFilter` gagne `aromas`, `vintageMin`, `vintageMax`, `tannin` et `region`, sérialisés dans `getCave` ;
  - `WineDetail.wine.traits` ;
  - `setWineTraits(id, body)` ;
  - `ProducerPage`, `getProducer(key)`, `setProducerField(key, field, value)` ;
  - le type `ProducerProfile` est mis à jour ;
  - `AROMAS`, recopié de l'api, dans `web/src/lib/traits.ts` avec `TANNIN_LABEL`.
  - Les clés passent par `encodeURIComponent`.
- Produces : route `/domaine/:key`.

  Page `DomainePage` :
  - les cinq champs, sous les titres Histoire, Terroir, Cépages, Style, Nez ;
  - pour un administrateur, un bouton « Corriger » par champ, qui ouvre un `textarea` de 600 caractères au plus, sur le modèle de l'édition actuelle de `DomaineBlock`, et « Régénérer » ;
  - « Fiche du domaine en préparation » tant que le statut est `PENDING` et que les champs sont vides (sondage toutes les `PRODUCER_POLL_MS`) ;
  - « Domaine inconnu de l'IA » si le statut est `UNKNOWN` ;
  - la liste des vins (vignette, cuvée, millésime, stock), chacun menant à `/cave/:id`.
- `DomaineBlock` montre un aperçu de `fields.histoire` (3 lignes) et un lien « Voir le domaine », sans édition.

- [ ] **Step 1: Tests** dans `DomainePage.test.tsx` :
  - `affiche les cinq champs et les vins` ;
  - `un membre ne voit pas Corriger` ;
  - `charge une clé accentuée` : le routeur reçoit `/domaine/${encodeURIComponent('château x')}` et `getProducer` est appelé avec `château x`.

  Dans `DomaineBlock.test.tsx` : `lien Voir le domaine`.
- [ ] **Step 2:** FAIL, puis implémenter.
- [ ] **Step 3:** Lancer la vérification web complète → PASS.
- [ ] **Step 4:** Commit `feat(web): page Domaine`.

### Task 8: Web, caractéristiques sur la fiche vin et filtres de la cave

**Files:**
- Create: `web/src/components/TraitsBlock.tsx` (+ test)
- Modify: `web/src/pages/WinePage.tsx`, `web/src/pages/CavePage.tsx` (+ `CavePage.test.tsx`), `web/src/styles/base.css`

**Interfaces:**
- Consumes : `setWineTraits`, `AROMAS`, `TANNIN_LABEL`, `CaveFilter` (Task 7).
- `TraitsBlock({ wineId, traits, readOnly })` affiche :
  - le tanin ;
  - les arômes en pastilles ;
  - le pays seulement si `AUTRE` (« Hors de France ») ;
  - « Caractéristiques en préparation » si `PENDING` et vide ;
  - rien d'autre si l'IA a échoué.

  Pour le propriétaire, « Corriger » ouvre :
  - un `select` pour le tanin (dont « — ») ;
  - les arômes à cocher (`filter-toggle`), cinq au plus, les cases restantes désactivées une fois cinq atteints ;
  - un `select` pour le pays (France, Hors de France, inconnu).

  « Enregistrer » envoie seulement les clés modifiées.
- `CavePage` :
  - l'ordre exact des Global Constraints ;
  - « Arômes » : une pastille `filter-pill` qui ouvre un `BottomSheet` de cases à cocher. Libellé : « Arômes : tous », ou la liste choisie, tronquée ;
  - « Millésime » : deux `input type="number"` (de, à), `inputMode="numeric"`, compacts ;
  - « Tanin » : `select` en pastille ;
  - `?region=` lu dans l'URL et affiché en pastille « Région : Bourgogne ✕ » (ou « Hors de France ✕ »), qui retire le filtre ;
  - la rangée de filtres passe à la ligne sans élargir la page (`flex-wrap`).

- [ ] **Step 1: Tests** :
  - `les filtres sont dans l'ordre demandé` : lire les noms accessibles dans l'ordre du DOM ;
  - `?region=Bourgogne envoie region et affiche la pastille retirable` ;
  - `cocher boisé et noisette envoie deux aromas` ;
  - `TraitsBlock : six arômes impossibles, le sixième est désactivé` ;
  - `TraitsBlock : membre sans Corriger`.
- [ ] **Step 2:** FAIL, puis implémenter.
- [ ] **Step 3:** Lancer la vérification web complète → PASS.
- [ ] **Step 4:** Commit `feat(web): tanin et arômes sur la fiche, nouveaux filtres de la cave`.

### Task 9: Web, carte de France sur l'accueil

**Files:**
- Create:
  - `web/src/components/FranceMap.tsx` (+ test)
  - `web/src/lib/region-counts.ts` (+ test)
  - `web/src/components/france-regions.ts` : chemins SVG
- Modify: `web/src/pages/HomePage.tsx` (+ test), `web/src/styles/base.css`

**Interfaces:**
- Produces :
  - `regionCounts(rows: CaveRow[]): { total: number; byRegion: Map<string, { bottles: number; producers: Array<{ producer: string; producerKey: string; bottles: number }> }>; horsFrance: same shape; sansRegion: number }`.

    Seules les lignes `quantity > 0` comptent. `region` non nul → sa région. Sinon `country === 'AUTRE'` → `horsFrance`. Sinon → `sansRegion`. Les domaines sont triés par bouteilles décroissantes. `producerKey` vient de `CaveRow.producerKey` (Task 4).
  - `FRANCE_OUTLINE: string` et `FRANCE_REGIONS: Array<{ name: string; d: string; labelX: number; labelY: number }>` : les douze régions du référentiel, noms exacts (Alsace, Beaujolais, Bordeaux, Bourgogne, Champagne, Jura, Languedoc-Roussillon, Loire, Provence, Rhône, Savoie, Sud-Ouest), viewBox `0 0 300 300`, tracés simplifiés reconnaissables.
  - `FranceMap({ counts, onSelect(regionOrHorsFrance: string) })` :
    - chaque région est un `<path role="button" tabIndex=0 aria-label="Bourgogne, 21 bouteilles">` qui répond à Entrée et Espace ;
    - remplissage en 5 classes, de `--map-0` (aucune bouteille) à `--map-4` (le maximum), définies en jetons clair et sombre dans `base.css` (dégradé bordeaux) ;
    - nombre affiché sur la région ;
    - pour Alsace, Jura, Savoie et Beaujolais, un cercle transparent de rayon 14 par-dessus le tracé, qui élargit la zone tactile ;
    - case « Hors de France » à côté de la carte (bouton) ;
    - légende ;
    - « dont N sans région » si N > 0 ;
    - « Aucune bouteille pour l'instant » si `total === 0`.
  - `HomePage` : une section « MA CAVE EN FRANCE · N bouteilles » sous les actions, pour le propriétaire comme pour un membre. Elle lit `getCave({})`, avec la clé de requête `['cave', {}]` partagée avec la cave. Toucher une région ouvre un `BottomSheet` avec :
    - le titre « Bourgogne · 21 bouteilles » ;
    - les domaines (lien vers `/domaine/:key`) et leurs bouteilles ;
    - le lien « Voir ces N vins dans la cave » vers `/cave?region=<nom>`, ou `HORS_FRANCE`.

- [ ] **Step 1: Tests** :
  - `regionCounts` : bouteilles épuisées ignorées ; vin français sans région → `sansRegion` ; `AUTRE` → `horsFrance` ; domaines triés ; liste vide → `total 0` ;
  - `FranceMap` : `Bourgogne, 21 bouteilles` atteignable au clavier, Entrée appelle `onSelect('Bourgogne')` ; cave vide → « Aucune bouteille pour l'instant » ;
  - `HomePage` : toucher Bourgogne ouvre le volet avec le lien `/cave?region=Bourgogne`.
- [ ] **Step 2:** FAIL, puis implémenter.
- [ ] **Step 3:** Lancer la vérification web complète → PASS. Puis contrôle visuel :
  - le serveur de développement web, l'api et le worker sur `cave_test` ;
  - capture à 375 px de large, en clair et en sombre : pas de défilement horizontal, petites régions touchables.
- [ ] **Step 4:** Commit `feat(web): carte de France de la cave sur l'accueil`.

### Task 10: Web, Accords : entrée « J'ai un vin »

**Files:**
- Modify: `web/src/pages/AccordsPage.tsx` (+ `AccordsPage.test.tsx`), `web/src/styles/base.css`

**Interfaces:**
- Consumes : `getCave({ q })`, `getWine(id)` (`wine.pairing`).
- Deux onglets en haut de page, des boutons `aria-pressed` : « J'ai un plat » (le parcours actuel, intact) et « J'ai un vin ».

  « J'ai un vin » :
  - un champ de recherche (domaine, cuvée, appellation) qui liste les vins en stock de la cave, 20 au plus ;
  - un choix affiche le vin (vignette, nom, millésime, lien vers la fiche) et ses plats en cartes, une par plat, dans l'ordre enregistré ;
  - `PENDING` → « Accords en préparation… » avec sondage `pairingPollInterval` ;
  - `FAILED` → « Les accords n'ont pas pu être générés » et un lien vers la fiche ;
  - `pairing` nul → « Pas encore d'accords pour ce vin » et un lien vers la fiche.

  Aucun appel à `postAccords` ni à la régénération.
- `sessionStorage` : la clé `accords:entree` garde `{ mode: 'plat'|'vin', wineId? }`. Elle se lit et s'écrit dans un `try`/`catch`, comme `accords:dernier`.

- [ ] **Step 1: Tests** :
  - `J'ai un vin : choisir un vin affiche ses plats en cartes` ;
  - `vin sans accords : message et lien, aucun POST` (vérifier que `fetch` n'a reçu aucun `POST`) ;
  - `retour sur la page : le vin choisi est restauré`.
- [ ] **Step 2:** FAIL, puis implémenter.
- [ ] **Step 3:** Lancer la vérification web complète → PASS.
- [ ] **Step 4:** Commit `feat(web): accords à partir d'un vin de la cave`.

### Task 11: Documentation et vérification d'ensemble

**Files:**
- Modify: `README.md` (liste des fonctionnalités, sans entrée de version : elle se fait à la publication), `docs/guide-detaille.md`

- [ ] **Step 1:** Guide : nouvelle section « Passage à la prochaine version (accords par vin, domaine, arômes, carte) ». Elle dit :
  - migration additive ;
  - rattrapage automatique des caractéristiques et des domaines en tâche de fond : un appel Gemini pour 10 vins, ou pour 10 domaines, selon les quotas ;
  - rien à changer dans le YAML.
- [ ] **Step 2:** Lancer les vérifications api et web complètes → PASS.
- [ ] **Step 3:** Commit `docs: accords par vin, page Domaine, arômes et tanin, carte de France`, puis push sur `main`.
- [ ] **Step 4:** Attendre la CI du dernier commit (`gh run list --branch main --limit 3`) → succès. Ne pas fusionner la PR release-please : on attend que Franck dise « fusionne et publie ».
