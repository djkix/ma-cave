# Refonte de Mon compte, des réglages et de l'administration — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** regrouper Mon compte, Ma cave › Réglages et l'Administration en un hub à quatre entrées, avec des motifs d'affichage communs, sans toucher à l'api.

**Architecture:** web seulement. Trois composants communs (`BottomSheet`, `ActionMenu`, `PersonRow`), un hub `/compte` et deux sous-écrans (`/compte/moi`, `/compte/a-propos`), `/ma-cave` réorganisé, `/admin` découpé en trois onglets routés.

**Tech Stack:** React 18, React Router 6, TanStack Query, Vitest + Testing Library, CSS de `web/src/styles/base.css`.

**Spec:** `docs/superpowers/specs/2026-10-20-ma-cave-refonte-reglages-design.md`

## Global Constraints

- Aucun changement dans `api/`.
- Charte actuelle (variables de `base.css`) ; aucune nouvelle dépendance npm.
- Cibles tactiles de 48 px au moins ; aucun défilement horizontal à 375 px ; colonne de 640 px au plus.
- Libellé du rôle invité : « Lecture seule » partout ; menu de la barre du haut : « <nom> · Lecture seule ».
- Un seul bouton principal (`btn--primary`) par carte.
- Textes exacts de la spec (titres de cartes, résumés, confirmations, « Actualiser », « Règles de confidentialité »).
- Tout comportement existant est conservé ; ses tests sont adaptés, jamais supprimés sans équivalent.
- Vérifs : `cd web && npx vitest run && npx tsc --noEmit -p . && npx eslint src --quiet && npm run build`.
- Commits en français, style conventionnel, terminés par l'unique ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Feuille du bas fermée par Échap ou toucher hors du panneau : le formulaire n'est pas envoyé et le focus revient au bouton d'origine (test Task 1).
2. Menu « ⋯ » ouvert puis toucher ailleurs ou Échap : il se ferme sans action (test Task 1).
3. Hub d'un invité : ni carte Ma cave ni Application, et aucune requête `plans`/`zones`/`members`/`admin/registrations` lancée (test Task 2).
4. `/admin/couts` ouvert directement par un non-administrateur : « Réservé à l'administrateur. », aucune requête admin (test Task 4).
5. Consommation Gemini avec un seul jour et un seul usage, et avec zéro appel : le graphique ne casse pas (pas de division par zéro) et l'état vide reste « Aucun appel à Gemini sur 7 jours. » (test Task 5).

---

### Task 1: Composants communs

**Files:**
- Create: `web/src/components/BottomSheet.tsx`, `web/src/components/ActionMenu.tsx`, `web/src/components/PersonRow.tsx` (+ `*.test.tsx`)
- Modify: `web/src/styles/base.css`, `web/src/components/CaveSwitcher.tsx` (+ test)

**Interfaces:**
- Produces:
  - `BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode })` — `<dialog>` natif ouvert par `showModal()` quand `open`, titre en `<h2>`, `onClose` sur Échap (événement `cancel`) et sur clic du fond (cible = le `<dialog>`), focus rendu à l'élément actif à l'ouverture. Classe `.sheet`, collé en bas, coins hauts 16 px, `max-width: 640px`, animation désactivée sous `prefers-reduced-motion`.
  - `ActionMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void; disabled?: boolean }[] })` — bouton « ⋯ » (`aria-label={label}`, `aria-haspopup="menu"`, `aria-expanded`), liste `role="menu"` d'éléments `role="menuitem"` de 48 px ; fermeture par Échap, clic extérieur, ou choix.
  - `PersonRow({ title, subtitle, badges, meta, action }: { title: string; subtitle?: string | null; badges?: { label: string; tone: 'ok' | 'warn' }[]; meta?: ReactNode; action?: ReactNode })`.
  - `CaveSwitcher` : option `« ${name} · Lecture seule »` pour une cave VIEWER.

- [ ] **Step 1: Tests (échouent)** — BottomSheet : ouvert → `getByRole('dialog', { name: title })` ; Échap → `onClose` ; clic sur le fond → `onClose` ; fermé → focus sur le bouton qui l'a ouvert. (jsdom n'a pas `showModal` : le polyfiller dans le test ou dans `setupTests` comme l'a fait `LocationsBlock` — chercher comment.) ActionMenu : clic « ⋯ » → `menu` visible ; choisir un élément → `onSelect` une fois et menu fermé ; Échap ou clic extérieur → fermé sans `onSelect` ; élément `disabled` non cliquable. PersonRow : titre, sous-titre seulement s'il existe, badges avec la classe `badge--ok`/`badge--warn`, zone d'action. CaveSwitcher : option « Cave de Paul · Lecture seule ».
- [ ] **Step 2: Lancer** `cd web && npx vitest run src/components/BottomSheet.test.tsx src/components/ActionMenu.test.tsx src/components/PersonRow.test.tsx src/components/CaveSwitcher.test.ts` → FAIL.
- [ ] **Step 3: Implémenter** les trois composants, le CSS (`.sheet`, `.action-menu`, `.person-row`), et le libellé de `CaveSwitcher`.
- [ ] **Step 4: Vérifs web complètes** → vertes.
- [ ] **Step 5: Commit** — `feat(web): feuille du bas, menu ⋯ et ligne de personne communs`

### Task 2: Hub, Moi, À propos

**Files:**
- Create: `web/src/pages/MoiPage.tsx`, `web/src/pages/AProposPage.tsx` (+ tests)
- Modify: `web/src/pages/ComptePage.tsx` (+ test), `web/src/router.tsx`, `web/src/components/CaveSwitcher.tsx` (`ANY_ROLE`), `web/src/components/AccountScreens.tsx` (+ test si présent)

**Interfaces:**
- Consumes : `PersonRow` (Task 1) pour Mes caves.
- Produces : routes `/compte`, `/compte/moi`, `/compte/a-propos` ; `InstallCard` et `CavesCard` déplacées dans `MoiPage.tsx` (exportées si Task 3 en a besoin : non).

- [ ] **Step 1: Tests (échouent)**
  - Hub, propriétaire admin avec 2 caves, 3 plans, 12 zones, 2 membres, 2 inscriptions : médaillon aux initiales, nom, e-mail ; liens `Moi` (« 2 caves », href `/compte/moi`), `Ma cave` (« 3 plans · 12 zones · 2 membres », `/ma-cave`), `Application` (badge « 2 inscriptions en attente », `/admin`), `À propos` (`Version ${APP_VERSION}`, `/compte/a-propos`). Pluriels : « 1 cave », « 1 plan · 1 zone · 1 membre », « Aucun plan · 0 zone · 1 membre ».
  - Hub d'un invité : seulement Moi et À propos ; `getPlans`, `getZones`, `getMembers`, `getRegistrations` jamais appelés (Review Focus 3).
  - Admin sans inscription : résumé « Comptes, coûts de l'IA, données du vin ».
  - Moi : Mes caves (badge « Propriétaire » / « Lecture seule », « Cave affichée » ou « Afficher » qui change de cave), les 4 états d'installation (reprendre les tests actuels), « Se déconnecter » en `btn--dark`. Plus de sauvegarde ni de version ici.
  - À propos : version, « Application non installée » en jsdom, lien « Règles de confidentialité » vers `/confidentialite`.
  - Écran d'inscription en attente : bouton « Actualiser » qui relance `getMe`.
  - `pathAfterCaveSwitch('/compte/moi', false)` → `/compte/moi`.
- [ ] **Step 2: Lancer les tests ciblés** → FAIL.
- [ ] **Step 3: Implémenter** : `ComptePage` devient le hub (cartes `nav-card` : icône Material, titre serif, résumé, chevron, 48 px+) ; requêtes des résumés activées seulement si la carte est visible (`enabled`) ; résumé vide en chargement, omis en erreur. Routes ajoutées dans `RequireAuth`. Flèche retour des sous-écrans vers `/compte`.
- [ ] **Step 4: Vérifs web complètes** → vertes.
- [ ] **Step 5: Commit** — `feat(web): hub Mon compte, écrans Moi et À propos`

### Task 3: Ma cave

**Files:**
- Modify: `web/src/pages/MaCavePage.tsx` (+ test), `web/src/styles/base.css`

**Interfaces:**
- Consumes : `BottomSheet`, `ActionMenu`, `PersonRow` (Task 1) ; `exportUrl()` de `api-client`.

- [ ] **Step 1: Tests (échouent)**
  - Carte « Sauvegarde » en dernier : texte « Toute la cave dans un classeur Excel : stock, journal, cotes. », lien « Télécharger la sauvegarde Excel » href `/api/export.xlsx`.
  - Plans : menu « ⋯ » (`aria-label` « Actions du plan Cellier ») → *Renommer* ouvre la feuille « Renommer le plan » (champ « Nom du plan » prérempli) → « Enregistrer » appelle `renamePlan('p2', …)` ; « Annuler » ferme sans appel ; *Remplacer la photo* déclenche l'input fichier ; *Supprimer le plan* garde la confirmation exacte. Les tests existants des onglets, du toucher, du clavier restent verts.
  - Zones : *Modifier* ouvre la feuille « Modifier Garage » (Nom, Indication) → `updateZone` ; Annuler sans appel.
  - Membres : `PersonRow`, badges « Propriétaire » / « Lecture seule » / « Invitation en attente », « Retirer » inchangé.
- [ ] **Step 2: Lancer** `npx vitest run src/pages/MaCavePage.test.tsx` → FAIL.
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifs web complètes** → vertes.
- [ ] **Step 5: Commit** — `feat(web): Ma cave, sauvegarde, menu du plan et éditions en feuille du bas`

### Task 4: Application, onglets et Comptes

**Files:**
- Modify: `web/src/pages/AdminPage.tsx` (+ test), `web/src/router.tsx`, `web/src/components/admin/RegistrationsSection.tsx`, `web/src/components/admin/GuardsSection.tsx` (+ tests), `web/src/styles/base.css`

**Interfaces:**
- Consumes : `ActionMenu`, `PersonRow`, `BottomSheet` (Task 1).
- Produces : routes `/admin` (→ `/admin/comptes`), `/admin/comptes`, `/admin/couts`, `/admin/donnees`, toutes dans `AdminPage` avec un paramètre d'onglet ; `/admin/couts` rend `BudgetSection` + `GeminiUsageSection` (Task 5 les modifie).

- [ ] **Step 1: Tests (échouent)**
  - `/admin` redirige vers `/admin/comptes` ; `tablist` « Administration » avec liens « Comptes », « Coûts de l'IA », « Données du vin » (`aria-current="page"` sur l'actif) ; badge « 2 » sur Comptes avec 2 inscriptions.
  - Comptes : carte titrée « Comptes » ; menu « ⋯ » (`Actions pour sophie@example.fr`) avec les éléments selon le compte ; *Bloquer* → `confirm` « Bloquer sophie@example.fr ? Le compte ne pourra plus se connecter. » puis `updateAdminUser('u2', { status: 'BLOCKED' })` ; refus → aucun appel ; *Retirer les droits* → « Retirer les droits d'administrateur de sophie@example.fr ? » ; *Réactiver*, *Promouvoir administrateur*, *Créer sa cave* sans confirmation ; sa propre ligne sans menu, « votre compte ».
  - `/admin/donnees` : les trois sections ; Gardes *Ajuster* ouvre la feuille « Ajuster la garde de Pauillac » ; « Enregistrer la garde » appelle l'api comme avant.
  - Plus de lien « Confidentialité » dans l'Administration.
  - Non-administrateur sur `/admin/couts` : « Réservé à l'administrateur. », aucune requête admin (Review Focus 4).
- [ ] **Step 2: Lancer les tests ciblés** → FAIL.
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Vérifs web complètes** → vertes.
- [ ] **Step 5: Commit** — `feat(web): Administration en trois onglets, actions des comptes dans un menu`

### Task 5: Coûts de l'IA, graphique et jauge

**Files:**
- Modify: `web/src/components/admin/GeminiUsageSection.tsx`, `web/src/components/admin/BudgetSection.tsx` (+ tests), `web/src/styles/base.css`

**Interfaces:**
- Consumes : les données actuelles de `getGeminiUsage` et `getAdminBudget` (lire leurs types dans `api-client.ts`).

- [ ] **Step 1: Tests (échouent)**
  - Chiffres clés : « Coût » = somme des coûts au format « 0,53 € », « Réussis » = somme, « Refusés » = refusés / appels en % arrondi (« 14 % »).
  - Graphique : une barre par jour présent (`role="img"`, nom « 18/10 : 14 appels, 0,35 € »), un segment par usage non nul, hauteur proportionnelle au maximum du jour le plus chargé ; légende des 5 usages.
  - Un seul jour et un seul usage → une barre pleine ; zéro appel → état vide actuel, pas de graphique (Review Focus 5).
  - `<details>` « Détail par jour » replié par défaut contenant le tableau actuel.
  - Budget : `role="meter"` avec `aria-valuenow` = dépensé, `aria-valuemax` = plafond, texte « Dépensé ce mois : 3,42 € sur 10,00 € » ; plafond nul → jauge vide sans erreur.
- [ ] **Step 2: Lancer** → FAIL.
- [ ] **Step 3: Implémenter** en CSS (barres verticales empilées, couleurs des usages prises dans la charte : `--color-primary`, `--color-primary-container`, `--color-secondary`, `--color-ferronnerie`, `--color-warning` ou équivalents existants de `base.css`).
- [ ] **Step 4: Vérifs web complètes** → vertes.
- [ ] **Step 5: Commit** — `feat(web): coûts de l'IA, chiffres clés, barres par jour et jauge du budget`

### Task 6: Documentation et vérification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README** — décrire la nouvelle organisation (hub, Moi, Ma cave avec sauvegarde, Application en trois onglets, À propos, « Actualiser »), mettre à jour toute mention de l'ancienne disposition (sauvegarde dans Mon compte, lien Confidentialité dans l'Administration, « Invité, lecture seule », « (lecture) »). Ne pas toucher aux entrées datées du journal ni au CHANGELOG.
- [ ] **Step 2: Vérification navigateur** (contrôleur) à 375 px et 640 px : hub, Moi, Ma cave, les trois onglets, À propos ; aucun défilement horizontal.
- [ ] **Step 3: Commit** — `docs: refonte de Mon compte, des réglages et de l'administration`
