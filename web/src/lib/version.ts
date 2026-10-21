/**
 * Version affichée dans la barre de titre, sur tous les écrans.
 *
 * La valeur est injectée à la construction de l'image par l'intégration continue
 * (`VITE_APP_VERSION`, voir .github/workflows/docker-build.yml) : le numéro de
 * version publié pour une image taguée, et ce même numéro suivi de l'empreinte du
 * commit pour une image `latest` construite depuis `main`. Une construction locale
 * sans variable affiche « dev ».
 */
export const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || 'dev';

/** Vrai pour un numéro publié (`2.17.1`), faux pour `dev` ou `2.17.1+ab12cd3`. */
function isReleased(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export interface VersionState {
  /** Ce qu'il faut afficher, par exemple « 2.17.1 ». */
  label: string;
  /** Vrai quand l'interface en cache est plus ancienne que le serveur. */
  stale: boolean;
}

/**
 * Compare la version figée dans la coque à celle que renvoie l'API. Les deux
 * moitiés sont étiquetées par la même valeur au même `docker build` : un écart
 * signifie que le navigateur sert une coque périmée.
 *
 * En développement, ou pour une image `latest` (`2.17.1+ab12cd3`), les valeurs
 * ne sont pas des numéros publiés : l'écart n'a pas de sens, on ne le signale
 * pas, sinon le bandeau resterait affiché en permanence.
 */
export function versionState(apiVersion: string | undefined, webVersion: string = APP_VERSION): VersionState {
  if (!apiVersion) return { label: webVersion, stale: false };
  const comparable = isReleased(apiVersion) && isReleased(webVersion);
  return { label: apiVersion, stale: comparable && apiVersion !== webVersion };
}
