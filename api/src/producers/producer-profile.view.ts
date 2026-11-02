import { PRODUCER_FIELDS, ProducerField } from '../vision/producer-output';

/** Ce que la fiche vin et la page Domaine montrent du domaine. */
export interface ProducerProfileView {
  key: string;
  displayName: string;
  status: string;
  /** Ancien descriptif libre, gardé pour les clients en cache ; le web lit `fields`. */
  description: string | null;
  fields: Record<ProducerField, string | null>;
  /** Champs corrigés à la main : la génération automatique ne les écrase jamais. */
  manualFields: string[];
  source: string;
  errorMessage: string | null;
  generatedAt: Date | null;
  /**
   * Auteur de la dernière correction : nom affiché, à défaut e-mail ; null sinon.
   * Pour un membre (VIEWER) : nom affiché ou null, jamais un e-mail (comme `ratedBy`).
   */
  updatedBy: string | null;
}

export type ProducerProfileRow = Record<ProducerField, string | null> & {
  producerKey: string;
  displayName: string;
  status: string;
  description: string | null;
  manualFields: string[];
  source: string;
  errorMessage: string | null;
  generatedAt: Date | null;
  updatedBy: { displayName: string | null; email: string } | null;
};

/** À passer en `include` pour lire l'auteur avec la fiche. */
export const PRODUCER_PROFILE_INCLUDE = { updatedBy: { select: { displayName: true, email: true } } } as const;

/** Les cinq champs d'une fiche. */
export const producerFieldsOf = (p: Record<ProducerField, string | null>) =>
  Object.fromEntries(PRODUCER_FIELDS.map((f) => [f, p[f]])) as Record<ProducerField, string | null>;

/** `role` : rôle du lecteur dans la cave ; seul OWNER peut voir l'e-mail de l'auteur. */
export function producerProfileOf(p: ProducerProfileRow | null, role: 'OWNER' | 'VIEWER'): ProducerProfileView | null {
  if (!p) return null;
  return {
    key: p.producerKey,
    displayName: p.displayName,
    status: p.status,
    description: p.description,
    fields: producerFieldsOf(p),
    manualFields: p.manualFields,
    source: p.source,
    errorMessage: p.errorMessage,
    generatedAt: p.generatedAt,
    updatedBy: p.updatedBy ? (p.updatedBy.displayName ?? (role === 'OWNER' ? p.updatedBy.email : null)) : null,
  };
}
