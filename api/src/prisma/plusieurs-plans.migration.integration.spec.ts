import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration « plusieurs plans » éprouvée sur une base au format précédent
 * (2.13.0) : une cave avec plan et repère, une cave sans plan dont des zones
 * (active et archivée) gardent un repère, une cave sans plan ni repère. Un
 * schéma PostgreSQL dédié dans la base de test, toutes les migrations
 * précédentes, puis le SQL livré, en un seul envoi. Le schéma `public` n'est
 * jamais touché ; le schéma d'essai est supprimé à la fin.
 */
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const MIGRATION = '20261020000000_plusieurs_plans';
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');
const PRISMA_BIN = join(__dirname, '..', '..', 'node_modules', '.bin', 'prisma');

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');

const previousMigrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name < MIGRATION)
  .map((d) => d.name)
  .sort();

describeIfDb('migration plusieurs plans (base au format précédent)', () => {
  const prisma = new PrismaClient();
  const schema = `plans_mig_${process.pid}`;
  const q = <T = Record<string, unknown>>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);
  const updatedAt = new Date('2026-10-01T08:30:00.000Z');

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
      return (String((e as Error).message).match(/cave_zone_\w+_(check|fkey)/) ?? ['refusé sans contrainte nommée'])[0];
    }
  }

  const planOf = async (caveId: string) =>
    (await q<{ id: string }>(`SELECT id::text FROM "${schema}".cave_plan WHERE cave_id = '${caveId}'`))[0]?.id;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const name of previousMigrations) execute(migrationSql(name));
    execute(`
      INSERT INTO cave (id, name, plan_path, plan_width, plan_height, plan_updated_at) VALUES
        ('cave-plan', 'Avec plan', 'plans/cave-plan.jpg', 1200, 800, '${updatedAt.toISOString().replace('Z', '')}'),
        ('cave-sans', 'Sans plan, repères gardés', NULL, NULL, NULL, NULL),
        ('cave-vide', 'Sans plan ni repère', NULL, NULL, NULL, NULL);
      INSERT INTO cave_zone (id, cave_id, name, sort_order, plan_x, plan_y, archived_at) VALUES
        ('z-plan', 'cave-plan', 'Cellier', 0, 0.5, 0.25, NULL),
        ('z-plan-sans-repere', 'cave-plan', 'Garage', 1, NULL, NULL, NULL),
        ('z-sans-active', 'cave-sans', 'Cave 1', 0, 0.3, 0.3, NULL),
        ('z-sans-archivee', 'cave-sans', 'Ancienne', 1, 0.7, 0.1, '2026-09-01'),
        ('z-vide', 'cave-vide', 'Frigo', 0, NULL, NULL, NULL);
    `);
    execute(migrationSql(MIGRATION));
  }, 120_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  });

  it('part bien du format précédent (plan de la cave)', () => {
    expect(previousMigrations[previousMigrations.length - 1]).toBe('20261017000000_plan_cave');
  });

  it('le plan d’une cave devient « Plan principal » (même fichier, taille et date) ; son repère pointe vers lui', async () => {
    expect(await q(`SELECT cave_id, name, path, width, height, updated_at, created_at FROM "${schema}".cave_plan`)).toEqual([
      { cave_id: 'cave-plan', name: 'Plan principal', path: 'plans/cave-plan.jpg', width: 1200, height: 800, updated_at: updatedAt, created_at: updatedAt },
    ]);
    const planId = await planOf('cave-plan');
    expect(await q(`SELECT id, plan_id::text, plan_x, plan_y FROM "${schema}".cave_zone WHERE cave_id = 'cave-plan' ORDER BY id`)).toEqual([
      { id: 'z-plan', plan_id: planId, plan_x: 0.5, plan_y: 0.25 },
      { id: 'z-plan-sans-repere', plan_id: null, plan_x: null, plan_y: null },
    ]);
  });

  it('cave sans plan : les repères de ses zones, active et archivée, sont effacés ; les zones restent', async () => {
    expect(await q(`SELECT id, plan_id, plan_x, plan_y, archived_at IS NOT NULL AS archived FROM "${schema}".cave_zone WHERE cave_id = 'cave-sans' ORDER BY id`)).toEqual([
      { id: 'z-sans-active', plan_id: null, plan_x: null, plan_y: null, archived: false },
      { id: 'z-sans-archivee', plan_id: null, plan_x: null, plan_y: null, archived: true },
    ]);
  });

  it('cave sans plan ni repère : aucun plan créé', async () => {
    expect(await planOf('cave-sans')).toBeUndefined();
    expect(await planOf('cave-vide')).toBeUndefined();
    expect(await q(`SELECT id, plan_id, plan_x FROM "${schema}".cave_zone WHERE cave_id = 'cave-vide'`)).toEqual([{ id: 'z-vide', plan_id: null, plan_x: null }]);
  });

  it('cave n’a plus de colonnes de plan', async () => {
    expect(await q(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = '${schema}' AND table_name = 'cave' AND column_name LIKE 'plan_%'`)).toEqual([]);
  });

  it('CHECK : plan, x et y tous nuls, ou tous renseignés avec x et y entre 0 et 1', async () => {
    const planId = await planOf('cave-plan');
    const set = (p: string, x: string, y: string) => write(`UPDATE $s.cave_zone SET plan_id = ${p}, plan_x = ${x}, plan_y = ${y} WHERE id = 'z-plan'`);
    for (const [p, x, y] of [[`'${planId}'`, '0', '1'], [`'${planId}'`, '0.5', '0.25'], ['NULL', 'NULL', 'NULL']]) expect(await set(p, x, y)).toBeNull();
    for (const [p, x, y] of [
      [`'${planId}'`, 'NULL', '0.5'], [`'${planId}'`, '0.5', 'NULL'], [`'${planId}'`, '1.01', '0.5'], [`'${planId}'`, '0.5', '-0.01'],
      [`'${planId}'`, `'NaN'`, '0.5'], ['NULL', '0.5', '0.5'],
    ]) {
      expect(await set(p, x, y)).toBe('cave_zone_plan_position_check');
    }
  });

  it('clé étrangère composite : une zone ne pointe pas vers le plan d’une autre cave', async () => {
    const planId = await planOf('cave-plan');
    expect(await write(`UPDATE $s.cave_zone SET plan_id = '${planId}', plan_x = 0.5, plan_y = 0.5 WHERE id = 'z-vide'`)).toBe('cave_zone_plan_id_cave_id_fkey');
    expect(await write(`UPDATE $s.cave_zone SET plan_id = '${planId}', plan_x = 0.5, plan_y = 0.5 WHERE id = 'z-plan-sans-repere'`)).toBeNull();
  });
});
