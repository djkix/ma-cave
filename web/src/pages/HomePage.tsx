import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnalysisQueueBanner } from '../components/AnalysisQueueBanner';
import { BottomNav } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { DrinkSoonCard } from '../components/DrinkSoonCard';
import { FranceMap, HORS_FRANCE } from '../components/FranceMap';
import { Icon } from '../components/Icon';
import { OfflineQueueBanner } from '../components/OfflineQueueBanner';
import { TopBar } from '../components/TopBar';
import { getCave, getEntryInbox, getRecentMovements } from '../lib/api-client';
import { regionCounts } from '../lib/region-counts';
import { useCurrentCave, usePendingRegistrations } from '../lib/use-current-cave';
import { MovementRow } from './JournalPage';

export function HomePage() {
  // Journal, photos à confirmer : réservés au propriétaire (403 pour un membre),
  // donc ni requête ni sondage tant que le rôle courant n'est pas OWNER.
  const { isOwner, isAdmin, role } = useCurrentCave();
  const movements = useQuery({ queryKey: ['movements', 'recent'], queryFn: () => getRecentMovements(3), enabled: isOwner });
  // Fiches à valider et photos illisibles : tout ce qui attend une décision.
  const inbox = useQuery({ queryKey: ['entry-inbox'], queryFn: getEntryInbox, refetchInterval: 30_000, enabled: isOwner });
  const toConfirm = isOwner ? (inbox.data?.toConfirm.length ?? 0) + (inbox.data?.failed.length ?? 0) : 0;
  const registrations = usePendingRegistrations() ?? 0;
  return (
    <>
      <TopBar />
      <main className="page">
        {registrations > 0 && (
          <Link to="/admin/comptes" className="btn btn--outline">
            <Icon name="how_to_reg" />
            <span className="num">{registrations}</span> inscription{registrations > 1 ? 's' : ''} à valider
          </Link>
        )}
        {/* Photos d'un autre compte sur ce téléphone : signalées à tous, envoyées par leur seul auteur. */}
        <OfflineQueueBanner readOnly={!isOwner} />
        {isOwner && (
          <>
            <AnalysisQueueBanner />
            <section className="actions">
              <Link to="/entree" className="action action--in">
                <Icon name="qr_code_scanner" />
                <span className="action__text">
                  <strong>Rentrer du vin</strong>
                  <small>Arrivage de cartons (6, 12, 18) ou bouteilles</small>
                </span>
                <Icon name="arrow_forward" />
              </Link>
              <Link to="/sortie" className="action action--out">
                <Icon name="remove_circle_outline" />
                <span className="action__text">
                  <strong>Sortir une bouteille</strong>
                  <small>Photo de l’étiquette, ou recherche dans la cave</small>
                </span>
                <Icon name="arrow_forward" />
              </Link>
            </section>
            <CaveMap />
            {toConfirm > 0 && (
              <Link to="/a-confirmer" className="btn btn--outline">
                <Icon name="fact_check" />
                <span className="num">{toConfirm}</span> vin{toConfirm > 1 ? 's' : ''} à confirmer
              </Link>
            )}
            <DrinkSoonCard />
            <h2 style={{ fontSize: 14, letterSpacing: '0.08em', color: 'var(--color-secondary)' }}>DERNIERS MOUVEMENTS</h2>
            <div className="list">
              {movements.data?.map((m) => <MovementRow key={m.id} m={m} all={movements.data} />)}
              {movements.data?.length === 0 && <p className="centered">Aucun mouvement pour l’instant.</p>}
            </div>
            <Link to="/journal" className="btn btn--link">Voir le journal</Link>
            <Link to="/ma-cave" className="btn btn--link">Ma cave › Réglages</Link>
          </>
        )}
        {role === 'VIEWER' && (
          <section className="actions">
            <Link to="/cave" className="action action--in">
              <Icon name="shelves" />
              <span className="action__text">
                <strong>Voir la cave</strong>
                <small>Fiches, apogées, accords mets-vins</small>
              </span>
              <Icon name="arrow_forward" />
            </Link>
            <Link to="/stats" className="action action--out">
              <Icon name="bar_chart" />
              <span className="action__text">
                <strong>Statistiques</strong>
                <small>Couleurs, régions, millésimes</small>
              </span>
              <Icon name="arrow_forward" />
            </Link>
          </section>
        )}
        {role === 'VIEWER' && <CaveMap />}
        {role === 'VIEWER' && <DrinkSoonCard />}
        {isAdmin && <Link to="/admin" className="btn btn--link">Administration</Link>}
      </main>
      <BottomNav />
    </>
  );
}

/**
 * « Ma cave en France » : bouteilles par région, lues dans la même requête que la cave
 * (`['cave', {}]`). Une région touchée ouvre ses domaines et le lien vers la cave filtrée.
 */
function CaveMap() {
  const cave = useQuery({ queryKey: ['cave', {}], queryFn: () => getCave({}) });
  const [selected, setSelected] = useState<string | null>(null);
  if (!cave.data) return null;
  const counts = regionCounts(cave.data);
  const detail = selected === HORS_FRANCE ? counts.horsFrance : selected ? counts.byRegion.get(selected) : undefined;
  const bottles = detail?.bottles ?? 0;
  // Le lien mène à une liste de vins (lignes), pas de bouteilles.
  const wines = cave.data.filter((r) => r.quantity > 0 && (selected === HORS_FRANCE ? !r.region && r.country === 'AUTRE' : r.region === selected)).length;
  return (
    <section>
      <h2 style={{ fontSize: 14, letterSpacing: '0.08em', color: 'var(--color-secondary)', marginBottom: 'var(--space-sm)' }}>
        MA CAVE EN FRANCE · <span className="num">{counts.total}</span> bouteille{counts.total > 1 ? 's' : ''}
      </h2>
      <FranceMap counts={counts} onSelect={setSelected} />
      <BottomSheet
        open={selected !== null}
        title={`${selected === HORS_FRANCE ? 'Hors de France' : selected} · ${bottles} bouteille${bottles > 1 ? 's' : ''}`}
        onClose={() => setSelected(null)}
      >
        {bottles === 0 ? (
          <p className="centered">Aucune bouteille de cette région.</p>
        ) : (
          <>
            <ul className="region-sheet__list">
              {detail?.producers.map((p) => (
                <li key={p.producerKey}>
                  <Link to={`/domaine/${encodeURIComponent(p.producerKey)}`}>
                    <span>{p.producer}</span>
                    <span className="num">{p.bottles}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link to={`/cave?region=${encodeURIComponent(selected ?? '')}`} className="btn btn--link">
              {wines > 1 ? `Voir ces ${wines} vins dans la cave` : 'Voir ce vin dans la cave'} →
            </Link>
          </>
        )}
      </BottomSheet>
    </section>
  );
}
