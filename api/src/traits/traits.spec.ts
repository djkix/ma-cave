import { parseTraitsOutput } from './traits';

describe('parseTraitsOutput', () => {
  it('normalise le tanin, les arômes (sans casse ni accents) et le pays', () => {
    expect(parseTraitsOutput({ tanin: 'moyen', aromes: ['Boisé', 'noisette', 'inventé'], pays: 'France' })).toEqual({
      tannin: 'MOYEN',
      aromas: ['boisé', 'noisette'],
      country: 'FR',
    });
  });

  it('garde les cinq premiers arômes valides', () => {
    const aromes = ['fruits rouges', 'fruits noirs', 'agrumes', 'floral', 'épicé', 'cuir', 'miel'];
    expect(parseTraitsOutput({ tanin: null, aromes, pays: 'France' }).aromas).toEqual(aromes.slice(0, 5));
  });

  it('classe un autre pays en AUTRE', () => {
    expect(parseTraitsOutput({ tanin: null, aromes: [], pays: 'Italie' })).toEqual({ tannin: null, aromas: [], country: 'AUTRE' });
  });

  it('tanin inconnu : null ; pays absent : null', () => {
    const out = parseTraitsOutput({ tanin: 'énorme', aromes: [] });
    expect(out.tannin).toBeNull();
    expect(out.country).toBeNull();
  });

  it('refuse une sortie qui n’est pas un objet', () => {
    expect(() => parseTraitsOutput('x')).toThrow(/^Sortie du modèle invalide/);
  });
});
