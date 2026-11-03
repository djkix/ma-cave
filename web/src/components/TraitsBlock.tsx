import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Country, setWineTraits, Tannin, WineTraits } from '../lib/api-client';
import { AROMAS, MAX_AROMAS, REGIONS, TANNIN_LABEL } from '../lib/traits';
import { Button } from './Button';

/** Valeur du sélecteur de région pour un vin hors de France (envoyée comme `country: 'AUTRE'`). */
const HORS_FRANCE = 'HORS_FRANCE';

const traitsEmpty = (t: WineTraits) => !t.tannin && t.aromas.length === 0;

/** La fiche se rafraîchit tant que les caractéristiques sont en attente et vides. */
export function traitsPollInterval(traits: WineTraits | null | undefined): number | false {
  return traits && traits.status === 'PENDING' && traitsEmpty(traits) ? 5000 : false;
}

/**
 * `region` / `regionSource` / `country` : région et pays publiés du vin (manuels, référentiel
 * ou IA), ceux de la liste, de la carte et des stats ; pas le pays brut des caractéristiques.
 * `readOnly` : membre en lecture seule, sans « Corriger ».
 */
export function TraitsBlock({ wineId, traits, region = null, regionSource = null, country = null, readOnly = false }: {
  wineId: string; traits: WineTraits | null | undefined; region?: string | null; regionSource?: 'MANUEL' | 'REFERENTIEL' | 'IA' | null;
  country?: Country | null; readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [tannin, setTannin] = useState<Tannin | ''>('');
  const [aromas, setAromas] = useState<string[]>([]);
  const [place, setPlace] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Sans ligne de caractéristiques, seul le propriétaire voit le bloc (le PUT la crée) ; un membre ne voit rien.
  if (!traits && readOnly) return null;
  const view: WineTraits = traits ?? { status: 'DONE', tannin: null, aromas: [], country: null, region: null, manualFields: [] };
  // Choix courant du sélecteur : « Hors de France », la région publiée, sinon inconnue.
  const currentPlace = country === 'AUTRE' ? HORS_FRANCE : region && REGIONS.includes(region) ? region : '';

  function open() {
    setTannin(view.tannin ?? '');
    setAromas(view.aromas);
    setPlace(currentPlace);
    setError(null);
    setEditing(true);
  }

  async function save() {
    const t = view;
    const body: { tannin?: Tannin | null; aromas?: string[]; country?: Country | null; region?: string | null } = {};
    if ((tannin || null) !== t.tannin) body.tannin = tannin || null;
    if (aromas.join('|') !== t.aromas.join('|')) body.aromas = aromas;
    // Région : une région de la liste (l'api met le pays à France), « Hors de France » (pays autre, sans région), ou effacée.
    if (place !== currentPlace) {
      if (place === HORS_FRANCE) body.country = 'AUTRE';
      else if (place) body.region = place;
      else if (currentPlace === HORS_FRANCE) body.country = null;
      else body.region = null;
    }
    setBusy(true);
    setError(null);
    try {
      if (Object.keys(body).length > 0) {
        await setWineTraits(wineId, body);
        // La région publiée sert aussi la liste, son filtre et les stats.
        void qc.invalidateQueries({ predicate: (q) => ['cave', 'wine', 'stats'].includes(String(q.queryKey[0])) });
      }
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (a: string) => setAromas((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  const pending = view.status === 'PENDING' && traitsEmpty(view);
  return (
    <section className="card">
      <h3 style={{ fontSize: 16, margin: 0 }}>Caractéristiques</h3>
      {!editing && (
        <>
          {pending && <p className="list__meta">Caractéristiques en préparation</p>}
          {view.tannin && <p style={{ margin: 'var(--space-xs) 0' }}>{`Tanin : ${TANNIN_LABEL[view.tannin]}`}</p>}
          {view.aromas.length > 0 && (
            <ul className="dish-pills">{view.aromas.map((a) => <li key={a} className="dish-pill">{a}</li>)}</ul>
          )}
          {country === 'AUTRE' ? <p style={{ margin: 'var(--space-xs) 0' }}>Hors de France</p>
            : region && <p style={{ margin: 'var(--space-xs) 0' }}>{`Région : ${region}${regionSource === 'IA' ? ' (estimée par l’IA)' : ''}`}</p>}
          {!readOnly && <Button variant="link" onClick={open}>Corriger</Button>}
        </>
      )}
      {editing && (
        <>
          <label htmlFor="traits-tannin">Tanin</label>
          <select id="traits-tannin" value={tannin} onChange={(e) => setTannin(e.target.value as Tannin | '')}>
            <option value="">—</option>
            {(Object.keys(TANNIN_LABEL) as Tannin[]).map((t) => <option key={t} value={t}>{TANNIN_LABEL[t]}</option>)}
          </select>
          <div className="cave-filters" role="group" aria-label="Arômes" style={{ marginTop: 'var(--space-sm)' }}>
            {AROMAS.map((a) => {
              const on = aromas.includes(a);
              return (
                <label key={a} className="filter-toggle">
                  <input type="checkbox" className="visually-hidden" checked={on} disabled={!on && aromas.length >= MAX_AROMAS} onChange={() => toggle(a)} aria-label={a} />
                  {a}
                </label>
              );
            })}
          </div>
          <label htmlFor="traits-region">Région</label>
          <select id="traits-region" value={place} onChange={(e) => setPlace(e.target.value)}>
            <option value="">Inconnue</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value={HORS_FRANCE}>Hors de France</option>
          </select>
          {error && <p role="alert" className="text-error">{error}</p>}
          <Button disabled={busy} onClick={save}>Enregistrer</Button>
          <Button variant="link" disabled={busy} onClick={() => setEditing(false)}>Annuler</Button>
        </>
      )}
    </section>
  );
}
