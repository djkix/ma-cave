import { parseTraitsOutput } from './traits';

describe('parseTraitsOutput', () => {
  it('normalise le tanin, les arômes (sans casse ni accents) et le pays', () => {
    expect(parseTraitsOutput({ tanin: 'moyen', aromes: ['Boisé', 'noisette', 'inventé'], pays: 'France' })).toEqual({
      tannin: 'MOYEN',
      aromas: ['boisé', 'noisette'],
      grapes: [],
      country: 'FR',
      region: null,
      guard: null,
    });
  });

  it('région de la liste fermée (sans accents ni casse), sinon null ; garde entière cohérente, sinon null', () => {
    expect(parseTraitsOutput({ pays: 'France', region: 'rhone', garde: { min: 3, max: 10 } })).toMatchObject({ region: 'Rhône', guard: { min: 3, max: 10 } });
    expect(parseTraitsOutput({ pays: 'Italie', region: 'Toscane' })).toMatchObject({ country: 'AUTRE', region: null, guard: null });
    expect(parseTraitsOutput({ pays: 'Italie', region: 'Rhône' }).region).toBeNull();
    expect(parseTraitsOutput({ garde: { min: 8, max: 2 } }).guard).toBeNull();
    expect(parseTraitsOutput({ garde: { min: -1, max: 2 } }).guard).toBeNull();
    expect(parseTraitsOutput({ garde: { min: 0, max: 61 } }).guard).toBeNull();
    expect(parseTraitsOutput({ garde: { min: 1.6, max: 4.2 } }).guard).toEqual({ min: 2, max: 4 });
  });

  it('cépages : espaces resserrés, vides, trop longs et doublons écartés, six au plus', () => {
    const cepages = [' Syrah ', 'syrah', 'Grenache  Noir', '', 42, 'x'.repeat(41), 'Mourvèdre', 'Cinsault', 'Carignan', 'Counoise', 'Vaccarèse'];
    expect(parseTraitsOutput({ cepages }).grapes).toEqual(['Syrah', 'Grenache Noir', 'Mourvèdre', 'Cinsault', 'Carignan', 'Counoise']);
    expect(parseTraitsOutput({ cepages: 'Syrah' }).grapes).toEqual([]);
  });

  it('garde les cinq premiers arômes valides', () => {
    const aromes = ['fruits rouges', 'fruits noirs', 'agrumes', 'floral', 'épicé', 'cuir', 'miel'];
    expect(parseTraitsOutput({ tanin: null, aromes, pays: 'France' }).aromas).toEqual(aromes.slice(0, 5));
  });

  it('classe un autre pays en AUTRE', () => {
    expect(parseTraitsOutput({ tanin: null, aromes: [], pays: 'Italie' })).toEqual({ tannin: null, aromas: [], grapes: [], country: 'AUTRE', region: null, guard: null });
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
