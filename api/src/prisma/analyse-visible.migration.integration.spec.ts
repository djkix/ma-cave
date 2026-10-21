import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration « analyse du plan plus visible » éprouvée sur une base au format
 * précédent (2.16) : deux plans, l'un en attente d'analyse, l'autre en échec.
 * Un schéma PostgreSQL dédié dans la base de test, toutes les migrations
 * précédentes, puis le SQL livré. Le schéma `public` n'est jamais touché ; le
 * schéma d'essai est supprimé à la fin.
 */
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const MIGRATION = '20261022000000_analyse_visible';
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');
const PRISMA_BIN = join(__dirname, '..', '..', 'node_modules', '.bin', 'prisma');

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

const previousMigrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name < MIGRATION)
  .map((d) => d.name)
  .sort();

describeIfDb('migration analyse du plan plus visible (base au format précédent)', () => {
  const prisma = new PrismaClient();
  const schema = `analyse_visible_mig_${process.pid}`;
  const q = <T = Record<string, unknown>>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);
  const pending = '6f1d1c2e-7c55-4b8e-9a0e-3a2b1c0d9e8f';
  const failed = '7a2e2d3f-8d66-4c9f-8b1f-4b3c2d1e0f9a';

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
    execute(`
      INSERT INTO cave (id, name) VALUES ('cave-1', 'Cave');
      INSERT INTO cave_plan (id, cave_id, name, path, width, height, updated_at, analysis_status) VALUES
        ('${pending}', 'cave-1', 'Cellier', 'plans/a.jpg', 800, 600, '2026-10-01 10:00:00.123', 'PENDING'),
        ('${failed}', 'cave-1', 'Garage', 'plans/b.jpg', 800, 600, '2026-10-02 11:30:00', 'FAILED');
    `);
    execute(migrationSql(MIGRATION));
  }, 120_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  });

  it('part bien du format précédent (usage analyse de plan)', () => {
    expect(previousMigrations[previousMigrations.length - 1]).toBe('20261021010000_usage_analyse_plan');
  });

  it('plans existants : demande d’analyse = date de l’image (à la milliseconde), sans raison d’échec ; rien d’autre ne change', async () => {
    expect(await q(`SELECT id::text, analysis_status, analysis_error, analysis_requested_at = updated_at AS same FROM "${schema}".cave_plan ORDER BY name`)).toEqual([
      { id: pending, analysis_status: 'PENDING', analysis_error: null, same: true },
      { id: failed, analysis_status: 'FAILED', analysis_error: null, same: true },
    ]);
  });

  it('nouveau plan : demande d’analyse renseignée par défaut, jamais nulle', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schema}".cave_plan (id, cave_id, name, path, width, height, updated_at) VALUES (gen_random_uuid(), 'cave-1', 'Neuf', 'plans/c.jpg', 1, 1, now())`,
    );
    expect(await q(`SELECT analysis_requested_at IS NOT NULL AS set FROM "${schema}".cave_plan WHERE name = 'Neuf'`)).toEqual([{ set: true }]);
    await expect(prisma.$executeRawUnsafe(`UPDATE "${schema}".cave_plan SET analysis_requested_at = NULL WHERE name = 'Neuf'`)).rejects.toThrow();
  });
});
