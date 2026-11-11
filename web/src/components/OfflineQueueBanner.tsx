import { useCurrentCave } from '../lib/use-current-cave';
import { useOfflineQueue } from '../lib/use-offline-queue';
import { Icon } from './Icon';
import { Button } from './Button';

/**
 * Photos encore sur le téléphone. Celles d'un autre compte (téléphone partagé)
 * ne sont ni comptées ni envoyées ici : une simple mention les signale.
 * `readOnly` (membre en lecture seule) : seulement cette mention, et, dans une
 * cave où l'on n'est que membre, une note sur ses propres photos, qui
 * attendent que sa cave soit de nouveau sélectionnée. Chaque photo ne part que
 * vers la cave où elle a été prise : celles d'une autre cave du compte attendent
 * de même, avec la même note.
 */
export function OfflineQueueBanner({ readOnly = false }: { readOnly?: boolean }) {
  const { me, role } = useCurrentCave();
  const { count, others, elsewhere, flushing, flushNow } = useOfflineQueue(me?.id, me?.currentCaveId);
  const showBanner = !readOnly && count > 0;
  // Membre ici : toutes ses photos attendent sa cave. Propriétaire : celles d'une autre de ses caves.
  const waiting = readOnly && role === 'VIEWER' ? count + elsewhere : elsewhere;
  const showViewerNote = waiting > 0;
  if (!showBanner && !showViewerNote && others === 0) return null;
  return (
    <>
      {showViewerNote && (
        <p className="list__meta" style={{ margin: 0 }}>
          {waiting > 1
            ? `${waiting} photos en attente : elles partiront quand leur cave sera sélectionnée`
            : '1 photo en attente : elle partira quand sa cave sera sélectionnée'}
        </p>
      )}
      {others > 0 && <p className="list__meta" style={{ margin: 0 }}>{`Photos en attente d’un autre compte : ${others}`}</p>}
      {showBanner && (
        <aside className="banner banner--warn" role="status">
          <Icon name="cloud_off" />
          <span>
            <strong className="num">{count} photo{count > 1 ? 's' : ''} en cours d’envoi</strong>
            <br />
            <small>Envoi automatique dès que le réseau revient (app ouverte)</small>
          </span>
          <Button variant="outline" onClick={flushNow} disabled={flushing}>{flushing ? 'Envoi…' : 'Forcer l’envoi'}</Button>
        </aside>
      )}
    </>
  );
}
