import { isLightModel } from '../config/env';

const LIST_TTL_MS = 3_600_000;
/** Google en panne : l'échec est gardé une minute, pour ne pas attendre son délai à chaque page de l'Administration. */
const LIST_FAILURE_TTL_MS = 60_000;
const LIST_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Modèle stable de génération : `gemini-<version>-flash` ou `-flash-lite`, sans suffixe (preview, exp, tts, image…). */
const STABLE = /^gemini-(\d+(?:\.\d+)*)-flash(-lite)?$/;

/**
 * Modèle de génération stable, Flash ou Flash-Lite, sans suffixe : écarte les
 * variantes spécialisées (tts, image, live, audio…), qui refusent une image ou
 * un texte en entrée, et les preview. Jamais de Pro.
 */
export function isStableModel(name: string): boolean {
  return STABLE.test(name) && isLightModel(name);
}

/**
 * Ordre d'emploi : les modèles stables Flash et Flash-Lite, du plus récent au
 * plus ancien, Flash avant Flash-Lite à version égale. Jamais de Pro.
 */
export function fallbackModels(available: string[]): string[] {
  const rank = (m: string) => {
    const [, version, lite] = STABLE.exec(m)!;
    return { version: version.split('.').map(Number), lite: lite ? 1 : 0 };
  };
  return [...new Set(available)].filter(isStableModel).sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < Math.max(ra.version.length, rb.version.length); i++) {
      const d = (rb.version[i] ?? 0) - (ra.version[i] ?? 0);
      if (d) return d;
    }
    return ra.lite - rb.lite;
  });
}

interface Deps {
  fetch?: typeof fetch;
  clock?: () => number;
}

interface GoogleModelsPage {
  models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  nextPageToken?: string;
}

/**
 * Modèles Gemini de tous les usages, choisis seuls (plus de réglage) : la liste
 * stable de Google, dans l'ordre de `fallbackModels`. Liste indisponible :
 * `GEMINI_MODEL` du .env s'il est stable.
 */
export class GeminiModelService {
  private list: { models: string[]; at: number } | null = null;
  private listFailure: { error: string; at: number } | null = null;
  private readonly fetch: typeof fetch;
  private readonly clock: () => number;

  constructor(
    private readonly envModel: string,
    private readonly apiKey: string,
    deps: Deps = {},
  ) {
    this.fetch = deps.fetch ?? fetch;
    this.clock = deps.clock ?? Date.now;
  }

  /** Modèles Flash ou Lite de Google (cache 1 h) ; en échec, le modèle du .env (s'il est stable) et l'erreur. */
  async available(): Promise<{ models: string[]; error: string | null }> {
    const now = this.clock();
    if (this.list && now - this.list.at < LIST_TTL_MS) return { models: this.list.models, error: null };
    if (!this.listFailure || now - this.listFailure.at >= LIST_FAILURE_TTL_MS) {
      try {
        const models = await this.fetchModels();
        this.list = { models, at: now };
        this.listFailure = null;
        return { models, error: null };
      } catch (e) {
        this.listFailure = { error: `Liste des modèles indisponible : ${messageOf(e)}`, at: now };
      }
    }
    return { models: isStableModel(this.envModel) ? [this.envModel] : [], error: this.listFailure.error };
  }

  /** Modèles à essayer, dans l'ordre (voir `fallbackModels`). */
  async candidates(): Promise<string[]> {
    return fallbackModels((await this.available()).models);
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
        if (isStableModel(name) && m.supportedGenerationMethods?.includes('generateContent')) names.add(name);
      }
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return [...names].sort();
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
