import { z } from 'zod';
import { AROMAS, MAX_AROMAS, REGIONS, TANNINS } from './traits';

/** Correction manuelle : seules les clés présentes sont modifiées (null efface le tanin, le pays ou la région). */
export const traitsSchema = z.object({
  tannin: z.enum(TANNINS).nullable().optional(),
  aromas: z
    .array(z.string().refine((a) => AROMAS.includes(a), 'Arôme inconnu'))
    .max(MAX_AROMAS, `${MAX_AROMAS} arômes au plus`)
    .optional(),
  country: z.enum(['FR', 'AUTRE']).nullable().optional(),
  region: z.string().refine((r) => REGIONS.includes(r), 'Région inconnue').nullable().optional(),
});

export type TraitsInput = z.infer<typeof traitsSchema>;
