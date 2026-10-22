import {
  cessionCents, COTE_INVALID, hasBuyerFees, createQuoteSchema, currentQuote, currentQuoteByWine, DATE_INVALID, idealwineSearchUrl, parisToday,
  quoteSiteOf, quoteView, searchLinks, TRANSACTIONS_INVALID, URL_INVALID,
} from './quote';

const valid = { coteCents: 8500, nTransactions: 12, quotedOn: '2026-03-03', sourceUrl: 'https://www.idealwine.com/fr/acheter-vin/B2210084-1.jsp' };
const errorOf = (body: unknown) => {
  const r = createQuoteSchema.safeParse(body);
  return r.success ? null : r.error.issues.map((i) => i.message);
};

describe('createQuoteSchema', () => {
  it('accepte une cote complète, et une cote sans transactions ni lien', () => {
    expect(createQuoteSchema.parse(valid)).toEqual(valid);
    expect(createQuoteSchema.parse({ coteCents: 1, quotedOn: '1990-01-01' })).toEqual({ coteCents: 1, quotedOn: '1990-01-01' });
    expect(createQuoteSchema.parse({ coteCents: 10_000_000, nTransactions: null, quotedOn: '2026-03-03', sourceUrl: null })).toMatchObject({ nTransactions: null, sourceUrl: null });
    expect(createQuoteSchema.parse({ ...valid, nTransactions: 0 }).nTransactions).toBe(0);
  });

  it.each([undefined, null, 0, -1, 10_000_001, 12.5, '8500'])('cote %p : refusée', (coteCents) => {
    expect(errorOf({ ...valid, coteCents })).toEqual([COTE_INVALID]);
  });

  it('message de la cote exact', () => {
    expect(COTE_INVALID).toBe('La cote doit être comprise entre 0,01 € et 100 000 €');
  });

  it.each([-1, 2.5, '3', 3_000_000_000])('transactions %p : refusées', (nTransactions) => {
    expect(errorOf({ ...valid, nTransactions })).toEqual(['Nombre de transactions invalide']);
    expect(TRANSACTIONS_INVALID).toBe('Nombre de transactions invalide');
  });

  it.each([undefined, null, '', '2026-02-30', '2026-3-3', '03/03/2026', '1989-12-31', '2999-01-01', 20260303])('date %p : refusée', (quotedOn) => {
    expect(errorOf({ ...valid, quotedOn })).toEqual(['Date de cote invalide']);
    expect(DATE_INVALID).toBe('Date de cote invalide');
  });

  it('accepte la date du jour à Paris, refuse le lendemain', () => {
    const today = parisToday();
    expect(errorOf({ ...valid, quotedOn: today })).toBeNull();
    const tomorrow = new Date(`${today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    expect(errorOf({ ...valid, quotedOn: tomorrow.toISOString().slice(0, 10) })).toEqual([DATE_INVALID]);
  });

  it.each([
    'http://www.idealwine.com/fr/x',
    'https://idealwine.com/fr/x',
    'https://www.idealwine.com.evil.test/',
    'https://vivino.com/w/1',
    'https://www.vivino.com:8443/w/1',
    'https://www.wine-searcher.com.evil.test/find/x',
    'https://user:pw@www.wine-searcher.com/find/x',
    'https://evil.test/https://www.idealwine.com/',
    'https://www.idealwine.com@evil.test/',
    'pas un lien',
    42,
  ])('lien %p : refusé', (sourceUrl) => {
    expect(errorOf({ ...valid, sourceUrl })).toEqual(['Le lien doit être une page iDealwine, Wine-Searcher ou Vivino']);
    expect(URL_INVALID).toBe('Le lien doit être une page iDealwine, Wine-Searcher ou Vivino');
  });

  it.each(['https://www.wine-searcher.com/find/tempier+bandol', 'https://www.vivino.com/FR/fr/domaine-tempier/w/1'])('lien %p : accepté', (sourceUrl) => {
    expect(createQuoteSchema.parse({ ...valid, sourceUrl }).sourceUrl).toBe(sourceUrl);
  });

  it('un lien vide vaut pas de lien', () => {
    expect(createQuoteSchema.parse({ ...valid, sourceUrl: '  ' }).sourceUrl).toBeNull();
  });
});

describe('quoteSiteOf', () => {
  it('https et hôte exactement celui d’un des trois sites', () => {
    expect(quoteSiteOf('https://www.idealwine.com/')?.label).toBe('iDealwine');
    expect(quoteSiteOf('https://WWW.IDEALWINE.COM/fr/x')?.label).toBe('iDealwine');
    expect(quoteSiteOf('https://www.wine-searcher.com/find/x')?.label).toBe('Wine-Searcher');
    expect(quoteSiteOf('https://www.vivino.com/w/1')?.label).toBe('Vivino');
    expect(quoteSiteOf('https://www.idealwine.com.evil.test/')).toBeNull();
    expect(quoteSiteOf('http://www.idealwine.com/')).toBeNull();
    expect(quoteSiteOf('https://www.idealwine.com:8443/')).toBeNull();
    expect(quoteSiteOf('https://user@www.idealwine.com/')).toBeNull();
    expect(quoteSiteOf(null)).toBeNull();
    expect(quoteSiteOf('pas un lien')).toBeNull();
  });
});

describe('hasBuyerFees', () => {
  it('cote iDealwine ou sans lien : frais acheteur ; Vivino, Wine-Searcher : non', () => {
    expect(hasBuyerFees(null)).toBe(true);
    expect(hasBuyerFees('https://www.idealwine.com/fr/x')).toBe(true);
    expect(hasBuyerFees('https://www.vivino.com/w/1')).toBe(false);
    expect(hasBuyerFees('https://www.wine-searcher.com/find/x')).toBe(false);
  });
});

describe('searchLinks', () => {
  const wine = { producer: 'Château de Beaucastel', cuvee: 'Hommage à Jacques Perrin', vintage: 2016 };
  it('un lien de recherche par site, mêmes termes (sans millésime), dans l’ordre iDealwine, Wine-Searcher, Vivino', () => {
    expect(searchLinks(wine, null)).toEqual([
      { site: 'idealwine', label: 'iDealwine', hint: 'enchères', url: 'https://www.idealwine.com/fr/acheter-du-vin/recherche-chateau%20de%20beaucastel%20hommage%20a%20jacques%20perrin' },
      { site: 'wine-searcher', label: 'Wine-Searcher', hint: 'prix moyen chez les cavistes', url: 'https://www.wine-searcher.com/find/chateau+de+beaucastel+hommage+a+jacques+perrin' },
      { site: 'vivino', label: 'Vivino', hint: 'prix boutique et note', url: 'https://www.vivino.com/search/wines?q=chateau%20de%20beaucastel%20hommage%20a%20jacques%20perrin' },
    ]);
  });
  it('la page enregistrée remplace la recherche de son site seulement', () => {
    const page = 'https://www.vivino.com/FR/fr/beaucastel/w/1';
    const links = searchLinks(wine, page);
    expect(links.map((l) => l.url)).toEqual([idealwineSearchUrl(wine), expect.stringContaining('wine-searcher.com/find/'), page]);
  });
});

describe('idealwineSearchUrl', () => {
  const base = 'https://www.idealwine.com/fr/acheter-du-vin/recherche-';
  it('« producteur cuvée » sans accents, en minuscules, séparés par des espaces (%20), sans le millésime', () => {
    expect(idealwineSearchUrl({ producer: 'Château de Beaucastel', cuvee: 'Hommage à Jacques Perrin', vintage: 2016 }))
      .toBe(`${base}chateau%20de%20beaucastel%20hommage%20a%20jacques%20perrin`);
  });
  it('omet une cuvée absente, écrase la ponctuation', () => {
    expect(idealwineSearchUrl({ producer: "  Domaine d'Élise — Œuvre ! ", cuvee: null, vintage: null })).toBe(`${base}domaine%20d%20elise%20oeuvre`);
    expect(idealwineSearchUrl({ producer: 'Leflaive', cuvee: '', vintage: 2020 })).toBe(`${base}leflaive`);
  });
  it('ligatures œ / æ (minuscules et majuscules) écrites oe / ae', () => {
    expect(idealwineSearchUrl({ producer: 'Clos du Cœur', cuvee: 'ŒNOTHÈQUE Æther', vintage: 2015 })).toBe(`${base}clos%20du%20coeur%20oenotheque%20aether`);
    expect(idealwineSearchUrl({ producer: 'Lætitia', cuvee: null, vintage: null })).toBe(`${base}laetitia`);
  });
});

describe('cote courante et vue', () => {
  const q = (id: string, quotedOn: string, createdAt: string) => ({ id, quotedOn: new Date(quotedOn), createdAt: new Date(createdAt) });

  it('la dernière par date de cote, puis par date de saisie', () => {
    const quotes = [
      q('a', '2026-01-01', '2026-09-01T10:00:00Z'),
      q('b', '2026-03-03', '2026-04-01T10:00:00Z'),
      q('c', '2026-03-03', '2026-05-01T10:00:00Z'),
      q('d', '2025-12-31', '2026-10-01T10:00:00Z'),
    ];
    expect(currentQuote(quotes)?.id).toBe('c');
    expect(currentQuote([])).toBeNull();
  });

  it('par vin', () => {
    const byWine = currentQuoteByWine([
      { ...q('a', '2026-01-01', '2026-01-01'), wineId: 'w1' },
      { ...q('b', '2026-02-01', '2026-01-01'), wineId: 'w1' },
      { ...q('c', '2025-02-01', '2026-01-01'), wineId: 'w2' },
    ]);
    expect([...byWine].map(([w, x]) => [w, x.id])).toEqual([['w1', 'b'], ['w2', 'c']]);
  });

  it('valeur de cession : cote hors frais acheteur d’environ 16 % (cote / 1,16), arrondie au centime', () => {
    expect(cessionCents(8500)).toBe(7328); // 85 € → 73 €, l'exemple de la spec
    expect(cessionCents(1)).toBe(1);
    expect(cessionCents(333)).toBe(287); // 287,07
    expect(cessionCents(10_000_000)).toBe(8_620_690);
  });

  it('vue : date AAAA-MM-JJ, auteur par son nom sinon son e-mail, valeur de cession', () => {
    const row = {
      coteCents: 8500, nTransactions: 12, quotedOn: new Date('2026-03-03T00:00:00Z'), sourceUrl: null,
      enteredBy: { displayName: null, email: 'proprietaire@example.com' },
    };
    expect(quoteView(row)).toEqual({
      coteCents: 8500, nTransactions: 12, quotedOn: '2026-03-03', sourceUrl: null, site: null, source: null, enteredBy: 'proprietaire@example.com', cessionCents: 7328,
    });
    expect(quoteView({ ...row, sourceUrl: 'https://www.vivino.com/w/1' })).toMatchObject({ site: 'vivino', source: 'Vivino' });
    expect(quoteView({ ...row, enteredBy: { displayName: 'djkix', email: 'f@x' } }).enteredBy).toBe('djkix');
    expect(quoteView({ ...row, enteredBy: null }).enteredBy).toBeNull();
  });
});
