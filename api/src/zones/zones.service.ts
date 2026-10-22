import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CaveZone, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CaveContextService } from '../caves/cave-context.service';
import { LocationsService } from '../locations/locations.service';
import { lockWine, writeMove } from '../movements/movements.service';
import { ImageNormalizationService } from '../photos/image-normalization.service';
import { PHOTO_STORAGE_DIR } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CELL_CODES_TAKEN, CELL_PREFIX_TAKEN, CellBoxes, cellBoxesFor, cellNamesFor, CellNames, CreateZoneInput, keptCellNames, NO_FREE_PREFIX, NO_GRID, NO_MARKER, PLAN_NOT_FOUND, renamePrefix, suggestPrefix,
  UpdateZoneInput, ZONE_NAME_TAKEN, ZONE_NOT_FOUND, ZONE_PHOTO_NOT_FOUND, zonePhotoPath, ZoneView, zoneView,
} from './zone';

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * Index unique violé (course entre deux écritures) : 409 « lettre prise » pour
 * cave_zone_cave_id_cell_prefix_key, « nom pris » pour cave_zone_cave_id_name_key ;
 * toute autre erreur repart telle quelle.
 */
export function zoneConflict(e: unknown): never {
  if (isUniqueViolation(e)) {
    const target = String((e as Prisma.PrismaClientKnownRequestError).meta?.target);
    throw new ConflictException(target.includes('cell_prefix') ? CELL_PREFIX_TAKEN : ZONE_NAME_TAKEN);
  }
  throw e;
}

/**
 * Lettre des cases d'une zone à grille, lue dans la transaction qui l'écrit :
 * `wanted` (demandée ou déjà la sienne) si aucune autre zone active de la cave
 * ne l'a, sinon 409 ; sans `wanted`, le choix automatique par le nom (409 quand
 * les 26 sont prises). `zoneId` : la zone elle-même, exclue (null : nouvelle zone).
 */
export async function choosePrefix(tx: Prisma.TransactionClient, caveId: string, zoneId: string | null, wanted: string | null, name: string): Promise<string> {
  const others = await tx.caveZone.findMany({
    where: { caveId, archivedAt: null, cellPrefix: { not: null }, ...(zoneId ? { id: { not: zoneId } } : {}) }, select: { cellPrefix: true },
  });
  const taken = others.map((z) => z.cellPrefix!);
  if (wanted) {
    if (taken.includes(wanted)) throw new ConflictException(CELL_PREFIX_TAKEN);
    return wanted;
  }
  const auto = suggestPrefix(name, taken);
  if (!auto) throw new ConflictException(NO_FREE_PREFIX);
  return auto;
}

export async function unlinkIgnoringMissing(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

/**
 * Image normalisée (400 si illisible), écrite dans un fichier temporaire à côté
 * de `path` (relatif à `dir`), puis `commit(place)` : `place()` la met en place
 * (rename, atomique) et s'appelle sous le verrou de l'enregistrement. Le
 * temporaire est effacé quoi qu'il arrive : jamais de fichier orphelin ni à moitié écrit.
 */
export async function placeImage(
  normalized: Promise<{ buffer: Buffer; width: number; height: number }>, dir: string, path: string,
  commit: (place: () => Promise<void>, size: { width: number; height: number }) => Promise<void>,
): Promise<void> {
  let image: { buffer: Buffer; width: number; height: number };
  try {
    image = await normalized;
  } catch {
    throw new BadRequestException('Image illisible ou format non pris en charge');
  }
  const final = join(dir, path);
  const tmp = `${final}.${randomUUID()}.tmp`;
  await mkdir(dirname(final), { recursive: true });
  await writeFile(tmp, image.buffer);
  try {
    await commit(() => rename(tmp, final), image);
  } finally {
    await unlinkIgnoringMissing(tmp);
  }
}

/** Ordre d'affichage : sort_order, puis la plus ancienne (deux zones au même rang, après une reprise). */
const ORDER: Prisma.CaveZoneOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];

/**
 * Zones de la cave (« Ma cave ») : nom, indication, photo, ordre. Une zone
 * d'une autre cave, ou archivée, est « introuvable ».
 */
@Injectable()
export class ZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalization: ImageNormalizationService,
    private readonly caves: CaveContextService,
    private readonly locations: LocationsService,
    @Inject(PHOTO_STORAGE_DIR) private readonly dir: string,
  ) {}

  /** Zones non archivées, dans l'ordre d'affichage. */
  async list(caveId: string): Promise<ZoneView[]> {
    const zones = await this.prisma.caveZone.findMany({ where: { caveId, archivedAt: null }, orderBy: ORDER });
    return zones.map(zoneView);
  }

  private async findOwn(caveId: string, id: string): Promise<CaveZone> {
    const zone = await this.prisma.caveZone.findFirst({ where: { id, caveId, archivedAt: null } });
    if (!zone) throw new NotFoundException(ZONE_NOT_FOUND);
    return zone;
  }

  /** Nouvelle zone, en fin de liste. 409 si une zone de la cave porte déjà ce nom (casse ignorée). */
  async create(caveId: string, input: CreateZoneInput): Promise<ZoneView> {
    try {
      const zone = await this.prisma.$transaction(async (tx) => {
        const last = await tx.caveZone.aggregate({ where: { caveId, archivedAt: null }, _max: { sortOrder: true } });
        return tx.caveZone.create({ data: { caveId, name: input.name, indication: input.indication ?? null, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      });
      return zoneView(zone);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(ZONE_NAME_TAKEN);
      throw e;
    }
  }

  /**
   * Renommer, changer l'indication, la grille (`null` la retire, avec lettre,
   * noms et positions des cases), la lettre ou les noms des cases (remplacement
   * complet, vérifiés contre la grille et la lettre qui en résultent) : le
   * nouveau nom vaut partout, l'emplacement ne change pas. Une grille réduite
   * perd les noms des cases disparues ; une grille changée (lignes ou colonnes)
   * perd les positions de ses cases. Une zone à grille sans lettre en reçoit une
   * (demandée, sinon choisie) quand sa grille est enregistrée ; renommer la zone
   * ne change pas sa lettre. Changer la lettre renomme les noms, les positions
   * et le casier des emplacements de la zone qui sont des codes de l'ancienne
   * (« a5 » → « C5 ») : les bouteilles suivent. Sous verrou de la zone : une
   * entrée simultanée dans la zone (LocationsService.resolve la lit FOR SHARE)
   * passe avant ou après.
   */
  async update(caveId: string, id: string, input: UpdateZoneInput): Promise<ZoneView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockOwn(tx, caveId, id);
      const current = zoneView(await tx.caveZone.findUniqueOrThrow({ where: { id } }));
      const grid = input.grid !== undefined ? input.grid : current.grid;
      const gridChanged = input.grid !== undefined && (input.grid?.rows !== current.grid?.rows || input.grid?.cols !== current.grid?.cols);
      const wanted = input.cellPrefix ?? current.cellPrefix;
      const prefix = grid && (wanted || input.grid !== undefined) ? await choosePrefix(tx, caveId, id, wanted, input.name ?? current.name) : null;
      const old = current.cellPrefix;
      const renamed = old != null && prefix != null && prefix !== old;
      const cellNames: CellNames | undefined =
        input.cellNames !== undefined ? cellNamesFor(input.cellNames, grid, prefix)
          : input.grid !== undefined || prefix !== old ? keptCellNames(renamed ? renamePrefix(current.cellNames, old, prefix) : current.cellNames, grid, prefix)
            : undefined;
      if (input.cellBoxes !== undefined && !grid) throw new BadRequestException(NO_GRID);
      if (input.cellBoxes !== undefined && !current.marker) throw new BadRequestException(NO_MARKER);
      const cellBoxes: CellBoxes | undefined = input.cellBoxes !== undefined ? cellBoxesFor(input.cellBoxes, grid, prefix)
        : !grid || gridChanged ? {} : renamed ? renamePrefix(current.cellBoxes, old, prefix) : undefined;
      if (renamed) {
        await tx.$executeRaw`
          UPDATE location SET casier = ${prefix} || substring(casier from 2)
          WHERE zone_id = ${id} AND casier ~* ${`^${old}[1-9][0-9]*$`}`.catch((e: unknown) => {
          // Un emplacement de la zone porte déjà un code de la nouvelle lettre (location_place_key).
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2010' && e.meta?.code === '23505') throw new ConflictException(CELL_CODES_TAKEN);
          throw e;
        });
      }
      await tx.caveZone.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.indication !== undefined ? { indication: input.indication } : {}),
          ...(input.grid !== undefined ? { gridRows: input.grid?.rows ?? null, gridCols: input.grid?.cols ?? null } : {}),
          cellPrefix: prefix,
          ...(cellNames !== undefined ? { cellNames } : {}),
          ...(cellBoxes !== undefined ? { cellBoxes } : {}),
        },
      });
    }).catch(zoneConflict);
    return zoneView(await this.findOwn(caveId, id));
  }

  /**
   * Cases occupées : stock > 0 par valeur de casier (non vide) dans la zone,
   * toutes positions confondues, en majuscules (« c15 » et « C15 » : une seule case « C15 »). Les bouteilles d'une case disparue d'une grille
   * réduite restent lues ici.
   */
  async cells(caveId: string, id: string): Promise<Array<{ casier: string; quantity: number }>> {
    await this.findOwn(caveId, id);
    return this.prisma.$queryRaw<Array<{ casier: string; quantity: number }>>`
      SELECT upper(l.casier) AS casier, SUM(m.delta)::INTEGER AS quantity
      FROM movement m JOIN location l ON l.id = m.location_id
      WHERE l.zone_id = ${id} AND l.cave_id = ${caveId} AND l.casier IS NOT NULL AND l.casier <> ''
      GROUP BY upper(l.casier)
      HAVING SUM(m.delta) > 0
      ORDER BY upper(l.casier)`;
  }

  /**
   * Nouvel ordre : les zones données, dans cet ordre, puis celles qui manquent
   * (créées entre-temps sur un autre téléphone) dans leur ordre actuel. Une
   * seule transaction, sous verrou des zones de la cave : deux réordonnancements
   * simultanés ne s'entremêlent pas, le dernier l'emporte en entier.
   */
  async reorder(caveId: string, ids: string[]): Promise<ZoneView[]> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM cave_zone WHERE cave_id = ${caveId} AND archived_at IS NULL
        ORDER BY sort_order, created_at, id FOR UPDATE`;
      const known = new Set(current.map((z) => z.id));
      if (ids.some((id) => !known.has(id))) throw new NotFoundException(ZONE_NOT_FOUND);
      const order = [...ids, ...current.map((z) => z.id).filter((id) => !ids.includes(id))];
      for (const [sortOrder, id] of order.entries()) await tx.caveZone.update({ where: { id }, data: { sortOrder } });
    });
    return this.list(caveId);
  }

  /**
   * Supprimer : les bouteilles encore rangées dans la zone en sortent par un
   * déplacement (paire MOVE, annulable) vers l'emplacement sans zone de même
   * casier et même position (« Sans emplacement » s'il n'y en a pas) ; la zone
   * est alors archivée. Archivée aussi si un mouvement l'a désignée
   * (l'historique garde son libellé) ; sinon supprimée, avec ses emplacements
   * jamais utilisés et sa photo. Sous verrou de la zone : une entrée simultanée
   * dans cette zone (LocationsService.resolve la lit FOR SHARE) passe avant ou
   * après, jamais entre. `archived` dit ce qui s'est passé, `unplaced` combien
   * de bouteilles sont sorties de la zone.
   */
  async remove(caveId: string, id: string): Promise<{ archived: boolean; unplaced: number }> {
    // Zone d'une autre cave ou archivée : 404, avant toute lecture de ses vins.
    await this.findOwn(caveId, id);
    const deleted = await this.prisma.$transaction(async (tx) => {
      // Ordre des verrous : les vins d'abord (par id), la zone ensuite — le même ordre
      // qu'un déplacement, une annulation ou un inventaire vers la zone (verrou du vin,
      // puis LocationsService lit la zone) : jamais d'interblocage avec eux. Le verrou du
      // vin fige son stock : une sortie simultanée ne peut plus le changer.
      const wines = await tx.$queryRaw<{ wineId: string }[]>`
        SELECT DISTINCT m.wine_id AS "wineId" FROM movement m JOIN location l ON l.id = m.location_id
        WHERE l.zone_id = ${id} ORDER BY m.wine_id`;
      for (const { wineId } of wines) await lockWine(tx, caveId, wineId);
      const locked = new Set(wines.map((w) => w.wineId));
      const zone = await this.lockOwn(tx, caveId, id);
      const [{ used }] = await tx.$queryRaw<{ used: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM movement m JOIN location l ON l.id = m.location_id WHERE l.zone_id = ${id}) AS used`;
      const stockedNow = () => tx.$queryRaw<{ wineId: string; locationId: string; casier: string | null; position: string | null; quantity: number }[]>`
        SELECT m.wine_id AS "wineId", l.id AS "locationId", l.casier, l.position, SUM(m.delta)::INTEGER AS quantity
        FROM movement m JOIN location l ON l.id = m.location_id
        WHERE l.zone_id = ${id}
        GROUP BY m.wine_id, l.id, l.casier, l.position
        HAVING SUM(m.delta) > 0
        ORDER BY m.wine_id`;
      let stocked = await stockedNow();
      // Un vin entré dans la zone entre la première lecture et le verrou de la zone (cas rare) :
      // verrouillé à son tour, puis le stock est relu sous ce verrou. La zone verrouillée
      // n'admet plus d'autre entrée.
      const late = [...new Set(stocked.map((s) => s.wineId))].filter((w) => !locked.has(w));
      for (const wineId of late) await lockWine(tx, caveId, wineId);
      if (late.length > 0) stocked = await stockedNow();
      let unplaced = 0;
      for (const s of stocked) {
        const to = s.casier || s.position ? (await this.locations.resolve(caveId, { casier: s.casier, position: s.position }, tx)).id : null;
        await writeMove(tx, s.wineId, s.quantity, randomUUID(), s.locationId, to);
        unplaced += s.quantity;
      }
      if (used) {
        await tx.caveZone.update({ where: { id }, data: { archivedAt: new Date() } });
        return { archived: true, unplaced, photoPath: null };
      }
      await tx.location.deleteMany({ where: { zoneId: id } });
      await tx.caveZone.delete({ where: { id } });
      return { archived: false, unplaced: 0, photoPath: zone.photoPath };
    });
    if (deleted.photoPath) await unlinkIgnoringMissing(join(this.dir, deleted.photoPath));
    return { archived: deleted.archived, unplaced: deleted.unplaced };
  }

  /** Zone non archivée de la cave, verrouillée (FOR UPDATE) jusqu'à la fin de la transaction ; sinon 404. */
  private async lockOwn(tx: Prisma.TransactionClient, caveId: string, id: string): Promise<{ photoPath: string | null }> {
    const [zone] = await tx.$queryRaw<{ photoPath: string | null }[]>`
      SELECT photo_path AS "photoPath" FROM cave_zone WHERE id = ${id} AND cave_id = ${caveId} AND archived_at IS NULL FOR UPDATE`;
    if (!zone) throw new NotFoundException(ZONE_NOT_FOUND);
    return zone;
  }

  /**
   * Photo de la zone (remplace la précédente) : normalisée comme les photos
   * d'étiquette, 1600 px au plus, JPEG. Écrite dans un fichier temporaire, puis
   * mise en place (rename, atomique) et enregistrée sous verrou de la zone : une
   * suppression simultanée passe avant (404, fichier temporaire effacé) ou après
   * (elle voit la photo et l'efface), jamais de fichier orphelin ni à moitié écrit.
   */
  async setPhoto(caveId: string, id: string, input: Buffer): Promise<ZoneView> {
    await this.findOwn(caveId, id);
    const path = zonePhotoPath(id);
    await placeImage(this.normalization.normalize(input), this.dir, path, (place) =>
      this.prisma.$transaction(async (tx) => {
        await this.lockOwn(tx, caveId, id);
        await place();
        await tx.caveZone.update({ where: { id }, data: { photoPath: path } });
      }));
    return zoneView(await this.findOwn(caveId, id));
  }

  /**
   * Pose ou déplace le repère de la zone sur un plan de la cave : 404 « Zone
   * introuvable » pour une zone d'une autre cave ou archivée, puis 404 « Plan
   * introuvable » pour un plan absent ou d'une autre cave (la clé étrangère
   * composite (plan_id, cave_id) le refuse, même pour un plan supprimé entre-temps).
   * Sur un autre plan, les positions des cases sont effacées (elles ne valent que sur le leur).
   */
  async setMarker(caveId: string, id: string, marker: { planId: string; x: number; y: number }): Promise<ZoneView> {
    const current = await this.findOwn(caveId, id);
    const { count } = await this.prisma.caveZone
      .updateMany({
        where: { id, caveId, archivedAt: null },
        data: { planId: marker.planId, planX: marker.x, planY: marker.y, ...(current.planId !== marker.planId ? { cellBoxes: {} } : {}) },
      })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new NotFoundException(PLAN_NOT_FOUND);
        throw e;
      });
    if (count === 0) throw new NotFoundException(ZONE_NOT_FOUND);
    return zoneView(await this.findOwn(caveId, id));
  }

  /** Retire le repère de la zone (plan et position), avec les positions de ses cases. */
  async removeMarker(caveId: string, id: string): Promise<ZoneView> {
    const { count } = await this.prisma.caveZone.updateMany({ where: { id, caveId, archivedAt: null }, data: { planId: null, planX: null, planY: null, cellBoxes: {} } });
    if (count === 0) throw new NotFoundException(ZONE_NOT_FOUND);
    return zoneView(await this.findOwn(caveId, id));
  }

  /** Retire la photo, sous verrou de la zone : un envoi simultané passe entièrement avant ou après. */
  async removePhoto(caveId: string, id: string): Promise<ZoneView> {
    await this.prisma.$transaction(async (tx) => {
      const zone = await this.lockOwn(tx, caveId, id);
      await tx.caveZone.update({ where: { id }, data: { photoPath: null } });
      if (zone.photoPath) await unlinkIgnoringMissing(join(this.dir, zone.photoPath));
    });
    return zoneView(await this.findOwn(caveId, id));
  }

  /**
   * Image de la photo, pour tout compte qui a accès à la cave de la zone
   * (propriétaire ou membre, cave courante ou non). Sinon la zone est « introuvable ».
   */
  async readPhoto(userId: string, id: string): Promise<Buffer> {
    const zone = await this.prisma.caveZone.findUnique({ where: { id } });
    if (!zone || !(await this.caves.findAccess(userId, zone.caveId))) throw new NotFoundException(ZONE_NOT_FOUND);
    if (!zone.photoPath) throw new NotFoundException(ZONE_PHOTO_NOT_FOUND);
    try {
      return await readFile(join(this.dir, zone.photoPath));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException(ZONE_PHOTO_NOT_FOUND);
      throw e;
    }
  }
}
