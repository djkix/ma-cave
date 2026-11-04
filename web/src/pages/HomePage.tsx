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
  const { isOwner, role } = useCurrentCave();
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
            {toConfirm > 0 && (
              <Link to="/a-confirmer" className="home-confirm">
                <Icon name="fact_check" />
                <span className="home-confirm__text"><span className="num">{toConfirm}</span> vin{toConfirm > 1 ? 's' : ''} à confirmer</span>
                <span className="home-chip home-chip--lichen">Action requise</span>
                <Icon name="chevron_right" />
              </Link>
            )}
            <CaveMap />
            <DrinkSoonCard />
            <section className="card">
              <header className="home-head">
                <div>
                  <p className="home-eyebrow">Historique</p>
                  <h2 className="home-title">Derniers mouvements</h2>
                </div>
              </header>
              <div className="mv-list">
                {movements.data?.map((m) => <MovementRow key={m.id} m={m} all={movements.data} />)}
                {movements.data?.length === 0 && <p className="centered">Aucun mouvement pour l’instant.</p>}
              </div>
              <Link to="/journal" className="home-wide-btn">Voir le journal complet <Icon name="arrow_forward" /></Link>
            </section>
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
  // Pastilles : régions les plus fournies d'abord ; l'active est la région ouverte (à défaut, la première).
  const chips = [...counts.byRegion.entries()].map(([name, c]) => ({ name, label: name, bottles: c.bottles }));
  chips.sort((x, y) => y.bottles - x.bottles);
  if (counts.horsFrance.bottles > 0) chips.push({ name: HORS_FRANCE, label: 'Hors de France', bottles: counts.horsFrance.bottles });
  const active = selected ?? chips[0]?.name;
  return (
    <section className="card geo">
      <header className="home-head">
        <div>
          <p className="home-eyebrow">Répartition géographique</p>
          <h2 className="home-title">Ma cave en France · <span className="num">{counts.total}</span> btl</h2>
        </div>
      </header>
      <FranceMap counts={counts} onSelect={setSelected} />
      {counts.byRegion.size > 0 && <p className="geo__terroirs"><span className="num">{counts.byRegion.size}</span> terroir{counts.byRegion.size > 1 ? 's' : ''} actif{counts.byRegion.size > 1 ? 's' : ''}</p>}
      <div className="geo__chips">
        {chips.map((c) => (
          <button key={c.name} type="button" className={`geo__chip${c.name === active ? ' geo__chip--active' : ''}`} aria-pressed={c.name === selected} onClick={() => setSelected(c.name)}>
            {c.label} <span className="num">{c.bottles}</span>
          </button>
        ))}
      </div>
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
