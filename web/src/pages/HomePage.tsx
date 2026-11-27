import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnalysisQueueBanner } from '../components/AnalysisQueueBanner';
import { BottomNav } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { FranceMap, HORS_FRANCE } from '../components/FranceMap';
import { Icon } from '../components/Icon';
import { OfflineQueueBanner } from '../components/OfflineQueueBanner';
import { TopBar } from '../components/TopBar';
import { getCave } from '../lib/api-client';
import { useDrinkSoon } from '../lib/drink-soon';
import { regionCounts } from '../lib/region-counts';
import { useCurrentCave, usePendingRegistrations } from '../lib/use-current-cave';
import { useToConfirmCount } from '../lib/use-to-confirm';

export function HomePage() {
  // Journal, photos à confirmer : réservés au propriétaire (403 pour un membre),
  // donc ni requête ni sondage tant que le rôle courant n'est pas OWNER.
  const { isOwner } = useCurrentCave();
  // Fiches à valider et photos illisibles : tout ce qui attend une décision.
  const toConfirm = useToConfirmCount();
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
          </>
        )}
        {/* Chiffres, carte, puis la liste : pour le propriétaire comme pour le membre. */}
        <HomeTiles />
        <CaveMap />
        <section className="actions"><CaveLink /></section>
      </main>
      <BottomNav />
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Trois chiffres : bouteilles et références en stock (lecture `['cave', {}]`,
 * partagée avec la carte), bouteilles à boire vite (la liste de `/a-boire`, où
 * mène la tuile : son nombre est toujours celui de la page).
 */
function HomeTiles() {
  const cave = useQuery({ queryKey: ['cave', {}], queryFn: () => getCave({}) });
  const soon = useDrinkSoon();
  const inStock = (cave.data ?? []).filter((r) => r.quantity > 0);
  const bottles = inStock.reduce((n, r) => n + r.quantity, 0);
  const urgent = (soon.data ?? []).reduce((n, r) => n + Math.max(r.quantity, 0), 0);
  return (
    <section className="home-tiles">
      <div className="home-tile" role="group" aria-label={plural(bottles, 'bouteille', 'bouteilles')}>
        <strong className="num">{bottles}</strong><span>{bottles > 1 ? 'bouteilles' : 'bouteille'}</span>
      </div>
      <div className="home-tile" role="group" aria-label={plural(inStock.length, 'référence', 'références')}>
        <strong className="num">{inStock.length}</strong><span>{inStock.length > 1 ? 'références' : 'référence'}</span>
      </div>
      <Link to="/a-boire" className="home-tile home-tile--link">
        <strong className="num">{urgent}</strong><span>à boire vite</span>
      </Link>
    </section>
  );
}

/** L'onglet Cave ouvre l'accueil : ce lien mène à la liste des bouteilles. */
function CaveLink() {
  const cave = useQuery({ queryKey: ['cave', {}], queryFn: () => getCave({}) });
  const total = cave.data?.reduce((n, r) => n + Math.max(r.quantity, 0), 0);
  return (
    <Link to="/cave" className="action action--in">
      <Icon name="shelves" />
      <span className="action__text">
        <strong>{total === undefined ? 'Voir mes bouteilles' : `Voir mes ${total} bouteille${total > 1 ? 's' : ''}`}</strong>
        <small>Fiches, apogées, accords mets-vins</small>
      </span>
      <Icon name="arrow_forward" />
    </Link>
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
