# Ma Cave — plusieurs plans par cave

Date : 20 octobre 2026. Version visée : 2.14.0.

## Intention

Franck veut « décomposer » le plan de sa cave : une cave peut avoir plusieurs
rangements éloignés (cellier, garage, frigo de la cuisine), qu'une seule photo
ne montre pas. Aujourd'hui une cave a **une seule** image de plan (2.8.0).

Ce qu'il a choisi :

1. **Plusieurs plans côte à côte** (pas de plan général qui s'ouvre sur des
   plans détaillés) : chaque plan a son nom, sa photo et ses repères ; une
   zone est placée sur un seul plan.
2. **Des onglets** au-dessus du plan dans « Ma cave › Réglages » : un plan
   affiché à la fois.
3. **Supprimer un plan garde ses zones** : elles perdent leur repère, les
   bouteilles restent rangées dedans, et ces zones reviennent en raccourci
   quand on touche un autre plan.

Réussi quand : Franck crée « Cellier » et « Garage », y nomme ses zones d'un
toucher, et la fiche d'un vin montre le bon plan avec son nom et le repère de
la zone en rouge. Son plan actuel devient « Plan principal » sans rien perdre.

## Hors périmètre

- Plans imbriqués (un repère qui ouvre un autre plan).
- Réordonner les onglets (ordre de création), déplacer un repère d'un plan à
  l'autre en un geste (on le retire puis on le pose sur l'autre plan).
- Export Excel : il ignore les plans, comme aujourd'hui.

## Données

### Table `cave_plan`

| Colonne | Type | Règle |
|---|---|---|
| `id` | uuid | clé |
| `cave_id` | uuid | FK `cave(id)` |
| `name` | text | 1 à 40 caractères après nettoyage ; unique par cave sur `lower(name)` |
| `path` | text | image relative à `PHOTO_STORAGE_DIR` |
| `width`, `height` | integer | taille après normalisation (2400 px au plus sur le grand côté, comme aujourd'hui) |
| `updated_at` | timestamp | dernier envoi de l'image (relecture du cache) |
| `created_at` | timestamp | ordre des onglets |

Index unique `(id, cave_id)` pour la clé étrangère composite des zones.
**20 plans au plus par cave** : au-delà, 409 « 20 plans au plus par cave ».

Les nouveaux plans sont enregistrés en `plans/<planId>.jpg`.

### Repère d'une zone

`cave_zone` gagne `plan_id` :

- FK composite `(plan_id, cave_id)` → `cave_plan(id, cave_id)` : un repère ne
  peut pointer que vers un plan de la même cave ;
- FK sans action en cascade (NO ACTION) : le service efface les repères des
  zones du plan, dans la même transaction, avant de supprimer le plan ;
- CHECK `cave_zone_plan_position_check` remplacé : `plan_id`, `plan_x`,
  `plan_y` tous nuls, ou tous renseignés avec `x` et `y` entre 0 et 1.

Une zone a toujours au plus un repère, donc au plus un plan.

### Migration (SQL écrit à la main)

1. Créer `cave_plan` et ses index.
2. Pour chaque cave avec `plan_path` : une ligne « Plan principal », avec le
   chemin existant (`plans/<caveId>.jpg`, aucun fichier déplacé), sa taille et
   sa date.
3. Zones à repère de ces caves : `plan_id` = ce plan.
4. Zones à repère dans une cave **sans** plan (plan retiré auparavant, repères
   gardés) : repère effacé. C'est la seule donnée perdue ; elle n'était plus
   visible.
5. Ajouter la FK et le nouveau CHECK, puis supprimer `plan_path`,
   `plan_width`, `plan_height`, `plan_updated_at` de `cave`.

README : section « Passage à la 2.14.0 » (sauvegarde avant, migration
automatique au démarrage, ce qui change à l'écran).

## API

Remplace `/api/caves/current/plan` et `/api/caves/plans/:caveId/image`.

| Méthode et chemin | Rôle | Effet |
|---|---|---|
| `GET /api/caves/current/plans` | membre | `{ plans: [{ id, name, width, height, updatedAt }], markers: [{ zoneId, planId, name, number, x, y }] }` ; plans dans l'ordre de création ; `number` = rang **par plan**, dans l'ordre d'affichage des zones, zones non archivées seulement |
| `POST /api/caves/current/plans` | propriétaire | multipart `file` + `name` ; 201 avec le plan ; nom pris → 409 « Un plan porte déjà ce nom » ; 21e plan → 409 |
| `PATCH /api/caves/current/plans/:id` | propriétaire | `{ name }` ; renomme |
| `PUT /api/caves/current/plans/:id/image` | propriétaire | remplace l'image ; repères gardés (fractions) |
| `DELETE /api/caves/current/plans/:id` | propriétaire | 204 ; repères de ses zones effacés, zones gardées ; image effacée après validation de la transaction |
| `GET /api/caves/plans/:planId/image` | tout compte ayant accès à la cave du plan | JPEG, `Cache-Control: private, no-cache` ; sinon 404 « Plan introuvable » |
| `PUT /api/caves/current/zones/:id/marker` | propriétaire | `{ planId, x, y }` ; plan absent ou d'une autre cave → 404 « Plan introuvable » |

- Plan d'une autre cave sur toute route `:id` → 404 « Plan introuvable ».
- Mêmes limites que l'image actuelle : 15 Mo, plafond de 30 envois par minute,
  normalisation EXIF et JPEG, mise en place sous verrou (comme `PlanService`).
- `ZoneView.marker` devient `{ planId, x, y } | null`.
- La matrice d'isolation (`api/src/caves.isolation.e2e.spec.ts`) classe toutes
  les nouvelles routes ; `plan.e2e.spec.ts` couvre création, limite de 20,
  nom pris, renommage, remplacement, suppression (zones gardées sans repère),
  repère sur le plan d'une autre cave, numérotation par plan.

## Écrans

### « Ma cave › Réglages », carte « Plan de la cave »

- Rangée d'onglets (`role="tablist"`) : « Plan principal · Cellier ·
  + Ajouter un plan ». Le premier plan est choisi par défaut ; le plan créé
  devient l'onglet affiché.
- **Ajouter un plan** : champ « Nom du plan », puis choix de la photo (appareil
  photo ou galerie) ; l'envoi crée le plan.
- Sous le plan affiché : *Renommer*, *Remplacer la photo*, *Supprimer le plan*
  (confirmation « Supprimer le plan « Cellier » ? Les zones et leurs bouteilles
  sont gardées. »).
- Tout le comportement de la 2.13.0 s'applique au plan de l'onglet : toucher
  (ou Entrée) pose un « + », *Nom de l'endroit* puis *Enregistrer* crée la zone
  avec son repère sur ce plan, zones sans repère proposées en raccourci,
  toucher un repère → nom, indication, *Déplacer*, *Retirer le repère*,
  placement au clavier.
- Sans aucun plan : le texte actuel et *Ajouter un plan*.

### Carte « Zones »

Pas d'ajout dès qu'il existe au moins un plan (texte « Pour ajouter une zone,
touchez un plan ci-dessus à son endroit. ») ; sinon comme aujourd'hui.

### Fiche vin, « À boire », emplacements

`ZonePlan` montre le plan de la zone (celui de son repère), tous les repères de
ce plan, celui de la zone en rouge, et le nom du plan en légende
(« Cellier »). Rien sans repère.

## Erreurs

Messages de l'api affichés tels quels, comme partout : « Plan introuvable »,
« Un plan porte déjà ce nom », « 20 plans au plus par cave », « Le nom du plan
doit faire de 1 à 40 caractères », « Photo trop lourde (15 Mo au plus) ».

## Tests

- api : e2e des routes ci-dessus, matrice d'isolation, migration rejouée sur
  `cave_test` avec une cave à plan, une cave sans plan mais avec repères.
- web : onglets (création, changement, renommage, suppression avec
  confirmation), création de zone sur le plan de l'onglet, raccourcis,
  `ZonePlan` avec légende.
- Vérification dans le navigateur avec la cave locale.
