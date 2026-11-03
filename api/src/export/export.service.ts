import { Injectable } from '@nestjs/common';
import { Prisma, WineColor } from '@prisma/client';
import ExcelJS from 'exceljs';
import { ApogeeConfidence, isDrinkSoon, sortByApogeeEnd } from '../apogee/apogee';
import { ApogeeRulesService } from '../apogee/apogee-rules.service';
import { countryOf, filterCave, publishedRegion } from '../cave/cave-filter';
import { apogeeOf, CaveDbRow } from '../cave/cave.service';
import type { Country } from '../traits/traits';
import { formatPlaces, LocatedParts, partsOf, placesOf } from '../locations/location';
import { PrismaService } from '../prisma/prisma.service';
import { currentQuoteByWine, quoteSiteOf } from '../quotes/quote';

export interface ExportFilter {
  color?: WineColor;
  region?: string;
  /** Seulement les vins à boire en priorité, fin d'apogée la plus proche en premier. */
  drinkSoon?: boolean;
}

const COLOR_LABEL: Record<WineColor, string> = { ROUGE: 'Rouge', BLANC: 'Blanc', ROSE: 'Rosé', PETILLANT: 'Pétillant' };
const CONFIDENCE_LABEL: Record<ApogeeConfidence, string> = { SAISIE: 'Saisie', MOYENNE: 'Moyenne', FAIBLE: 'Faible' };
/** Fond d'avertissement des lignes dont l'apogée est passée. */
const PASSED_FILL = 'FFFCE4D6';

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: ApogeeRulesService,
  ) {}

  /** Classeur de la cave `caveId` (stock, journal, référentiel commun), journalisé dans cette cave. */
  async buildWorkbook(caveId: string, filter: ExportFilter, userId: string): Promise<{ buffer: Buffer; rowCount: number }> {
    const [stockRows, wines, movements, appellations, quotes] = await Promise.all([
      // stock_courant n'a pas de cave : jointe par le vin.
      this.prisma.$queryRaw<{ wine_id: string; quantity: number }[]>`
        SELECT s.wine_id, s.quantity FROM stock_courant s JOIN wine w ON w.id = s.wine_id WHERE w.cave_id = ${caveId}`,
      this.prisma.wine.findMany({ where: { caveId }, include: { appellation: true, pairing: true, traits: true }, orderBy: [{ producer: 'asc' }, { vintage: 'asc' }] }),
      this.prisma.movement.findMany({ where: { wine: { caveId } }, include: { wine: true, location: { include: { zone: true } } }, orderBy: { occurredAt: 'desc' } }),
      this.prisma.appellation.findMany({ orderBy: { canonicalName: 'asc' } }),
      // Cote : l'export est réservé au propriétaire, qui voit les prix.
      this.prisma.priceQuote.findMany({ where: { wine: { caveId } }, select: { wineId: true, coteCents: true, quotedOn: true, createdAt: true, sourceUrl: true } }),
    ]);
    const quoteByWine = currentQuoteByWine(quotes);
    const stockByWine = new Map(stockRows.map((r) => [r.wine_id, Number(r.quantity)]));
    // Même règle que les statistiques : une entrée annulée (reprise par un ADJUST qui la référence) ne fixe pas le prix.
    const cancelled = new Set(movements.filter((m) => m.reversesId).map((m) => m.reversesId as string));
    const lastPrice = new Map<string, number>();
    for (const m of [...movements].reverse()) if (m.type === 'IN' && m.priceUnitCents != null && !cancelled.has(m.id)) lastPrice.set(m.wineId, m.priceUnitCents);
    // Stock par emplacement, sommé depuis le journal déjà lu (même règle que la fiche).
    const byPlace = new Map<string, Map<string | null, { location: LocatedParts | null; quantity: number }>>();
    for (const m of movements) {
      const groups = byPlace.get(m.wineId) ?? new Map();
      byPlace.set(m.wineId, groups);
      const key = m.locationId ?? null;
      const g = groups.get(key) ?? { location: m.location ? partsOf(m.location) : null, quantity: 0 };
      g.quantity += m.delta;
      groups.set(key, g);
    }
    const placesText = (wineId: string) => formatPlaces(placesOf([...(byPlace.get(wineId)?.values() ?? [])]));
    const rules = await this.rules.load();
    const year = new Date().getFullYear();

    // Première entrée non annulée par vin : départ de la garde IA d'un non-millésimé (à défaut, la création du vin).
    const firstIn = new Map<string, number>();
    for (const m of movements) {
      if (m.type !== 'IN' || cancelled.has(m.id)) continue;
      const y = m.occurredAt.getFullYear();
      firstIn.set(m.wineId, Math.min(y, firstIn.get(m.wineId) ?? y));
    }
    // Mêmes lignes, même filtre, même région et même apogée que l'application : l'export ne raconte jamais autre chose.
    const wineById = new Map(wines.map((w) => [w.id, w]));
    const rows: CaveDbRow[] = wines.map((w) => {
      const row = {
        id: w.id, producer: w.producer, cuvee: w.cuvee, appellationRaw: w.appellationRaw, vintage: w.vintage, color: w.color,
        formatCl: w.formatCl, referencePhotoId: w.referencePhotoId, quantity: stockByWine.get(w.id) ?? 0,
        appellationId: w.appellationId, refRegion: w.appellation?.region ?? null,
        referenceGuardMin: w.appellation?.guardMinYears ?? null, referenceGuardMax: w.appellation?.guardMaxYears ?? null,
        apogeeMin: w.apogeeMin, apogeeMax: w.apogeeMax, apogeeSource: w.apogeeSource,
        aiRegion: w.traits?.region ?? null, aiGuardMin: w.traits?.guardMin ?? null, aiGuardMax: w.traits?.guardMax ?? null,
        traitsManual: w.traits?.manualFields ?? [], country: (w.traits?.country ?? null) as Country | null,
        firstEntryYear: firstIn.get(w.id) ?? w.createdAt.getFullYear(),
      };
      return { ...row, ...publishedRegion(row) };
    });
    const filtered = filterCave(rows, { color: filter.color, region: filter.region })
      .map((row) => ({ w: wineById.get(row.id)!, row, apogee: apogeeOf(row, rules, year) }));
    const inStock = filter.drinkSoon ? sortByApogeeEnd(filtered.filter((i) => isDrinkSoon(i.apogee, year))) : filtered;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Ma Cave';
    wb.created = new Date();

    const stock = wb.addWorksheet('Stock', { views: [{ state: 'frozen', ySplit: 1 }] });
    stock.columns = [
      { header: 'Producteur', key: 'producer', width: 28 },
      { header: 'Cuvée', key: 'cuvee', width: 22 },
      { header: 'Appellation', key: 'appellation', width: 26 },
      { header: 'Région', key: 'region', width: 14 },
      { header: 'Millésime', key: 'vintage', width: 10 },
      { header: 'Apogée min', key: 'apogeeMin', width: 11 },
      { header: 'Apogée max', key: 'apogeeMax', width: 11 },
      { header: 'Confiance', key: 'confidence', width: 11 },
      { header: 'Note /20', key: 'rating', width: 9 },
      { header: 'Couleur', key: 'color', width: 10 },
      { header: 'Format (cl)', key: 'formatCl', width: 10 },
      { header: 'Quantité', key: 'quantity', width: 10 },
      { header: "Prix d'achat unitaire (€)", key: 'price', width: 20 },
      { header: "Valeur d'achat (€)", key: 'value', width: 16 },
      { header: 'Accords', key: 'pairings', width: 48 },
      { header: 'Emplacements', key: 'locations', width: 40 },
      { header: 'Cote (€)', key: 'cote', width: 10 },
      { header: 'Date de la cote', key: 'quotedOn', width: 14, style: { numFmt: 'dd/mm/yyyy' } },
      { header: 'Valeur à la cote (€)', key: 'quotedValue', width: 18 },
      // Site déduit du lien de la cote ; vide sans lien.
      { header: 'Source', key: 'quoteSource', width: 14 },
    ];
    for (const { w, row: r, apogee } of inStock) {
      const q = r.quantity;
      const price = lastPrice.has(w.id) ? lastPrice.get(w.id)! / 100 : null;
      const quote = quoteByWine.get(w.id);
      const row = stock.addRow({
        producer: w.producer, cuvee: w.cuvee ?? '', appellation: w.appellationRaw, region: r.region ?? (countryOf(r) === 'AUTRE' ? 'Hors de France' : ''),
        vintage: w.vintage ?? 'NV', apogeeMin: apogee.min, apogeeMax: apogee.max,
        confidence: apogee.confidence ? CONFIDENCE_LABEL[apogee.confidence] : null,
        rating: w.rating == null ? null : Number(w.rating),
        color: COLOR_LABEL[w.color], formatCl: w.formatCl, quantity: q,
        price, value: price == null ? null : Math.round(price * q * 100) / 100,
        pairings: w.pairing?.status === 'DONE' ? w.pairing.dishes.join(' ; ') : '',
        locations: placesText(w.id),
        cote: quote ? quote.coteCents / 100 : null,
        quotedOn: quote?.quotedOn ?? null,
        quotedValue: quote ? (quote.coteCents * q) / 100 : null,
        quoteSource: quoteSiteOf(quote?.sourceUrl ?? null)?.label ?? null,
      });
      if (apogee.status === 'PASSEE') {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASSED_FILL } };
        });
      }
    }
    stock.autoFilter = { from: 'A1', to: 'T1' };
    stock.getRow(1).font = { bold: true };

    const mv = wb.addWorksheet('Mouvements', { views: [{ state: 'frozen', ySplit: 1 }] });
    mv.columns = [
      { header: 'Date', key: 'date', width: 18, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
      { header: 'Type', key: 'type', width: 8 },
      { header: 'Delta', key: 'delta', width: 8 },
      { header: 'Producteur', key: 'producer', width: 28 },
      { header: 'Cuvée', key: 'cuvee', width: 22 },
      { header: 'Appellation', key: 'appellation', width: 26 },
      { header: 'Millésime', key: 'vintage', width: 10 },
      { header: 'Prix unitaire (€)', key: 'price', width: 16 },
      { header: 'Note', key: 'note', width: 40 },
    ];
    for (const m of movements) {
      mv.addRow({
        date: m.occurredAt, type: m.type, delta: m.delta, producer: m.wine.producer, cuvee: m.wine.cuvee ?? '',
        appellation: m.wine.appellationRaw, vintage: m.wine.vintage ?? 'NV',
        price: m.priceUnitCents == null ? null : m.priceUnitCents / 100, note: m.note ?? '',
      });
    }
    mv.autoFilter = { from: 'A1', to: 'I1' };
    mv.getRow(1).font = { bold: true };

    const ref = wb.addWorksheet('Référence', { views: [{ state: 'frozen', ySplit: 1 }] });
    ref.columns = [
      { header: 'Appellation', key: 'name', width: 30 },
      { header: 'Région', key: 'region', width: 16 },
      { header: 'Couleurs', key: 'colors', width: 22 },
      { header: 'Garde min (ans)', key: 'gmin', width: 14 },
      { header: 'Garde max (ans)', key: 'gmax', width: 14 },
    ];
    for (const a of appellations) {
      ref.addRow({ name: a.canonicalName, region: a.region ?? '', colors: a.allowedColors.map((c) => COLOR_LABEL[c]).join(', '), gmin: a.guardMinYears, gmax: a.guardMaxYears });
    }
    ref.autoFilter = { from: 'A1', to: 'E1' };
    ref.getRow(1).font = { bold: true };

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await this.prisma.exportLog.create({ data: { caveId, userId, filter: filter as Prisma.InputJsonValue, rowCount: inStock.length } });
    return { buffer, rowCount: inStock.length };
  }
}
