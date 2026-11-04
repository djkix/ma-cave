import { AROMAS, REGIONS } from '../traits';
import { DISHES } from './data';
import { findDishes } from './match';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

describe('base d\'accords', () => {
  it('compte entre 230 et 260 entrées, bien réparties', () => {
    expect(DISHES.length).toBeGreaterThanOrEqual(230);
    expect(DISHES.length).toBeLessThanOrEqual(260);
    const count = (c: string) => DISHES.filter((d) => d.category === c).length;
    const ranges: Array<[string, number, number]> = [['ENTREE', 35, 45], ['PLAT', 110, 130], ['FROMAGE', 40, 50], ['DESSERT', 30, 45]];
    for (const [c, min, max] of ranges) {
      expect(count(c), c).toBeGreaterThanOrEqual(min);
      expect(count(c), c).toBeLessThanOrEqual(max);
    }
  });

  it('a des ids uniques en kebab-case', () => {
    expect(new Set(DISHES.map((d) => d.id)).size).toBe(DISHES.length);
    for (const d of DISHES) expect(d.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('ne partage aucun mot-clé entre deux entrées', () => {
    const owner = new Map<string, string>();
    for (const d of DISHES) {
      for (const k of d.keywords) {
        const n = norm(k);
        const other = owner.get(n);
        expect(other === undefined || other === d.id, `« ${k} » dans ${other} et ${d.id}`).toBe(true);
        owner.set(n, d.id);
      }
    }
  });

  it('respecte le format de chaque entrée', () => {
    for (const d of DISHES) {
      expect(d.keywords.length, d.id).toBeGreaterThanOrEqual(1);
      expect(d.keywords.length, d.id).toBeLessThanOrEqual(8);
      for (const k of d.keywords) expect(k.trim(), d.id).not.toBe('');
      expect(d.colors.length, d.id).toBeGreaterThan(0);
      expect(new Set(d.colors).size, d.id).toBe(d.colors.length);
      expect(d.aromas.length, d.id).toBeLessThanOrEqual(3);
      for (const a of d.aromas) expect(AROMAS, d.id).toContain(a);
      for (const c of d.classics ?? []) if (/^\p{Lu}/u.test(c)) expect(REGIONS, d.id).toContain(c);
    }
  });
});

describe('reconnaissance sur la base réelle', () => {
  it.each([
    ['Tarte à la rhubarbe', 'rhubarbe'], ['Compote de rhubarbe', 'rhubarbe'], ['Figues rôties', 'figues'],
    ['Tarte aux mirabelles', 'prunes'], ['Tarte aux myrtilles', 'fruits-noirs'], ['Banane flambée', 'banane'],
    ['Pâte de coings', 'poire'], ['Pain perdu', 'crepes'], ['Tarte normande', 'tarte-pommes'], ['Cannelés', 'gateaux-secs'],
  ])('« %s » → %s', (dish, id) => {
    expect(findDishes(dish, DISHES)[0]?.id).toBe(id);
  });
});
