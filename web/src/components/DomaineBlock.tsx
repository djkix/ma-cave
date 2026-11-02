import { Link } from 'react-router-dom';
import { ProducerProfile } from '../lib/api-client';

export const PRODUCER_POLL_MS = 5000;

/** La fiche se rafraîchit tant que le descriptif du domaine n'a pas abouti (ou échoué). */
export function producerPollInterval(
  producerKey: string | null,
  producerProfile: ProducerProfile | null | undefined,
): number | false {
  if (!producerKey) return false;
  return !producerProfile || producerProfile.status === 'PENDING' ? PRODUCER_POLL_MS : false;
}

/** Aperçu du domaine sur la fiche vin ; la fiche complète et sa correction sont sur la page Domaine. */
export function DomaineBlock({
  producerKey,
  producerProfile,
}: {
  producerKey: string | null;
  producerProfile: ProducerProfile | null | undefined;
}) {
  if (!producerKey) return null;
  const histoire = producerProfile?.fields?.histoire;
  const unknown = producerProfile?.status === 'UNKNOWN';

  return (
    <section className="card">
      <h3 style={{ fontSize: 16, margin: 0 }}>Le domaine</h3>
      {histoire ? (
        <p style={{ margin: 'var(--space-xs) 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{histoire}</p>
      ) : unknown ? (
        <p className="list__meta">Domaine peu documenté : Gemini n’a pas d’information fiable.</p>
      ) : (
        <p className="list__meta">Descriptif en préparation…</p>
      )}
      <Link to={`/domaine/${encodeURIComponent(producerKey)}`}>Voir le domaine</Link>
    </section>
  );
}
