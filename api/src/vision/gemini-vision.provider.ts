import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { EXTRACTION_JSON_SCHEMA_DESCRIPTION, parseExtraction } from './extraction-schema';
import { GeminiJournal, GeminiUsage, classifyFailure } from './gemini-journal';
import { parsePairingOutput } from './pairing-output';
import { PairingBatchItem, PairingBatchResult, PairingProvider, PairingWine } from './pairing-provider.interface';
import { parseProducerOutput } from './producer-output';
import { OfficialSiteProvider, OfficialSiteQuery, OfficialSiteResult } from './official-site-provider.interface';
import { ProducerBatchItem, ProducerBatchResult, ProducerProvider, ProducerQuery } from './producer-provider.interface';
import { BatchVisionResult, LabelPurpose, VisionProvider, VisionResult } from './vision-provider.interface';

export class VisionInvalidOutputError extends Error {
  /** `costCents` : l'appel a abouti et il est facturé même si sa sortie est inexploitable. */
  constructor(message: string, readonly costCents = 0) {
    super(message);
  }
}

/** Lot mélangé (JSON illisible, pas un tableau, longueur ≠ N, indice manquant/dupliqué/hors bornes) :
 * attrapée par le processeur de lot, qui relit alors photo par photo. */
export class VisionBatchMismatchError extends Error {
  /** `costCents` : l'appel a abouti et il est facturé même si sa sortie est inexploitable. */
  constructor(message: string, readonly costCents = 0) {
    super(message);
  }
}

/** Règles de lecture communes aux consignes simple et de lot : une seule source, pour qu'elles ne divergent pas. */
const READING_RULES = `Règles :
- N'invente jamais un champ absent de l'image : un champ illisible ou absent vaut null avec confidence 0.
- Donne une confiance par champ, entre 0 et 1.
- Distingue le nom du producteur (domaine, château, maison) du nom de la cuvée.
- Sur un carton, lis le nombre de bouteilles s'il est imprimé (« 6 bouteilles », « caisse de 12 »), sinon null.
- "couleur" ∈ rouge | blanc | rosé | pétillant.
- "format_cl" en centilitres (75 par défaut uniquement si l'image le confirme, sinon null).
- "etiquette" : le cadre de l'étiquette principale sur la photo, [ymin, xmin, ymax, xmax] en coordonnées normalisées de 0 à 1000 (0,0 = coin haut gauche), ou null si l'étiquette n'est pas repérable.`;

const PROMPT = `Tu lis une étiquette de vin (ou un carton de vin) photographiée. Réponds UNIQUEMENT par un objet JSON strict de cette forme :
${EXTRACTION_JSON_SCHEMA_DESCRIPTION}
${READING_RULES}`;

/** Consigne de lot : la réponse attendue est un tableau, jamais un objet (sinon le modèle hésite entre les deux). */
const batchPrompt = (n: number) =>
  `Tu lis des étiquettes de vin (ou des cartons de vin) photographiées. Tu reçois ${n} images numérotées de 1 à ${n}.
Réponds UNIQUEMENT par un tableau JSON de ${n} éléments, un par image, dans l'ordre des images.
Chaque élément est un objet avec un champ "image" (le numéro de l'image, de 1 à ${n}) et exactement les champs suivants :
${EXTRACTION_JSON_SCHEMA_DESCRIPTION}
${READING_RULES}`;

// Ordre de grandeur pour le plafond mensuel ; ajuster si la grille tarifaire change.
const PRICE_PER_1K_TOKENS_CENTS = { input: 0.01, output: 0.04 };

function rawCostCentsOf(usage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined, price = PRICE_PER_1K_TOKENS_CENTS): number {
  return ((usage?.promptTokenCount ?? 0) / 1000) * price.input + ((usage?.candidatesTokenCount ?? 0) / 1000) * price.output;
}

/** Une photo facturée par Gemini ne doit jamais être comptée à coût nul : on majore toujours. */
function costCentsOf(usage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined, price = PRICE_PER_1K_TOKENS_CENTS): number {
  return Math.ceil(rawCostCentsOf(usage, price));
}

/** Un accord coûte un ordre de grandeur de moins qu'une photo (~0,004 ct) : arrondir plutôt que
 * majorer évite qu'il consomme systématiquement 1 ct du plafond mensuel partagé avec les photos. */
function pairingCostCentsOf(usage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined): number {
  return Math.round(rawCostCentsOf(usage));
}

/** Ordre de grandeur du prix d'une requête de recherche ancrée (~35 $ les 1000 requêtes). */
const PRICE_PER_GROUNDED_QUERY_CENTS = 1.4;

/**
 * Un appel ancré sur la recherche Google est facturé à part, par requête de
 * recherche lancée (`groundingMetadata.webSearchQueries`), et les jetons des
 * résultats (`toolUsePromptTokenCount`) s'ajoutent à l'entrée : compter au moins
 * 1 ct par appel, et le plus élevé des deux coûts (jetons, requêtes), majoré, pour
 * que le plafond mensuel voie réellement cette dépense.
 */
function groundedCostCentsOf(
  usage: { promptTokenCount?: number; candidatesTokenCount?: number; toolUsePromptTokenCount?: number } | undefined,
  searchQueries: number,
): number {
  const tokens = rawCostCentsOf({
    promptTokenCount: (usage?.promptTokenCount ?? 0) + (usage?.toolUsePromptTokenCount ?? 0),
    candidatesTokenCount: usage?.candidatesTokenCount,
  });
  return Math.max(1, Math.ceil(tokens), Math.ceil(searchQueries * PRICE_PER_GROUNDED_QUERY_CENTS));
}

/** Nombre de requêtes de recherche lancées par Gemini pour un appel ancré (0 si la réponse ne le dit pas). */
function searchQueriesOf(response: { candidates?: Array<{ groundingMetadata?: { webSearchQueries?: unknown } }> }): number {
  const queries = response.candidates?.[0]?.groundingMetadata?.webSearchQueries;
  return Array.isArray(queries) ? queries.length : 0;
}

const stripFences = (text: string) => text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

/**
 * Le modèle enveloppe parfois le tableau demandé dans un objet (`{"items": […]}`) :
 * un objet dont une seule propriété est un tableau est ramené à ce tableau, tout
 * autre forme reste telle quelle (et sera refusée comme lot mélangé).
 */
function unwrapArray(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const arrays = Object.values(value).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0] : value;
}

/**
 * Réponse d'un lot : un tableau JSON de `n` objets portant chacun leur numéro
 * (`key`, de 1 à n). Rendue dans l'ordre des éléments envoyés (position 0 à
 * n − 1). JSON illisible, pas un tableau, longueur ≠ n, numéro manquant,
 * dupliqué ou hors bornes : lot mélangé (`VisionBatchMismatchError`), aucune
 * réponse ne peut être attribuée avec certitude. Commun aux photos, accords
 * et descriptifs.
 */
function indexedItems(text: string, n: number, key: string, costCents: number): unknown[] {
  let rawArray: unknown;
  try {
    rawArray = unwrapArray(JSON.parse(stripFences(text)));
  } catch {
    throw new VisionBatchMismatchError('Sortie du modèle invalide (JSON illisible)', costCents);
  }
  if (!Array.isArray(rawArray) || rawArray.length !== n) {
    throw new VisionBatchMismatchError('Sortie du modèle invalide (tableau de taille incorrecte)', costCents);
  }
  const items = new Array<unknown>(n);
  const seen = new Set<number>();
  for (const obj of rawArray as unknown[]) {
    const index = (obj as Record<string, unknown> | null)?.[key];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > n) {
      throw new VisionBatchMismatchError('Sortie du modèle invalide (indice hors bornes)', costCents);
    }
    if (seen.has(index)) {
      throw new VisionBatchMismatchError('Sortie du modèle invalide (indice dupliqué)', costCents);
    }
    seen.add(index);
    items[index - 1] = obj;
  }
  if (seen.size !== n) {
    throw new VisionBatchMismatchError('Sortie du modèle invalide (indice manquant)', costCents);
  }
  return items;
}

const COLOR_WORD: Record<string, string> = { ROUGE: 'rouge', BLANC: 'blanc', ROSE: 'rosé', PETILLANT: 'pétillant' };

/** Un vin, tel que décrit au modèle. */
function pairingLine(w: PairingWine): string {
  return `producteur « ${w.producer} » ; cuvée « ${w.cuvee ?? 'aucune'} » ; appellation « ${w.appellation} » ; région « ${w.region ?? 'inconnue'} » ; couleur ${COLOR_WORD[w.color] ?? w.color} ; ${w.vintage == null ? 'non millésimé' : `millésime ${w.vintage}`}.`;
}

/** Consigne de lot des accords : les règles de l'ancienne consigne d'un vin, réponse en tableau numéroté. */
function pairingsBatchPrompt(wines: PairingWine[]): string {
  const n = wines.length;
  return `Tu es sommelier. Pour chacun des ${n} vins ci-dessous, numérotés de 1 à ${n}, propose de 5 à 8 plats qui s'accordent avec ce vin.
Réponds UNIQUEMENT par un tableau JSON de ${n} éléments, un par vin, dans l'ordre des vins.
Chaque élément est un objet strict de la forme {"vin": number, "plats": string[]}, où "vin" est le numéro du vin (de 1 à ${n}).
Chaque plat : un nom court en français (60 caractères au plus), sans phrase ni explication.
${wines.map((w, i) => `Vin ${i + 1} : ${pairingLine(w)}`).join('\n')}`;
}

/** Un domaine, tel que décrit au modèle. */
function producerLine(q: ProducerQuery): string {
  return `« ${q.producer} » ; appellation(s) de ses vins : ${q.appellations.length ? q.appellations.map((a) => `« ${a} »`).join(', ') : 'inconnue'} ; région « ${q.region ?? 'inconnue'} ».`;
}

/** Consigne de lot des descriptifs : les règles de l'ancienne consigne d'un domaine, réponse en tableau numéroté. */
function producersBatchPrompt(queries: ProducerQuery[]): string {
  const n = queries.length;
  return `Tu es sommelier. Pour chacun des ${n} domaines viticoles ci-dessous, numérotés de 1 à ${n}, présente ce domaine en 3 à 4 phrases en français : le lieu (région, village), quelques repères d'histoire, le style de ses vins (cépages).
Réponds UNIQUEMENT par un tableau JSON de ${n} éléments, un par domaine, dans l'ordre des domaines.
Chaque élément est un objet strict de la forme {"domaine": number, "connu": true, "description": string}, où "domaine" est le numéro du domaine (de 1 à ${n}).
Si tu ne connais pas un domaine de façon fiable, n'invente rien et réponds pour lui exactement {"domaine": <numéro>, "connu": false}.
${queries.map((q, i) => `Domaine ${i + 1} : ${producerLine(q)}`).join('\n')}`;
}

function officialSitePrompt(q: OfficialSiteQuery): string {
  return `Trouve, avec la recherche Google, l'adresse du site officiel du domaine viticole qui produit ce vin (le site du domaine lui-même, pas un caviste, un guide ni un réseau social).
Réponds UNIQUEMENT par un objet JSON strict de la forme {"site": "https://…"}.
Si tu ne trouves pas de site officiel de façon fiable, réponds exactement {"site": null}.
Vin : producteur « ${q.producer} » ; cuvée « ${q.cuvee ?? 'aucune'} » ; appellation « ${q.appellation} » ; ${q.vintage == null ? 'non millésimé' : `millésime ${q.vintage}`}.`;
}

/** Une réponse ancrée sur la recherche Google n'est pas garantie en JSON pur : on prend le premier objet du texte. */
function siteOf(text: string): string | null {
  const match = stripFences(text).match(/\{[\s\S]*?\}/);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const site = (raw as { site?: unknown } | null)?.site;
  if (typeof site !== 'string') return null;
  try {
    const url = new URL(site.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Consigne de l'analyse d'un plan. La forme de la réponse est décrite dans le
 * texte, sans `responseSchema` : Google refusait le schéma imbriqué (400). Les
 * entrées mal formées sont écartées par `unitsToBlocks` / `validBlocks`.
 */
const PLAN_PROMPT = `Tu regardes la photo d'une cave à vin (ou le schéma d'une cave). Tu dois repérer les rangements à bouteilles case par case, puis regrouper les cases par meuble.

1. Les cases. Commence par repérer les meubles, de gauche à droite. Pour chaque meuble, parcours ses cases rangée par rangée, de haut en bas puis de gauche à droite, et donne-les toutes : une case est un espace délimité par des montants (verticaux) et des tablettes (horizontales). Compte chaque case, même vide, et même partiellement cachée par un objet posé devant (estime alors son cadre). Une case plus haute ou plus large que ses voisines reste une seule case. Ne fusionne jamais plusieurs cases en une. Pour chaque case, donne "box_2d" : le cadre serré sur l'intérieur de la case, [ymin, xmin, ymax, xmax] en entiers normalisés de 0 à 1000 (0,0 = coin haut gauche).

2. Les meubles. Regroupe les cases par meuble physique ("units"). Un meuble est une unité de construction. Les meubles se touchent souvent : la limite entre deux meubles se voit à un montant doublé ou plus épais, à un petit espace, à des tablettes qui ne sont pas à la même hauteur, à des cases de taille différente ou à un changement de bois ou de couleur. Une même tablette continue d'un bout à l'autre signale un seul meuble. Dans le doute, sépare. Ne fusionne jamais deux meubles accolés. Pour chaque meuble, donne "kind" : CASIER (casier à cases ou alvéoles), ETAGERE (tablettes ou étagères), AUTRE (tout autre rangement à bouteilles), et "cells" : la liste de ses cases.

3. À ignorer : un meuble coupé par le bord de l'image (moins d'environ 70 % visible), les objets posés devant ou dans les cases (sacs, seaux, cartons, bouteilles) : ce ne sont pas des cases, mais les cases qu'ils cachent en partie comptent. Ignore aussi les murs, le plafond, le sol, les portes.

Au plus 12 meubles, au plus 200 cases par meuble. Si la photo ne montre aucun rangement à bouteilles, réponds {"units": []}.

Réponds uniquement avec ce JSON : {"units": [{"kind": "CASIER", "cells": [{"box_2d": [ymin, xmin, ymax, xmax]}, …]}, …]} (entiers de 0 à 1000). Exemple : {"units": [{"kind": "ETAGERE", "cells": [{"box_2d": [100, 50, 300, 450]}, {"box_2d": [300, 50, 500, 450]}]}]}`;

/**
 * L'outil de recherche Google de Gemini 3 n'est pas encore typé par
 * `@google/generative-ai` (qui ne connaît que `googleSearchRetrieval`) : la
 * requête passe par ce type élargi, le reste de l'appel est inchangé.
 */
type GroundedRequest = Parameters<GenerativeModel['generateContent']>[0] & { tools: Array<{ googleSearch: Record<string, never> }> };

type Model = Pick<GenerativeModel, 'generateContent'>;

export class GeminiVisionProvider implements VisionProvider, PairingProvider, ProducerProvider, OfficialSiteProvider {
  /**
   * `modelFor` : le modèle Gemini d'un nom ; `currentModel` : le nom en vigueur,
   * lu à chaque appel (choisi dans l'Administration, voir GeminiModelService) :
   * un changement sert dès l'appel suivant, pour tous les usages.
   * `journal` : point de passage unique de tous les appels (voir `call`). Sans
   * journal (tests unitaires des consignes), les appels partent tels quels.
   */
  constructor(
    private readonly modelFor: (name: string) => Model,
    private readonly currentModel: () => Promise<string>,
    private readonly journal?: GeminiJournal,
  ) {}

  static fromApiKey(apiKey: string, currentModel: () => Promise<string>, journal?: GeminiJournal): GeminiVisionProvider {
    const ai = new GoogleGenerativeAI(apiKey);
    return new GeminiVisionProvider((model) => ai.getGenerativeModel({ model }), currentModel, journal);
  }

  /**
   * Chaque méthode publique passe par ici : pendant une pause commune, aucun
   * appel ne part (`GeminiPausedError`) et rien n'est noté ; sinon une ligne
   * `gemini_call` par requête envoyée, réussie, refusée (429, 503 : la pause
   * est posée) ou en erreur, avec le modèle employé. Le journal ne lève jamais.
   */
  private async call<T extends { costCents: number }>(usage: GeminiUsage, run: (model: Model, modelName: string) => Promise<T>): Promise<T> {
    await this.journal?.assertNotPaused();
    const model = await this.currentModel();
    if (!this.journal) return run(this.modelFor(model), model);
    const started = Date.now();
    let result: T;
    try {
      result = await run(this.modelFor(model), model);
    } catch (e) {
      await this.journal.record({ usage, ...classifyFailure(e), model, durationMs: Date.now() - started });
      throw e;
    }
    await this.journal.record({ usage, outcome: 'OK', httpStatus: null, reason: null, costCents: result.costCents, model, durationMs: Date.now() - started });
    return result;
  }

  /**
   * Photo seule : `EXIT` pour une sortie (ExtractionProcessor), `ENTRY` pour une
   * photo d'entrée relue seule par le lot (EntryBatchProcessor) ; sert à
   * distinguer lecture d'entrée et de sortie dans le journal des appels.
   */
  extractWineLabel(image: Buffer, mimeType: string, purpose: LabelPurpose = 'EXIT'): Promise<VisionResult> {
    return this.call(purpose === 'ENTRY' ? 'LECTURE_ENTREE' : 'LECTURE_SORTIE', (model, name) => this.readLabel(model, name, image, mimeType));
  }

  private async readLabel(model: Model, modelName: string, image: Buffer, mimeType: string): Promise<VisionResult> {
    const started = Date.now();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { data: image.toString('base64'), mimeType } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const latencyMs = Date.now() - started;
    const costCents = costCentsOf(result.response.usageMetadata);
    const text = stripFences(result.response.text());

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new VisionInvalidOutputError('Sortie du modèle invalide (JSON illisible)', costCents);
    }
    let extraction;
    try {
      extraction = parseExtraction(raw);
    } catch (e) {
      throw new VisionInvalidOutputError(`Sortie du modèle invalide : ${(e as Error).message}`, costCents);
    }

    return { extraction, raw, model: modelName, latencyMs, costCents };
  }

  extractWineLabels(images: Array<{ data: Buffer; mimeType: string }>): Promise<BatchVisionResult> {
    return this.call('LECTURE_ENTREE', (model, name) => this.readLabels(model, name, images));
  }

  private async readLabels(model: Model, modelName: string, images: Array<{ data: Buffer; mimeType: string }>): Promise<BatchVisionResult> {
    const n = images.length;
    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
      { text: batchPrompt(n) },
    ];
    images.forEach((image, i) => {
      parts.push({ text: `Image ${i + 1} :` });
      parts.push({ inlineData: { data: image.data.toString('base64'), mimeType: image.mimeType } });
    });

    const started = Date.now();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const latencyMs = Date.now() - started;
    const costCents = costCentsOf(result.response.usageMetadata);
    const items = indexedItems(result.response.text(), n, 'image', costCents).map((obj) => {
      try {
        return { raw: obj, extraction: parseExtraction(obj) };
      } catch {
        return { error: 'Lecture de l’étiquette inexploitable' };
      }
    });

    return { items, model: modelName, latencyMs, costCents };
  }

  /** Photo d'un plan : une ligne `ANALYSE_PLAN` au journal. JSON illisible : `VisionInvalidOutputError` (avec son coût). */
  analyzePlan(image: Buffer, mimeType: string): Promise<{ units: unknown; costCents: number }> {
    return this.call('ANALYSE_PLAN', (model) => this.readPlan(model, image, mimeType));
  }

  private async readPlan(model: Model, image: Buffer, mimeType: string): Promise<{ units: unknown; costCents: number }> {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: PLAN_PROMPT }, { inlineData: { data: image.toString('base64'), mimeType } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const costCents = costCentsOf(result.response.usageMetadata);
    // Sans schéma imposé, le modèle peut entourer l'objet de texte : on garde du premier « { » au dernier « } ».
    const text = stripFences(result.response.text());
    let raw: unknown;
    try {
      raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    } catch {
      throw new VisionInvalidOutputError('Sortie du modèle invalide (JSON illisible)', costCents);
    }
    return { units: (raw as { units?: unknown } | null)?.units, costCents };
  }

  /** Accords de tout un lot de vins (dix au plus) en un seul appel : une ligne `ACCORDS` au journal. */
  suggestPairingsBatch(wines: PairingWine[]): Promise<PairingBatchResult> {
    return this.call('ACCORDS', (model, name) => this.pairingsBatch(model, name, wines));
  }

  private async pairingsBatch(model: Model, modelName: string, wines: PairingWine[]): Promise<PairingBatchResult> {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: pairingsBatchPrompt(wines) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const costCents = pairingCostCentsOf(result.response.usageMetadata);
    const items: PairingBatchItem[] = [];
    indexedItems(result.response.text(), wines.length, 'vin', costCents).forEach((obj, index) => {
      try {
        items.push({ index, dishes: parsePairingOutput(obj) });
      } catch {
        // Vin inexploitable : absent du résultat, redemandé par le lot suivant.
      }
    });
    return { items, model: modelName, costCents };
  }

  /** Descriptifs de tout un lot de domaines (dix au plus) en un seul appel : une ligne `DESCRIPTIF` au journal. */
  describeProducersBatch(queries: ProducerQuery[]): Promise<ProducerBatchResult> {
    return this.call('DESCRIPTIF', (model, name) => this.producersBatch(model, name, queries));
  }

  private async producersBatch(model: Model, modelName: string, queries: ProducerQuery[]): Promise<ProducerBatchResult> {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: producersBatchPrompt(queries) }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const costCents = pairingCostCentsOf(result.response.usageMetadata);
    const items: ProducerBatchItem[] = [];
    indexedItems(result.response.text(), queries.length, 'domaine', costCents).forEach((obj, index) => {
      try {
        const output = parseProducerOutput(obj);
        items.push({ index, known: output.known, description: output.known ? output.description : null });
      } catch {
        // Domaine inexploitable : absent du résultat, redemandé par le lot suivant.
      }
    });
    return { items, model: modelName, costCents };
  }

  /**
   * Site officiel du domaine, trouvé par Gemini avec la recherche Google. Pas de
   * `responseMimeType` JSON : il n'est pas garanti avec un outil de recherche, la
   * consigne suffit et la réponse est lue avec tolérance. Coût : au moins 1 ct,
   * et par requête de recherche (voir `groundedCostCentsOf`). Une réponse
   * inexploitable vaut « pas de site » (l'appel reste facturé). `signal` : délai
   * global de la recherche d'image, l'appel est abandonné quand il est levé.
   */
  findOfficialSite(query: OfficialSiteQuery, signal?: AbortSignal): Promise<OfficialSiteResult> {
    return this.call('RECHERCHE_IMAGE', (model, name) => this.officialSite(model, name, query, signal));
  }

  private async officialSite(model: Model, modelName: string, query: OfficialSiteQuery, signal?: AbortSignal): Promise<OfficialSiteResult> {
    const request: GroundedRequest = {
      contents: [{ role: 'user', parts: [{ text: officialSitePrompt(query) }] }],
      tools: [{ googleSearch: {} }],
    };
    const result = await model.generateContent(request as Parameters<GenerativeModel['generateContent']>[0], { signal });
    let text = '';
    try {
      text = result.response.text();
    } catch {
      // Réponse bloquée ou vide : pas de site.
    }
    return { site: siteOf(text), model: modelName, costCents: groundedCostCentsOf(result.response.usageMetadata, searchQueriesOf(result.response)) };
  }
}
