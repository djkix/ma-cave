import { tastedPairingSchema } from './tasted-pairing.dto';

describe('tastedPairingSchema', () => {
  it('accepte un plat reconnu ou non', () => {
    expect(tastedPairingSchema.parse({ dish: ' Poulet aux morilles ', dishId: 'poulet-roti', good: true })).toEqual({ dish: 'Poulet aux morilles', dishId: 'poulet-roti', good: true });
    expect(tastedPairingSchema.parse({ dish: 'Soupe miso', good: false })).toEqual({ dish: 'Soupe miso', dishId: null, good: false });
  });
  it('refuse un plat vide, un avis absent, un identifiant mal formé', () => {
    expect(tastedPairingSchema.safeParse({ dish: '  ', good: true }).success).toBe(false);
    expect(tastedPairingSchema.safeParse({ dish: 'Poulet' }).success).toBe(false);
    expect(tastedPairingSchema.safeParse({ dish: 'Poulet', dishId: 'Poulet Rôti', good: true }).success).toBe(false);
  });
});
