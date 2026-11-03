import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Country, setWineTraits, Tannin, WineTraits } from '../lib/api-client';
import { AROMAS, MAX_AROMAS, TANNIN_LABEL } from '../lib/traits';
import { Button } from './Button';

const traitsEmpty = (t: WineTraits) => !t.tannin && t.aromas.length === 0;

/** La fiche se rafraîchit tant que les caractéristiques sont en attente et vides. */
export function traitsPollInterval(traits: WineTraits | null | undefined): number | false {
  return traits && traits.status === 'PENDING' && traitsEmpty(traits) ? 5000 : false;
}

/** `readOnly` : membre en lecture seule, sans « Corriger ». */
export function TraitsBlock({ wineId, traits, readOnly = false }: { wineId: string; traits: WineTraits | null | undefined; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [tannin, setTannin] = useState<Tannin | ''>('');
  const [aromas, setAromas] = useState<string[]>([]);
  const [country, setCountry] = useState<Country | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Sans ligne de caractéristiques, seul le propriétaire voit le bloc (le PUT la crée) ; un membre ne voit rien.
  if (!traits && readOnly) return null;
  const view: WineTraits = traits ?? { status: 'DONE', tannin: null, aromas: [], country: null, region: null, manualFields: [] };

  function open() {
    setTannin(view.tannin ?? '');
    setAromas(view.aromas);
    setCountry(view.country ?? '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    const t = view;
    const body: { tannin?: Tannin | null; aromas?: string[]; country?: Country | null } = {};
    if ((tannin || null) !== t.tannin) body.tannin = tannin || null;
    if (aromas.join('|') !== t.aromas.join('|')) body.aromas = aromas;
    if ((country || null) !== t.country) body.country = country || null;
    setBusy(true);
    setError(null);
    try {
      if (Object.keys(body).length > 0) {
        await setWineTraits(wineId, body);
        void qc.invalidateQueries({ queryKey: ['wine', wineId] });
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
          {view.country === 'AUTRE' && <p style={{ margin: 'var(--space-xs) 0' }}>Hors de France</p>}
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
          <label htmlFor="traits-country">Pays</label>
          <select id="traits-country" value={country} onChange={(e) => setCountry(e.target.value as Country | '')}>
            <option value="">Inconnu</option>
            <option value="FR">France</option>
            <option value="AUTRE">Hors de France</option>
          </select>
          {error && <p role="alert" className="text-error">{error}</p>}
          <Button disabled={busy} onClick={save}>Enregistrer</Button>
          <Button variant="link" disabled={busy} onClick={() => setEditing(false)}>Annuler</Button>
        </>
      )}
    </section>
  );
}
