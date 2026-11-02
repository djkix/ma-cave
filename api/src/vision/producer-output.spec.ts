import { isTransientVisionFailure } from '../queue/transient-failure';
import { PRODUCER_FIELDS, ProducerInvalidOutputError, parseProducerOutput } from './producer-output';

const text = (n: number) => 'a'.repeat(n);
const FIELDS = {
  histoire: 'Domaine familial fondé en 1834 au Castellet.',
  terroir: 'Restanques argilo-calcaires face à la mer.',
  cepages: 'Mourvèdre majoritaire, grenache et cinsault.',
  style: 'Rouges de garde, rosés de gastronomie.',
  nez: 'Fruits noirs, garrigue, cuir avec l’âge.',
};

describe('parseProducerOutput', () => {
  it('rend les cinq champs rognés d’un domaine connu', () => {
    const raw = { connu: true, ...FIELDS, histoire: `  ${FIELDS.histoire}  ` };
    expect(parseProducerOutput(raw)).toEqual({ known: true, fields: FIELDS });
  });

  it('nomme les cinq champs dans l’ordre', () => {
    expect(PRODUCER_FIELDS).toEqual(['histoire', 'terroir', 'cepages', 'style', 'nez']);
  });

  it('rend « inconnu » pour un domaine peu documenté', () => {
    expect(parseProducerOutput({ connu: false })).toEqual({ known: false });
    expect(parseProducerOutput({ connu: false, histoire: 'ignoré' })).toEqual({ known: false });
  });

  it('accepte les bornes : 20 et 600 caractères', () => {
    const raw = { connu: true, ...FIELDS, terroir: text(20), nez: text(600) };
    expect(parseProducerOutput(raw)).toEqual({ known: true, fields: { ...FIELDS, terroir: text(20), nez: text(600) } });
  });

  it.each([
    ['champ manquant', { connu: true, ...FIELDS, nez: undefined }],
    ['champ trop court', { connu: true, ...FIELDS, style: text(19) }],
    ['champ trop long', { connu: true, ...FIELDS, cepages: text(601) }],
    ['champ vide', { connu: true, ...FIELDS, histoire: '   ' }],
    ['champ non textuel', { connu: true, ...FIELDS, terroir: 42 }],
    ['sans champ connu', { ...FIELDS }],
    ['champ connu non booléen', { connu: 'oui', ...FIELDS }],
    ['réponse non objet', 'Domaine Tempier'],
    ['réponse nulle', null],
  ])('refuse une réponse inexploitable : %s', (_label, raw) => {
    expect(() => parseProducerOutput(raw)).toThrow(ProducerInvalidOutputError);
    expect(() => parseProducerOutput(raw)).toThrow(/^Sortie du modèle invalide/);
  });

  it('classe une réponse inexploitable en échec définitif', () => {
    let error: unknown;
    try { parseProducerOutput({ connu: true, ...FIELDS, nez: 'court' }); } catch (e) { error = e; }
    expect(isTransientVisionFailure(error)).toBe(false);
  });
});
