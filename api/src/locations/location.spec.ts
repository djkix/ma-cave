import { BadRequestException } from '@nestjs/common';
import { cellCodeOf, formatPlaces, labelOf, locationInputSchema, normalizeLocation, partsOf, placesOf } from './location';

describe('normalizeLocation', () => {
  const ZONE = '7d9f2a52-3c1e-4f0e-9a3b-2f5e8c1d4a60';

  it('nettoie casier et position, vide = absent ; la zone est un identifiant de zone de la cave', () => {
    expect(normalizeLocation({ zoneId: ZONE, casier: ' B ', position: '' })).toEqual({ zoneId: ZONE, zoneName: null, casier: 'B', position: null });
    expect(normalizeLocation({ casier: ' b ' })).toEqual({ zoneId: null, zoneName: null, casier: 'b', position: null });
    expect(normalizeLocation({ zoneId: null, casier: undefined, position: '3' })).toEqual({ zoneId: null, zoneName: null, casier: null, position: '3' });
  });

  it('ancien client : `zone` en texte, nettoyé, est gardé comme nom de zone à retrouver ; un identifiant l’emporte', () => {
    expect(normalizeLocation({ zone: '  Cave 2 ', casier: 'B' })).toEqual({ zoneId: null, zoneName: 'Cave 2', casier: 'B', position: null });
    expect(normalizeLocation({ zoneId: ZONE, zone: 'Cave 2' })).toEqual({ zoneId: ZONE, zoneName: null, casier: null, position: null });
  });

  it('refuse un emplacement vide', () => {
    expect(() => normalizeLocation({})).toThrow(new BadRequestException('Indiquez au moins une zone, un casier ou une position'));
    expect(() => normalizeLocation({ zone: '   ', casier: '', position: null })).toThrow(BadRequestException);
    expect(() => normalizeLocation({ zoneId: null, casier: ' ' })).toThrow(BadRequestException);
  });

  it('refuse un champ de plus de 40 caractères (une fois nettoyé)', () => {
    expect(normalizeLocation({ zone: ` ${'a'.repeat(40)} ` }).zoneName).toHaveLength(40);
    expect(() => normalizeLocation({ position: 'a'.repeat(41) })).toThrow(new BadRequestException('40 caractères au plus par champ d\'emplacement'));
    expect(() => normalizeLocation({ zone: 'a'.repeat(41) })).toThrow(new BadRequestException('40 caractères au plus par champ d\'emplacement'));
  });
});

describe('locationInputSchema', () => {
  it('zoneId : un UUID ou null', () => {
    expect(locationInputSchema.safeParse({ zoneId: 'pas-un-uuid' }).success).toBe(false);
    expect(locationInputSchema.safeParse({ zoneId: null, casier: 'B' }).success).toBe(true);
    expect(locationInputSchema.safeParse({ zone: 'Cave 1' }).success).toBe(true);
  });
});

describe('partsOf', () => {
  it('le nom de la zone vient de la relation (il suit les renommages)', () => {
    expect(partsOf({ id: 'l1', zoneId: 'z1', zone: { name: 'Cellier' }, casier: 'B', position: null })).toEqual({
      id: 'l1', zoneId: 'z1', zone: 'Cellier', casier: 'B', position: null,
    });
    expect(partsOf({ id: 'l2', zoneId: null, zone: null, casier: null, position: '4' })).toEqual({ id: 'l2', zoneId: null, zone: null, casier: null, position: '4' });
  });

  it('les noms de cases de la zone suivent, pour le libellé', () => {
    const parts = partsOf({ id: 'l3', zoneId: 'z1', zone: { name: 'Casier', cellNames: { B3: 'Champagnes' } }, casier: 'B3', position: null });
    expect(labelOf(parts)).toBe('Casier / Champagnes (B3)');
  });
});

describe('labelOf', () => {
  it('« zone / casier / position » sans les parties absentes', () => {
    expect(labelOf({ zone: 'Cave 2', casier: 'B', position: '3' })).toBe('Cave 2 / B / 3');
    expect(labelOf({ zone: null, casier: 'B', position: null })).toBe('B');
    expect(labelOf({ zone: 'Cellier', casier: null, position: '12' })).toBe('Cellier / 12');
  });

  it('case nommée : « Nom (code) », casse du casier ignorée ; sans nom : le casier tel quel', () => {
    const cellNames = { B3: 'Champagnes' };
    expect(labelOf({ zone: 'Casier', casier: 'b3', position: '2', cellNames })).toBe('Casier / Champagnes (B3) / 2');
    expect(labelOf({ zone: 'Casier', casier: 'A1', position: null, cellNames })).toBe('Casier / A1');
    expect(labelOf({ zone: 'Casier', casier: null, position: '4', cellNames })).toBe('Casier / 4');
  });
});

describe('cellCodeOf', () => {
  it('un nom de case connu (casse et espaces ignorés) devient son code ; sinon le casier ne change pas', () => {
    const cellNames = { B3: 'Champagnes', A1: 'Bordeaux' };
    expect(cellCodeOf('champagnes', cellNames)).toBe('B3');
    expect(cellCodeOf('BORDEAUX', cellNames)).toBe('A1');
    expect(cellCodeOf('B3', cellNames)).toBe('B3');
    expect(cellCodeOf('Loire', cellNames)).toBe('Loire');
    expect(cellCodeOf(null, cellNames)).toBeNull();
    expect(cellCodeOf('Champagnes', {})).toBe('Champagnes');
  });
});

describe('placesOf', () => {
  const loc = (id: string, zone: string, casier: string | null = null) => ({ id, zoneId: `z-${zone}`, zone, casier, position: null });

  it('emplacements par libellé puis « Sans emplacement » (total − stocks positifs), quantités > 0 seulement', () => {
    expect(
      placesOf([
        { location: loc('l2', 'Placard'), quantity: 2 },
        { location: null, quantity: 3 },
        { location: loc('l1', 'Cave', 'c5'), quantity: 4 },
        { location: loc('l3', 'Vide'), quantity: 0 },
      ]),
    ).toEqual([
      { id: 'l1', label: 'Cave / c5', quantity: 4, zoneId: 'z-Cave', casier: 'c5' },
      { id: 'l2', label: 'Placard', quantity: 2, zoneId: 'z-Placard', casier: null },
      { id: null, label: 'Sans emplacement', quantity: 3, zoneId: null, casier: null },
    ]);
  });

  it('« Sans emplacement » jamais négatif ni nul à l’affichage', () => {
    expect(placesOf([{ location: loc('l1', 'Cave'), quantity: 2 }, { location: null, quantity: -2 }])).toEqual([{ id: 'l1', label: 'Cave', quantity: 2, zoneId: 'z-Cave', casier: null }]);
    expect(placesOf([{ location: loc('l1', 'Cave'), quantity: 2 }])).toEqual([{ id: 'l1', label: 'Cave', quantity: 2, zoneId: 'z-Cave', casier: null }]);
  });
});

describe('formatPlaces', () => {
  it('« Cave 2 / B / 3 × 4 ; Sans emplacement × 2 »', () => {
    expect(formatPlaces([{ id: 'l', label: 'Cave 2 / B / 3', quantity: 4, zoneId: 'z', casier: 'B' }, { id: null, label: 'Sans emplacement', quantity: 2, zoneId: null, casier: null }])).toBe(
      'Cave 2 / B / 3 × 4 ; Sans emplacement × 2',
    );
    expect(formatPlaces([])).toBe('');
  });
});
