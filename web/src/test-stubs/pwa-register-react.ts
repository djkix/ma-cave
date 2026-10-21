/**
 * Remplaçant du module virtuel `virtual:pwa-register/react`, fourni par
 * vite-plugin-pwa au build et absent sous Vitest (voir l'alias dans
 * vitest.config.ts). Aucun service worker en jsdom : jamais de mise à jour en
 * attente. Un test qui veut le cas contraire remplace `useAppUpdate`.
 */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => undefined] as [boolean, (v: boolean) => void],
    offlineReady: [false, () => undefined] as [boolean, (v: boolean) => void],
    updateServiceWorker: async () => undefined,
  };
}
