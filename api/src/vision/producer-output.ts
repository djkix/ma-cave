export const MIN_PRODUCER_FIELD = 20;
export const MAX_PRODUCER_FIELD = 600;

/** Les cinq champs de la fiche d'un domaine, dans l'ordre d'affichage. */
export const PRODUCER_FIELDS = ['histoire', 'terroir', 'cepages', 'style', 'nez'] as const;
export type ProducerField = (typeof PRODUCER_FIELDS)[number];
export type ProducerFields = Record<ProducerField, string>;

/**
 * Réponse de Gemini inexploitable pour un descriptif de domaine. Le message
 * commence par « Sortie du modèle invalide » : `isTransientVisionFailure` la
 * classe en échec définitif, et la file ne la rejoue pas.
 */
export class ProducerInvalidOutputError extends Error {
  /** `costCents` : l'appel a abouti et il est facturé même si sa sortie est inexploitable (posé par le fournisseur). */
  constructor(message: string, readonly costCents = 0) {
    super(message);
  }
}

const invalid = (why: string) => new ProducerInvalidOutputError(`Sortie du modèle invalide : ${why}`);

export type ProducerOutput = { known: true; fields: ProducerFields } | { known: false };

/** `{"connu": false}` ou `{"connu": true, "histoire": …, …, "nez": …}`, chaque champ de 20 à 600 caractères après rognage. */
export function parseProducerOutput(raw: unknown): ProducerOutput {
  if (!raw || typeof raw !== 'object') throw invalid('réponse non objet');
  const obj = raw as Record<string, unknown>;
  if (obj.connu === false) return { known: false };
  if (obj.connu !== true) throw invalid('champ « connu » absent');
  const fields = {} as ProducerFields;
  for (const name of PRODUCER_FIELDS) {
    const value = obj[name];
    if (typeof value !== 'string') throw invalid(`champ « ${name} » absent`);
    const text = value.trim();
    if (text.length < MIN_PRODUCER_FIELD) throw invalid(`champ « ${name} » trop court`);
    if (text.length > MAX_PRODUCER_FIELD) throw invalid(`champ « ${name} » trop long`);
    fields[name] = text;
  }
  return { known: true, fields };
}
