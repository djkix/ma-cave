import { z } from 'zod';

/** Accord vécu : plat servi (texte libre), entrée de la base d'accords reconnue (facultative), avis. */
export const tastedPairingSchema = z.object({
  dish: z.string().trim().min(1, 'Indique le plat').max(100, 'Plat trop long (100 caractères au plus)'),
  dishId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Entrée de la base invalide').max(60).nullable().default(null),
  good: z.boolean({ required_error: 'Indique si l’accord était bon', invalid_type_error: 'Indique si l’accord était bon' }),
});

export type TastedPairingInput = z.infer<typeof tastedPairingSchema>;
