/** Codes des bouteilles : EAN-13 surtout, EAN-8 et UPC pour quelques vins étrangers. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}

interface DetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * Lecteur natif du navigateur (Chrome Android) ; sinon, sur iPhone notamment,
 * ZXing en WebAssembly, chargé au premier scan et servi par l'application
 * (la CSP n'autorise aucun autre hôte, et `'wasm-unsafe-eval'` pour le compiler).
 */
export async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (native && (await native.getSupportedFormats().catch((): string[] => [])).includes('ean_13')) return new native({ formats: FORMATS });
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
  return new BarcodeDetector({ formats: FORMATS as never });
}

/** Code lisible par l'API : chiffres seulement, 8 à 14. */
export const isEan = (code: string) => /^\d{8,14}$/.test(code);
