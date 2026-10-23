/** Au-delà, l'absence de sauvegarde réussie est signalée à l'administrateur. */
export const BACKUP_MAX_AGE_HOURS = 36;

export interface BackupRunView {
  finishedAt: Date;
  succeeded: boolean;
  message: string;
}

/**
 * Alerte de l'Administration, ou `null` : dernière tentative en échec, ou
 * dernière réussite vieille de plus de 36 h. Aucune tentative (service jamais
 * lancé) : rien.
 */
export function backupAlert(last: BackupRunView | null, lastSuccess: Date | null, now: Date): string | null {
  if (last && !last.succeeded) return `Dernière sauvegarde en échec : ${last.message}.`;
  if (lastSuccess && now.getTime() - lastSuccess.getTime() > BACKUP_MAX_AGE_HOURS * 3_600_000) {
    return `Aucune sauvegarde réussie depuis ${BACKUP_MAX_AGE_HOURS} h.`;
  }
  return null;
}
