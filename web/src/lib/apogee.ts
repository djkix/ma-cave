import { Apogee, ApogeeConfidence, ApogeeReason } from './api-client';

export const CONFIDENCE_LABEL: Record<ApogeeConfidence, string> = {
  SAISIE: 'Saisie', MOYENNE: 'Confiance moyenne', FAIBLE: 'Confiance faible',
};

const REASON_MESSAGE: Record<ApogeeReason, string> = {
  NON_MILLESIME: 'Vin non millésimé : saisis la fourchette si tu la connais',
  APPELLATION_INCONNUE: 'Appellation non reconnue par le référentiel : saisis la fourchette',
  GARDE_INCONNUE: 'Garde inconnue pour cette appellation : saisis la fourchette',
};

export function apogeeRange(a: Apogee): string | null {
  if (a.min == null || a.max == null) return null;
  return a.min === a.max ? `À boire en ${a.min}` : `À boire entre ${a.min} et ${a.max}`;
}

export function apogeeStatusLabel(a: Apogee): string | null {
  switch (a.status) {
    case 'TROP_JEUNE': return `Trop jeune — à partir de ${a.min}`;
    case 'A_BOIRE': return `À boire — jusqu’en ${a.max}`;
    case 'A_BOIRE_VITE': return `À boire vite — ${a.max} est la dernière année`;
    case 'PASSEE': return `Apogée passée depuis ${a.max}`;
    default: return null;
  }
}

/** Mention courte pour une ligne de la liste. */
export function apogeeShortLabel(a: Apogee): string | null {
  switch (a.status) {
    case 'TROP_JEUNE': return `Trop jeune (${a.min})`;
    case 'A_BOIRE': return `À boire ${a.min}-${a.max}`;
    case 'A_BOIRE_VITE': return 'À boire vite';
    case 'PASSEE': return 'Apogée passée';
    default: return null;
  }
}

export function apogeeReasonMessage(reason: ApogeeReason): string {
  return REASON_MESSAGE[reason];
}

/** Libellé de l'apogée sur une proposition d'« Accords ». */
export function apogeePairingLabel(a: Apogee): string | null {
  switch (a.status) {
    case 'TROP_JEUNE': return `Encore jeune — à partir de ${a.min}`;
    case 'A_BOIRE': return `À l’apogée jusqu’en ${a.max}`;
    case 'A_BOIRE_VITE': return 'À boire cette année';
    case 'PASSEE': return `Apogée passée depuis ${a.max}`;
    default: return null;
  }
}

/** Avancement dans la fenêtre d'apogée, de 0 à 100 (barre) ; null sans fenêtre. */
export function apogeeProgress(a: Apogee, year: number): number | null {
  if (a.min == null || a.max == null) return null;
  const ratio = (year - a.min + 1) / (a.max - a.min + 1);
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
