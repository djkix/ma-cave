import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBackupStatus, requestBackup } from '../../lib/api-client';

const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** Sauvegarde vers le NAS : dernière réussite, alerte, et « Sauvegarder maintenant ». */
export function BackupSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'backup'], queryFn: getBackupStatus });
  const ask = useMutation({
    mutationFn: requestBackup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'backup'] }),
  });
  const d = q.data;

  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Sauvegarde</h2>
      <p className="list__meta">Chaque nuit vers le NAS : base, photos et configuration, sept jours gardés.</p>
      {q.isError && <p role="alert" className="text-error">{(q.error as Error).message}</p>}
      {d && (
        <>
          {d.alert && <p role="alert" className="text-error">{d.alert}</p>}
          <p>
            Dernière sauvegarde réussie : {d.lastSuccessAt ? fmt.format(new Date(d.lastSuccessAt)) : 'aucune'}
          </p>
          {d.requested ? (
            <p>Sauvegarde demandée : elle part dans les 5 minutes.</p>
          ) : (
            <button type="button" className="btn btn--outline" disabled={ask.isPending} onClick={() => ask.mutate()}>
              Sauvegarder maintenant
            </button>
          )}
        </>
      )}
      {ask.isError && <p role="alert" className="text-error">{(ask.error as Error).message}</p>}
    </section>
  );
}
