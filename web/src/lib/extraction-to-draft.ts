import type { WineDraft, WineExtraction } from './api-client';

export function extractionToDraft(e: WineExtraction) {
  const draft: WineDraft = {
    producer: e.producer.value ?? '',
    cuvee: e.cuvee.value ?? '',
    appellationRaw: e.appellation.value ?? '',
    vintage: e.vintage.value,
    color: e.color.value ?? 'ROUGE',
    formatCl: e.formatCl.value ?? 75,
  };
  const confidences: Record<keyof WineDraft, number> = {
    producer: e.producer.confidence, cuvee: e.cuvee.confidence, appellationRaw: e.appellation.confidence,
    vintage: e.vintage.confidence, color: e.color.confidence, formatCl: e.formatCl.confidence,
  };
  return { draft, confidences, detectedQuantity: e.bottlesPerCase.value };
}

/**
 * Quantité proposée à la confirmation : le nombre choisi à la prise de vue,
 * sauf s'il vaut 1 (le défaut du sélecteur) et que le carton en indique un autre.
 */
export function initialQuantity(requested: number | null, detected: number | null): number {
  return requested && requested !== 1 ? requested : (detected ?? requested ?? 1);
}
