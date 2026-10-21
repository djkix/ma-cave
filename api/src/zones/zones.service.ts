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
  CreateZoneInput, PLAN_NOT_FOUND, UpdateZoneInput, ZONE_NAME_TAKEN, ZONE_NOT_FOUND, ZONE_PHOTO_NOT_FOUND, zonePhotoPath, ZoneView, zoneView,
} from './zone';

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
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

  /** Renommer ou changer l'indication : le nouveau nom vaut partout, l'emplacement ne change pas. */
  async update(caveId: string, id: string, input: UpdateZoneInput): Promise<ZoneView> {
    await this.findOwn(caveId, id);
    try {
      // updateMany : la condition de cave et « non archivée » est vérifiée au moment de l'écriture.
      const { count } = await this.prisma.caveZone.updateMany({
        where: { id, caveId, archivedAt: null },
        data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.indication !== undefined ? { indication: input.indication } : {}) },
      });
      if (count === 0) throw new NotFoundException(ZONE_NOT_FOUND);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(ZONE_NAME_TAKEN);
      throw e;
    }
    return zoneView(await this.findOwn(caveId, id));
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
    const deleted = await this.prisma.$transaction(async (tx) => {
      const zone = await this.lockOwn(tx, caveId, id);
      // Vins rangés dans la zone, verrouillés (par id : deux suppressions ne s'interbloquent pas)
      // avant de lire leur stock, qu'une sortie simultanée ne peut alors plus changer.
      const wines = await tx.$queryRaw<{ wineId: string }[]>`
        SELECT DISTINCT m.wine_id AS "wineId" FROM movement m JOIN location l ON l.id = m.location_id
        WHERE l.zone_id = ${id} ORDER BY m.wine_id`;
      for (const { wineId } of wines) await lockWine(tx, caveId, wineId);
      const stocked = await tx.$queryRaw<{ wineId: string; locationId: string; casier: string | null; position: string | null; quantity: number }[]>`
        SELECT m.wine_id AS "wineId", l.id AS "locationId", l.casier, l.position, SUM(m.delta)::INTEGER AS quantity
        FROM movement m JOIN location l ON l.id = m.location_id
        WHERE l.zone_id = ${id}
        GROUP BY m.wine_id, l.id, l.casier, l.position
        HAVING SUM(m.delta) > 0`;
      let unplaced = 0;
      for (const s of stocked) {
        const to = s.casier || s.position ? (await this.locations.resolve(caveId, { casier: s.casier, position: s.position }, tx)).id : null;
        await writeMove(tx, s.wineId, s.quantity, randomUUID(), s.locationId, to);
        unplaced += s.quantity;
      }
      if (wines.length > 0) {
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
   */
  async setMarker(caveId: string, id: string, marker: { planId: string; x: number; y: number }): Promise<ZoneView> {
    await this.findOwn(caveId, id);
    const { count } = await this.prisma.caveZone
      .updateMany({ where: { id, caveId, archivedAt: null }, data: { planId: marker.planId, planX: marker.x, planY: marker.y } })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new NotFoundException(PLAN_NOT_FOUND);
        throw e;
      });
    if (count === 0) throw new NotFoundException(ZONE_NOT_FOUND);
    return zoneView(await this.findOwn(caveId, id));
  }

  /** Retire le repère de la zone (plan et position). */
  async removeMarker(caveId: string, id: string): Promise<ZoneView> {
    const { count } = await this.prisma.caveZone.updateMany({ where: { id, caveId, archivedAt: null }, data: { planId: null, planX: null, planY: null } });
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
