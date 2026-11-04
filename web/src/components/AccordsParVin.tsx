import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CaveFilter, getCave, getWine, WineColor } from '../lib/api-client';
import { regionCounts } from '../lib/region-counts';
import { HORS_FRANCE } from './FranceMap';
import { Button } from './Button';
import { pairingPollInterval } from './PairingBlock';
import { WineThumb } from './WineThumb';

const MAX_VINS = 20;
const COLORS: Array<{ value: WineColor | ''; label: string }> = [
  { value: '', label: 'Couleur : toutes' }, { value: 'ROUGE', label: 'Rouge' }, { value: 'BLANC', label: 'Blanc' },
  { value: 'ROSE', label: 'Rosé' }, { value: 'PETILLANT', label: 'Pétillant' },
];

/** « J'ai un vin » : on choisit une bouteille de la cave, on lit ses plats déjà enregistrés (aucune génération ici). */
export function AccordsParVin({ wineId, onPick }: { wineId: string | null; onPick: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const [color, setColor] = useState<WineColor | ''>('');
  const [region, setRegion] = useState('');
  const [vintage, setVintage] = useState('');
  const search = q.trim();
  const year = Number(vintage);
  // Mêmes filtres que la cave (couleur, région, millésime) pour retrouver un vin sans connaître son nom.
  const filter: CaveFilter = { ...(search ? { q: search } : {}), ...(color ? { color } : {}), ...(region ? { region } : {}),
    ...(vintage && Number.isInteger(year) ? { vintageMin: year, vintageMax: year } : {}) };
  const cave = useQuery({ queryKey: ['cave', filter], queryFn: () => getCave(filter) });
  // Régions proposées : celles de la cave entière (requête en cache, partagée avec l'accueil et la cave).
  const all = useQuery({ queryKey: ['cave', {}], queryFn: () => getCave({}) });
  const counts = regionCounts(all.data ?? []);
  const regions = [...counts.byRegion.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
  const total = cave.data?.length ?? 0;
  const wine = useQuery({
    queryKey: ['wine', wineId],
    queryFn: () => getWine(wineId!),
    enabled: !!wineId,
    refetchInterval: (query) => pairingPollInterval(query.state.data?.wine.pairing),
  });
  const w = wine.data?.wine;
  const pairing = w?.pairing;
  const fiche = `/cave/${wineId}`;
  const ficheLink = <Link to={fiche} state={{ from: '/accords' }}>Voir la fiche</Link>;

  if (wineId) {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', minWidth: 0 }}>
        <Button variant="link" onClick={() => onPick(null)}>Changer de vin</Button>
        {wine.isError && <p role="alert" className="text-error">Vin introuvable</p>}
        {w && (
          <>
            <Link to={fiche} state={{ from: '/accords' }} className="cave-row">
              <WineThumb photoId={w.referencePhotoId} />
              <span style={{ minWidth: 0 }}>
                <span className="list__title" style={{ display: 'block' }}>{w.producer}{w.cuvee ? ` — ${w.cuvee}` : ''}</span>
                <span className="list__meta" style={{ display: 'block' }}>{w.vintage ?? 'NV'}</span>
              </span>
            </Link>
            {pairing?.status === 'DONE' && pairing.dishes.length > 0 ? (
              <ul className="dish-cards" aria-label="Plats conseillés">
                {pairing.dishes.map((d) => <li key={d} className="card">{d}</li>)}
              </ul>
            ) : pairing?.status === 'PENDING' ? (
              <p role="status">Accords en préparation…</p>
            ) : pairing?.status === 'FAILED' ? (
              <p><span>Les accords n’ont pas pu être générés</span> {ficheLink}</p>
            ) : (
              <p><span>Pas encore d’accords pour ce vin</span> {ficheLink}</p>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', minWidth: 0 }}>
      <label className="field__label" htmlFor="accords-vin">Domaine, cuvée ou appellation</label>
      <input id="accords-vin" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. Raveneau, Chablis" />
      <div className="cave-pills">
        <label htmlFor="accords-color" className="visually-hidden">Couleur</label>
        <select id="accords-color" className={`filter-pill${color ? ' filter-pill--on' : ''}`} value={color} onChange={(e) => setColor(e.target.value as WineColor | '')}>
          {COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label htmlFor="accords-region" className="visually-hidden">Région</label>
        <select id="accords-region" className={`filter-pill${region ? ' filter-pill--on' : ''}`} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Région : toutes</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          {counts.horsFrance.producers.length > 0 && <option value={HORS_FRANCE}>Hors de France</option>}
        </select>
        <span className="filter-vintage">
          <input type="number" inputMode="numeric" min={1900} max={2100} value={vintage} onChange={(e) => setVintage(e.target.value)} placeholder="Millésime" aria-label="Millésime" />
        </span>
      </div>
      {cave.isError && <p role="alert" className="text-error">Cave indisponible</p>}
      {cave.data && (
        <p className="list__meta" role="status" style={{ margin: 0 }}>
          {total === 0 ? 'Aucun vin ne correspond' : total > MAX_VINS ? `${MAX_VINS} premiers vins sur ${total} : affinez la recherche` : `${total} vin${total > 1 ? 's' : ''}`}
        </p>
      )}
      <ul className="list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {cave.data?.slice(0, MAX_VINS).map((r) => (
          <li key={r.id}>
            <button type="button" className="cave-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => onPick(r.id)}>
              <WineThumb photoId={r.referencePhotoId} />
              <span style={{ minWidth: 0 }}>
                <span className="list__title" style={{ display: 'block' }}>{r.producer}{r.cuvee ? ` — ${r.cuvee}` : ''}</span>
                <span className="list__meta" style={{ display: 'block' }}>{[r.vintage ?? 'NV', r.appellationRaw].join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
