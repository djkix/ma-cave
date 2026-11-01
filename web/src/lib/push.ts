import { deletePushSubscription, getPushKey, savePushSubscription } from './api-client';

/** `unsupported` : pas de Web Push ici (iPhone hors application installée, développement sans service worker…). */
export type PushState = 'unsupported' | 'denied' | 'enabled' | 'disabled';

/** La clé VAPID arrive en base64url ; `subscribe` la veut en octets (Safari n'accepte pas la chaîne). */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

export async function pushState(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await reg.pushManager.getSubscription()) ? 'enabled' : 'disabled';
}

/** Demande la permission, abonne l'appareil avec la clé du serveur et envoie l'abonnement. */
export async function enablePush(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'disabled';
  const { publicKey } = await getPushKey();
  // Un ancien abonnement peut porter une autre clé (clés imposées par l'environnement) : on repart de zéro.
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await savePushSubscription(sub.toJSON());
  return 'enabled';
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await deletePushSubscription(sub.endpoint);
    await sub.unsubscribe();
  }
  return 'disabled';
}
