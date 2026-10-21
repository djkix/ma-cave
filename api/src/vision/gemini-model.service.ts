import { PrismaClient } from '@prisma/client';
import { isLightModel } from '../config/env';

/** Réglage `app_setting` du modèle choisi dans l'Administration ; absent : `GEMINI_MODEL` du .env. */
export const GEMINI_MODEL_KEY = 'gemini_model';

/** L'api et le worker relisent le réglage au plus tard 30 s après un changement fait par l'autre processus. */
const CURRENT_TTL_MS = 30_000;
const LIST_TTL_MS = 3_600_000;
const LIST_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiModelChoice {
  model: string;
  source: 'ADMIN' | 'ENV';
}

interface Deps {
  fetch?: typeof fetch;
  clock?: () => number;
  log?: { error(message: string): void };
}

interface GoogleModelsPage {
  models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  nextPageToken?: string;
}

/**
 * Modèle Gemini en vigueur, commun à tous les usages, à l'api et au worker
 * (même base). Un réglage illisible ou une base injoignable ne bloque jamais
 * un appel : dernier modèle connu, sinon celui du .env.
 */
export class GeminiModelService {
  private cached: { value: GeminiModelChoice; at: number } | null = null;
  private list: { models: string[]; at: number } | null = null;
  private readonly fetch: typeof fetch;
  private readonly clock: () => number;
  private readonly log: { error(message: string): void };

  constructor(
    private readonly prisma: Pick<PrismaClient, 'appSetting'>,
    private readonly envModel: string,
    private readonly apiKey: string,
    deps: Deps = {},
  ) {
    this.fetch = deps.fetch ?? fetch;
    this.clock = deps.clock ?? Date.now;
    this.log = deps.log ?? console;
  }

  async current(): Promise<GeminiModelChoice> {
    const now = this.clock();
    if (this.cached && now - this.cached.at < CURRENT_TTL_MS) return this.cached.value;
    let value: GeminiModelChoice;
    try {
      const [row] = await this.prisma.appSetting.findMany({ where: { key: { in: [GEMINI_MODEL_KEY] } } });
      // Une valeur Pro glissée à la main en base n'est jamais employée.
      value = row && isLightModel(row.value) ? { model: row.value, source: 'ADMIN' } : { model: this.envModel, source: 'ENV' };
    } catch (e) {
      this.log.error(`Modèle Gemini illisible, ${this.cached ? 'dernier modèle connu' : 'modèle du .env'} employé : ${messageOf(e)}`);
      return this.cached?.value ?? { model: this.envModel, source: 'ENV' };
    }
    this.cached = { value, at: now };
    return value;
  }

  /** Le nom est validé par l'appelant (Flash ou Lite, connu de Google). */
  async set(model: string): Promise<GeminiModelChoice> {
    await this.prisma.appSetting.upsert({ where: { key: GEMINI_MODEL_KEY }, create: { key: GEMINI_MODEL_KEY, value: model }, update: { value: model } });
    const value: GeminiModelChoice = { model, source: 'ADMIN' };
    this.cached = { value, at: this.clock() };
    return value;
  }

  /** Modèles Flash ou Lite de Google (cache 1 h) ; en échec, le modèle en vigueur seul et l'erreur. */
  async available(): Promise<{ models: string[]; error: string | null }> {
    const now = this.clock();
    if (this.list && now - this.list.at < LIST_TTL_MS) return { models: this.list.models, error: null };
    try {
      const models = await this.fetchModels();
      this.list = { models, at: now };
      return { models, error: null };
    } catch (e) {
      return { models: [(await this.current()).model], error: `Liste des modèles indisponible : ${messageOf(e)}` };
    }
  }

  private async fetchModels(): Promise<string[]> {
    if (!this.apiKey) throw new Error('clé GEMINI_API_KEY absente');
    const names = new Set<string>();
    let pageToken = '';
    do {
      const url = new URL(LIST_URL);
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      // La clé passe en en-tête plutôt que dans l'adresse : elle ne finit pas dans un message d'erreur.
      const res = await this.fetch(url, { headers: { 'x-goog-api-key': this.apiKey }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Google a répondu ${res.status}`);
      const page = (await res.json()) as GoogleModelsPage;
      for (const m of page.models ?? []) {
        const name = (m.name ?? '').replace(/^models\//, '');
        if (isLightModel(name) && m.supportedGenerationMethods?.includes('generateContent')) names.add(name);
      }
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return [...names].sort();
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
