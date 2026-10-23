import { GEMINI_PAUSE_REASON_KEY, GEMINI_PAUSE_UNTIL_KEY, GeminiJournal, GeminiPausedError } from './gemini-journal';
import { fakeGeminiPrisma as fakePrisma } from '../test-utils/fake-gemini-prisma';
import { GeminiVisionProvider, VisionBatchMismatchError } from './gemini-vision.provider';
import { GeminiModelAsideError, GeminiQuotaError } from './gemini-pause';

const validObj = (overrides: Record<string, unknown> = {}) => ({
  producteur: { value: 'Domaine Tempier', confidence: 0.98 }, cuvee: { value: null, confidence: 0 },
  appellation: { value: 'Bandol', confidence: 0.97 }, millesime: { value: 2019, confidence: 0.94 },
  couleur: { value: 'rouge', confidence: 0.99 }, format_cl: { value: 75, confidence: 0.9 },
  degre: { value: null, confidence: 0 }, pays_region: { value: 'Provence', confidence: 0.7 },
  nb_cols_carton: { value: 6, confidence: 0.85 }, confiance_globale: 0.93,
  ...overrides,
});

const validJson = JSON.stringify(validObj());

function fakeModel(text: string, usage = { promptTokenCount: 1000, candidatesTokenCount: 200 }) {
  return { generateContent: jest.fn().mockResolvedValue({ response: { text: () => text, usageMetadata: usage } }) };
}

/** Fournisseur au modèle fixe : la fabrique rend toujours `model`, le modèle en vigueur est `name`. */
const gemini = (model: any, name: string, journal?: GeminiJournal) => new GeminiVisionProvider(() => model, async () => [name], journal);

describe('GeminiVisionProvider', () => {
  it('sends the image with the JSON contract and parses the answer', async () => {
    const model = fakeModel(validJson);
    const provider = gemini(model as any, 'gemini-test');
    const res = await provider.extractWineLabel(Buffer.from('img'), 'image/jpeg');
    expect(res.extraction.producer.value).toBe('Domaine Tempier');
    expect(res.model).toBe('gemini-test');
    expect(res.raw).toEqual(JSON.parse(validJson));
    const call = model.generateContent.mock.calls[0][0];
    expect(JSON.stringify(call)).toContain('nb_cols_carton');
    expect(call.generationConfig.responseMimeType).toBe('application/json');
  });

  it('strips a ```json fence before parsing', async () => {
    const provider = gemini(fakeModel('```json\n' + validJson + '\n```') as any, 'm');
    await expect(provider.extractWineLabel(Buffer.from('x'), 'image/jpeg')).resolves.toBeDefined();
  });

  it('throws a VisionInvalidOutputError on garbage', async () => {
    const provider = gemini(fakeModel('pas du json') as any, 'm');
    await expect(provider.extractWineLabel(Buffer.from('x'), 'image/jpeg')).rejects.toThrow(/sortie du modèle invalide/i);
  });
});

describe('GeminiVisionProvider.suggestPairingsBatch', () => {
  const tempier = { producer: 'Domaine Tempier', cuvee: 'La Tourtine', appellation: 'Bandol', region: 'Provence', color: 'ROUGE', vintage: 2019 };
  const trimbach = { producer: 'Trimbach', cuvee: null, appellation: 'Alsace', region: null, color: 'BLANC', vintage: null };
  const fake = (text: string, usage = { promptTokenCount: 200, candidatesTokenCount: 50 }) => ({
    generateContent: jest.fn(async () => ({ response: { text: () => text, usageMetadata: usage } })),
  });
  const promptOf = (model: ReturnType<typeof fake>) => (model.generateContent.mock.calls[0] as any)[0].contents[0].parts[0].text as string;

  it('demande en un seul appel un tableau numéroté de plats en français et rend chaque liste à la position de son vin', async () => {
    const model = fake(JSON.stringify([
      { vin: 2, plats: ['Choucroute', 'Munster'] },
      { vin: 1, plats: ['Agneau de sept heures', 'Daube provençale'] },
    ]));
    const r = await gemini(model as any, 'gemini-test').suggestPairingsBatch([tempier, trimbach]);
    expect(r).toEqual({
      items: [
        { index: 0, dishes: ['Agneau de sept heures', 'Daube provençale'] },
        { index: 1, dishes: ['Choucroute', 'Munster'] },
      ],
      model: 'gemini-test',
      costCents: 0,
    });
    expect(model.generateContent).toHaveBeenCalledTimes(1);
    const prompt = promptOf(model);
    expect(prompt).toContain('Tu es sommelier');
    expect(prompt).toContain('de 5 à 8 plats');
    expect(prompt).toContain('60 caractères au plus');
    expect(prompt).toContain('tableau JSON de 2 éléments');
    expect(prompt).toContain('Vin 1 : producteur « Domaine Tempier » ; cuvée « La Tourtine » ; appellation « Bandol » ; région « Provence » ; couleur rouge ; millésime 2019.');
    expect(prompt).toContain('Vin 2 : producteur « Trimbach » ; cuvée « aucune » ; appellation « Alsace » ; région « inconnue » ; couleur blanc ; non millésimé.');
    expect((model.generateContent.mock.calls[0] as any)[0].generationConfig.responseMimeType).toBe('application/json');
  });

  it('accepte une clôture ```json et un tableau enveloppé dans un objet', async () => {
    const model = fake('```json\n' + JSON.stringify({ vins: [{ vin: 1, plats: ['Agneau'] }] }) + '\n```');
    await expect(gemini(model as any, 'm').suggestPairingsBatch([tempier])).resolves.toMatchObject({ items: [{ index: 0, dishes: ['Agneau'] }] });
  });

  it('valide chaque vin avec les règles habituelles : un vin aux plats invalides est seulement absent du résultat', async () => {
    const model = fake(JSON.stringify([{ vin: 1, plats: [] }, { vin: 2, plats: ['Choucroute'] }]));
    const r = await gemini(model as any, 'm').suggestPairingsBatch([tempier, trimbach]);
    expect(r.items).toEqual([{ index: 1, dishes: ['Choucroute'] }]);
  });

  it.each([
    ['JSON illisible', 'pas du json'],
    ['pas un tableau', '{"plats": ["Agneau"]}'],
    ['taille incorrecte', JSON.stringify([{ vin: 1, plats: ['Agneau'] }])],
    ['indice manquant', JSON.stringify([{ vin: 1, plats: ['Agneau'] }, { plats: ['Choucroute'] }])],
    ['indice dupliqué', JSON.stringify([{ vin: 1, plats: ['Agneau'] }, { vin: 1, plats: ['Choucroute'] }])],
    ['indice hors bornes', JSON.stringify([{ vin: 1, plats: ['Agneau'] }, { vin: 3, plats: ['Choucroute'] }])],
  ])('lot mélangé (%s) : VisionBatchMismatchError, avec le coût de l’appel', async (_why, text) => {
    const model = fake(text, { promptTokenCount: 200000, candidatesTokenCount: 50000 });
    const e = await gemini(model as any, 'm').suggestPairingsBatch([tempier, trimbach]).catch((x) => x);
    expect(e).toBeInstanceOf(VisionBatchMismatchError);
    expect(e.message).toMatch(/^Sortie du modèle invalide/);
    expect(e.costCents).toBe(4);
  });

  it('arrondit (ne majore jamais) le coût total de l’appel', async () => {
    const model = fake(JSON.stringify([{ vin: 1, plats: ['Agneau'] }]), { promptTokenCount: 200000, candidatesTokenCount: 50000 });
    expect((await gemini(model as any, 'm').suggestPairingsBatch([tempier])).costCents).toBe(4);
  });
});

describe('GeminiVisionProvider.extractWineLabels', () => {
  const images = [
    { data: Buffer.from('img1'), mimeType: 'image/jpeg' },
    { data: Buffer.from('img2'), mimeType: 'image/jpeg' },
    { data: Buffer.from('img3'), mimeType: 'image/jpeg' },
  ];

  it('rend les 3 extractions à l’indice de leur photo, même si le tableau du modèle est désordonné', async () => {
    const arr = [
      { image: 3, ...validObj({ appellation: { value: 'Appellation 3', confidence: 0.9 } }) },
      { image: 1, ...validObj({ appellation: { value: 'Appellation 1', confidence: 0.9 } }) },
      { image: 2, ...validObj({ appellation: { value: 'Appellation 2', confidence: 0.9 } }) },
    ];
    const model = fakeModel(JSON.stringify(arr));
    const provider = gemini(model as any, 'gemini-test');
    const res = await provider.extractWineLabels(images);

    expect(res.model).toBe('gemini-test');
    expect(res.items).toHaveLength(3);
    expect((res.items[0] as any).extraction.appellation.value).toBe('Appellation 1');
    expect((res.items[1] as any).extraction.appellation.value).toBe('Appellation 2');
    expect((res.items[2] as any).extraction.appellation.value).toBe('Appellation 3');
  });

  it('isole un objet invalide : seul son indice devient une erreur', async () => {
    const arr = [
      { image: 1, ...validObj() },
      { image: 2, couleur: { value: 'turquoise', confidence: 0.5 } },
      { image: 3, ...validObj() },
    ];
    const model = fakeModel(JSON.stringify(arr));
    const provider = gemini(model as any, 'gemini-test');
    const res = await provider.extractWineLabels(images);

    expect((res.items[0] as any).extraction).toBeDefined();
    expect(res.items[1]).toEqual({ error: 'Lecture de l’étiquette inexploitable' });
    expect((res.items[2] as any).extraction).toBeDefined();
  });

  it('rejette une longueur de tableau différente de N', async () => {
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }];
    const model = fakeModel(JSON.stringify(arr));
    const provider = gemini(model as any, 'gemini-test');
    await expect(provider.extractWineLabels(images)).rejects.toThrow(VisionBatchMismatchError);
    await expect(provider.extractWineLabels(images)).rejects.toThrow(/sortie du modèle invalide/i);
  });

  it('rejette un indice dupliqué', async () => {
    const arr = [{ image: 1, ...validObj() }, { image: 1, ...validObj() }, { image: 3, ...validObj() }];
    const model = fakeModel(JSON.stringify(arr));
    const provider = gemini(model as any, 'gemini-test');
    await expect(provider.extractWineLabels(images)).rejects.toThrow(VisionBatchMismatchError);
  });

  it('rejette un JSON illisible', async () => {
    const model = fakeModel('pas du json');
    const provider = gemini(model as any, 'gemini-test');
    await expect(provider.extractWineLabels(images)).rejects.toThrow(VisionBatchMismatchError);
  });

  it('rejette une réponse qui n’est pas un tableau', async () => {
    const model = fakeModel(JSON.stringify(validObj()));
    const provider = gemini(model as any, 'gemini-test');
    await expect(provider.extractWineLabels(images)).rejects.toThrow(VisionBatchMismatchError);
  });

  it('rejette un indice manquant (laissant un trou dans la plage 1..N)', async () => {
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }, { image: 2, ...validObj() }];
    const model = fakeModel(JSON.stringify(arr));
    const provider = gemini(model as any, 'gemini-test');
    await expect(provider.extractWineLabels(images)).rejects.toThrow(VisionBatchMismatchError);
  });

  it('un lot mélangé porte le coût de l’appel, déjà payé', async () => {
    const ok = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }, { image: 3, ...validObj() }];
    const expected = (await gemini(fakeModel(JSON.stringify(ok)) as any, 'g').extractWineLabels(images)).costCents;
    expect(expected).toBeGreaterThan(0);
    const bad = [{ image: 1, ...validObj() }, { image: 1, ...validObj() }, { image: 3, ...validObj() }];
    const err = await gemini(fakeModel(JSON.stringify(bad)) as any, 'g').extractWineLabels(images).catch((e) => e);
    expect(err).toBeInstanceOf(VisionBatchMismatchError);
    expect(err.costCents).toBe(expected);
    const unreadable = await gemini(fakeModel('pas du json') as any, 'g').extractWineLabels(images).catch((e) => e);
    expect(unreadable.costCents).toBe(expected);
  });

  it('rejette un indice hors bornes', async () => {
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }, { image: 5, ...validObj() }];
    const model = fakeModel(JSON.stringify(arr));
    const provider = gemini(model as any, 'gemini-test');
    await expect(provider.extractWineLabels(images)).rejects.toThrow(VisionBatchMismatchError);
  });

  it('numérote les images de 1 à N dans la consigne et précède chaque image de « Image i : »', async () => {
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }, { image: 3, ...validObj() }];
    const model = fakeModel(JSON.stringify(arr));
    const provider = gemini(model as any, 'gemini-test');
    await provider.extractWineLabels(images);

    const call = model.generateContent.mock.calls[0][0];
    const parts = call.contents[0].parts;
    const texts = parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text);
    expect(texts.some((t: string) => /3 images numérotées de 1 à 3/.test(t))).toBe(true);
    expect(texts).toContain('Image 1 :');
    expect(texts).toContain('Image 2 :');
    expect(texts).toContain('Image 3 :');
  });

  it('la consigne de lot demande un tableau de N éléments, jamais « un objet JSON strict »', async () => {
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }, { image: 3, ...validObj() }];
    const model = fakeModel(JSON.stringify(arr));
    await gemini(model as any, 'gemini-test').extractWineLabels(images);
    const prompt = model.generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(prompt).toMatch(/tableau JSON de 3 éléments/);
    expect(prompt).not.toMatch(/objet JSON strict/);
    expect(prompt).toContain('"image"');
    expect(prompt).toContain('nb_cols_carton');
  });

  it('les consignes simple et de lot partagent les mêmes règles de lecture', async () => {
    const single = fakeModel(validJson);
    await gemini(single as any, 'g').extractWineLabel(Buffer.from('x'), 'image/jpeg');
    const singlePrompt = single.generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }, { image: 3, ...validObj() }];
    const batch = fakeModel(JSON.stringify(arr));
    await gemini(batch as any, 'g').extractWineLabels(images);
    const batchPrompt = batch.generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    expect(singlePrompt).toMatch(/objet JSON strict/);
    for (const rule of [
      'null avec confidence 0',
      'producteur (domaine, château, maison) du nom de la cuvée',
      'nombre de bouteilles',
      'rouge | blanc | rosé | pétillant',
      'format_cl',
    ]) {
      expect(singlePrompt).toContain(rule);
      expect(batchPrompt).toContain(rule);
    }
  });

  it('les consignes simple et de lot demandent le cadre de l’étiquette, et le lot le rend', async () => {
    const single = fakeModel(JSON.stringify(validObj({ etiquette: [50, 100, 950, 900] })));
    const res = await gemini(single as any, 'g').extractWineLabel(Buffer.from('x'), 'image/jpeg');
    expect(res.extraction.labelBox).toEqual([50, 100, 950, 900]);
    const singlePrompt = single.generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    const arr = [
      { image: 1, ...validObj({ etiquette: [10, 20, 900, 800] }) },
      { image: 2, ...validObj({ etiquette: null }) },
      { image: 3, ...validObj() },
    ];
    const batch = fakeModel(JSON.stringify(arr));
    const out = await gemini(batch as any, 'g').extractWineLabels(images);
    const batchPrompt = batch.generateContent.mock.calls[0][0].contents[0].parts[0].text as string;
    for (const prompt of [singlePrompt, batchPrompt]) {
      expect(prompt).toContain('"etiquette"');
      expect(prompt).toMatch(/\[ymin, xmin, ymax, xmax\]/);
      expect(prompt).toMatch(/0 à 1000/);
    }
    expect(out.items.map((i) => ('extraction' in i ? i.extraction.labelBox : 'erreur'))).toEqual([[10, 20, 900, 800], null, null]);
  });

  it('accepte un tableau enveloppé dans un objet à une seule propriété tableau', async () => {
    const arr = [{ image: 2, ...validObj() }, { image: 1, ...validObj() }, { image: 3, ...validObj() }];
    for (const key of ['items', 'resultats']) {
      const provider = gemini(fakeModel(JSON.stringify({ [key]: arr })) as any, 'g');
      const res = await provider.extractWineLabels(images);
      expect(res.items).toHaveLength(3);
      expect(res.items.every((i) => 'extraction' in i)).toBe(true);
    }
  });

  it('rejette un objet à plusieurs propriétés tableau, ou sans tableau', async () => {
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }, { image: 3, ...validObj() }];
    for (const body of [{ a: arr, b: [] }, { items: { image: 1 } }]) {
      const provider = gemini(fakeModel(JSON.stringify(body)) as any, 'g');
      await expect(provider.extractWineLabels(images)).rejects.toThrow(VisionBatchMismatchError);
    }
  });

  it('facture le coût de l’appel entier (pas divisé ici)', async () => {
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }, { image: 3, ...validObj() }];
    const model = fakeModel(JSON.stringify(arr), { promptTokenCount: 3000, candidatesTokenCount: 600 });
    const provider = gemini(model as any, 'gemini-test');
    const res = await provider.extractWineLabels(images);
    expect(res.costCents).toBe(Math.ceil((3000 / 1000) * 0.01 + (600 / 1000) * 0.04));
  });
});

describe('GeminiVisionProvider.describeProducersBatch', () => {
  const tempier = { producer: 'Domaine Tempier', appellations: ['Bandol'], region: 'Provence' };
  const closX = { producer: 'Clos X', appellations: [], region: null };
  const description = 'Domaine familial du Castellet, au cœur de l’appellation Bandol, réputé pour ses mourvèdres de garde.';
  const fake = (body: string, usage = { promptTokenCount: 200, candidatesTokenCount: 120 }) => ({
    generateContent: jest.fn(async () => ({ response: { text: () => body, usageMetadata: usage } })),
  });
  const promptOf = (model: ReturnType<typeof fake>) => (model.generateContent.mock.calls[0] as any)[0].contents[0].parts[0].text as string;

  it('demande en un seul appel un tableau numéroté de descriptifs en français et rend chacun à la position de son domaine', async () => {
    const model = fake(JSON.stringify([{ domaine: 2, connu: false }, { domaine: 1, connu: true, description }]));
    const r = await gemini(model as any, 'gemini-test').describeProducersBatch([tempier, closX]);
    expect(r).toEqual({
      items: [
        { index: 0, known: true, description },
        { index: 1, known: false, description: null },
      ],
      model: 'gemini-test',
      costCents: 0,
    });
    expect(model.generateContent).toHaveBeenCalledTimes(1);
    const prompt = promptOf(model);
    expect(prompt).toMatch(/3 à 4 phrases/);
    expect(prompt).toContain('n\'invente rien');
    expect(prompt).toContain('"connu": false');
    expect(prompt).toContain('tableau JSON de 2 éléments');
    expect(prompt).toContain('Domaine 1 : « Domaine Tempier » ; appellation(s) de ses vins : « Bandol » ; région « Provence ».');
    expect(prompt).toContain('Domaine 2 : « Clos X » ; appellation(s) de ses vins : inconnue ; région « inconnue ».');
    expect((model.generateContent.mock.calls[0] as any)[0].generationConfig.responseMimeType).toBe('application/json');
  });

  it('valide chaque domaine avec les règles habituelles : un descriptif trop court est seulement absent du résultat', async () => {
    const model = fake(JSON.stringify([{ domaine: 1, connu: true, description: 'Bandol.' }, { domaine: 2, connu: false }]));
    const r = await gemini(model as any, 'm').describeProducersBatch([tempier, closX]);
    expect(r.items).toEqual([{ index: 1, known: false, description: null }]);
  });

  it.each([
    ['JSON illisible', 'pas du json'],
    ['indice manquant', JSON.stringify([{ domaine: 1, connu: false }, { connu: false }])],
    ['indice dupliqué', JSON.stringify([{ domaine: 2, connu: false }, { domaine: 2, connu: false }])],
  ])('lot mélangé (%s) : VisionBatchMismatchError, avec le coût de l’appel', async (_why, text) => {
    const model = fake(text, { promptTokenCount: 200000, candidatesTokenCount: 50000 });
    const e = await gemini(model as any, 'm').describeProducersBatch([tempier, closX]).catch((x) => x);
    expect(e).toBeInstanceOf(VisionBatchMismatchError);
    expect(e.costCents).toBe(4);
  });
});

describe('GeminiVisionProvider.findOfficialSite', () => {
  const query = { producer: 'Domaine Tempier', cuvee: 'La Migoua', appellation: 'Bandol', vintage: 2019 };
  const fake = (body: string, usage = { promptTokenCount: 300, candidatesTokenCount: 40 }) => ({
    generateContent: jest.fn(async () => ({ response: { text: () => body, usageMetadata: usage } })),
  });
  const requestOf = (model: ReturnType<typeof fake>) => (model.generateContent.mock.calls[0] as any)[0];

  it('demande le site officiel avec la recherche Google et rend l’adresse', async () => {
    const model = fake('{"site": "https://www.domainetempier.com/"}');
    const r = await gemini(model as any, 'gemini-test').findOfficialSite(query);
    expect(r).toEqual({ site: 'https://www.domainetempier.com/', model: 'gemini-test', costCents: 1 });
    const req = requestOf(model);
    expect(req.tools).toEqual([{ googleSearch: {} }]);
    const prompt = req.contents[0].parts[0].text as string;
    expect(prompt).toContain('Domaine Tempier');
    expect(prompt).toContain('La Migoua');
    expect(prompt).toContain('Bandol');
    expect(prompt).toContain('{"site": null}');
  });

  it('rend null quand le domaine n’a pas de site connu', async () => {
    expect((await gemini(fake('{"site": null}') as any, 'm').findOfficialSite(query)).site).toBeNull();
  });

  it('retrouve le JSON au milieu d’un texte ou d’une clôture (la recherche ancrée ne garantit pas un JSON pur)', async () => {
    const fenced = fake('```json\n{"site": "https://tempier.fr"}\n```');
    expect((await gemini(fenced as any, 'm').findOfficialSite(query)).site).toBe('https://tempier.fr/');
    const prose = fake('Voici le résultat : {"site": "https://tempier.fr/vins"} — bonne dégustation.');
    expect((await gemini(prose as any, 'm').findOfficialSite(query)).site).toBe('https://tempier.fr/vins');
  });

  it('rend null (avec le coût, déjà payé) pour une réponse inexploitable ou une adresse non http(s)', async () => {
    for (const body of ['pas du json', '{"site": "javascript:alert(1)"}', '{"site": 42}', '{"autre": 1}']) {
      const r = await gemini(fake(body, { promptTokenCount: 200000, candidatesTokenCount: 50000 }) as any, 'm').findOfficialSite(query);
      expect(r).toEqual({ site: null, model: 'm', costCents: 4 });
    }
  });

  it('compte au moins 1 ct par appel ancré, même pour un usage courant', async () => {
    const model = fake('{"site": null}', { promptTokenCount: 300, candidatesTokenCount: 40, toolUsePromptTokenCount: 1500 } as any);
    expect((await gemini(model as any, 'm').findOfficialSite(query)).costCents).toBe(1);
    const noUsage = { generateContent: jest.fn(async () => ({ response: { text: () => '{"site": null}', usageMetadata: undefined } })) };
    expect((await gemini(noUsage as any, 'm').findOfficialSite(query)).costCents).toBe(1);
  });

  it('majore un gros usage, jetons de la recherche (toolUsePromptTokenCount) compris', async () => {
    // (200 000 + 100 000) / 1000 × 0,01 + 50 000 / 1000 × 0,04 = 3 + 2 = 5 ; un jeton de sortie de plus → 5,00004, majoré à 6
    const exact = fake('{"site": null}', { promptTokenCount: 200000, candidatesTokenCount: 50000, toolUsePromptTokenCount: 100000 } as any);
    expect((await gemini(exact as any, 'm').findOfficialSite(query)).costCents).toBe(5);
    const above = fake('{"site": null}', { promptTokenCount: 200000, candidatesTokenCount: 50001, toolUsePromptTokenCount: 100000 } as any);
    expect((await gemini(above as any, 'm').findOfficialSite(query)).costCents).toBe(6);
  });

  it('compte aussi les requêtes de recherche ancrées (webSearchQueries) : 1,4 ct chacune, majoré', async () => {
    const withQueries = (queries: string[] | undefined, usage = { promptTokenCount: 300, candidatesTokenCount: 40 }) => ({
      generateContent: jest.fn(async () => ({
        response: { text: () => '{"site": null}', usageMetadata: usage, candidates: [{ groundingMetadata: queries ? { webSearchQueries: queries } : {} }] },
      })),
    });
    const cost = async (model: ReturnType<typeof withQueries>) => (await gemini(model as any, 'm').findOfficialSite(query)).costCents;
    expect(await cost(withQueries(['tempier']))).toBe(2); // 1,4 → 2
    expect(await cost(withQueries(['a', 'b', 'c']))).toBe(5); // 4,2 → 5
    expect(await cost(withQueries([]))).toBe(1);
    expect(await cost(withQueries(undefined))).toBe(1);
    // Les jetons l'emportent s'ils coûtent davantage : 300 000 / 1000 × 0,01 = 3 ct > 1,4 ct.
    expect(await cost(withQueries(['tempier'], { promptTokenCount: 300000, candidatesTokenCount: 0 }))).toBe(3);
  });

  it('transmet le signal d’abandon de la recherche à Gemini', async () => {
    const model = fake('{"site": null}');
    const search = new AbortController();
    await gemini(model as any, 'm').findOfficialSite(query, search.signal);
    const passed = (model.generateContent.mock.calls[0] as any)[1].signal as AbortSignal;
    expect(passed.aborted).toBe(false);
    search.abort();
    expect(passed.aborted).toBe(true);
  });

  it('laisse remonter une panne de Gemini', async () => {
    const model = { generateContent: jest.fn(async () => { throw new Error('503 Service Unavailable'); }) };
    await expect(gemini(model as any, 'm').findOfficialSite(query)).rejects.toThrow('503');
  });
});

describe('GeminiVisionProvider — journal des appels et pause commune', () => {
  const NOW = new Date('2026-10-08T12:00:00.000Z');
  const GEMINI_503 = new Error('[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [503 Service Unavailable] busy');
  const GEMINI_429 = new Error('[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [429 Too Many Requests] quota');
  const wine = { producer: 'Domaine Tempier', cuvee: null, appellation: 'Bandol', region: null, color: 'ROUGE', vintage: 2019 };
  const failing = (e: Error) => ({ generateContent: jest.fn(async () => { throw e; }) });
  const journalOf = (prisma = fakePrisma()) => ({ prisma, journal: new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() }, () => NOW) });

  it('note un appel réussi : usage, issue OK, coût et durée', async () => {
    const { prisma, journal } = journalOf();
    await gemini(fakeModel(validJson) as any, 'm', journal).extractWineLabel(Buffer.from('x'), 'image/jpeg');
    expect(prisma.calls).toEqual([
      { usage: 'LECTURE_SORTIE', outcome: 'OK', httpStatus: null, reason: null, costCents: 1, model: 'm', durationMs: expect.any(Number) },
    ]);
  });

  it('distingue lecture d’entrée (photo seule ou lot), accords, descriptifs et recherche d’image', async () => {
    const { prisma, journal } = journalOf();
    await gemini(fakeModel(validJson) as any, 'm', journal).extractWineLabel(Buffer.from('x'), 'image/jpeg', 'ENTRY');
    const arr = [{ image: 1, ...validObj() }, { image: 2, ...validObj() }];
    await gemini(fakeModel(JSON.stringify(arr)) as any, 'm', journal).extractWineLabels([
      { data: Buffer.from('a'), mimeType: 'image/jpeg' },
      { data: Buffer.from('b'), mimeType: 'image/jpeg' },
    ]);
    await gemini(fakeModel('[{"vin":1,"plats":["Agneau"]}]') as any, 'm', journal).suggestPairingsBatch([wine]);
    await gemini(fakeModel('[{"domaine":1,"connu":false}]') as any, 'm', journal).describeProducersBatch([{ producer: 'X', appellations: [], region: null }]);
    await gemini(fakeModel('{"site": null}') as any, 'm', journal).findOfficialSite({ producer: 'X', cuvee: null, appellation: 'Bandol', vintage: null });
    expect(prisma.calls.map((c: any) => c.usage)).toEqual(['LECTURE_ENTREE', 'LECTURE_ENTREE', 'ACCORDS', 'DESCRIPTIF', 'RECHERCHE_IMAGE']);
  });

  it('503 : noté REFUSE avec le statut, et met Gemini en pause 5 min (« modèle saturé »)', async () => {
    const { prisma, journal } = journalOf();
    await expect(gemini(failing(GEMINI_503) as any, 'm', journal).suggestPairingsBatch([wine])).rejects.toBe(GEMINI_503);
    expect(prisma.calls).toEqual([
      { usage: 'ACCORDS', outcome: 'REFUSE', httpStatus: 503, reason: GEMINI_503.message, costCents: 0, model: 'm', durationMs: expect.any(Number) },
    ]);
    expect(prisma.settings.get(GEMINI_PAUSE_UNTIL_KEY)).toBe('2026-10-08T12:05:00.000Z');
    expect(prisma.settings.get(GEMINI_PAUSE_REASON_KEY)).toBe('modèle saturé');
  });

  it('429 sans délai : noté REFUSE avec le statut, et met Gemini en pause 1 h (QUOTA_GOOGLE)', async () => {
    const { prisma, journal } = journalOf();
    await expect(gemini(failing(GEMINI_429) as any, 'm', journal).describeProducersBatch([{ producer: 'X', appellations: [], region: null }])).rejects.toBe(GEMINI_429);
    expect(prisma.calls[0]).toMatchObject({ usage: 'DESCRIPTIF', outcome: 'REFUSE', httpStatus: 429 });
    expect(prisma.settings.get(GEMINI_PAUSE_UNTIL_KEY)).toBe('2026-10-08T13:00:00.000Z');
    expect(prisma.settings.get(GEMINI_PAUSE_REASON_KEY)).toBe('QUOTA_GOOGLE');
  });

  it('429 : le délai demandé par Google est lu dans le message complet, même au-delà des 300 caractères du journal', async () => {
    const { prisma, journal } = journalOf();
    const long = new Error(`${GEMINI_429.message} ${'x'.repeat(400)} [{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37s"}]`);
    await expect(gemini(failing(long) as any, 'm', journal).suggestPairingsBatch([wine])).rejects.toBe(long);
    expect(prisma.settings.get(GEMINI_PAUSE_UNTIL_KEY)).toBe('2026-10-08T12:00:37.000Z');
  });

  it('un 503 après un 429 ne raccourcit pas la pause d’une heure', async () => {
    const { prisma, journal } = journalOf();
    prisma.settings.set(GEMINI_PAUSE_UNTIL_KEY, '2026-10-08T11:59:00.000Z'); // pause échue : l'appel part
    await expect(gemini(failing(GEMINI_429) as any, 'm', journal).suggestPairingsBatch([wine])).rejects.toBe(GEMINI_429);
    await journal.extendPause(503, NOW);
    expect(prisma.settings.get(GEMINI_PAUSE_UNTIL_KEY)).toBe('2026-10-08T13:00:00.000Z');
  });

  it('une autre panne est notée ERREUR, sans pause ; une sortie inexploitable aussi, avec son coût', async () => {
    const { prisma, journal } = journalOf();
    const boom = new Error('[500 Internal Server Error] boom');
    await expect(gemini(failing(boom) as any, 'm', journal).suggestPairingsBatch([wine])).rejects.toBe(boom);
    await expect(gemini(fakeModel('pas du json') as any, 'm', journal).extractWineLabel(Buffer.from('x'), 'image/jpeg')).rejects.toThrow(/sortie du modèle invalide/i);
    await expect(
      gemini(fakeModel('pas du json', { promptTokenCount: 200000, candidatesTokenCount: 50000 }) as any, 'm', journal).extractWineLabels([
        { data: Buffer.from('a'), mimeType: 'image/jpeg' },
        { data: Buffer.from('b'), mimeType: 'image/jpeg' },
      ]),
    ).rejects.toThrow(VisionBatchMismatchError);
    expect(prisma.calls.map((c: any) => [c.outcome, c.httpStatus, c.costCents])).toEqual([
      ['ERREUR', 500, 0],
      ['ERREUR', null, 1],
      ['ERREUR', null, 4],
    ]);
    expect(prisma.settings.has(GEMINI_PAUSE_UNTIL_KEY)).toBe(false);
  });

  it('un lot d’accords ou de descriptifs inexploitable porte son coût, déjà facturé, jusque dans le journal', async () => {
    const { prisma, journal } = journalOf();
    const big = { promptTokenCount: 200000, candidatesTokenCount: 50000 };
    const e1 = await gemini(fakeModel('pas du json', big) as any, 'm', journal).suggestPairingsBatch([wine]).catch((x) => x);
    expect(e1).toBeInstanceOf(VisionBatchMismatchError);
    expect(e1.costCents).toBe(4);
    const e2 = await gemini(fakeModel('{"plats":[]}', big) as any, 'm', journal).suggestPairingsBatch([wine]).catch((x) => x);
    expect(e2).toBeInstanceOf(VisionBatchMismatchError);
    const e3 = await gemini(fakeModel('pas du json', big) as any, 'm', journal)
      .describeProducersBatch([{ producer: 'X', appellations: [], region: null }])
      .catch((x) => x);
    expect(e3).toBeInstanceOf(VisionBatchMismatchError);
    expect(prisma.calls.map((c: any) => [c.usage, c.outcome, c.costCents])).toEqual([
      ['ACCORDS', 'ERREUR', 4],
      ['ACCORDS', 'ERREUR', 4],
      ['DESCRIPTIF', 'ERREUR', 4],
    ]);
  });

  it('une seule ligne de journal par lot, quel que soit le nombre de vins ou de domaines, avec le coût total', async () => {
    const { prisma, journal } = journalOf();
    const big = { promptTokenCount: 200000, candidatesTokenCount: 50000 };
    const wines = [wine, { ...wine, producer: 'B' }, { ...wine, producer: 'C' }];
    const plats = JSON.stringify(wines.map((_, i) => ({ vin: i + 1, plats: ['Agneau'] })));
    await gemini(fakeModel(plats, big) as any, 'm', journal).suggestPairingsBatch(wines);
    const producers = [{ producer: 'X', appellations: [], region: null }, { producer: 'Y', appellations: [], region: null }];
    await gemini(fakeModel('[{"domaine":1,"connu":false},{"domaine":2,"connu":false}]', big) as any, 'm', journal).describeProducersBatch(producers);
    expect(prisma.calls.map((c: any) => [c.usage, c.outcome, c.costCents])).toEqual([
      ['ACCORDS', 'OK', 4],
      ['DESCRIPTIF', 'OK', 4],
    ]);
  });

  it('pendant une pause, aucun appel n’est envoyé à Google et rien n’est noté', async () => {
    const { prisma, journal } = journalOf();
    prisma.settings.set(GEMINI_PAUSE_UNTIL_KEY, '2026-10-08T12:05:00.000Z');
    prisma.settings.set(GEMINI_PAUSE_REASON_KEY, 'modèle saturé');
    const model = fakeModel(validJson);
    const provider = gemini(model as any, 'm', journal);
    for (const call of [
      () => provider.extractWineLabel(Buffer.from('x'), 'image/jpeg'),
      () => provider.extractWineLabels([{ data: Buffer.from('a'), mimeType: 'image/jpeg' }]),
      () => provider.suggestPairingsBatch([wine]),
      () => provider.describeProducersBatch([{ producer: 'X', appellations: [], region: null }]),
      () => provider.findOfficialSite({ producer: 'X', cuvee: null, appellation: 'Bandol', vintage: null }),
    ]) {
      const e = await call().catch((x) => x);
      expect(e).toBeInstanceOf(GeminiPausedError);
      expect(e.message).toBe(`Gemini en pause jusqu'à 14:05 (modèle saturé)`);
    }
    expect(model.generateContent).not.toHaveBeenCalled();
    expect(prisma.calls).toEqual([]);
  });

  it('une écriture du journal en échec ne casse pas l’appel', async () => {
    const { prisma, journal } = journalOf();
    prisma.geminiCall.create.mockRejectedValue(new Error('base injoignable'));
    const r = await gemini(fakeModel('[{"vin":1,"plats":["Agneau"]}]') as any, 'm', journal).suggestPairingsBatch([wine]);
    expect(r.items).toEqual([{ index: 0, dishes: ['Agneau'] }]);
    await expect(gemini(failing(GEMINI_503) as any, 'm', journal).suggestPairingsBatch([wine])).rejects.toBe(GEMINI_503);
  });
});

describe('GeminiVisionProvider.analyzePlan', () => {
  const NOW = new Date('2026-10-21T12:00:00.000Z');
  const units = [{ kind: 'CASIER', cells: [{ box_2d: [200, 100, 500, 400] }, { box_2d: [500, 100, 900, 400] }] }];

  it('envoie l’image en demandant du JSON sans schéma imposé (refusé par Google) et rend les unités brutes avec le coût', async () => {
    const model = fakeModel(JSON.stringify({ units }));
    const res = await gemini(model as any, 'm').analyzePlan(Buffer.from('img'), 'image/jpeg');
    expect(res).toEqual({ units, costCents: 1 });
    const call = model.generateContent.mock.calls[0][0];
    expect(call.contents[0].parts[1]).toEqual({ inlineData: { data: Buffer.from('img').toString('base64'), mimeType: 'image/jpeg' } });
    expect(call.generationConfig).toEqual({ responseMimeType: 'application/json' });
    const prompt = call.contents[0].parts[0].text;
    expect(prompt).toContain('Réponds uniquement avec ce JSON : {"units": [{"kind": "CASIER", "cells": [{"box_2d": [ymin, xmin, ymax, xmax]}, …]}, …]}');
    expect(prompt).toMatch(/entiers de 0 à 1000/);
    expect(prompt).toMatch(/12/);
    expect(prompt).toMatch(/70 %/);
    expect(prompt).toContain('1. Les cases. Commence par repérer les meubles, de gauche à droite. Pour chaque meuble, parcours ses cases rangée par rangée, de haut en bas puis de gauche à droite, et donne-les toutes : une case est un espace délimité par des montants (verticaux) et des tablettes (horizontales). Compte chaque case, même vide, et même partiellement cachée par un objet posé devant (estime alors son cadre). Une case plus haute ou plus large que ses voisines reste une seule case. Ne fusionne jamais plusieurs cases en une.');
    expect(prompt).toContain('Les meubles se touchent souvent : la limite entre deux meubles se voit à un montant doublé ou plus épais, à un petit espace, à des tablettes qui ne sont pas à la même hauteur, à des cases de taille différente ou à un changement de bois ou de couleur. Une même tablette continue d\'un bout à l\'autre signale un seul meuble. Dans le doute, sépare.');
    expect(prompt).toContain('les objets posés devant ou dans les cases (sacs, seaux, cartons, bouteilles) : ce ne sont pas des cases, mais les cases qu\'ils cachent en partie comptent.');
  });

  it('coût de l’analyse d’un plan au tarif Flash, quel que soit le modèle', async () => {
    const usage = { promptTokenCount: 10_000, candidatesTokenCount: 10_000 };
    const run = (name: string) => gemini(fakeModel(JSON.stringify({ units: [] }), usage), name).analyzePlan(Buffer.from('x'), 'image/jpeg');
    // 10 × 0,01 + 10 × 0,04 = 0,5 ct → 1 ct.
    expect((await run('gemini-3.5-flash')).costCents).toBe(1);
    expect((await run('gemini-3.5-flash-lite')).costCents).toBe(1);
  });

  it('JSON entouré de balises ```json ou de texte : lu quand même', async () => {
    for (const text of ['```json\n' + JSON.stringify({ units }) + '\n```', 'Voici le résultat : ' + JSON.stringify({ units }) + ' Fin.']) {
      expect((await gemini(fakeModel(text) as any, 'm').analyzePlan(Buffer.from('x'), 'image/jpeg')).units).toEqual(units);
    }
  });

  it('JSON illisible : sortie du modèle invalide, avec son coût', async () => {
    const e = await gemini(fakeModel('pas du json') as any, 'm').analyzePlan(Buffer.from('x'), 'image/jpeg').catch((x) => x);
    expect(e.message).toMatch(/sortie du modèle invalide/i);
    expect(e.costCents).toBe(1);
  });

  it('journalise l’appel sous l’usage ANALYSE_PLAN', async () => {
    const prisma = fakePrisma();
    const journal = new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() }, () => NOW);
    await gemini(fakeModel(JSON.stringify({ units: [] })) as any, 'm', journal).analyzePlan(Buffer.from('x'), 'image/jpeg');
    expect(prisma.calls).toEqual([{ usage: 'ANALYSE_PLAN', outcome: 'OK', httpStatus: null, reason: null, costCents: 1, model: 'm', durationMs: expect.any(Number) }]);
  });

  it('pendant une pause commune, aucun appel ne part', async () => {
    const prisma = fakePrisma();
    prisma.settings.set(GEMINI_PAUSE_UNTIL_KEY, new Date(NOW.getTime() + 60_000).toISOString());
    prisma.settings.set(GEMINI_PAUSE_REASON_KEY, 'refus');
    const model = fakeModel('{}');
    const journal = new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() }, () => NOW);
    await expect(gemini(model as any, 'm', journal).analyzePlan(Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(GeminiPausedError);
    expect(model.generateContent).not.toHaveBeenCalled();
  });
});

describe('GeminiVisionProvider — accords pour un plat', () => {
  const NOW = new Date('2026-10-23T12:00:00.000Z');
  const wines = [{ producer: 'Domaine A', cuvee: null, appellation: 'Chablis', color: 'BLANC', vintage: 2020, apogee: '2022-2028' }];

  it('envoie le plat et une ligne compacte par vin, rend l’objet lu, journalisé sous ACCORDS_PLAT', async () => {
    const prisma = fakePrisma();
    const journal = new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() }, () => NOW);
    const raw = { compris: ['Blanc sec'], ideal: 'Un blanc sec', choix: [{ vin: 1, score: 90, raison: 'Vif' }] };
    const model = fakeModel('```json\n' + JSON.stringify(raw) + '\n```');
    const res = await gemini(model as any, 'm', journal).pairDish('Sole meunière', wines);
    expect(res.raw).toEqual(raw);
    const prompt = (model.generateContent as jest.Mock).mock.calls[0][0].contents[0].parts[0].text;
    expect(prompt).toContain('« Sole meunière »');
    expect(prompt).toContain('1 : Domaine A ; - ; Chablis ; blanc ; 2020 ; 2022-2028');
    expect(prisma.calls).toEqual([expect.objectContaining({ usage: 'ACCORDS_PLAT', outcome: 'OK', model: 'm' })]);
  });

  it('JSON illisible : sortie du modèle invalide', async () => {
    await expect(gemini(fakeModel('non') as any, 'm').pairDish('Sole', wines)).rejects.toThrow(/Sortie du modèle invalide/);
  });
});

describe('GeminiVisionProvider — modèle en vigueur', () => {
  it('lu à chaque appel, pour tous les usages : un changement sert dès l’appel suivant', async () => {
    let current = 'gemini-3.5-flash';
    const asked: string[] = [];
    const modelFor = (name: string) => {
      asked.push(name);
      return name.endsWith('lite') ? fakeModel(JSON.stringify({ units: [] })) : fakeModel(validJson);
    };
    const provider = new GeminiVisionProvider(modelFor, async () => [current]);
    expect((await provider.extractWineLabel(Buffer.from('x'), 'image/jpeg')).model).toBe('gemini-3.5-flash');
    current = 'gemini-3.5-flash-lite';
    await provider.analyzePlan(Buffer.from('x'), 'image/jpeg');
    await provider.findOfficialSite({ producer: 'X', cuvee: null, appellation: 'Bandol', vintage: null });
    expect(asked).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']);
  });

  it('le modèle employé est noté au journal, appel réussi ou en échec', async () => {
    const prisma = fakePrisma();
    const journal = new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() });
    let current = 'gemini-3.5-flash';
    const failing = { generateContent: jest.fn(async () => { throw new Error('[500 Internal Server Error] boom'); }) };
    const provider = new GeminiVisionProvider((name) => (name === 'gemini-3.5-flash' ? fakeModel('[{"vin":1,"plats":["Agneau"]}]') : failing), async () => [current], journal);
    const wine = { producer: 'X', cuvee: null, appellation: 'Bandol', region: null, color: 'ROUGE', vintage: null };
    await provider.suggestPairingsBatch([wine]);
    current = 'gemini-3.5-flash-lite';
    await expect(provider.suggestPairingsBatch([wine])).rejects.toThrow('boom');
    expect(prisma.calls.map((c: any) => [c.outcome, c.model])).toEqual([['OK', 'gemini-3.5-flash'], ['ERREUR', 'gemini-3.5-flash-lite']]);
  });
});

describe('GeminiVisionProvider — limiteur de débit', () => {
  const wine = { producer: 'Domaine Tempier', cuvee: null, appellation: 'Bandol', region: null, color: 'ROUGE', vintage: 2019 };
  const limiter = () => ({
    reserve: jest.fn<Promise<void>, [string]>(async () => undefined),
    addTokens: jest.fn(async () => undefined),
    markExhausted: jest.fn(async () => undefined),
    markUnavailable: jest.fn(async () => undefined),
    limits: jest.fn(async () => ({ rpm: 5, tpm: 250000, rpd: 20 })),
  });
  const withQuota = (model: any, quota: ReturnType<typeof limiter>, journal?: GeminiJournal) =>
    new GeminiVisionProvider(() => model, async () => ['m'], journal, quota);

  it('refus du limiteur : aucun appel à Google, rien au journal, l’erreur de pause remonte', async () => {
    const prisma = fakePrisma();
    const journal = new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() });
    const quota = limiter();
    const refusal = new GeminiQuotaError(new Date('2026-10-08T12:01:00.000Z'), 'QUOTA_MINUTE', 5);
    quota.reserve.mockRejectedValue(refusal);
    const model = fakeModel('[{"vin":1,"plats":["Agneau"]}]');
    await expect(withQuota(model, quota, journal).suggestPairingsBatch([wine])).rejects.toBe(refusal);
    expect(model.generateContent).not.toHaveBeenCalled();
    expect(prisma.calls).toEqual([]);
    expect(prisma.settings.has(GEMINI_PAUSE_UNTIL_KEY)).toBe(false);
  });

  it('chaque appel réserve sa place, puis compte ses jetons réels (entrée + sortie)', async () => {
    const quota = limiter();
    await withQuota(fakeModel(validJson, { promptTokenCount: 2500, candidatesTokenCount: 200 }), quota).extractWineLabel(Buffer.from('x'), 'image/jpeg');
    expect(quota.reserve).toHaveBeenCalledTimes(1);
    expect(quota.addTokens).toHaveBeenCalledWith('m', 2700);
  });

  it('une sortie inexploitable a consommé ses jetons : ils sont comptés aussi', async () => {
    const quota = limiter();
    await expect(withQuota(fakeModel('pas du json', { promptTokenCount: 100, candidatesTokenCount: 20 }), quota).analyzePlan(Buffer.from('x'), 'image/jpeg')).rejects.toThrow();
    expect(quota.addTokens).toHaveBeenCalledWith('m', 120);
  });

  it('la place est réservée juste avant l’appel réseau : un échec local (modèle illisible) n’en consomme pas', async () => {
    const quota = limiter();
    const provider = new GeminiVisionProvider(() => fakeModel(validJson) as any, async () => { throw new Error('base injoignable'); }, undefined, quota);
    await expect(provider.extractWineLabel(Buffer.from('x'), 'image/jpeg')).rejects.toThrow('base injoignable');
    expect(quota.reserve).not.toHaveBeenCalled();
  });

  it('la réservation précède l’appel à Google', async () => {
    const order: string[] = [];
    const quota = limiter();
    quota.reserve.mockImplementation(async () => { order.push('reserve'); });
    const model = { generateContent: jest.fn(async () => { order.push('google'); return { response: { text: () => validJson, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } } }; }) };
    await withQuota(model, quota).extractWineLabel(Buffer.from('x'), 'image/jpeg');
    expect(order).toEqual(['reserve', 'google']);
  });

  it('pendant une pause commune, aucune place n’est réservée', async () => {
    const prisma = fakePrisma();
    prisma.settings.set(GEMINI_PAUSE_UNTIL_KEY, new Date(Date.now() + 60_000).toISOString());
    const quota = limiter();
    const journal = new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() });
    await expect(withQuota(fakeModel(validJson), quota, journal).extractWineLabel(Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(GeminiPausedError);
    expect(quota.reserve).not.toHaveBeenCalled();
  });
});

describe('GeminiVisionProvider — bascule quand le quota du jour d’un modèle est atteint', () => {
  const wine = { producer: 'Domaine Tempier', cuvee: null, appellation: 'Bandol', region: null, color: 'ROUGE', vintage: 2019 };
  const A = 'gemini-3-flash';
  const B = 'gemini-3-flash-lite';
  const DAILY_429 = new Error(
    '[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [429 Too Many Requests] You exceeded your current quota. [{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]',
  );
  const MINUTE_429 = new Error('[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [429 Too Many Requests] [{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]');
  const ok = () => fakeModel('[{"vin":1,"plats":["Agneau"]}]');
  const failing = (e: Error) => ({ generateContent: jest.fn(async () => { throw e; }) });
  const setup = (models: Record<string, any>) => {
    const prisma = fakePrisma();
    const journal = new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() });
    const quota = {
      reserve: jest.fn<Promise<void>, [string]>(async () => undefined),
      addTokens: jest.fn(async () => undefined),
      markExhausted: jest.fn(async () => undefined),
      markUnavailable: jest.fn(async () => undefined),
      limits: jest.fn(async () => ({ rpm: 5, tpm: 250000, rpd: 20 })),
    };
    const provider = new GeminiVisionProvider((name) => models[name], async () => Object.keys(models), journal, quota);
    return { prisma, quota, provider };
  };
  const dayRefusal = () => new GeminiQuotaError(new Date('2026-10-22T07:00:00Z'), 'QUOTA_JOUR', 20);

  it('refus local du jour pour le modèle choisi : le suivant sert, rien n’est parti vers le premier', async () => {
    const models = { [A]: ok(), [B]: ok() };
    const { prisma, quota, provider } = setup(models);
    quota.reserve.mockImplementation(async (m: string) => { if (m === A) throw dayRefusal(); });
    const r = await provider.suggestPairingsBatch([wine]);
    expect(r.model).toBe(B);
    expect(models[A].generateContent).not.toHaveBeenCalled();
    expect(prisma.calls.map((c: any) => [c.outcome, c.model])).toEqual([['OK', B]]);
  });

  it('429 journalier de Google : noté au journal, modèle marqué épuisé, le suivant sert aussitôt, sans pause commune', async () => {
    const { prisma, quota, provider } = setup({ [A]: failing(DAILY_429), [B]: ok() });
    const r = await provider.suggestPairingsBatch([wine]);
    expect(r.model).toBe(B);
    expect(quota.markExhausted).toHaveBeenCalledWith(A, expect.any(Date));
    expect(prisma.calls.map((c: any) => [c.outcome, c.httpStatus, c.model])).toEqual([['REFUSE', 429, A], ['OK', null, B]]);
    expect(prisma.settings.has(GEMINI_PAUSE_UNTIL_KEY)).toBe(false);
  });

  it('429 à la minute : noté REFUSE, modèle mis de côté 15 min, le suivant sert aussitôt, sans pause commune', async () => {
    const models = { [A]: failing(MINUTE_429), [B]: ok() };
    const { prisma, quota, provider } = setup(models);
    const r = await provider.suggestPairingsBatch([wine]);
    expect(r.model).toBe(B);
    expect(quota.markExhausted).not.toHaveBeenCalled();
    expect(quota.markUnavailable).toHaveBeenCalledWith(A, expect.any(Date), expect.any(Date));
    expect(prisma.calls.map((c: any) => [c.outcome, c.httpStatus, c.model])).toEqual([['REFUSE', 429, A], ['OK', null, B]]);
    expect(prisma.settings.has(GEMINI_PAUSE_UNTIL_KEY)).toBe(false);
  });

  it('429 à la minute sur le seul modèle : pause commune et erreur, comme avant', async () => {
    const { prisma, quota, provider } = setup({ [A]: failing(MINUTE_429) });
    await expect(provider.suggestPairingsBatch([wine])).rejects.toBe(MINUTE_429);
    expect(quota.markUnavailable).toHaveBeenCalledWith(A, expect.any(Date), expect.any(Date));
    expect(prisma.settings.get(GEMINI_PAUSE_REASON_KEY)).toBe('QUOTA_GOOGLE');
  });

  it('refus local à la minute du modèle choisi : attente, pas de bascule', async () => {
    const models = { [A]: ok(), [B]: ok() };
    const { quota, provider } = setup(models);
    const refusal = new GeminiQuotaError(new Date('2026-10-21T12:01:00Z'), 'QUOTA_MINUTE', 5);
    quota.reserve.mockImplementation(async (m: string) => { if (m === A) throw refusal; });
    await expect(provider.suggestPairingsBatch([wine])).rejects.toBe(refusal);
    expect(models[B].generateContent).not.toHaveBeenCalled();
  });

  it('tous les modèles épuisés pour la journée : refus du jour (QUOTA_JOUR) du premier, sans pause commune', async () => {
    const first = dayRefusal();
    const { prisma, quota, provider } = setup({ [A]: ok(), [B]: failing(DAILY_429) });
    quota.reserve.mockImplementation(async (m: string) => { if (m === A) throw first; });
    await expect(provider.suggestPairingsBatch([wine])).rejects.toBe(first);
    expect(quota.markExhausted).toHaveBeenCalledWith(B, expect.any(Date));
    expect(prisma.settings.has(GEMINI_PAUSE_UNTIL_KEY)).toBe(false);
  });

  it('dernier modèle refusé par un 429 journalier : l’erreur est un refus du jour, avec la limite du modèle', async () => {
    const { provider } = setup({ [A]: failing(DAILY_429) });
    const e = await provider.suggestPairingsBatch([wine]).catch((x: any) => x);
    expect(e).toBeInstanceOf(GeminiQuotaError);
    expect(e.reason).toBe('QUOTA_JOUR');
    expect(e.message).toMatch(/^Quota Gemini du jour atteint \(20 requêtes\)/);
  });
});

describe('GeminiVisionProvider — bascule quand un modèle est lent ou saturé', () => {
  const A = 'gemini-3.8-flash';
  const B = 'gemini-3.6-flash';
  const GEMINI_503 = new Error('[GoogleGenerativeAI Error]: Error fetching from https://…:generateContent: [503 Service Unavailable] The model is overloaded.');
  const ok = () => fakeModel(validJson);
  /** Ne répond jamais, mais s'arrête (AbortError) quand la requête est interrompue. */
  const hanging = () => ({
    generateContent: jest.fn((_req: unknown, opts: { signal: AbortSignal }) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('This operation was aborted')));
    })),
  });
  const setup = (models: Record<string, any>, reserve: (m: string) => Promise<void> = async () => undefined) => {
    const prisma = fakePrisma();
    const journal = new GeminiJournal(prisma, { warn: jest.fn(), error: jest.fn() });
    const quota = {
      reserve: jest.fn(reserve),
      addTokens: jest.fn(async () => undefined),
      markExhausted: jest.fn(async () => undefined),
      markUnavailable: jest.fn(async () => undefined),
      limits: jest.fn(async () => ({ rpm: 5, tpm: 250000, rpd: 20 })),
    };
    const provider = new GeminiVisionProvider((name) => models[name], async () => Object.keys(models), journal, quota, 20);
    return { prisma, quota, provider };
  };
  const asideFor = (quota: { markUnavailable: jest.Mock }) => {
    const [model, until, now] = quota.markUnavailable.mock.calls[0] as unknown as [string, Date, Date];
    return { model, ms: until.getTime() - now.getTime() };
  };

  it('délai d’essai dépassé sur le 1er modèle : requête interrompue, 2e modèle employé, 1er mis de côté 15 min, sans pause commune', async () => {
    const models = { [A]: hanging(), [B]: ok() };
    const { prisma, quota, provider } = setup(models);
    const r = await provider.extractWineLabel(Buffer.from('x'), 'image/jpeg', 'ENTRY');
    expect(r.model).toBe(B);
    expect((models[A].generateContent.mock.calls[0] as any)[1].signal.aborted).toBe(true);
    expect(asideFor(quota)).toEqual({ model: A, ms: 15 * 60_000 });
    expect(prisma.calls.map((c: any) => [c.usage, c.outcome, c.model])).toEqual([['LECTURE_ENTREE', 'ERREUR', A], ['LECTURE_ENTREE', 'OK', B]]);
    expect(prisma.calls[0].reason).toMatch(/ETIMEDOUT après 0 s, gemini-3\.8-flash/);
    expect(prisma.settings.has(GEMINI_PAUSE_UNTIL_KEY)).toBe(false);
  });

  it('503 sur le 1er modèle : noté REFUSE avec le modèle, 2e modèle employé, 1er mis de côté 15 min, sans pause commune', async () => {
    const { prisma, quota, provider } = setup({ [A]: { generateContent: jest.fn(async () => { throw GEMINI_503; }) }, [B]: ok() });
    const r = await provider.extractWineLabel(Buffer.from('x'), 'image/jpeg');
    expect(r.model).toBe(B);
    expect(asideFor(quota)).toEqual({ model: A, ms: 15 * 60_000 });
    expect(prisma.calls.map((c: any) => [c.outcome, c.httpStatus, c.model])).toEqual([['REFUSE', 503, A], ['OK', null, B]]);
    expect(prisma.settings.has(GEMINI_PAUSE_UNTIL_KEY)).toBe(false);
  });

  it('tous lents : le dernier délai dépassé remonte (panne passagère, report), sans pause commune', async () => {
    const { quota, provider } = setup({ [A]: hanging(), [B]: hanging() });
    await expect(provider.extractWineLabel(Buffer.from('x'), 'image/jpeg')).rejects.toThrow(/ETIMEDOUT/);
    expect(quota.markUnavailable.mock.calls.map((c: any[]) => c[0])).toEqual([A, B]);
  });

  it('tous saturés : pause commune « modèle saturé » et le 503, comme avant', async () => {
    const failing = { generateContent: jest.fn(async () => { throw GEMINI_503; }) };
    const { prisma, provider } = setup({ [A]: failing, [B]: failing });
    await expect(provider.extractWineLabel(Buffer.from('x'), 'image/jpeg')).rejects.toBe(GEMINI_503);
    expect(prisma.settings.get(GEMINI_PAUSE_REASON_KEY)).toBe('modèle saturé');
  });

  it('tous mis de côté ou épuisés : rien ne part, refus dont la reprise est la plus proche', async () => {
    const aside = new GeminiModelAsideError(new Date('2026-10-21T12:15:00Z'));
    const day = new GeminiQuotaError(new Date('2026-10-22T07:00:00Z'), 'QUOTA_JOUR', 20);
    const models = { [A]: ok(), [B]: ok() };
    const { prisma, provider } = setup(models, async (m) => { throw m === A ? day : aside; });
    await expect(provider.extractWineLabel(Buffer.from('x'), 'image/jpeg')).rejects.toBe(aside);
    expect(models[A].generateContent).not.toHaveBeenCalled();
    expect(models[B].generateContent).not.toHaveBeenCalled();
    expect(prisma.calls).toEqual([]);
    expect(prisma.settings.has(GEMINI_PAUSE_UNTIL_KEY)).toBe(false);
  });

  it('modèle mis de côté par l’autre processus : le suivant sert sans rien envoyer au premier', async () => {
    const models = { [A]: ok(), [B]: ok() };
    const { provider } = setup(models, async (m) => { if (m === A) throw new GeminiModelAsideError(new Date(Date.now() + 60_000)); });
    expect((await provider.pairDish('agneau', [])).model).toBe(B);
    expect(models[A].generateContent).not.toHaveBeenCalled();
  });

  it('sans limiteur : pas de marque ni de bascule, le délai dépassé remonte', async () => {
    const models = { [A]: hanging(), [B]: ok() };
    const provider = new GeminiVisionProvider((name) => (models as any)[name], async () => Object.keys(models), undefined, undefined, 20);
    await expect(provider.extractWineLabel(Buffer.from('x'), 'image/jpeg')).rejects.toThrow(/ETIMEDOUT/);
    expect(models[B].generateContent).not.toHaveBeenCalled();
  });
});
