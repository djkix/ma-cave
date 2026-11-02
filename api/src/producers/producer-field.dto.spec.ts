import { PRODUCER_FIELD_LENGTH, producerFieldSchema } from './producer-field.dto';

const MESSAGE = 'Le texte doit faire entre 1 et 600 caractères';

describe('producerFieldSchema', () => {
  it('rogne le texte', () => {
    expect(producerFieldSchema.parse({ value: '  Un domaine du Castellet.  ' })).toEqual({ value: 'Un domaine du Castellet.' });
  });

  it('accepte 1 et 600 caractères', () => {
    expect(producerFieldSchema.safeParse({ value: 'x' }).success).toBe(true);
    expect(producerFieldSchema.safeParse({ value: 'x'.repeat(600) }).success).toBe(true);
  });

  it.each([
    ['vide', { value: '' }],
    ['blanc', { value: '   ' }],
    ['trop long', { value: 'x'.repeat(601) }],
    ['non textuel', { value: 12 }],
    ['absent', {}],
  ])('refuse un texte %s avec un message en français', (_label, body) => {
    const r = producerFieldSchema.safeParse(body);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toEqual([MESSAGE]);
  });

  it('expose la limite de 600 caractères', () => {
    expect(PRODUCER_FIELD_LENGTH).toBe(600);
  });
});
