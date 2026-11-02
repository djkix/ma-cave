import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getCave, getWine } from '../lib/api-client';
import { Button } from './Button';
import { pairingPollInterval } from './PairingBlock';
import { WineThumb } from './WineThumb';

const MAX_VINS = 20;

/** « J'ai un vin » : on choisit une bouteille de la cave, on lit ses plats déjà enregistrés (aucune génération ici). */
export function AccordsParVin({ wineId, onPick }: { wineId: string | null; onPick: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const search = q.trim();
  const cave = useQuery({ queryKey: ['cave', { q: search }], queryFn: () => getCave({ q: search || undefined }) });
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
      {cave.isError && <p role="alert" className="text-error">Cave indisponible</p>}
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
