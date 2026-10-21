import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration « modèle Gemini choisi dans l'Administration » éprouvée sur une
 * base au format précédent (2.18) : un appel déjà journalisé.
 * Un schéma PostgreSQL dédié dans la base de test, toutes les migrations
 * précédentes, puis le SQL livré. Le schéma `public` n'est jamais touché ; le
 * schéma d'essai est supprimé à la fin.
 */
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const MIGRATION = '20261023000000_modele_gemini';
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');
const PRISMA_BIN = join(__dirname, '..', '..', 'node_modules', '.bin', 'prisma');

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

const previousMigrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name < MIGRATION)
  .map((d) => d.name)
  .sort();

describeIfDb('migration modèle Gemini (base au format précédent)', () => {
  const prisma = new PrismaClient();
  const schema = `modele_gemini_mig_${process.pid}`;
  const q = <T = Record<string, unknown>>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);

  function execute(sql: string): void {
    execFileSync(PRISMA_BIN, ['db', 'execute', '--stdin', '--url', process.env.DATABASE_URL!], {
      input: `SET search_path TO "${schema}", public;\n${sql}`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const name of previousMigrations) execute(migrationSql(name));
    execute(`INSERT INTO gemini_call (id, usage, outcome, cost_cents, duration_ms) VALUES ('ancien', 'ACCORDS', 'OK', 2, 10);`);
    execute(migrationSql(MIGRATION));
  }, 120_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  });

  it('part bien du format précédent (analyse du plan plus visible)', () => {
    expect(previousMigrations[previousMigrations.length - 1]).toBe('20261022000000_analyse_visible');
  });

  it('appels déjà journalisés : modèle inconnu (NULL), rien d’autre ne change', async () => {
    expect(await q(`SELECT id, usage, outcome, cost_cents, duration_ms, model FROM "${schema}".gemini_call`)).toEqual([
      { id: 'ancien', usage: 'ACCORDS', outcome: 'OK', cost_cents: 2, duration_ms: 10, model: null },
    ]);
  });

  it('nouvel appel : le modèle est enregistré', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schema}".gemini_call (id, usage, outcome, duration_ms, model) VALUES ('neuf', 'ACCORDS', 'OK', 1, 'gemini-3.5-flash-lite')`,
    );
    expect(await q(`SELECT model FROM "${schema}".gemini_call WHERE id = 'neuf'`)).toEqual([{ model: 'gemini-3.5-flash-lite' }]);
  });
});
