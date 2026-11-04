import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getPhotoQueueStatus, PhotoBatchProgress } from '../lib/api-client';
import { useCurrentCave } from '../lib/use-current-cave';
import { Icon } from './Icon';

/**
 * Avancement des rafales en cours (« 6/8 photos traitées ») ; rien sans lot en
 * cours. Un lot disparaît de la réponse dès que toutes ses photos sont traitées.
 */
export function BatchProgressList({ batches }: { batches?: PhotoBatchProgress[] }) {
  if (!batches?.length) return null;
  return (
    <>
      {batches.map((b) => (
        <span key={b.batchId} className="batch-progress">
          <span className="num">{b.done}/{b.total} photos traitées</span>
          <progress value={b.done} max={b.total} aria-label={`Lot de photos : ${b.done} sur ${b.total} traitées`} />
        </span>
      ))}
    </>
  );
}

/**
 * Une photo reportée n'a encore aucun mouvement dans le journal : sans ce
 * bandeau, l'utilisateur croit sa photo perdue et la reprend inutilement. Le
 * lien mène à « À confirmer », qui la montre dans « En cours d'analyse ».
 *
 * Complément du bandeau hors ligne : celui-ci compte les photos encore sur le
 * téléphone, celui-là les photos déjà reçues par le serveur.
 */
export function AnalysisQueueBanner({ hideLink = false }: { hideLink?: boolean }) {
  // File d'analyse réservée au propriétaire (403 pour un membre) : aucune requête ni sondage sinon.
  const { isOwner } = useCurrentCave();
  const status = useQuery({ queryKey: ['photos', 'queue-status'], queryFn: getPhotoQueueStatus, refetchInterval: 30_000, enabled: isOwner });
  const waiting = isOwner ? (status.data?.waiting ?? 0) : 0;
  if (waiting === 0) return null;
  return (
    <aside className="banner analysis-banner" role="status">
      <span className="analysis-banner__icon"><Icon name="hourglass_top" /></span>
      <span className="analysis-banner__text">
        <strong className="num">
          {waiting} photo{waiting > 1 ? 's' : ''} en attente d’analyse
        </strong>
        <small>{status.data?.lastReason ?? 'Analyse automatique dès que le service de lecture répond'}</small>
        <BatchProgressList batches={status.data?.batches} />
      </span>
      {!hideLink && (
        <Link to="/a-confirmer" className="btn btn--outline" aria-label="Voir la liste">
          Voir <Icon name="arrow_forward" />
        </Link>
      )}
    </aside>
  );
}
