import { AROMAS } from './traits';
import { traitsSchema } from './traits.dto';

describe('traitsSchema', () => {
  it('accepte une correction valide', () => {
    expect(traitsSchema.safeParse({ tannin: 'MOYEN', aromas: ['boisé'], country: null }).success).toBe(true);
  });
  it('refuse un arôme hors liste', () => {
    expect(traitsSchema.safeParse({ aromas: ['chocolat'] }).success).toBe(false);
  });
  it('refuse six arômes', () => {
    expect(traitsSchema.safeParse({ aromas: AROMAS.slice(0, 6) }).success).toBe(false);
  });
  it('région : une des douze, ou null pour l’effacer', () => {
    expect(traitsSchema.safeParse({ region: 'Loire' }).success).toBe(true);
    expect(traitsSchema.safeParse({ region: null }).success).toBe(true);
    expect(traitsSchema.safeParse({ region: 'Toscane' }).success).toBe(false);
  });
});
