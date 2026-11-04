import type { CaveRow } from '../api-client';
import { accordsFor, findDishes, isSweetWine, localAccords, normalizeDish, rankCave, scoreWine, suggestDishes } from './match';
import type { DishEntry } from './types';

const entry = (over: Partial<DishEntry> & Pick<DishEntry, 'id'>): DishEntry => ({
  name: over.id, category: 'PLAT', keywords: [over.id], colors: ['ROUGE'], tannin: null, aromas: [], ...over,
});
const poulet = entry({ id: 'poulet', name: 'Poulet', keywords: ['poulet', 'volaille'], colors: ['ROUGE', 'BLANC'], tannin: 'LEGER', aromas: ['fruits rouges', 'beurré', 'floral'], classics: ['Bourgogne'] });
const champignons = entry({ id: 'champignons', name: 'Champignons', keywords: ['champignons', 'champignon', 'morilles', 'morille'] });
const coteDeBoeuf = entry({ id: 'cote-de-boeuf', name: 'Côte de bœuf', keywords: ['côte de bœuf'], tannin: 'PUISSANT' });
const boeuf = entry({ id: 'boeuf', name: 'Bœuf', keywords: ['bœuf'] });
const huitres = entry({ id: 'huitres', name: 'Huîtres', category: 'ENTREE', keywords: ['huîtres', 'huître'], colors: ['BLANC'], classics: ['chablis', 'muscadet'] });
const fondant = entry({ id: 'fondant', name: 'Fondant au chocolat', category: 'DESSERT', keywords: ['fondant'], colors: ['ROUGE', 'BLANC'], sweet: true, classics: ['banyuls'] });
const ENTRIES = [poulet, champignons, coteDeBoeuf, boeuf, huitres, fondant];

const wine = (over: Partial<CaveRow> = {}): CaveRow => ({
  id: 'w', producer: 'Domaine', cuvee: null, appellationRaw: 'Côtes du Rhône', vintage: 2020, color: 'ROUGE', formatCl: 75,
  referencePhotoId: null, quantity: 1, ...over,
});

describe('normalizeDish', () => {
  it('minuscules, sans accents, ponctuation et apostrophes en espaces', () => {
    expect(normalizeDish("  Côte de Bœuf, l'Œuf  à la  CRÈME ! ")).toBe('cote de boeuf l oeuf a la creme');
  });
});

describe('findDishes', () => {
  it('l’ingrédient dominant d’abord : « Poulet aux morilles » → poulet puis champignons', () => {
    expect(findDishes('Poulet aux morilles', ENTRIES).map((e) => e.id)).toEqual(['poulet', 'champignons']);
    expect(findDishes('morilles et poulet', ENTRIES).map((e) => e.id)).toEqual(['champignons', 'poulet']);
  });
  it('le mot-clé le plus long l’emporte : « côte de bœuf », pas « bœuf » en plus', () => {
    expect(findDishes('côte de boeuf grillée', ENTRIES).map((e) => e.id)).toEqual(['cote-de-boeuf']);
  });
  it('mots entiers seulement, singulier et pluriel selon les mots-clés', () => {
    expect(findDishes('une huître', ENTRIES).map((e) => e.id)).toEqual(['huitres']);
    expect(findDishes('Huîtres creuses', ENTRIES).map((e) => e.id)).toEqual(['huitres']);
    expect(findDishes('poulets', ENTRIES)).toEqual([]);
  });
  it('rien de reconnu : liste vide', () => {
    expect(findDishes('soupe miso', ENTRIES)).toEqual([]);
  });
});

it('suggestDishes : commence par, puis contient ; au moins 2 caractères', () => {
  expect(suggestDishes('p', ENTRIES)).toEqual([]);
  expect(suggestDishes('bo', ENTRIES).map((e) => e.id)).toEqual(['boeuf', 'cote-de-boeuf']);
  expect(suggestDishes('vola', ENTRIES).map((e) => e.id)).toEqual(['poulet']);
});

describe('scoreWine', () => {
  it('couleur non listée : exclu', () => {
    expect(scoreWine(huitres, wine({ color: 'ROUGE' }))).toBeNull();
  });
  it('couleur préférée 70, autre couleur 55', () => {
    expect(scoreWine(champignons, wine())).toBe(70);
    expect(scoreWine(poulet, wine({ color: 'BLANC' }))).toBe(55);
  });
  it('tanin : identique +12, voisin +4, opposé −10, inconnu 0', () => {
    expect(scoreWine(poulet, wine({ tannin: 'LEGER' }))).toBe(82);
    expect(scoreWine(poulet, wine({ tannin: 'MOYEN' }))).toBe(74);
    expect(scoreWine(poulet, wine({ tannin: 'PUISSANT' }))).toBe(60);
    expect(scoreWine(poulet, wine())).toBe(70);
  });
  it('arômes en commun : +6 chacun, +12 au plus', () => {
    expect(scoreWine(poulet, wine({ aromas: ['fruits rouges'] }))).toBe(76);
    expect(scoreWine(poulet, wine({ aromas: ['fruits rouges', 'beurré', 'floral'] }))).toBe(82);
  });
  it('accord classique : fragment d’appellation ou région, +15', () => {
    expect(scoreWine(huitres, wine({ color: 'BLANC', appellationRaw: 'Chablis 1er cru' }))).toBe(85);
    expect(scoreWine(poulet, wine({ region: 'Bourgogne' }))).toBe(85);
  });
  it('vin doux : bonus pour une entrée sucrée, malus sinon', () => {
    expect(scoreWine(fondant, wine({ appellationRaw: 'Banyuls' }))).toBe(100);
    expect(scoreWine(fondant, wine())).toBe(55);
    expect(scoreWine(champignons, wine({ appellationRaw: 'Maury' }))).toBe(45);
  });
  it('liquoreux et VDN reconnus, jurançon sec exclu', () => {
    expect(isSweetWine('Sainte-Croix-du-Mont')).toBe(true);
    expect(isSweetWine('Muscat de Beaumes-de-Venise')).toBe(true);
    expect(isSweetWine('Jurançon')).toBe(true);
    expect(isSweetWine('Jurançon sec')).toBe(false);
    expect(isSweetWine('Muscat d’Alsace')).toBe(false);
  });
});

describe('rankCave', () => {
  const year = 2026;
  const apogee = (status: 'A_BOIRE' | 'A_BOIRE_VITE' | 'PASSEE' | 'TROP_JEUNE' | null, max: number | null) =>
    ({ min: null, max, confidence: null, status, reason: null, source: null });
  it('score décroissant, puis apogée la plus urgente ; épuisés et couleurs exclues ; max', () => {
    const wines = [
      wine({ id: 'jeune', apogee: apogee('TROP_JEUNE', year + 20) }),
      wine({ id: 'sans' }),
      wine({ id: 'point-loin', apogee: apogee('A_BOIRE', year + 8) }),
      wine({ id: 'point-proche', apogee: apogee('A_BOIRE', year + 2) }),
      wine({ id: 'vite', apogee: apogee('A_BOIRE_VITE', year) }),
      wine({ id: 'passe', apogee: apogee('PASSEE', year - 1) }),
      wine({ id: 'meilleur', tannin: 'LEGER' }),
      wine({ id: 'epuise', tannin: 'LEGER', quantity: 0 }),
      wine({ id: 'rose', color: 'ROSE' }),
    ];
    expect(rankCave(poulet, wines, 6).map((x) => x.wine.id)).toEqual(['meilleur', 'passe', 'vite', 'point-proche', 'point-loin', 'sans']);
    expect(rankCave(poulet, wines)).toHaveLength(5);
  });
});

describe('localAccords', () => {
  it('réponse prête pour l’affichage, sur l’entrée dominante', () => {
    const wines = [
      wine({ id: 'w1', producer: 'Domaine A', appellationRaw: 'Bourgogne Pinot noir', tannin: 'LEGER', aromas: ['fruits rouges'], quantity: 2 }),
      wine({ id: 'w2', color: 'ROSE' }),
      wine({ id: 'w3', quantity: 0 }),
    ];
    const r = localAccords('Poulet aux morilles', ENTRIES, wines)!;
    expect(r).toMatchObject({ dish: 'Poulet aux morilles', wineCount: 2, understood: ['Poulet', 'Plats'] });
    expect(r.ideal).toBe('Rouge, tanin léger, notes de fruits rouges, beurré, floral, classique : Bourgogne');
    expect(r.picks).toEqual([expect.objectContaining({
      wineId: 'w1', producer: 'Domaine A', appellation: 'Bourgogne Pinot noir', quantity: 2, place: null, score: 100,
      reason: 'Accord classique : Bourgogne · Rouge comme conseillé · tanin léger · fruits rouges',
      apogee: expect.objectContaining({ status: null }),
    })]);
  });
  it('plat non reconnu : null', () => {
    expect(localAccords('soupe miso', ENTRIES, [])).toBeNull();
  });
  it('accordsFor : raison d’un classique d’appellation', () => {
    const r = accordsFor(huitres, 'Huîtres', [wine({ color: 'BLANC', appellationRaw: 'Chablis' })]);
    expect(r.picks[0].reason).toBe('Accord classique : Chablis · Blanc comme conseillé');
  });
});
