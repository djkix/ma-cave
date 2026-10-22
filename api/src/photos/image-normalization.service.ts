import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Plafond de pixels décodés pour toute image envoyée par un utilisateur
 * (40 Mpx, soit 7 300 × 5 500 environ) : une « bombe de décompression » — un
 * PNG de quelques kilo-octets annonçant des dimensions énormes — est refusée
 * avant décodage au lieu d'épuiser la mémoire du conteneur. Les photos du
 * téléphone sont déjà réduites à 1 600 px côté navigateur avant l'envoi.
 */
export const MAX_INPUT_PIXELS = 40_000_000;

@Injectable()
export class ImageNormalizationService {
  /**
   * Redressée selon l'EXIF, réduite (jamais agrandie), JPEG sans métadonnées.
   * Par défaut 1600 px de large au plus (étiquettes, zones) ; `maxSide` borne
   * plutôt le plus grand côté (plan de la cave).
   */
  async normalize(input: Buffer, opts: { maxSide?: number } = {}): Promise<{ buffer: Buffer; width: number; height: number }> {
    const resize = opts.maxSide
      ? { width: opts.maxSide, height: opts.maxSide, fit: 'inside' as const, withoutEnlargement: true }
      : { width: 1600, withoutEnlargement: true };
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(resize)
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  }
}
