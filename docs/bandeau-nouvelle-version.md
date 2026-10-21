# Bandeau « Nouvelle version disponible » : guide de reproduction

Extrait de kitchen-inventory (React + Vite + vite-plugin-pwa, API qui expose sa
version sur `/health`). À donner tel quel à un assistant sur ma-cave.

## Principe

Deux signaux, parce qu'aucun des deux ne suffit seul :

1. **Le service worker** a téléchargé une nouvelle coque et attend d'être
   activé (`needRefresh`). Couvre le cas normal.
2. **Un écart de version** entre la coque chargée (figée au build) et celle que
   renvoie l'API. Couvre le cas où le navigateur sert un cache périmé et où le
   service worker n'a même pas vu la nouvelle version.

Le bandeau s'affiche si l'un OU l'autre est vrai. Le bouton « Recharger »
active le service worker en attente **et** recharge en dur après 1,5 s, sinon
le cas 2 ne se débloque jamais (il n'y a pas de service worker en attente).

## Étape 0 : les deux versions

**Côté build** — `vite.config.ts` :

```ts
const appVersion = process.env.APP_VERSION ?? 'dev';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    VitePWA({
      // « prompt » et non « autoUpdate » : on propose, on ne recharge pas
      // sous les doigts de l'utilisateur.
      registerType: 'prompt',
      injectRegister: false,   // l'enregistrement est fait par lib/pwa.ts
      // … manifest, workbox
    }),
  ],
});
```

`src/globals.d.ts` :

```ts
/// <reference types="vite-plugin-pwa/react" />

/** Injecté par Vite au build (`define`) : version de l'interface. */
declare const __APP_VERSION__: string;
```

`docker/Dockerfile` — la valeur vient de la CI, pas du code :

```dockerfile
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=${APP_VERSION}
```

et dans le workflow de build d'image : `build-args: APP_VERSION=<version publiée>`.

**Côté serveur** — l'API renvoie sa propre version sur son endpoint de santé,
lue depuis la même variable d'environnement `APP_VERSION`. Le point important :
les deux moitiés de l'image sont étiquetées par **la même** valeur au même
`docker build`. C'est ce qui rend l'écart significatif.

> Next.js : `NEXT_PUBLIC_*` est figé au `next build`, donc inutilisable avec une
> image construite une fois par la CI. Même parade que pour le Client ID
> Google : servir la version de l'interface depuis le backend à l'exécution, ou
> construire l'image par environnement.

## La comparaison : `lib/version.ts`

```ts
/**
 * Version affichée dans l'interface. Deux sources : celle figée dans la coque
 * à la construction de l'image, et celle que renvoie l'API. Un écart signifie
 * que le service worker sert une interface plus ancienne que le serveur.
 */
export const WEB_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

function isReleased(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export interface VersionState {
  /** Ce qu'il faut afficher, par exemple « 0.4.1 ». */
  label: string;
  /** Vrai quand l'interface en cache est plus ancienne que le serveur. */
  stale: boolean;
}

export function versionState(apiVersion: string | undefined, webVersion: string = WEB_VERSION): VersionState {
  if (!apiVersion) return { label: webVersion, stale: false };
  // En développement, les deux valeurs ne sont pas des numéros de version
  // publiés : l'écart n'a pas de sens, on ne le signale pas.
  const comparable = isReleased(apiVersion) && isReleased(webVersion);
  return { label: apiVersion, stale: comparable && apiVersion !== webVersion };
}
```

Le garde-fou `isReleased` est ce qui empêche le bandeau de clignoter en
permanence en développement (`dev` ≠ `0.0.0-dev`).

## Le service worker : `lib/pwa.ts`

```ts
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Intervalle entre deux vérifications de mise à jour, application ouverte. */
const UPDATE_CHECK_MS = 30 * 60_000;
/** Délai avant le rechargement de secours, si aucun service worker n'attendait. */
const RELOAD_FALLBACK_MS = 1500;

export interface AppUpdate {
  /** Vrai quand une nouvelle version est téléchargée et attend d'être activée. */
  needRefresh: boolean;
  /** Active la nouvelle version et recharge l'application. */
  reload: () => void;
}

/**
 * Suit les mises à jour du service worker. Une application installée ne
 * vérifie d'elle-même qu'au lancement : on relance la vérification toutes les
 * trente minutes et à chaque retour au premier plan, sinon une version déployée
 * en journée n'arrive sur le téléphone qu'au prochain démarrage complet.
 */
export function useAppUpdate(): AppUpdate {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => undefined);
      window.setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  return {
    needRefresh,
    reload: () => {
      void updateServiceWorker(true);
      // Sans service worker en attente, `updateServiceWorker` ne recharge rien :
      // ce filet couvre le cas d'une coque périmée repérée par l'écart de version.
      window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
    },
  };
}
```

Les deux relances (toutes les 30 min, et au retour au premier plan) sont ce qui
fait vraiment la différence sur mobile : une PWA installée ne vérifie d'elle-même
qu'au démarrage à froid, et un téléphone ne redémarre jamais vraiment une appli.

## Le bandeau : `components/shell/update-banner.tsx`

La vue est séparée du branchement sur les données : la vue se teste sans réseau
ni service worker, en lui passant simplement `visible`, `version` et `onReload`.

```tsx
import { Button } from '../ui/button';
import { useHealthQuery } from '../../lib/queries';
import { useAppUpdate } from '../../lib/pwa';
import { versionState } from '../../lib/version';

interface UpdateBannerViewProps {
  visible: boolean;
  /** Version proposée, affichée quand le serveur l'a déjà annoncée. */
  version: string | null;
  onReload: () => void;
}

/**
 * Bandeau de mise à jour, au-dessus de la barre de navigation. Il reste sous
 * l'écran de scan, qui s'affiche par-dessus : une session de scan ne doit pas
 * être interrompue par une proposition de rechargement.
 */
export function UpdateBannerView({ visible, version, onReload }: UpdateBannerViewProps) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="safe-bottom fixed inset-x-0 bottom-[var(--spacing-nav)] z-30 mx-auto max-w-lg px-3 pb-2"
    >
      <div className="flex items-center gap-3 rounded-card border border-line bg-raised px-4 py-3 shadow-lg">
        <p className="flex-1 text-[14px] leading-snug">
          Nouvelle version disponible{version ? ` (${version})` : ''}.
        </p>
        <Button variant="primary" size="sm" onClick={onReload}>
          Recharger
        </Button>
      </div>
    </div>
  );
}

export function UpdateBanner() {
  const update = useAppUpdate();
  const health = useHealthQuery();
  const { label, stale } = versionState(health.data?.version);

  // Deux signaux complémentaires : le service worker a téléchargé une nouvelle
  // coque, ou le serveur annonce une version plus récente que celle chargée,
  // cas d'un cache qui n'a pas encore été rafraîchi.
  const visible = update.needRefresh || stale;

  return <UpdateBannerView visible={visible} version={stale ? label : null} onReload={update.reload} />;
}
```

`useHealthQuery` est une requête TanStack Query ordinaire sur l'endpoint de
santé de l'API. Lui donner un `refetchInterval` (quelques minutes) : sans
rafraîchissement, le signal n°2 n'arrive jamais sur une application restée
ouverte. Monter `<UpdateBanner />` une seule fois, dans la coque applicative.

## En complément : la version au bas des réglages

Information d'administration, pas un élément du quotidien — elle ne va pas sur
les écrans courants :

```tsx
export function VersionBadge({ className }: { className?: string }) {
  const health = useHealthQuery();
  const { label, stale } = versionState(health.data?.version);

  return (
    <p className={cn('px-4 pb-2 pt-6 text-center text-[12px] text-faint', className)}>
      <span>Inventaire {label}</span>
      {stale && (
        <>
          {' · '}
          <span className="text-soon">interface {__APP_VERSION__}, fermez puis rouvrez l’application</span>
        </>
      )}
    </p>
  );
}
```

## Pièges rencontrés

1. **`registerType: 'autoUpdate'`** recharge la page sans prévenir. Sur une
   application où l'on est en train de saisir quelque chose, c'est une perte de
   saisie. D'où `'prompt'` et le bandeau.
2. **`injectRegister: false`** : sinon le plugin injecte son propre
   enregistrement et `useRegisterSW` n'a plus la main sur le registration, donc
   plus de vérification périodique.
3. **Le rechargement de secours** (1,5 s) : sans lui, le bouton « Recharger » ne
   fait rien du tout dans le cas de l'écart de version, puisqu'aucun service
   worker n'attend. C'est le bug le plus déroutant de l'ensemble.
4. **Les deux versions doivent venir du même build.** Si la coque est construite
   à un moment et l'API étiquetée à un autre, l'écart est permanent et le
   bandeau ne disparaît plus jamais.
5. **Pas de service worker sans HTTPS** (sauf `localhost`). Le signal n°1
   n'existe pas en HTTP ; le signal n°2, lui, fonctionne partout.
6. **Ne jamais mettre l'API dans le cache du service worker** : seule la coque.
   Sinon la version renvoyée par `/health` est elle-même périmée et plus rien ne
   peut détecter quoi que ce soit.
