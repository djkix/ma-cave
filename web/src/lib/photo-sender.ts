import { uploadPhoto } from './api-client';
import { flushQueue, notifyQueueChanged } from './offline-queue';

let inFlight: Promise<void> | null = null;
// Compte dont la file part : le propriétaire connecté, posé par useBackgroundSender.
// Nul (déconnecté, membre en lecture seule, compte en attente) : rien ne part.
let account: string | null = null;
// Cave courante : seules ses photos partent (le serveur range chaque envoi dans la cave de la session).
let cave: string | null = null;

export function setSenderAccount(userId: string | null, caveId: string | null = null): void {
  account = userId;
  cave = caveId;
}

/**
 * Vidange la file locale, à vol unique dans toute l'application : si une
 * vidange est déjà en cours, l'appel renvoie la même promesse au lieu d'en
 * démarrer une seconde en parallèle (deux onglets ou deux instances du hook
 * ne doivent jamais envoyer la même photo deux fois).
 */
export function sendQueuedPhotos(): Promise<void> {
  const owner = account;
  const here = cave;
  if (!owner) return Promise.resolve();
  inFlight ??= (async () => {
    try {
      await flushQueue(uploadPhoto, owner, here);
    } finally {
      inFlight = null;
      notifyQueueChanged();
    }
  })();
  return inFlight;
}

/** Déclenche une vidange sans attendre son résultat (appel « tire et oublie »). */
export function kickSender(): void {
  void sendQueuedPhotos();
}

export function _resetSenderForTests(): void {
  inFlight = null;
  account = null;
  cave = null;
}
