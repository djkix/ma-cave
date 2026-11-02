import { z } from 'zod';

export const PRODUCER_FIELD_LENGTH = 600;
const LENGTH = `Le texte doit faire entre 1 et ${PRODUCER_FIELD_LENGTH} caractères`;

/** Champ de la fiche d'un domaine corrigé à la main : 1 à 600 caractères une fois rogné. */
export const producerFieldSchema = z.object({
  value: z
    .string({ required_error: LENGTH, invalid_type_error: LENGTH })
    .trim()
    .min(1, LENGTH)
    .max(PRODUCER_FIELD_LENGTH, LENGTH),
});
