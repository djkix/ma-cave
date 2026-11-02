import { z } from 'zod';
import { AROMAS, MAX_AROMAS, TANNINS } from './traits';

/** Correction manuelle : seules les clés présentes sont modifiées (null efface le tanin ou le pays). */
export const traitsSchema = z.object({
  tannin: z.enum(TANNINS).nullable().optional(),
  aromas: z
    .array(z.string().refine((a) => AROMAS.includes(a), 'Arôme inconnu'))
    .max(MAX_AROMAS, `${MAX_AROMAS} arômes au plus`)
    .optional(),
  country: z.enum(['FR', 'AUTRE']).nullable().optional(),
});

export type TraitsInput = z.infer<typeof traitsSchema>;
