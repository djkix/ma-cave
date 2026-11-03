import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Wine } from '@prisma/client';
import { AppellationsService, normalizeLabel } from '../appellations/appellations.service';
import type { WineEditInput } from '../movements/dto';
import { requestPairings, requestProducerProfiles, requestTraits } from '../pairing/generation-requests';
import { PrismaService } from '../prisma/prisma.service';
import { producerKeyOf } from '../producers/producer-key';
import { wineIdentity } from './wine-matching.service';

export interface DuplicateWine { id: string; producer: string; cuvee: string | null; vintage: number | null; quantity: number }
export type WineEditResult = { id: string; merged?: true } | { duplicate: DuplicateWine };

/** Caractéristiques qu'une correction manuelle protège (voir CaveService.setTraits). */
const TRAIT_FIELDS = ['tannin', 'aromas', 'country', 'region'] as const;
const REQUEUE = { status: 'PENDING' as const, errorMessage: null, attempts: 0, nextAttemptAt: null, reservedUntil: null };

@Injectable()
export class WineEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appellations: AppellationsService,
  ) {}

  /**
   * Corrige l'identité d'un vin de la cave. Si elle devient celle d'un autre vin
   * de la cave (même `matchKey`), renvoie ce doublon, ou le fusionne dans ce vin
   * existant quand `merge` est demandé. L'apogée n'est stockée que manuelle
   * (intacte) : la règle et l'IA se recalculent à la lecture.
   */
  async edit(caveId: string, id: string, input: WineEditInput): Promise<WineEditResult> {
    const { merge, ...draft } = input;
    const identity = wineIdentity(draft, await this.appellations.resolve(draft.appellationRaw));
    return this.prisma.$transaction(async (tx) => {
      // Verrou de la ligne `wine` : celui que prend chaque nouveau mouvement (check_stock_non_negative).
      const wine = await lockWine(tx, caveId, id);
      if (!wine) throw new NotFoundException('Vin introuvable');
      const other = await tx.wine.findUnique({ where: { caveId_matchKey: { caveId, matchKey: identity.matchKey } } });

      if (other && other.id !== id) {
        if (!merge) {
          const { _sum } = await tx.movement.aggregate({ where: { wineId: other.id }, _sum: { delta: true } });
          return { duplicate: { id: other.id, producer: other.producer, cuvee: other.cuvee, vintage: other.vintage, quantity: _sum.delta ?? 0 } };
        }
        const target = await lockWine(tx, caveId, other.id);
        if (!target) throw new NotFoundException('Vin introuvable');
        await mergeInto(tx, wine, target);
        return { id: target.id, merged: true as const };
      }

      await tx.wine.update({ where: { id }, data: identity });
      const producerChanged = producerKeyOf(wine.producer) !== producerKeyOf(identity.producer);
      const appellationChanged = wine.appellationId !== identity.appellationId || normalizeLabel(wine.appellationRaw) !== normalizeLabel(identity.appellationRaw);
      // Le millésime et la couleur changent aussi les caractéristiques (et l'accord).
      const vintageOrColorChanged = wine.vintage !== identity.vintage || wine.color !== identity.color;
      if (producerChanged || appellationChanged || vintageOrColorChanged) {
        // Champs manuels gardés : la génération ne les écrase jamais.
        const requestedAt = new Date();
        await tx.wineTraits.updateMany({ where: { wineId: id }, data: { ...REQUEUE, requestedAt } });
        await tx.pairing.updateMany({ where: { wineId: id }, data: { ...REQUEUE, requestedAt } });
        await requestTraits(tx, [id], requestedAt);
        await requestPairings(tx, [id], requestedAt);
      }
      const producerKey = producerKeyOf(identity.producer);
      if (producerChanged && producerKey) await requestProducerProfiles(tx, [{ producerKey, displayName: identity.producer }]);
      return { id };
    });
  }
}

async function lockWine(tx: Prisma.TransactionClient, caveId: string, id: string): Promise<Wine | null> {
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM wine WHERE id = ${id} AND cave_id = ${caveId} FOR UPDATE`;
  return locked ? tx.wine.findUnique({ where: { id } }) : null;
}

/**
 * Fusion de `source` dans `target`, dans la transaction de l'appelant : rien ne
 * se perd. Mouvements (donc bouteilles, emplacements et photos), cotes et coûts
 * de recherche d'image passent à la cible ; la note la plus récente gagne ; les
 * corrections manuelles de la cible priment ; la source est supprimée en
 * dernier (la clé étrangère des mouvements refuserait s'il en restait un).
 */
async function mergeInto(tx: Prisma.TransactionClient, source: Wine, target: Wine): Promise<void> {
  const moved = { where: { wineId: source.id }, data: { wineId: target.id } };
  await tx.movement.updateMany(moved);
  await tx.priceQuote.updateMany(moved);
  await tx.imageSearchCost.updateMany(moved);

  const data: Prisma.WineUncheckedUpdateInput = {};
  if (source.ratedAt && (!target.ratedAt || source.ratedAt > target.ratedAt)) {
    Object.assign(data, { rating: source.rating, ratedAt: source.ratedAt, ratedById: source.ratedById });
  }
  if (!target.referencePhotoId && source.referencePhotoId) {
    Object.assign(data, {
      referencePhotoId: source.referencePhotoId, referencePhotoPreviousId: source.referencePhotoPreviousId,
      referencePhotoSource: source.referencePhotoSource, referencePhotoSourceUrl: source.referencePhotoSourceUrl,
    });
  }
  if (source.apogeeSource === 'MANUEL' && target.apogeeSource !== 'MANUEL') {
    Object.assign(data, { apogeeMin: source.apogeeMin, apogeeMax: source.apogeeMax, apogeeSource: source.apogeeSource });
  }
  if (!target.idealwineRef && source.idealwineRef) data.idealwineRef = source.idealwineRef;
  if (Object.keys(data).length) await tx.wine.update({ where: { id: target.id }, data });

  const [sourceTraits, targetTraits] = await Promise.all([
    tx.wineTraits.findUnique({ where: { wineId: source.id } }),
    tx.wineTraits.findUnique({ where: { wineId: target.id } }),
  ]);
  if (sourceTraits && !targetTraits) await tx.wineTraits.update({ where: { wineId: source.id }, data: { wineId: target.id } });
  else if (sourceTraits && targetTraits) {
    const copied = TRAIT_FIELDS.filter((k) => sourceTraits.manualFields.includes(k) && !targetTraits.manualFields.includes(k));
    if (copied.length) {
      await tx.wineTraits.update({
        where: { wineId: target.id },
        data: { ...Object.fromEntries(copied.map((k) => [k, sourceTraits[k]])), manualFields: [...targetTraits.manualFields, ...copied], reservedUntil: null },
      });
    }
    await tx.wineTraits.delete({ where: { wineId: source.id } });
  }
  await tx.pairing.deleteMany({ where: { wineId: source.id } });
  await requestPairings(tx, [target.id]);
  await tx.wine.delete({ where: { id: source.id } });
}
