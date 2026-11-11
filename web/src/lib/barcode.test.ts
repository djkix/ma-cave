import { createDetector, isEan } from './barcode';

afterEach(() => { delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector; });

it('prend le lecteur natif quand il lit les EAN-13 (pas de WebAssembly à charger)', async () => {
  const formats: string[][] = [];
  class Native {
    static getSupportedFormats = async () => ['qr_code', 'ean_13'];
    constructor(o: { formats: string[] }) { formats.push(o.formats); }
    detect = async () => [];
  }
  (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = Native;
  expect(await createDetector()).toBeInstanceOf(Native);
  expect(formats[0]).toEqual(['ean_13', 'ean_8', 'upc_a', 'upc_e']);
});

it('n’accepte que 8 à 14 chiffres', () => {
  expect(isEan('3760123456789')).toBe(true);
  expect(isEan('12345670')).toBe(true);
  expect(isEan('1234567')).toBe(false);
  expect(isEan('37601234567a9')).toBe(false);
});
