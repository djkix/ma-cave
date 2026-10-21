import { isLightModel, parseEnv } from './env';

const minimal: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://postgres:dev@localhost:5432/cave',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('parseEnv', () => {
  it('accepts a minimal environment', () => {
    const env = parseEnv(minimal);
    expect(env.DATABASE_URL).toBe(minimal.DATABASE_URL);
    expect(env.NODE_ENV).toBe('development');
  });

  it('treats the empty break-glass secrets shipped by .env.example as unset', () => {
    // docker compose passes the whole .env to api and worker; `.env.example` ships
    // BREAK_GLASS_* empty, which must mean « pas de compte de secours », not a crash.
    const env = parseEnv({ ...minimal, BREAK_GLASS_EMAIL: '', BREAK_GLASS_PASSWORD: '' });
    expect(env.BREAK_GLASS_EMAIL).toBeUndefined();
    expect(env.BREAK_GLASS_PASSWORD).toBeUndefined();
  });

  it('still rejects a non-empty break-glass password that is too short', () => {
    expect(() => parseEnv({ ...minimal, BREAK_GLASS_EMAIL: 'secours@example.com', BREAK_GLASS_PASSWORD: 'court' })).toThrow();
  });

  it('still rejects a non-empty break-glass e-mail that is not an address', () => {
    expect(() => parseEnv({ ...minimal, BREAK_GLASS_EMAIL: 'pas-une-adresse' })).toThrow();
  });

  it('rejects a missing session secret', () => {
    expect(() => parseEnv({ DATABASE_URL: minimal.DATABASE_URL })).toThrow();
  });

  it('defaults ADMIN_EMAILS to an empty string when absent', () => {
    const env = parseEnv(minimal);
    expect(env.ADMIN_EMAILS).toBe('');
  });

  it('GEMINI_PLAN_MODEL (retirée) est ignorée, même avec une valeur', () => {
    const env = parseEnv({ ...minimal, GEMINI_MODEL: 'gemini-3.5-flash', GEMINI_PLAN_MODEL: 'gemini-3.5-pro' });
    expect(env.GEMINI_MODEL).toBe('gemini-3.5-flash');
    expect(env).not.toHaveProperty('GEMINI_PLAN_MODEL');
  });

  it('refuse un modèle Gemini qui n’est ni Flash ni Lite (Pro compris)', () => {
    expect(() => parseEnv({ ...minimal, GEMINI_MODEL: 'gemini-2.5-pro' })).toThrow(/Flash ou Lite/);
    expect(() => parseEnv({ ...minimal, GEMINI_MODEL: 'gemini-3.5-flash-pro' })).toThrow(/Flash ou Lite/);
  });
});

describe('isLightModel', () => {
  it('Flash, Lite ou Light, jamais Pro', () => {
    expect(['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.0-flash-light', 'Gemini-Flash'].every(isLightModel)).toBe(true);
    expect(['gemini-3.5-pro', 'gemini-3.5-flash-pro', 'gemini-embedding', ''].some(isLightModel)).toBe(false);
  });
});
