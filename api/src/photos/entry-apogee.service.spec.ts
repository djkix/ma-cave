import { EMPTY_APOGEE_RULES } from '../apogee/apogee';
import { EntryApogeeService, extractionApogee } from './entry-apogee.service';

const f = <T>(value: T | null) => ({ value, confidence: 0.9 });
function extraction(appellation: string | null, vintage: number | null, color: 'ROUGE' | 'ROSE' | null = 'ROUGE') {
  return {
    producer: f('Domaine Exemple'), cuvee: f(null), appellation: f(appellation), vintage: f(vintage), color: f(color),
    formatCl: f(75), degree: f(null), countryRegion: f(null), bottlesPerCase: f(null), globalConfidence: 0.9, labelBox: null,
  } as any;
}
const pauillac = { id: 'a1', region: 'Bordeaux', guardMinYears: 8, guardMaxYears: 25 };

describe('extractionApogee', () => {
  it('appellation reconnue et millésime lus : fourchette des règles du référentiel', () => {
    expect(extractionApogee(extraction('Pauillac', 2015), pauillac, EMPTY_APOGEE_RULES, 2026)).toMatchObject({ min: 2023, max: 2040, source: 'REGLE', status: 'A_BOIRE' });
  });

  it('rosé : garde courte, comme en cave', () => {
    expect(extractionApogee(extraction('Pauillac', 2024, 'ROSE'), pauillac, EMPTY_APOGEE_RULES, 2026)).toMatchObject({ min: 2025, max: 2027 });
  });

  it('sans millésime, sans appellation reconnue ou sans garde : null', () => {
    expect(extractionApogee(extraction('Pauillac', null), pauillac, EMPTY_APOGEE_RULES, 2026)).toBeNull();
    expect(extractionApogee(extraction('Inconnue', 2015), null, EMPTY_APOGEE_RULES, 2026)).toBeNull();
    expect(extractionApogee(extraction('Pauillac', 2015), { ...pauillac, guardMinYears: null, guardMaxYears: null }, EMPTY_APOGEE_RULES, 2026)).toBeNull();
    expect(extractionApogee(null, pauillac, EMPTY_APOGEE_RULES, 2026)).toBeNull();
  });
});

describe('EntryApogeeService.forExtractions', () => {
  const known = async (raw: string) => (raw === 'Pauillac' ? { kind: 'exact', id: 'a1', canonicalName: 'Pauillac', similarity: 1 } : { kind: 'none', raw });
  function setup(resolve: jest.Mock = jest.fn(known)) {
    const prisma = { appellation: { findMany: jest.fn(async () => [pauillac]) } };
    const rules = { load: jest.fn(async () => EMPTY_APOGEE_RULES) };
    return { svc: new EntryApogeeService(prisma as any, { resolve } as any, rules as any), resolve, rules };
  }

  it('une apogée par fiche, dans l’ordre ; une appellation lue deux fois n’est résolue qu’une fois', async () => {
    const { svc, resolve } = setup();
    const res = await svc.forExtractions([extraction('Pauillac', 2015), null, extraction('Inconnue', 2015), extraction('Pauillac', null), extraction('Pauillac', 2016)]);
    expect(res.map((a) => a && [a.min, a.max])).toEqual([[2023, 2040], null, null, null, [2024, 2041]]);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('rien de calculable : aucune requête', async () => {
    const { svc, resolve, rules } = setup();
    expect(await svc.forExtractions([null, extraction(null, 2015)])).toEqual([null, null]);
    expect(resolve).not.toHaveBeenCalled();
    expect(rules.load).not.toHaveBeenCalled();
  });

  it('référentiel indisponible : des null, jamais d’erreur', async () => {
    const { svc } = setup(jest.fn(async () => { throw new Error('base indisponible'); }));
    expect(await svc.forExtractions([extraction('Pauillac', 2015)])).toEqual([null]);
  });
});
