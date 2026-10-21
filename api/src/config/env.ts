import { z } from 'zod';

// `docker compose` hands the whole `.env` to the api and the worker, and `.env.example`
// ships the optional secrets as empty strings. An empty string is "not set", not an
// invalid value: without this the schema would reject it and the container would
// crash-loop on boot.
const emptyToUndefined = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? undefined : v), s);

/**
 * Modèles Gemini légers seulement (Flash, Lite) : les coûts et le budget sont
 * calculés au tarif Flash, et djkix n'emploie pas les modèles Pro.
 */
const LIGHT_MODEL = /flash|lite|light/i;
const lightModel = z.string().refine((m) => LIGHT_MODEL.test(m) && !/pro/i.test(m), { message: 'seuls les modèles Gemini Flash ou Lite sont acceptés' });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(32),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().url().default('http://localhost:3000/api/auth/google/callback'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: lightModel.default('gemini-3.5-flash'),
  // Modèle de l'analyse des plans seulement ; absent ou vide : GEMINI_MODEL (voir parseEnv).
  GEMINI_PLAN_MODEL: emptyToUndefined(lightModel.optional()),
  GEMINI_MONTHLY_CAP_CENTS: z.coerce.number().int().default(500),
  PHOTO_STORAGE_DIR: z.string().default('./data/photos'),
  BREAK_GLASS_EMAIL: emptyToUndefined(z.string().email().optional()),
  BREAK_GLASS_PASSWORD: emptyToUndefined(z.string().min(12).optional()),
  // Toute adresse Google peut s'inscrire, mais attend la validation d'un
  // administrateur (sauf invitation). ADMIN_EMAILS est la seule façon de
  // désigner un administrateur sans passer par /admin. Adresses séparées par
  // des virgules.
  ADMIN_EMAILS: z.string().default(''),
});

export type Env = Omit<z.infer<typeof schema>, 'GEMINI_PLAN_MODEL'> & { GEMINI_PLAN_MODEL: string };

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const env = schema.parse(source);
  return { ...env, GEMINI_PLAN_MODEL: env.GEMINI_PLAN_MODEL ?? env.GEMINI_MODEL };
}

let cached: Env | undefined;

export function loadEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
