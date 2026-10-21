import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration « propositions de zones » éprouvée sur une base au format précédent
 * (2.15) : un plan et deux zones (active et archivée). Un schéma PostgreSQL
 * dédié dans la base de test, toutes les migrations précédentes, puis le SQL
 * livré. Le schéma `public` n'est jamais touché ; le schéma d'essai est supprimé à la fin.
 */
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const MIGRATION = '20261021000000_propositions_zones';
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');
const PRISMA_BIN = join(__dirname, '..', '..', 'node_modules', '.bin', 'prisma');

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

const previousMigrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name < MIGRATION)
  .map((d) => d.name)
  .sort();

describeIfDb('migration propositions de zones (base au format précédent)', () => {
  const prisma = new PrismaClient();
  const schema = `propositions_mig_${process.pid}`;
  const q = <T = Record<string, unknown>>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);
  const planId = '6f1d1c2e-7c55-4b8e-9a0e-3a2b1c0d9e8f';

  function execute(sql: string): void {
    execFileSync(PRISMA_BIN, ['db', 'execute', '--stdin', '--url', process.env.DATABASE_URL!], {
      input: `SET search_path TO "${schema}", public;\n${sql}`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  /** Écriture dans le schéma d'essai ; rejetée : le nom de la contrainte violée, sinon null. */
  async function write(sql: string): Promise<string | null> {
    try {
      await prisma.$executeRawUnsafe(sql.replaceAll('$s', `"${schema}"`));
      return null;
    } catch (e) {
      return (String((e as Error).message).match(/cave_(zone|plan)_\w+_check/) ?? ['refusé sans contrainte nommée'])[0];
    }
  }

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const name of previousMigrations) execute(migrationSql(name));
    execute(`
      INSERT INTO cave (id, name) VALUES ('cave-1', 'Cave');
      INSERT INTO cave_plan (id, cave_id, name, path, width, height, updated_at) VALUES ('${planId}', 'cave-1', 'Cellier', 'plans/p.jpg', 800, 600, '2026-10-01');
      INSERT INTO cave_zone (id, cave_id, name, sort_order, plan_id, plan_x, plan_y, archived_at) VALUES
        ('z-active', 'cave-1', 'Casier A', 0, '${planId}', 0.5, 0.5, NULL),
        ('z-archivee', 'cave-1', 'Ancienne', 1, NULL, NULL, NULL, '2026-09-01');
    `);
    execute(migrationSql(MIGRATION));
  }, 120_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  });

  it('part bien du format précédent (plusieurs plans)', () => {
    expect(previousMigrations[previousMigrations.length - 1]).toBe('20261020000000_plusieurs_plans');
  });

  it('plan existant : analyse NONE, aucune proposition ; zones existantes sans grille', async () => {
    expect(await q(`SELECT id::text, analysis_status, suggestions FROM "${schema}".cave_plan`)).toEqual([{ id: planId, analysis_status: 'NONE', suggestions: [] }]);
    expect(await q(`SELECT id, grid_rows, grid_cols FROM "${schema}".cave_zone ORDER BY id`)).toEqual([
      { id: 'z-active', grid_rows: null, grid_cols: null },
      { id: 'z-archivee', grid_rows: null, grid_cols: null },
    ]);
  });

  it('CHECK : état d’analyse parmi NONE, PENDING, DONE, FAILED', async () => {
    const set = (v: string) => write(`UPDATE $s.cave_plan SET analysis_status = ${v} WHERE id = '${planId}'`);
    for (const v of [`'PENDING'`, `'DONE'`, `'FAILED'`, `'NONE'`]) expect(await set(v)).toBeNull();
    for (const v of [`'done'`, `'AUTRE'`, `''`]) expect(await set(v)).toBe('cave_plan_analysis_status_check');
    expect(await set('NULL')).toBe('refusé sans contrainte nommée');
  });

  it('CHECK : grille nulle, ou 1 à 26 lignes et 1 à 30 colonnes', async () => {
    const set = (rows: string, cols: string) => write(`UPDATE $s.cave_zone SET grid_rows = ${rows}, grid_cols = ${cols} WHERE id = 'z-active'`);
    for (const [r, c] of [['1', '1'], ['26', '30'], ['6', '4'], ['NULL', 'NULL']]) expect(await set(r, c)).toBeNull();
    for (const [r, c] of [['NULL', '4'], ['6', 'NULL'], ['0', '4'], ['27', '4'], ['6', '0'], ['6', '31']]) expect(await set(r, c)).toBe('cave_zone_grid_check');
  });
});
