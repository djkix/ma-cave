import { Injectable, NotFoundException } from '@nestjs/common';
import { CaveRole } from '@prisma/client';
import { requestProducerProfiles } from '../pairing/generation-requests';
import { PrismaService } from '../prisma/prisma.service';
import { producerKeyOf } from './producer-key';
import { ProducerField } from '../vision/producer-output';
import { PRODUCER_PROFILE_INCLUDE, producerFieldsOf, producerProfileOf, ProducerProfileView } from './producer-profile.view';
import { findProducerWines } from './producer-wines';
import { retryOnceOnUniqueConflict } from './retry-on-conflict';

@Injectable()
export class ProducerScheduler {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nouveau vin : on ne demande le descriptif que si son domaine n'en a pas
   * encore. La demande, en attente, part dans le prochain lot du worker.
   */
  async scheduleIfMissing(producer: string): Promise<void> {
    const key = producerKeyOf(producer);
    if (!key) return;
    if (await this.prisma.producerProfile.findUnique({ where: { producerKey: key }, select: { id: true } })) return;
    await requestProducerProfiles(this.prisma, [{ producerKey: key, displayName: producer }]);
  }
}

@Injectable()
export class ProducersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Nom du domaine tel que vu la première fois ; 404 si aucun vin ne porte cette clé. */
  private async displayNameOf(producerKey: string): Promise<string> {
    const wines = await findProducerWines(this.prisma, producerKey);
    if (!wines.length) throw new NotFoundException('Domaine introuvable');
    return wines[0].producer;
  }

  /**
   * Page Domaine : la fiche partagée et les vins de ce domaine dans la cave
   * courante, épuisés compris ; 404 si aucun vin de la cave ne porte la clé.
   * Seul effet de bord, sans appel à Gemini : une fiche absente, ou sans aucun
   * des cinq champs (ancien format, échec), est mise en file une seule fois.
   * Un domaine inconnu de Gemini (UNKNOWN) n'y retourne pas à chaque affichage :
   * c'est le rôle de « Régénérer ».
   */
  async page(caveId: string, producerKey: string, role: CaveRole): Promise<{ profile: ProducerProfileView | null; wines: PageWine[] }> {
    // Stock de la vue stock_courant, jointe par le vin (elle n'a pas de cave), comme CaveService.allWithStock.
    const rows = await this.prisma.$queryRaw<Array<PageWine & { producer: string }>>`
      SELECT w.id, w.producer, w.cuvee, w.vintage, w.color::TEXT AS color,
             COALESCE(s.quantity, 0)::INTEGER AS quantity, w.reference_photo_id AS "referencePhotoId"
      FROM wine w
      LEFT JOIN stock_courant s ON s.wine_id = w.id
      WHERE w.cave_id = ${caveId}
      ORDER BY w.vintage ASC NULLS FIRST, w.cuvee ASC NULLS FIRST`;
    const mine = producerKey ? rows.filter((w) => producerKeyOf(w.producer) === producerKey) : [];
    if (!mine.length) throw new NotFoundException('Domaine introuvable');
    const wines = mine.map(({ id, cuvee, vintage, color, quantity, referencePhotoId }) => ({ id, cuvee, vintage, color, quantity, referencePhotoId }));

    const read = () => this.prisma.producerProfile.findUnique({ where: { producerKey }, include: PRODUCER_PROFILE_INCLUDE });
    let profile = await read();
    if (!profile) {
      await requestProducerProfiles(this.prisma, [{ producerKey, displayName: mine[0].producer }]);
      profile = await read();
    } else if (profile.status !== 'PENDING' && profile.status !== 'UNKNOWN' && Object.values(producerFieldsOf(profile)).every((v) => v === null)) {
      const requeue = { status: 'PENDING' as const, requestedAt: new Date(), attempts: 0, nextAttemptAt: null, reservedUntil: null, errorMessage: null };
      await this.prisma.producerProfile.updateMany({ where: { producerKey, status: { not: 'PENDING' } }, data: requeue });
      profile = { ...profile, ...requeue };
    }
    return { profile: producerProfileOf(profile, role), wines };
  }

  /**
   * Correction d'un champ par l'administrateur : il rejoint `manualFields`, et
   * le worker ne l'écrase plus. Statut et source inchangés ; la réservation d'un
   * lot en cours est levée, sa réponse ne peut plus rien écrire.
   */
  async setField(producerKey: string, field: ProducerField, value: string, userId: string): Promise<ProducerProfileView | null> {
    const displayName = await this.displayNameOf(producerKey);
    const current = await this.prisma.producerProfile.findUnique({ where: { producerKey }, select: { manualFields: true } });
    const edit = { [field]: value, manualFields: [...new Set([...(current?.manualFields ?? []), field])], updatedById: userId, reservedUntil: null };
    const saved = await retryOnceOnUniqueConflict(() =>
      this.prisma.producerProfile.upsert({
        where: { producerKey },
        create: { producerKey, displayName, ...edit },
        update: edit,
        include: PRODUCER_PROFILE_INCLUDE,
      }),
    );
    // Réponse à l'administrateur qui vient d'écrire : il peut voir l'e-mail de l'auteur.
    return producerProfileOf(saved, 'OWNER');
  }

  /**
   * Régénérer : repasse en attente côté Gemini, tout de suite, et rejoint le
   * prochain lot du worker (jamais d'appel direct à Gemini). Les corrections
   * sont abandonnées : les cinq champs seront tous réécrits. Les champs actuels
   * restent affichés pendant la nouvelle génération (comme les accords).
   */
  async regenerate(producerKey: string): Promise<void> {
    const displayName = await this.displayNameOf(producerKey);
    const requestedAt = new Date();
    const update = {
      status: 'PENDING' as const,
      source: 'GEMINI',
      errorMessage: null,
      requestedAt,
      attempts: 0,
      nextAttemptAt: null,
      reservedUntil: null, // un lot en cours n'enregistre plus sa réponse, périmée
      manualFields: [],
      updatedById: null,
    };
    await retryOnceOnUniqueConflict(() =>
      this.prisma.producerProfile.upsert({ where: { producerKey }, create: { producerKey, displayName, requestedAt }, update }),
    );
  }
}

/** Un vin du domaine sur sa page, avec son stock (0 s'il est épuisé). */
export interface PageWine {
  id: string;
  cuvee: string | null;
  vintage: number | null;
  color: string;
  quantity: number;
  referencePhotoId: string | null;
}
