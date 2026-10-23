<div align="center">

# 🍷 Ma Cave

**Cave à vin sans saisie clavier — photo à l'entrée, photo à la sortie, classeur Excel**

[![Version](https://img.shields.io/badge/version-2.32.0-purple?style=for-the-badge)](CHANGELOG.md)
[![Stack](https://img.shields.io/badge/stack-NestJS_·_React_·_PostgreSQL-blue?style=for-the-badge)](#stack-technique)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

*Une photo à l'achat crédite le stock, une photo au moment de boire le débite. Auto-hébergée en Docker, utilisée depuis le téléphone.*

<br />

```
┌──────────────────────────────────────────────────────┐
│ ▣ Ma Cave                          Cave principale ▾ │
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │ + Rentrer du vin                               → │ │
│ │   Arrivage de cartons ou bouteilles              │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ − Sortir une bouteille                         → │ │
│ │   Photo de l’étiquette, ou recherche             │ │
│ └──────────────────────────────────────────────────┘ │
│ [ ✓ 3 vins à confirmer ]                             │
│                                                      │
│ À boire prochainement                                │
│   Domaine A · Cuvée 2014                  Cave 1 / A │
│   Domaine B · 2016          Garage / Champagnes (C15) │
│                                        Tout voir (7) │
│                                                      │
│ DERNIERS MOUVEMENTS                                  │
│   Entrée · Domaine C 2019                        + 6 │
│                                      Voir le journal │
├──────────────────────────────────────────────────────┤
│ Cave · Entrée · Sortie · Journal · Stats · Réglages  │
└──────────────────────────────────────────────────────┘
```

<br />

[Installation](#installation) ·
[Fonctionnalités](#fonctionnalités) ·
[Architecture](#architecture) ·
[Déploiement Docker](#déploiement-docker) ·
[Dockge](#installation-via-dockge) ·
[Variables d'environnement](#variables-denvironnement) ·
[Guide détaillé](docs/guide-detaille.md) ·
[Approche IA (Gemini)](docs/approche-ia-gemini.md)

</div>

---

## Vue d'ensemble

**Ma Cave** tient le stock d'une cave à vin depuis un téléphone. Gemini lit
l'étiquette, l'utilisateur confirme, le journal fait foi. Chaque compte a sa
propre cave et peut inviter des membres en lecture seule. L'application tourne
en Docker derrière un proxy TLS, par exemple sur <https://cave.example.org/>.

| Écran | Rôle |
|-------|------|
| **Entrée** | Photos en rafale, lues par lots en arrière-plan |
| **À confirmer** | Fiches pré-remplies à valider, une par une ou toutes |
| **Sortie** | Photo de l'étiquette, comparée aux vins en stock |
| **Cave** | Liste, recherche, filtres, fiche vin complète |
| **Journal** | 20 derniers mouvements, annulables en un tap |
| **Stats** | Stock, apogée, couleurs, régions, valeur, classements |
| **Réglages** | Moi, Ma cave (zones, plans, membres, sauvegarde), Administration, À propos |

---

## Fonctionnalités

Le détail complet de chaque écran (règles, messages, API) est dans le
[guide détaillé](docs/guide-detaille.md#fonctionnalités).

### 📸 Entrée par photo, en rafale
- **Rafale** : photo après photo, sans attendre ni confirmer entre deux prises
- Photo **réduite sur le téléphone** (1 600 px, JPEG), rangée dans une **file locale**
- Envoi une par une en arrière-plan, tant que l'application est ouverte
- Le worker lit **jusqu'à 8 photos par appel Gemini**, toutes les 15 s
- Résultat en général **entre 15 s et 1 min**

### ✅ À confirmer
- Trois sections : **À valider**, **En cours d'analyse**, **Lecture impossible**
- Fiche pré-remplie avec un **indicateur de confiance** par champ
- **Valider**, **Tout valider**, **Mettre de côté** ou **Écarter**
- **Saisir à la main** une photo illisible
- **Rien n'entre en stock** sans validation explicite

### 🤖 Lecture d'étiquette (Gemini)
- Analyse **différée, jamais bloquante** : une photo reçue n'est jamais perdue
- Service saturé, quota ou clé invalide : la photo **attend et repart seule**
- **Pause commune** après un refus de Google (503, 429), pour l'api et le worker
- **Limites de débit par modèle**, comme Google, respectées avant l'appel (5 req/min, 250 000 jetons/min, 20 req/jour par défaut)
- **Modèle choisi seul** : le Flash ou Flash-Lite stable le plus récent dont le **quota du jour** n'est pas atteint, puis le suivant ; plus de sélecteur, l'Administration **affiche le modèle en cours** et les limites de chaque modèle
- **Modèle tracé** : chaque appel note le modèle employé, visible dans la colonne *Modèle* de la consommation Gemini
- **Photos plus nettes** : recadrage sur l'étiquette, sans appel supplémentaire

### 📤 Sortie
- Par **photo** : seuls les vins en stock sont proposés
- Un candidat clair : **confirmation** ; plusieurs : **1 à 4 vignettes** avec le millésime
- Aucun candidat : **Chercher dans la cave** ou **Rentrer ce vin**
- Par la **liste** : sélecteur de quantité borné par le stock
- **Rien ne sort** sans confirmation

### 📒 Journal et inventaire
- **20 derniers mouvements**, annulables en un tap (propriétaire)
- Une annulation écrit un **mouvement inverse** : rien n'est supprimé
- **Corriger le stock** : inventaire physique, écart annoncé avant d'enregistrer
- Stock **calculé à la lecture** depuis le journal, **jamais négatif**

### 🍾 Cave et fiche vin
- Recherche **sans accents ni casse**, filtres couleur, emplacement, vins épuisés
- Fiche : photo, **descriptif du domaine**, **accords**, apogée, note, cote, emplacements, mouvements
- **Note sur 20**, par demi-point
- **Chercher une image** : Open Food Facts, puis site officiel du domaine (source citée)

### ⏳ Apogée et « À boire »
- Fourchette **estimée par règles** (appellation, couleur, qualité du millésime)
- **Correction manuelle** par vin, prioritaire sur l'estimation
- Filtre **À boire en priorité** : apogée finie au plus tard l'an prochain
- Carte **À boire prochainement** sur l'accueil, page `/a-boire` **groupée par emplacement**
- Règles d'apogée réglables par l'administrateur

### 🍽️ Accords et descriptifs
- **Jusqu'à 8 plats** suggérés par Gemini pour chaque vin
- **Descriptif du domaine** (3 à 4 phrases), partagé par toutes les caves
- Générés **par lots de 10** en arrière-plan, **Régénérer** à la demande
- Recherche **Accompagner un plat** dans l'onglet Cave
- Texte du domaine modifiable par un **administrateur**

### 💶 Cote
- **Saisie à la main** : l'application ne lit jamais les sites de cote, elle n'offre que des liens
- **Voir sur iDealwine** (enchères), **Wine-Searcher** (prix moyen chez les cavistes) et **Vivino** (prix boutique et note), recherche du vin pré-remplie
- Source de la cote déduite du lien enregistré (« source Vivino »)
- Âge de la cote, alerte si peu de transactions ou cote ancienne
- **Valeur de cession estimée** (cote / 1,16, cotes iDealwine ou sans lien) et **valeur à la cote** dans les Stats
- Invisible pour un membre en lecture seule

### 🗺️ Emplacements, zones et plans
- Emplacement = **zone · casier · position** ; **Ranger / déplacer** depuis la fiche
- **Emplacement au doigt** : à l'entrée, au déplacement et à la correction du stock, on touche sur la photo du plan la case où est la bouteille (un onglet par plan, cases repérées par l'IA) ; la case s'allume et le nombre de bouteilles déjà rangées s'affiche
- **Saisir à la main** reste disponible pour une zone sans plan ou une case non repérée
- **Zones** : nom, indication, photo, ordre ; archivées si elles ont servi
- **Jusqu'à 20 plans** par cave, **repères numérotés** des zones
- **Propositions de zones** : Gemini repère les casiers sur la photo du plan
- **Grille de cases** numérotées par casier, rangée par rangée (C1…C48, *Lettre des cases* au choix), à toucher pour ranger ; **noms de cases** (« Champagnes (C15) »)
- Cases **gardées sur le plan** après acceptation ; **vignette recadrée** sur la zone dans la fiche vin
- **Ajuster les cases sur le plan** (*Modifier la zone*) : toucher une case puis son endroit, poser les cases oubliées

### 📊 Statistiques
- Bouteilles, références, **valeur au prix d'achat** et **à la cote** (propriétaire)
- Répartition par **apogée**, **couleur**, **région**, **décennie**
- **Mouvements sur 12 mois** et rythme de consommation
- Classements : plus bus, producteurs, plus chères, mieux notés

### 👥 Caves, membres et invités
- **Une cave par compte**, dont il est propriétaire
- **Membres en lecture seule** : ni prix, ni cote, ni journal, ni écriture
- **Sélecteur de cave** pour un compte qui a accès à plusieurs caves
- Identifiant d'une autre cave : réponse **404**

### 🛡️ Comptes et administration
- Connexion **Google** ; **compte de secours** local par `/login?secours`
- **Inscription validée** par un administrateur, qui crée la cave
- `ADMIN_EMAILS` : **administrateurs garantis**, ni blocables ni rétrogradables
- **Coûts de l'IA** : modèle en cours (automatique), limites de débit par modèle, budget mensuel, **part par cave**, consommation par jour
- **Données du vin** : qualité de la lecture (« zéro saisie »), règles d'apogée

### 📦 Sauvegarde Excel
- Classeur `.xlsx` **régénéré à chaque fois**, cave courante seulement
- Feuilles **Stock**, **Mouvements**, **Référence**
- Apogée, note, accords, emplacements et cote dans la feuille Stock
- Filtre couleur et **seulement les vins à boire en priorité**

### 📱 PWA et hors ligne
- **Installable** sur Android et iPhone
- File locale de **200 photos (200 Mo)**, envoyée au retour du réseau
- Bandeau **Nouvelle version disponible** avec *Recharger*, jamais de rechargement forcé
- Version affichée dans **Réglages › À propos** (`2.26.0`, `2.26.0+ab12cd3` pour `latest`)

---

## Architecture

```mermaid
flowchart TB
    subgraph Client["Téléphone"]
        PWA["PWA React + Vite<br/>file hors ligne IndexedDB"]
    end

    NPM["Nginx Proxy Manager<br/>TLS"]

    subgraph Stack["Stack Docker ma-cave"]
        WEB["web<br/>Nginx + PWA compilée<br/>port 3100"]
        API["api<br/>NestJS"]
        WRK["worker<br/>NestJS + BullMQ"]
        PG[("PostgreSQL 16<br/>pg_trgm")]
        RD[("Redis 7<br/>files, sessions, quotas")]
        PH[("Volume photo_data<br/>photos et plans")]
        BK["db-backup<br/>pg_dump quotidien"]
    end

    subgraph External["Services externes"]
        GEM["Google Gemini"]
        OFF["Open Food Facts"]
        GOA["Google OAuth"]
    end

    PWA -->|HTTPS| NPM --> WEB
    WEB -->|"/api/"| API
    API <--> PG
    API <--> RD
    API <--> PH
    WRK <--> PG
    WRK <--> RD
    WRK <--> PH
    WRK --> GEM
    API --> GEM
    API --> OFF
    API --> GOA
    BK --> PG
```

| Service | Rôle | Port |
|---------|------|------|
| `web` | Nginx + PWA compilée, relaie `/api/` | **3100** sur l'hôte → 80, seul port publié |
| `api` | REST, authentification, règles métier, export | 3000, interne |
| `worker` | Lots d'entrée (8 photos), accords et descriptifs (10), sorties et plans via BullMQ | interne |
| `postgres` | Données (PostgreSQL 16 + `pg_trgm`) | 5432, interne |
| `redis` | Files BullMQ, sessions, compteurs de quota | 6379, interne |
| `db-backup` | `pg_dump` quotidien avec rotation | interne |

### Entrée d'une bouteille

Les photos d'entrée n'ont pas de tâche BullMQ : la table des photos sert de
file. Un redémarrage du worker ou de Redis ne perd rien. BullMQ porte les
sorties et l'analyse des plans.

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant P as PWA
    participant A as api
    participant DB as PostgreSQL
    participant W as worker
    participant G as Gemini

    U->>P: Photos en rafale
    P->>P: Réduction 1 600 px, file locale
    P->>A: POST /api/photos
    A->>DB: Photo enregistrée, en attente
    Note over W: Passage toutes les 15 s
    W->>DB: Réserve jusqu'à 8 photos
    W->>W: Réserve le quota Gemini (Redis)
    W->>G: Un appel pour le lot
    G-->>W: Fiches lues + cadre de l'étiquette
    W->>DB: Fiches « À confirmer »
    P->>A: GET /api/photos/entry-inbox (toutes les 10 s)
    U->>P: Valider ou Tout valider
    P->>A: POST /api/movements/bulk
    A->>DB: Mouvement d'entrée, stock crédité
```

---

## Stack technique

| Couche | Technologies |
|--------|--------------|
| Frontend | React 18, TypeScript, Vite 5, React Router 6, TanStack Query 5, vite-plugin-pwa, idb |
| Backend | NestJS 10, Passport (Google OAuth 2.0), express-session + connect-redis, argon2, sharp, ExcelJS, zod |
| Files | BullMQ 5, Redis 7 |
| Base de données | PostgreSQL 16 + `pg_trgm`, Prisma 5 |
| IA | Google Gemini (`@google/generative-ai`), modèles Flash ou Lite |
| Tests | Jest (api), Vitest + Testing Library (web) |
| CI/CD | GitHub Actions, release-please, GHCR (`ghcr.io/djkix/ma-cave-api`, `ma-cave-web`) |
| Orchestration | Docker Compose, compatible **Dockge** |

---

## Installation

### Prérequis
- **Node.js** 22 (version des images)
- **Docker**, pour PostgreSQL 16 et Redis 7

### Développement local

```bash
git clone https://github.com/djkix/ma-cave.git
cd ma-cave

docker run -d --name cave-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=cave -p 5432:5432 postgres:16-alpine
docker run -d --name cave-redis -p 6379:6379 redis:7-alpine
```

L'api lit son environnement au démarrage : définir au moins `DATABASE_URL`
(`postgresql://postgres:dev@localhost:5432/cave`) et `SESSION_SECRET`
(32 caractères minimum). Puis, dans trois terminaux :

```bash
cd api && npm ci && npx prisma migrate deploy && npm run seed && npm run start:dev
```

```bash
cd api && npm run start:worker:dev
```

```bash
cd web && npm ci && npm run dev
```

Ouvrir [http://localhost:5173](http://localhost:5173). Vite relaie `/api` vers l'api sur le port 3000.

### Qualité & tests

```bash
cd api && npm run lint && npm test      # Jest ; les suites base de données s'activent avec DATABASE_URL
cd api && npm run build                 # nest build
cd web && npm run lint && npm test      # jetons de design + Vitest
cd web && npm run build                 # tsc --noEmit + vite build
```

La CI (`.github/workflows/ci.yml`) lance ces commandes sur chaque push `main` et
chaque pull request. Elle démarre aussi la stack dans un dossier qui ne
contient que `docker-compose.yml` et `.env`.

---

## Déploiement Docker

La stack est **autonome** : `docker-compose.yml` et son `.env` suffisent. Les
images portent le code, le script de sauvegarde est écrit dans le YAML.

```bash
mkdir -p /opt/stacks/ma-cave && cd /opt/stacks/ma-cave
curl -fsSLO https://raw.githubusercontent.com/djkix/ma-cave/main/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/djkix/ma-cave/main/.env.example
# Éditer .env (voir le tableau ci-dessous)
docker compose pull && docker compose up -d
```

Au démarrage, l'api applique les migrations Prisma puis charge le référentiel
des appellations. Les deux opérations se rejouent sans risque.

### Installation via Dockge

[Dockge](https://dockge.kuma.pet/) déploie la stack depuis son interface web.
Le pas à pas complet est dans le [guide détaillé](docs/guide-detaille.md#déploiement).

1. **Hôte** : VM ou LXC, 2 vCPU, 4 Go de RAM, 40 Go de disque, Docker et Compose
2. Dans Dockge : **+ Compose**, nommer la stack `ma-cave` (rangée dans `/opt/stacks/ma-cave/`)
3. Coller le YAML ci-dessous
4. Coller le `.env` rempli dans le panneau des variables
5. **Images** : `ghcr.io/djkix/ma-cave-api` et `ma-cave-web` sont publiques, aucune authentification n'est nécessaire
6. **Deploy**

```yaml
services:
  web:
    image: ghcr.io/djkix/ma-cave-web:${IMAGE_TAG:-latest}
    build: ./web
    restart: unless-stopped
    ports:
      - "${WEB_PORT:-3100}:80"
    depends_on:
      - api
    networks: [internal]

  api:
    image: ghcr.io/djkix/ma-cave-api:${IMAGE_TAG:-latest}
    build: ./api
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379
      PHOTO_STORAGE_DIR: /data/photos
    volumes:
      - photo_data:/data/photos
    expose: ["3000"]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    networks: [internal]

  worker:
    image: ghcr.io/djkix/ma-cave-api:${IMAGE_TAG:-latest}
    build: ./api
    restart: unless-stopped
    command: ["node", "dist/worker.js"]
    # Un lot en cours (appel Gemini de 2 min au plus) se termine avant l'arrêt.
    stop_grace_period: 150s
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379
      PHOTO_STORAGE_DIR: /data/photos
    volumes:
      - photo_data:/data/photos
    depends_on:
      api: { condition: service_started }
      redis: { condition: service_healthy }
    networks: [internal]

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10
    networks: [internal]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    networks: [internal]

  db-backup:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      PGHOST: postgres
      PGUSER: ${POSTGRES_USER}
      PGPASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: ${POSTGRES_DB}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-30}
      BACKUP_INTERVAL_SECONDS: ${BACKUP_INTERVAL_SECONDS:-86400}
    volumes:
      - ${BACKUP_DIR:-./backups}:/backups
    # Le script est écrit ici même, et non monté depuis le dépôt : Dockge crée la
    # stack à partir de ce seul fichier, sans cloner le dépôt. Un fichier monté
    # absent de l'hôte devient un dossier vide dans le conteneur, `sh` n'y
    # exécute rien, sort avec le code 0, et la sauvegarde ne tourne jamais — ce
    # qui s'est produit en production. Les `$$` sont des `$` échappés pour
    # Docker Compose, qui interpréterait sinon les variables à sa place.
    #
    # Dump quotidien, jamais un fichier tronqué : le nom définitif n'apparaît
    # qu'après un pg_dump ET un gzip réussis. Le dump est fait avec --clean
    # --if-exists, il se restaure donc par-dessus un schéma existant.
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        set -eu
        mkdir -p /backups
        echo "sauvegarde : un dump toutes les $${BACKUP_INTERVAL_SECONDS} s, conservation $${BACKUP_RETENTION_DAYS} jours"
        while true; do
          ts=$$(date +%Y%m%d-%H%M%S)
          raw="/backups/cave-$${ts}.sql.part"
          tmp="/backups/cave-$${ts}.sql.gz.tmp"
          final="/backups/cave-$${ts}.sql.gz"
          # busybox ash n'a pas PIPESTATUS : on dumpe d'abord, on compresse
          # ensuite, afin de tester chaque code de retour séparément.
          if pg_dump --clean --if-exists > "$$raw"; then
            if gzip -c "$$raw" > "$$tmp"; then
              rm -f "$$raw"
              mv "$$tmp" "$$final"
              echo "sauvegarde écrite : $$final"
            else
              rm -f "$$raw" "$$tmp"
              echo "sauvegarde échouée : compression impossible" >&2
            fi
          else
            rm -f "$$raw"
            echo "sauvegarde échouée : pg_dump en erreur" >&2
          fi
          find /backups -name 'cave-*.sql.gz' -mtime "+$${BACKUP_RETENTION_DAYS}" -delete
          sleep "$${BACKUP_INTERVAL_SECONDS}"
        done
    depends_on:
      postgres: { condition: service_healthy }
    networks: [internal]

networks:
  internal:

volumes:
  postgres_data:
  redis_data:
  photo_data:
```

Variables à renseigner dans le `.env` (référence complète :
[Variables d'environnement](#variables-denvironnement)) :

| Variable | Secret ? | Valeur |
|----------|----------|--------|
| `POSTGRES_PASSWORD` | Oui | `openssl rand -hex 24` |
| `SESSION_SECRET` | Oui | `openssl rand -hex 32` (32 caractères minimum) |
| `WEB_ORIGIN` | Non | `https://<domaine>` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Oui | Client OAuth Google |
| `GOOGLE_CALLBACK_URL` | Non | `https://<domaine>/api/auth/google/callback` |
| `ADMIN_EMAILS` | Non | Au moins votre adresse Google |
| `GEMINI_API_KEY` | Oui | Clé Google AI Studio |
| `IMAGE_TAG` | Non | `latest`, ou une version (`2.26.0`) pour figer |

Le `.env` n'est jamais commité et n'entre jamais dans une image.

#### Client OAuth Google

1. Créer un projet dans la [console Google Cloud](https://console.cloud.google.com/projectcreate)
2. **Google Auth Platform** : audience **External**. Dans **Branding** : page d'accueil `https://<domaine>`, règles de confidentialité `https://<domaine>/confidentialite` (page publique). Puis **Publish app**
3. **Clients → Create client**, type **Application Web**, URI de redirection `https://<domaine>/api/auth/google/callback`
4. Relever le **Client ID** et le **Client secret**

Scopes limités à `openid`, `userinfo.email` et `userinfo.profile` : aucune
vérification Google. **Aucun autre scope** ne doit être demandé.

#### Désigner un administrateur

N'importe quel compte Google peut se connecter, mais reste **en attente**
jusqu'à sa validation dans **Réglages › Application** (`/admin`). Les adresses
d'`ADMIN_EMAILS` sont administratrices dès la première connexion :

```bash
ADMIN_EMAILS=admin@example.com
```

C'est un **plancher garanti** : ces comptes ne sont ni blocables ni
rétrogradables depuis `/admin`. Sur une installation neuve, *Créer sa cave*
sur sa propre ligne crée la cave du premier administrateur.

**Compte de secours** : `BREAK_GLASS_EMAIL` et `BREAK_GLASS_PASSWORD`
(12 caractères minimum) créent un compte local, ouvert par `/login?secours`.
Il garde la main sur la cave principale pendant une panne de Google. Vides :
connexion Google seulement.

#### Nginx Proxy Manager

**Proxy Hosts → Add Proxy Host** :
- *Domain Names* : votre domaine
- *Scheme* `http`, *Forward Hostname / IP* de la VM, *Forward Port* `3100`
- *Websockets Support* et *Block Common Exploits* activés
- **SSL** : Let's Encrypt, *Force SSL*, HTTP/2

NPM envoie `X-Forwarded-Proto: https`, relayé tel quel : c'est ce qui pose le
cookie de session `Secure`. **Ne pas** ajouter `proxy_set_header
X-Forwarded-Proto $scheme;` dans la configuration avancée : la connexion
bouclerait.

#### Vérification

```bash
curl -s http://localhost:3100/api/health    # {"status":"ok","version":"…"}
docker compose logs api --tail 50           # en cas d'échec
```

Puis se connecter avec Google, rentrer une bouteille (fiche dans « À
confirmer » en moins d'une minute), télécharger la sauvegarde Excel, et
installer l'application depuis **Réglages › Moi**.

### Mettre à jour

Les images `latest` sont republiées à chaque fusion sur `main`.

```bash
cd /opt/stacks/ma-cave && docker compose pull && docker compose up -d
```

Avant une mise à jour qui change de version mineure, lire la section
**Passage à X.Y** dans le [guide détaillé](docs/guide-detaille.md#passages-de-version).
Versions avec migration ou geste particulier :

| Version | À retenir |
|---------|-----------|
| [2.27.0](docs/guide-detaille.md#passage-à-la-2270-cases-numérotées-par-casier) | Colonnes `cell_prefix` et `cell_boxes` des zones, additive ; **supprimer les zones à grille et relancer l'analyse du plan** |
| [2.24.0](docs/guide-detaille.md#passage-à-la-2240-noms-des-cases) | Colonne `cell_names` des zones, additive |
| [2.19.0](docs/guide-detaille.md#passage-à-la-2190-modèle-de-lia-dans-ladministration) | Colonne `model` du journal Gemini, `GEMINI_PLAN_MODEL` retirée |
| [2.17.0](docs/guide-detaille.md#passage-à-la-2170-analyse-du-plan-plus-visible) | État d'analyse des plans, additive |
| [2.16.0](docs/guide-detaille.md#passage-à-la-2160-propositions-de-zones) | Propositions de zones et grilles, additive |
| [2.14.0](docs/guide-detaille.md#passage-à-la-2140-plusieurs-plans) | Plusieurs plans ; **sauvegarde obligatoire**, retour arrière par restauration |
| [Ma Cave](docs/guide-detaille.md#passage-à-ma-cave-anciennement--cave-a-vin-) | Nouveau nom des images, de la stack et des volumes |
| [2.8.0](docs/guide-detaille.md#passage-à-la-280-plan-de-la-cave) | Plan de la cave, additive |
| [2.7.0](docs/guide-detaille.md#passage-à-la-270-accords-et-descriptifs-par-lots) | Lots d'accords ; `stop_grace_period: 150s` sur le worker |
| [2.6.0](docs/guide-detaille.md#passage-à-la-260-zones-de-la-cave) | Zones de la cave ; retour arrière par restauration |
| [2.2.0](docs/guide-detaille.md#passage-à-la-220-emplacements-et-cote) | Emplacements et cote |
| [2.0.0](docs/guide-detaille.md#passage-à-la-200-une-cave-par-compte) | Une cave par compte ; `ADMIN_EMAILS` à remplir avant |

### Revenir à une version précédente

Chaque version publiée a son tag d'image, `X.Y.Z` (sans `v`), en plus de
`latest`. Pour revenir en arrière, figer la version dans le `.env` :

```bash
IMAGE_TAG=2.25.0
```

puis `docker compose pull && docker compose up -d`. Un retour arrière ne
défait pas une migration déjà appliquée : la section *Passage à* de la version
dit si l'ancienne image tourne sur la base migrée, ou s'il faut restaurer la
sauvegarde.

---

## Sauvegarde et restauration

Le service `db-backup` dépose un `pg_dump` compressé chaque jour dans
`BACKUP_DIR` (`./backups`), conservé 30 jours. Un fichier `cave-*.sql.gz` est
toujours complet. Les dumps (`--clean --if-exists`) se restaurent par-dessus un
schéma existant.

```bash
cd /opt/stacks/ma-cave && docker compose logs db-backup --tail=5 && ls -la backups/
```

```bash
cd /opt/stacks/ma-cave && gunzip -c backups/cave-<date>.sql.gz | docker compose exec -T postgres psql -U cave -d cave
```

Les photos vivent dans le volume `photo_data` : à synchroniser vers un NAS
chaque semaine, `db-backup` ne les couvre pas. Prévoir un test de restauration
trimestriel.

---

## Variables d'environnement

Référence : [`.env.example`](.env.example).

| Variable | Obligatoire | Secret | Description |
|----------|-------------|--------|-------------|
| `TZ` | Non | Non | Fuseau horaire (`Europe/Paris`) |
| `IMAGE_TAG` | Non | Non | `latest` (défaut) ou une version publiée (`2.26.0`) |
| `WEB_PORT` | Non | Non | Seul port publié sur l'hôte, cible du proxy (défaut `3100`) |
| `POSTGRES_USER` | Oui | Non | Utilisateur PostgreSQL (`cave`) |
| `POSTGRES_PASSWORD` | Oui | Oui | Mot de passe PostgreSQL |
| `POSTGRES_DB` | Oui | Non | Nom de la base (`cave`) |
| `SESSION_SECRET` | Oui | Oui | Signature des sessions, 32 caractères minimum (l'api refuse de démarrer sinon) |
| `WEB_ORIGIN` | Prod | Non | Origine publique (redirections OAuth, cookies) |
| `GOOGLE_CLIENT_ID` | Prod | Non | Client OAuth Google |
| `GOOGLE_CLIENT_SECRET` | Prod | Oui | Secret du client OAuth |
| `GOOGLE_CALLBACK_URL` | Prod | Non | `https://<domaine>/api/auth/google/callback`, identique à l'URI déclaré chez Google |
| `ADMIN_EMAILS` | Recommandé | Non | Administrateurs garantis, séparés par des virgules, en minuscules |
| `BREAK_GLASS_EMAIL` | Non | Non | Compte de secours local (vide : aucun) |
| `BREAK_GLASS_PASSWORD` | Non | Oui | Mot de passe du compte de secours, 12 caractères minimum |
| `GEMINI_API_KEY` | Oui* | Oui | Clé Google AI Studio |
| `GEMINI_MODEL` | Non | Non | Modèle de repli quand la liste de Google est indisponible, Flash ou Lite seulement (défaut `gemini-3.8-flash`) |
| `GEMINI_MONTHLY_CAP_CENTS` | Non | Non | Plafond mensuel approximatif en centimes (défaut `500`) |
| `BACKUP_DIR` | Non | Non | Dossier des sauvegardes (défaut `./backups`) |
| `BACKUP_RETENTION_DAYS` | Non | Non | Rétention en jours (défaut `30`) |
| `BACKUP_INTERVAL_SECONDS` | Non | Non | Intervalle entre deux dumps (défaut `86400`) |
| `DATABASE_URL` | Dev local | Oui | URL PostgreSQL (construite par le compose en Docker) |
| `REDIS_URL` | Non | Non | URL Redis (défaut `redis://localhost:6379`, fixée par le compose) |
| `PHOTO_STORAGE_DIR` | Non | Non | Dossier des photos (défaut `./data/photos`, `/data/photos` en Docker) |

\* Sans clé valide, les photos restent en attente d'analyse et repartent seules une fois la clé corrigée.

---

## Structure du projet

```
ma-cave/
├── .env.example                # Modèle de réglages (copier → .env)
├── docker-compose.yml          # Stack complète, sauvegarde comprise
├── api/                        # NestJS : api et worker (même image)
│   ├── prisma/                 # Schéma et migrations SQL
│   └── src/
│       ├── main.ts / worker.ts # Points d'entrée
│       ├── photos/ queue/      # Réception et lots d'analyse
│       ├── vision/             # Gemini : lecture, quotas, pause, modèle
│       ├── cave/ movements/    # Fiche vin, stock, journal
│       ├── zones/ locations/   # Zones, plans, emplacements
│       └── admin/ auth/ …      # Comptes, administration, connexion
├── web/                        # PWA React + Vite, servie par Nginx
│   └── src/ pages/ components/
├── docs/guide-detaille.md      # Détail des fonctionnalités et des migrations
├── CHANGELOG.md                # Détail par commit (release-please)
└── .github/workflows/          # CI, release-please, images GHCR
```

---

## API principale

Toutes les routes sont sous `/api`. Seules `/api/health` et la connexion sont
publiques ; les autres exigent une session. Les routes d'écriture sont
réservées au propriétaire de la cave (403 « Lecture seule » pour un membre),
celles de `/api/admin` aux administrateurs.

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/health` | Statut et version *(public)* |
| `GET` | `/api/auth/google` | Connexion Google *(public)* |
| `GET` | `/api/auth/google/callback` | Retour OAuth *(public)* |
| `POST` | `/api/auth/local-login` | Compte de secours *(public)* |
| `POST` | `/api/auth/logout` | Déconnexion |
| `GET` | `/api/auth/me` | Compte, caves accessibles, rôle courant |
| `PUT` | `/api/auth/current-cave` | Change la cave courante |
| `POST` | `/api/photos` | Envoi d'une photo d'entrée ou de sortie |
| `GET` | `/api/photos/entry-inbox` | Les trois sections de « À confirmer » |
| `POST` | `/api/photos/:id/dismiss` | Écarter une photo |
| `GET` | `/api/photos/:id/image` | Image (`?variant=display` : version nette) |
| `GET` | `/api/photos/:id/events` | Suivi de l'analyse de sortie (SSE) |
| `GET` | `/api/photos/:id/exit-candidates` | Vins candidats pour une sortie |
| `POST` | `/api/movements` · `/bulk` · `/out` | Entrée, entrées groupées, sortie |
| `POST` | `/api/movements/:id/cancel` | Annule un mouvement |
| `GET` | `/api/movements/recent` | Derniers mouvements |
| `GET` | `/api/cave` | Liste (`drinkSoon`, `noApogee`, `dish`…) |
| `GET` | `/api/wines/:id` | Fiche vin |
| `POST` | `/api/wines/:id/inventory` · `/move` | Inventaire, déplacement |
| `PUT/DELETE` | `/api/wines/:id/apogee` · `/rating` | Apogée manuelle, note |
| `POST` | `/api/wines/:id/quotes` | Saisie de la cote |
| `POST` | `/api/wines/:id/pairing/regenerate` | Régénère les accords |
| `POST` | `/api/wines/:id/image-search` | Recherche d'image d'étiquette |
| `POST/DELETE` | `/api/wines/:id/reference-image` | Choisir ou retirer l'image trouvée |
| `PUT` | `/api/producers/:key/description` | Descriptif du domaine *(admin)* |
| `GET` | `/api/locations` | Emplacements de la cave |
| `GET/POST/PATCH/DELETE` | `/api/caves/current/zones` | Zones (ordre, grille, photo, repère) |
| `GET/POST/PATCH/DELETE` | `/api/caves/current/plans` | Plans, image, analyse, propositions |
| `GET/POST/DELETE` | `/api/caves/current/members` | Membres en lecture seule |
| `PATCH` | `/api/caves/current` | Renommer la cave |
| `GET` | `/api/stats` | Statistiques |
| `GET` | `/api/export.xlsx` | Sauvegarde Excel |
| `GET/PATCH/POST` | `/api/admin/users` · `/registrations` | Comptes et inscriptions *(admin)* |
| `GET/PUT` | `/api/admin/budget` · `/gemini-quota` | Budget, modèle en cours et limites par modèle *(admin)* |
| `GET` | `/api/admin/gemini-usage` · `/reading-quality` | Consommation, qualité de lecture *(admin)* |
| `GET/PUT/DELETE` | `/api/admin/vintages` · `/guards` | Règles d'apogée *(admin)* |

### Limites de débit

Compteurs par route (`@nestjs/throttler`) :

| Route | Limite |
|-------|--------|
| `POST /api/auth/local-login` | 5 / min |
| `POST /api/photos` | 30 / min |
| Photo de zone, création et image de plan | 30 / min |
| `POST /api/wines/:id/image-search` | 10 / min |

Un dépassement renvoie `429`. Côté Gemini, l'application reste sous le quota de
la clé : 5 requêtes et 250 000 jetons par minute, 20 requêtes par jour par
défaut, réglables dans **Administration › Coûts de l'IA**.

---

## Roadmap & limites

**Inclus** — voir [Fonctionnalités](#fonctionnalités) : entrée et sortie par
photo, À confirmer, journal, apogée, accords, descriptifs, cote, emplacements,
zones et plans, statistiques, multi-caves, administration, sauvegarde Excel,
PWA, Docker / Dockge.

**Limites connues** (liste complète dans le [guide détaillé](docs/guide-detaille.md#limites))
- Un membre ne peut rien écrire ; une cave n'a qu'un propriétaire
- Une seule note par vin, sans commentaire ni historique
- Envoi des photos seulement application ouverte
- Analyse par lot : 15 s à 1 min avant « À confirmer »
- Photo reportée reprise environ dix jours, puis saisie manuelle
- `GEMINI_MONTHLY_CAP_CENTS` est un plafond approximatif
- 145 appellations dans le référentiel (sur environ 360)

**Hors périmètre** (volontairement)
- Alerte hors de l'application (notification, e-mail) : la liste « à boire » se consulte
- Relevé automatique de la cote sur iDealwine, Wine-Searcher ou Vivino (contraire à leurs conditions d'utilisation)
- Accès à Drive ou Sheets : l'export est un simple téléchargement

---

## Historique des versions

Une entrée par version publiée, la plus récente en haut. Le détail par commit
est dans [`CHANGELOG.md`](CHANGELOG.md). **Les 10 dernières versions** sont
affichées ; le reste est replié sous **Versions antérieures**.

### 2.32.0 — 23 octobre 2026

Publiée ([v2.32.0](https://github.com/djkix/ma-cave/releases/tag/v2.32.0)),
images `ghcr.io/djkix/ma-cave-api:2.32.0` et `-web:2.32.0`.

**Menus en pastilles avec chevron**, logo vers l'accueil, cote sur une ligne,
correction du stock dans le bloc de sortie, historique replié. Aucune migration.

### 2.31.0 — 22 octobre 2026

Publiée ([v2.31.0](https://github.com/djkix/ma-cave/releases/tag/v2.31.0)),
images `ghcr.io/djkix/ma-cave-api:2.31.0` et `-web:2.31.0`.

**Emplacement au doigt** : on touche la case sur la photo du plan pour ranger
ou déplacer une bouteille. Aucune migration.

### 2.30.0 — 22 octobre 2026

Publiée ([v2.30.0](https://github.com/djkix/ma-cave/releases/tag/v2.30.0)),
images `ghcr.io/djkix/ma-cave-api:2.30.0` et `-web:2.30.0`.

**Correctifs de sécurité** (NestJS 11, CSP, compte `node`, port web sur
`127.0.0.1` : `WEB_BIND` à renseigner si NPM vise l'IP de la VM) et **modèle
Gemini choisi automatiquement**, affiché dans l'Administration. Aucune migration.

### 2.29.0 — 22 octobre 2026

Publiée ([v2.29.0](https://github.com/djkix/ma-cave/releases/tag/v2.29.0)),
images `ghcr.io/djkix/ma-cave-api:2.29.0` et `-web:2.29.0`.

**Quotas Gemini par modèle** et **bascule automatique** vers un autre modèle
Flash ou Flash-Lite quand le quota du jour est atteint. Aucune migration.

### 2.28.0 — 22 octobre 2026

Publiée ([v2.28.0](https://github.com/djkix/ma-cave/releases/tag/v2.28.0)),
images `ghcr.io/djkix/ma-cave-api:2.28.0` et `-web:2.28.0`.

**Cote sur iDealwine, Wine-Searcher ou Vivino**, source affichée ; **ajuster
les cases sur le plan** (déplacer, ajouter, voir tout le plan). Aucune
migration.

### 2.27.0 — 22 octobre 2026

Publiée ([v2.27.0](https://github.com/djkix/ma-cave/releases/tag/v2.27.0)),
images `ghcr.io/djkix/ma-cave-api:2.27.0` et `-web:2.27.0`.

**Cases numérotées par casier** (C1…C48, lettre modifiable), cases gardées sur
le plan, vignette du plan recadrée sur la case dans la fiche vin. Migration
additive ; zones à grille existantes à recréer (voir le guide détaillé).

### 2.26.0 — 22 octobre 2026

Publiée ([v2.26.0](https://github.com/djkix/ma-cave/releases/tag/v2.26.0)),
images `ghcr.io/djkix/ma-cave-api:2.26.0` et `-web:2.26.0`.

**Plus d'icône du compte** en haut à droite (onglet Réglages), passage à la
stack `ma-cave` depuis Dockhand. Aucune migration.

### 2.25.0 — 22 octobre 2026

Publiée ([v2.25.0](https://github.com/djkix/ma-cave/releases/tag/v2.25.0)),
images `ghcr.io/djkix/ma-cave-api:2.25.0` et `-web:2.25.0`.

**Onglet Réglages** dans la barre du bas, version en haut à droite des Réglages,
heure de reprise avec le jour nommé (« jeudi à 09:00 »). Aucune migration.

### 2.24.0 — 22 octobre 2026

Publiée ([v2.24.0](https://github.com/djkix/ma-cave/releases/tag/v2.24.0)),
images `ghcr.io/djkix/ma-cave-api:2.24.0` et `-web:2.24.0`.

**Renommer une case** : affichage « Nom (B3) » partout, saisie par le nom,
noms dans la Proposition, Modifier la zone et la grille de rangement. Petite
migration (ajout d'une colonne) ; voir « Passage à la 2.24.0 ».

### 2.23.0 — 22 octobre 2026

Publiée ([v2.23.0](https://github.com/djkix/ma-cave/releases/tag/v2.23.0)),
images `ghcr.io/djkix/ma-cave-api:2.23.0` et `-web:2.23.0`.

**Grille de cases juste sur une photo de biais**, nombre réel de cases repérées,
cases nommées dessinées sur la photo quand une proposition est ouverte. Aucune
migration ; relancer l'analyse du plan.

<details>
<summary><strong>Versions antérieures</strong> (2.22.0 → 1.0.0)</summary>

### 2.22.0 — 21 octobre 2026

Publiée ([v2.22.0](https://github.com/djkix/ma-cave/releases/tag/v2.22.0)),
images `ghcr.io/djkix/ma-cave-api:2.22.0` et `-web:2.22.0`.

**Limites de débit Gemini** respectées avant chaque appel, attente avec heure
de reprise, limites réglables dans l'Administration. Aucune migration.


### 2.21.0 — 21 octobre 2026

Publiée ([v2.21.0](https://github.com/djkix/ma-cave/releases/tag/v2.21.0)),
images `ghcr.io/djkix/ma-cave-api:2.21.0` et `-web:2.21.0`.

**gemini-3.8-flash** comme modèle par défaut. Aucune migration.


### 2.20.0 — 21 octobre 2026

Publiée ([v2.20.0](https://github.com/djkix/ma-cave/releases/tag/v2.20.0)),
images `ghcr.io/djkix/ma-cave-api:2.20.0` et `-web:2.20.0`.

**Analyse du plan réparée** (Google refusait le format imposé), refus de l'IA
affiché à part ; bandeau **Nouvelle version disponible** au lieu du
rechargement forcé. Aucune migration.


### 2.19.0 — 21 octobre 2026

Publiée ([v2.19.0](https://github.com/djkix/ma-cave/releases/tag/v2.19.0)),
images `ghcr.io/djkix/ma-cave-api:2.19.0` et `-web:2.19.0`.

**Modèle de l'IA** choisi dans Administration › Coûts de l'IA (Flash ou Lite,
liste de Google) ; `GEMINI_PLAN_MODEL` retirée. Migration automatique : lire
« Passage à la 2.19.0 ».


### 2.18.1 — 21 octobre 2026

Publiée ([v2.18.1](https://github.com/djkix/ma-cave/releases/tag/v2.18.1)),
images `ghcr.io/djkix/ma-cave-api:2.18.1` et `-web:2.18.1`.

**Gemini Flash ou Lite seulement** : un modèle Pro est refusé au démarrage,
tarif Pro retiré.


### 2.18.0 — 21 octobre 2026

Publiée ([v2.18.0](https://github.com/djkix/ma-cave/releases/tag/v2.18.0)),
images `ghcr.io/djkix/ma-cave-api:2.18.0` et `-web:2.18.0`.

**Détection case par case**, regroupée par meuble ; *Relancer l'analyse* dans
le menu ⋯ du plan ; variable `GEMINI_PLAN_MODEL`. Aucune migration.


### 2.17.1 — 21 octobre 2026

Publiée ([v2.17.1](https://github.com/djkix/ma-cave/releases/tag/v2.17.1)),
images `ghcr.io/djkix/ma-cave-api:2.17.1` et `-web:2.17.1`.

**Photo du plan** : choisie aussi sur ordinateur, bouton *Choisir une photo*
propre, puis *Créer le plan*.

### 2.17.0 — 21 octobre 2026

Publiée ([v2.17.0](https://github.com/djkix/ma-cave/releases/tag/v2.17.0)),
images `ghcr.io/djkix/ma-cave-api:2.17.0` et `-web:2.17.0`.

**Analyse du plan visible** : bandeau avec l'état réel (en cours, pause,
budget, nouvel essai), raison d'un échec et *Relancer l'analyse*. Migration
automatique : lire « Passage à la 2.17.0 ».

### 2.16.0 — 21 octobre 2026

Publiée ([v2.16.0](https://github.com/djkix/ma-cave/releases/tag/v2.16.0)),
images `ghcr.io/djkix/ma-cave-api:2.16.0` et `-web:2.16.0`.

**Propositions de zones** depuis la photo du plan (Gemini), grilles de cases
pour ranger les bouteilles ; **suppression d'une zone garnie** (bouteilles sans
emplacement). Migration automatique : lire « Passage à la 2.16.0 ».

### 2.15.0 — 20 octobre 2026

Publiée ([v2.15.0](https://github.com/djkix/ma-cave/releases/tag/v2.15.0)),
images `ghcr.io/djkix/ma-cave-api:2.15.0` et `-web:2.15.0`.

**Réglages réorganisés** : hub Mon compte (Moi, Ma cave, Application, À
propos), sauvegarde dans Ma cave, Administration en trois onglets, feuilles du
bas et menus « ⋯ ».

### 2.14.0 — 20 octobre 2026

Publiée ([v2.14.0](https://github.com/djkix/ma-cave/releases/tag/v2.14.0)),
images `ghcr.io/djkix/ma-cave-api:2.14.0` et `-web:2.14.0`.

**Plusieurs plans par cave** : onglets dans « Ma cave › Réglages », légende du
plan sur la fiche vin. Migration automatique : lire « Passage à la 2.14.0 ».

### 2.13.0 — 18 octobre 2026

Publiée ([v2.13.0](https://github.com/djkix/ma-cave/releases/tag/v2.13.0)),
images `ghcr.io/djkix/ma-cave-api:2.13.0` et `-web:2.13.0`.

**Zones créées depuis le plan** : toucher l'endroit, le nommer, Enregistrer.

### 2.12.0 — 18 octobre 2026

Publiée ([v2.12.0](https://github.com/djkix/ma-cave/releases/tag/v2.12.0)),
images `ghcr.io/djkix/ma-cave-api:2.12.0` et `-web:2.12.0`.

**Plan au clavier** : poser et déplacer les repères avec Entrée, les flèches et
Échap. **Connexion épurée** : Google seulement, compte de secours par
`/login?secours`.

### 2.11.0 — 17 octobre 2026

Publiée ([v2.11.0](https://github.com/djkix/ma-cave/releases/tag/v2.11.0)),
images `ghcr.io/djkix/ma-cave-api:2.11.0` et `-web:2.11.0`.

**Ma Cave** : nouveau nom partout, dépôt et images `ma-cave`, stack à déplacer
dans `/opt/stacks/ma-cave` (voir « Passage à Ma Cave »). Page
`/confidentialite`, message de connexion clair, nouveau logo.

### 2.10.0 — 15 octobre 2026

Publiée ([v2.10.0](https://github.com/djkix/ma-cave/releases/tag/v2.10.0)),
images `ghcr.io/djkix/ma-cave-api:2.10.0` et `-web:2.10.0`.

**Fiche vin réordonnée** : domaine et accords sous la photo, icône
d'emplacement qui ouvre la photo de la zone et le plan.

### 2.9.1 — 15 octobre 2026

Publiée ([v2.9.1](https://github.com/djkix/ma-cave/releases/tag/v2.9.1)),
images `ghcr.io/djkix/ma-cave-api:2.9.1` et `-web:2.9.1`.

**Photo du plan ou d'une zone** : appareil photo ou galerie, au choix.

### 2.9.0 — 15 octobre 2026

Publiée ([v2.9.0](https://github.com/djkix/ma-cave/releases/tag/v2.9.0)),
images `ghcr.io/djkix/ma-cave-api:2.9.0` et `-web:2.9.0`.

**Nouvelle icône** : une niche de cave en pierre claire et trois bouteilles
debout. Réinstaller l'application pour la voir sur le téléphone.

### 2.8.0 — 13 octobre 2026

Publiée ([v2.8.0](https://github.com/djkix/ma-cave/releases/tag/v2.8.0)),
images `ghcr.io/djkix/ma-cave-api:2.8.0` et `-web:2.8.0`.

**Plan de la cave.** Une photo de la pièce dans « Ma cave › Réglages », avec un repère par
zone, visible depuis la fiche d'un vin et « À boire prochainement ». Migration
`20261017000000_plan_cave`.

### 2.7.0 — 12 octobre 2026

Publiée ([v2.7.0](https://github.com/djkix/ma-cave/releases/tag/v2.7.0)),
images `ghcr.io/djkix/ma-cave-api:2.7.0` et `-web:2.7.0`.

**Accords et descriptifs par lots de dix.** Moins d'appels à Gemini, reprises
patientes (abandon après 7 jours de panne seulement), coût réparti exactement.
Migration `20261016000000_lots_accords`.

### 2.6.0 — 8 octobre 2026

Publiée ([v2.6.0](https://github.com/djkix/ma-cave/releases/tag/v2.6.0)),
images `ghcr.io/djkix/ma-cave-api:2.6.0` et `-web:2.6.0`.

**Zones de la cave et page « Ma cave › Réglages ».** Zones avec indication et photo,
choisies dans une liste à la saisie d'un emplacement (casier et position
libres) ; recherche iDealwine avec des espaces. **Sauvegarder la base avant**
et suivre « Passage à la 2.6.0 ». Migration `20261015000000_zones`.

### 2.5.0 — 8 octobre 2026

Publiée ([v2.5.0](https://github.com/djkix/ma-cave/releases/tag/v2.5.0)),
images `ghcr.io/djkix/ma-cave-api:2.5.0` et `-web:2.5.0`.

**Consommation Gemini et pause commune.** Section « Consommation Gemini » dans
l'Administration (appels réussis, refusés, coût, par jour et par usage) ;
après un refus de Google, une pause commune (5 min ou 1 h) remplace les
reprises en rafale. Migration `20261014000000_gemini_call`.

### 2.4.2 — 8 octobre 2026

Publiée ([v2.4.2](https://github.com/djkix/ma-cave/releases/tag/v2.4.2)),
images `ghcr.io/djkix/ma-cave-api:2.4.2` et `-web:2.4.2`.

**Quota Gemini épuisé signalé.** « Recherche d'image impossible : quota Gemini
épuisé » quand Google refuse la recherche faute de quota, et le motif d'un
refus de l'api est affiché tel quel.

### 2.4.1 — 8 octobre 2026

Publiée ([v2.4.1](https://github.com/djkix/ma-cave/releases/tag/v2.4.1)),
images `ghcr.io/djkix/ma-cave-api:2.4.1` et `-web:2.4.1`.

**Recherche d'image journalisée.** Chaque recherche laisse une trace dans les
journaux de l'api (issue ou raison du refus), et l'écran distingue une coupure
du proxy d'un refus de l'application.

### 2.4.0 — 8 octobre 2026

Publiée ([v2.4.0](https://github.com/djkix/ma-cave/releases/tag/v2.4.0)),
images `ghcr.io/djkix/ma-cave-api:2.4.0` et `-web:2.4.0`.

**À boire prochainement.** Carte sur l'accueil et page `/a-boire` : les vins à
boire au plus tard l'an prochain, regroupés par emplacement.

### 2.3.0 — 8 octobre 2026

Publiée ([v2.3.0](https://github.com/djkix/ma-cave/releases/tag/v2.3.0)),
images `ghcr.io/djkix/ma-cave-api:2.3.0` et `-web:2.3.0`.

**Mon compte.** Installation de l'application sur le téléphone, caves dont on
est propriétaire ou invité, sauvegarde Excel, version et déconnexion, réunies
dans une page ouverte depuis l'icône de l'en-tête.

### 2.2.1 — 8 octobre 2026

Publiée ([v2.2.1](https://github.com/djkix/ma-cave/releases/tag/v2.2.1)),
images `ghcr.io/djkix/ma-cave-api:2.2.1` et `-web:2.2.1`.

**Lien iDealwine corrigé et bouton « Se déconnecter ».** « Voir la cote sur
iDealwine » ouvre leur vraie recherche au lieu d'une page 404 ; l'accueil
propose « Se déconnecter ».

### 2.2.0 — 8 octobre 2026

Publiée ([v2.2.0](https://github.com/djkix/ma-cave/releases/tag/v2.2.0)),
images `ghcr.io/djkix/ma-cave-api:2.2.0` et `-web:2.2.0`.

**Emplacements et cote iDealwine saisie à la main.** Bouteilles rangées par
zone, casier et position, avec « D'où sort-elle ? » à la sortie et
« Ranger / déplacer » ; cote iDealwine reportée à la main depuis un lien
(l'application ne contacte jamais iDealwine), valeur de cession estimée et
« Valeur à la cote » dans les statistiques. **Sauvegarder la base avant** et
suivre « Passage à la 2.2.0 ».

### 2.1.1 — 7 octobre 2026

Publiée ([v2.1.1](https://github.com/djkix/ma-cave/releases/tag/v2.1.1)),
images `ghcr.io/djkix/ma-cave-api:2.1.1` et `-web:2.1.1`.

**Petites corrections.** Appel Gemini abandonné au délai de la recherche
d'image compté dans le budget ; message clair quand une image du web est
proposée pour une entrée ou une sortie.

### 2.1.0 — 7 octobre 2026

Publiée ([v2.1.0](https://github.com/djkix/ma-cave/releases/tag/v2.1.0)),
images `ghcr.io/djkix/ma-cave-api:2.1.0` et `-web:2.1.0`.

**Compte de secours et budget des caves invitées.** Le compte de secours a les
droits du propriétaire sur la cave principale, pour tenir la cave pendant une
panne de Google ; les caves invitées ne dépensent ensemble que 60 % du plafond
Gemini (réglable), le reste étant garanti à la cave principale.

### 2.0.1 — 7 octobre 2026

Publiée ([v2.0.1](https://github.com/djkix/ma-cave/releases/tag/v2.0.1)),
images `ghcr.io/djkix/ma-cave-api:2.0.1` et `-web:2.0.1`.

**Prêt pour les prochains modèles Gemini.** Les appels à Gemini n'envoient plus
de température, que les prochains modèles refuseront. Rien à faire de plus
qu'une mise à jour habituelle (passer d'abord par la 2.0.0 et sa sauvegarde).

### 2.0.0 — 7 octobre 2026

Publiée ([v2.0.0](https://github.com/djkix/ma-cave/releases/tag/v2.0.0)),
images `ghcr.io/djkix/ma-cave-api:2.0.0` et `-web:2.0.0`.

**Une cave par compte.** Inscriptions Google validées par l'administrateur,
membres invités en lecture seule (sans prix, journal ni export), sélecteur de
cave, part du budget Gemini par cave. **Sauvegarder la base avant la mise à
jour** et suivre « Passage à la 2.0.0 » : la migration
`20261012000000_multi_caves` est sans retour.

### 1.9.0 — 7 octobre 2026

Publiée ([v1.9.0](https://github.com/djkix/ma-cave/releases/tag/v1.9.0)),
images `ghcr.io/djkix/ma-cave-api:1.9.0` et `-web:1.9.0`.

**Icône, photos plus nettes et image trouvée sur le web.** L'application a son
icône (un verre de vin sur fond bordeaux) ; les vignettes sont recadrées sur
l'étiquette et retouchées avec douceur ; « Chercher une image » propose
l'étiquette d'Open Food Facts ou du site officiel du domaine, au choix.
Migration `20261011000000_image_reference`.

### 1.8.0 — 6 octobre 2026

Publiée ([v1.8.0](https://github.com/djkix/ma-cave/releases/tag/v1.8.0)),
images `ghcr.io/djkix/ma-cave-api:1.8.0` et `-web:1.8.0`.

**Descriptif du domaine.** Un bloc « Le domaine » sur chaque fiche vin : 3 à
4 phrases par producteur rédigées par Gemini en tâche de fond (« Domaine peu
documenté » quand il ne sait pas), modifiables à la main. Migration
`20261010000000_descriptif_domaine` ; au premier démarrage du worker, tous les
domaines existants sont mis en file.

### 1.7.0 — 6 octobre 2026

Publiée ([v1.7.0](https://github.com/djkix/ma-cave/releases/tag/v1.7.0)),
images `ghcr.io/djkix/ma-cave-api:1.7.0` et `-web:1.7.0`.

**Entrée en rafale, note de dégustation et accords mets-vins.** On photographie
les bouteilles à la suite sans attendre : envoi en arrière-plan, lecture par
lots de huit au plus par appel Gemini, confirmation dans « À confirmer » (badge
sur l'accueil) ; le mode campagne disparaît. Note sur 20 par vin, et plats
suggérés par Gemini avec la recherche « Accompagner un plat ». Migrations
`20261008000000_note_degustation`, `20261008000001_accords_mets_vins` et
`20261009000000_entree_par_lot`, appliquées au démarrage de l'api.

### 1.6.0 — 5 octobre 2026

Publiée ([v1.6.0](https://github.com/djkix/ma-cave/releases/tag/v1.6.0)),
images `ghcr.io/djkix/ma-cave-api:1.6.0` et `-web:1.6.0`.

**Statistiques.** Un 5e onglet *Stats* : valeur de la cave au prix d'achat,
répartition par apogée, couleur, région et millésime, mouvements sur 12 mois
avec le rythme de consommation, et trois classements. Correction : l'export
Excel ignore désormais le prix d'une entrée annulée, comme les statistiques.
Ni migration ni nouvelle variable d'environnement.

### 1.5.0 — 5 octobre 2026

Publiée ([v1.5.0](https://github.com/djkix/ma-cave/releases/tag/v1.5.0)),
images `ghcr.io/djkix/ma-cave-api:1.5.0` et `-web:1.5.0`.

**Mesure « zéro saisie ».** L'Administration affiche la part des champs
corrigés à la main à l'entrée par photo sur 90 jours, par rapport à l'objectif
de 15 %, avec le détail par champ. Correction : la fiche d'une photo déjà lue
se pré-remplit même si le flux temps réel se coupe. Migration
`20261007000000_zero_saisie`.

### 1.4.1 — 5 octobre 2026

Publiée ([v1.4.1](https://github.com/djkix/ma-cave/releases/tag/v1.4.1)),
images `ghcr.io/djkix/ma-cave-api:1.4.1` et `-web:1.4.1`.

**Le stock ne perd plus de mouvement quand deux se croisent.** La vue
`stock_courant` est désormais calculée à chaque lecture au lieu d'être
rafraîchie après chaque mouvement. Migration
`20261006000000_stock_vue_simple` ; le stock se recalcule depuis le journal à
la mise à jour, rien à recompter.

### 1.4.0 — 5 octobre 2026

Publiée ([v1.4.0](https://github.com/djkix/ma-cave/releases/tag/v1.4.0)),
images `ghcr.io/djkix/ma-cave-api:1.4.0` et `-web:1.4.0`.

**À boire en priorité.** Dans l'onglet Cave, la case *À boire en priorité*
garde les vins dont l'apogée se termine au plus tard l'an prochain, la fin la
plus proche en premier ; la case *Sans apogée* liste les vins sans estimation,
signalés par un bandeau « N vins sans apogée estimée — À compléter ». L'export
Excel propose *Seulement les vins à boire en priorité*. Ni migration ni
nouvelle variable d'environnement.

### 1.3.0 — 4 octobre 2026

Publiée ([v1.3.0](https://github.com/djkix/ma-cave/releases/tag/v1.3.0)),
images `ghcr.io/djkix/ma-cave-api:1.3.0` et `-web:1.3.0`.

**L'apogée : une fourchette de buvabilité estimée par règles, recalculée à
chaque lecture.** Fiche vin (fourchette, confiance, statut, correction
manuelle par vin qui prime toujours), mention courte dans l'onglet Cave,
colonnes *Apogée min*, *Apogée max* et *Confiance* dans l'export Excel (apogées
passées mises en évidence), administration réservée aux administrateurs pour
qualifier le millésime d'une région et ajuster la garde d'une appellation
(l'écran rappelle que les rosés se gardent 1 à 3 ans sauf ajustement « Rosé »,
qu'un ajustement « Toutes couleurs » ne s'applique pas à eux).
Migration `20261005000000_lot2b_apogee` (tables `vintage_quality`,
`guard_override`).

### 1.2.0 — 4 octobre 2026

Publiée ([v1.2.0](https://github.com/djkix/ma-cave/releases/tag/v1.2.0)),
images `ghcr.io/djkix/ma-cave-api:1.2.0` et `-web:1.2.0`.

**Le lot 2a boucle le cycle du stock : on peut désormais sortir ce qu'on a
rentré.** Onglet *Cave* (recherche sans accents, filtre couleur, vins
épuisés) ; fiche vin (photo de référence, stock, derniers mouvements, sortie
par quantité, inventaire physique avec écart annoncé) ; sortie par photo
restreinte aux vins en stock, avec choix sur vignettes quand plusieurs
millésimes sont proches et repli sur la cave en cas d'échec ou au bout de
12 s ; photos de sortie jamais reportées. Correction : le déclencheur « stock
jamais négatif » verrouille désormais la ligne du vin, deux sorties
simultanées de la dernière bouteille ne passent plus toutes les deux. Une
photo de sortie réutilisée après une annulation sort bien le vin choisi
ensuite ; réutilisée pour un autre vin sans annulation, elle est refusée en
clair. Une sortie rejouée par le serveur s'annonce « Déjà sortie — il en reste
N ». Le résultat et *Annuler* restent affichés après la sortie de la dernière
bouteille, même au retour sur l'application. Les vignettes de choix affichent
le format (« 150 cl »), et l'inventaire refuse un compte au-delà de 100 000
bouteilles. Une photo d'entrée identique à une ancienne photo de sortie
inutilisée rejoint la revue groupée.

### 1.1.2 — 3 octobre 2026

Version de documentation uniquement ([v1.1.2](https://github.com/djkix/ma-cave/releases/tag/v1.1.2)),
sans changement de code. Désormais, seuls les commits de fonctionnalité, de
correction et de performance déclenchent une nouvelle version : la mise à jour
de la documentation n'ouvre plus de version vide.

### 1.1.1 — 3 octobre 2026

Publiée ([v1.1.1](https://github.com/djkix/ma-cave/releases/tag/v1.1.1)),
images `ghcr.io/djkix/ma-cave-api:1.1.1` et `-web:1.1.1`.

**La sauvegarde de la base tourne enfin.** Le service `db-backup` dépendait d'un
script du dépôt monté depuis l'hôte, absent d'une stack créée dans Dockge : il
redémarrait en boucle sans jamais produire de dump. Le script est désormais écrit
dans le `docker-compose.yml`, la stack est autonome, et l'intégration continue
le vérifie à chaque commit en exigeant un vrai dump. La documentation de
déploiement décrit maintenant la création par Dockge. La construction des images
d'une publication ne peut plus être annulée par un push concurrent.

### 1.1.0 — 21 septembre 2026

Publiée ([v1.1.0](https://github.com/djkix/ma-cave/releases/tag/v1.1.0)),
images `ghcr.io/djkix/ma-cave-api:1.1.0` et `-web:1.1.0`.

**Analyse des photos différée et jamais bloquante.** Une indisponibilité
passagère du service de vision (429, 500, 502, 503, 504, coupure réseau,
plafond mensuel atteint) remet la photo en attente au lieu de la marquer en
échec, et le worker la reprend de 30 s à 15 minutes d'intervalle pendant une
dizaine de jours. Les erreurs définitives, elles, échouent immédiatement et
proposent la saisie manuelle. Le worker remet en file au démarrage les photos
que Redis a oubliées, un bandeau compte les photos en attente avec le motif du
dernier report, et l'écran d'entrée unitaire n'attend plus indéfiniment. La
migration `20260925000000_photo_deferred_retry` récupère les photos déjà
abandonnées à tort.

**Version affichée en permanence** en haut à droite de chaque écran et sur
l'écran de connexion, avec l'empreinte du commit pour une image `latest`.

### 1.0.0 — 21 septembre 2026

Première version déployable ([v1.0.0](https://github.com/djkix/ma-cave/releases/tag/v1.0.0)),
images `ghcr.io/djkix/ma-cave-api:1.0.0` et `-web:1.0.0`.

**Fonctionnalités**

- Socle auto-hébergé : Compose (`web`, `api`, `worker`, `postgres`, `redis`,
  `db-backup`), un seul port publié derrière Nginx Proxy Manager, intégration
  continue et publication automatique des images.
- Comptes : connexion Google OpenID Connect (scopes `openid`, `email`,
  `profile`), inscription libre avec accès complet immédiat, compte local de
  secours, sessions serveur en Redis.
- Administration (`/admin`) : blocage et réactivation des comptes, promotion et
  retrait des droits, avec `ADMIN_EMAILS` comme plancher garanti.
- Entrée de stock par photo : capture native, normalisation de l'image,
  extraction par Gemini avec confiance par champ, recalage sur le référentiel des
  appellations, dédoublonnage, écran de confirmation éditable, quantité en un tap.
- Mode campagne : rafale puis revue groupée triée par confiance croissante.
- File hors ligne (20 photos / 50 Mo) vidée au premier plan.
- Journal des 20 derniers mouvements avec annulation par mouvement inverse.
- Export Excel à la demande (`Stock`, `Mouvements`, `Référence`) avec filtre par
  couleur.

**Sécurité et exploitation**

- Contrôle d'accès par statut de compte : un blocage coupe la session en cours
  dès la requête suivante.
- L'API d'administration n'expose ni hachage de mot de passe ni identifiant
  Google.
- Sauvegardes quotidiennes de la base avec rotation, sans fichier tronqué.
- Limitation de débit sur l'envoi de photos et sur la connexion locale.
- Plafond mensuel de dépense pour l'API de vision.

**Corrections de la première mise en service**

- Moteurs Prisma compilés pour OpenSSL 3 (l'api et le worker ne démarraient pas).
- En-tête `X-Forwarded-Proto` relayé tel quel (le cookie de session n'était
  jamais posé derrière le proxy et la connexion bouclait).
- Démarrage possible avec un `.env` dont les variables de secours sont vides.

</details>

---

## Licence

MIT — voir [`LICENSE`](LICENSE).
