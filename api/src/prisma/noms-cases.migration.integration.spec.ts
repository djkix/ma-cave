import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration « noms des cases » éprouvée sur une base au format précédent
 * (2.23) : une zone à grille et une zone sans grille.
 * Un schéma PostgreSQL dédié dans la base de test, toutes les migrations
 * précédentes, puis le SQL livré. Le schéma `public` n'est jamais touché ; le
 * schéma d'essai est supprimé à la fin.
 */
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const MIGRATION = '20261024000000_noms_cases';
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');
const PRISMA_BIN = join(__dirname, '..', '..', 'node_modules', '.bin', 'prisma');

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

const previousMigrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name < MIGRATION)
  .map((d) => d.name)
  .sort();

describeIfDb('migration noms des cases (base au format précédent)', () => {
  const prisma = new PrismaClient();
  const schema = `noms_cases_mig_${process.pid}`;
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
    execute(`
      INSERT INTO cave (id, name) VALUES ('cave-1', 'Cave');
      INSERT INTO cave_zone (id, cave_id, name, sort_order, grid_rows, grid_cols) VALUES
        ('z-grille', 'cave-1', 'Casier', 0, 3, 4),
        ('z-libre', 'cave-1', 'Étagère', 1, NULL, NULL);
    `);
    execute(migrationSql(MIGRATION));
  }, 120_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  });

  it('part bien du format précédent (modèle Gemini)', () => {
    expect(previousMigrations[previousMigrations.length - 1]).toBe('20261023000000_modele_gemini');
  });

  it('zones existantes : aucun nom ({}), rien d’autre ne change', async () => {
    expect(await q(`SELECT id, name, grid_rows, grid_cols, cell_names FROM "${schema}".cave_zone ORDER BY sort_order`)).toEqual([
      { id: 'z-grille', name: 'Casier', grid_rows: 3, grid_cols: 4, cell_names: {} },
      { id: 'z-libre', name: 'Étagère', grid_rows: null, grid_cols: null, cell_names: {} },
    ]);
  });

  it('un objet { code: nom } s’enregistre ; tout autre JSON est refusé (cave_zone_cell_names_check)', async () => {
    await prisma.$executeRawUnsafe(`UPDATE "${schema}".cave_zone SET cell_names = '{"B3": "Champagnes"}' WHERE id = 'z-grille'`);
    expect(await q(`SELECT cell_names FROM "${schema}".cave_zone WHERE id = 'z-grille'`)).toEqual([{ cell_names: { B3: 'Champagnes' } }]);
    await expect(prisma.$executeRawUnsafe(`UPDATE "${schema}".cave_zone SET cell_names = '["B3"]' WHERE id = 'z-libre'`)).rejects.toThrow(/cave_zone_cell_names_check/);
  });
});
