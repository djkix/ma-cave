import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, CaveRow, updateWine, WineColor, WineDuplicate } from '../lib/api-client';
import { AppellationField } from './AppellationField';
import { Button } from './Button';

const COLORS: Array<{ value: WineColor; label: string }> = [
  { value: 'ROUGE', label: 'Rouge' }, { value: 'BLANC', label: 'Blanc' }, { value: 'ROSE', label: 'Rosé' }, { value: 'PETILLANT', label: 'Pétillant' },
];

function duplicateLabel(d: WineDuplicate) {
  return `${d.producer}${d.cuvee ? ` — ${d.cuvee}` : ''} ${d.vintage ?? 'NV'}, ${d.quantity} bouteille${d.quantity > 1 ? 's' : ''}`;
}

/**
 * Modifier l'identité d'un vin (propriétaire). Si elle double un autre vin de
 * la cave, l'api répond 409 avec ce vin : on propose de fusionner les deux, et
 * la fiche gardée est celle qui existait déjà.
 */
export function WineEditForm({ wine, onClose }: { wine: CaveRow; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [producer, setProducer] = useState(wine.producer);
  const [cuvee, setCuvee] = useState(wine.cuvee ?? '');
  const [appellation, setAppellation] = useState(wine.appellationRaw);
  const [vintage, setVintage] = useState(wine.vintage?.toString() ?? '');
  const [color, setColor] = useState<WineColor>(wine.color);
  const [formatCl, setFormatCl] = useState(String(wine.formatCl));
  const [duplicate, setDuplicate] = useState<WineDuplicate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mêmes exigences que la saisie : domaine et appellation non vides ; le reste est validé par l'api.
  // Jamais de NaN envoyé (il deviendrait null en JSON : un millésime mal tapé passerait pour NV).
  const valid = producer.trim() !== '' && appellation.trim() !== ''
    && /^(\d{4})?$/.test(vintage) && /^[1-9]\d*$/.test(formatCl);

  async function save(merge: boolean) {
    setBusy(true);
    setError(null);
    try {
      const body = {
        producer: producer.trim(), cuvee: cuvee.trim() || null, appellationRaw: appellation.trim(),
        vintage: vintage.trim() ? Number(vintage) : null, color, formatCl: Number(formatCl),
        ...(merge ? { merge: true } : {}),
      };
      const r = await updateWine(wine.id, body);
      // Fusion : la fiche modifiée n'existe plus, on ouvre celle qui a été gardée.
      onClose();
      if (r.merged) navigate(`/cave/${r.id}`, { replace: true });
      void qc.invalidateQueries({ predicate: (q) => ['cave', 'wine', 'movements', 'locations'].includes(String(q.queryKey[0])) });
    } catch (e) {
      const dup = e instanceof ApiError && e.status === 409 ? (e.body as { duplicate?: WineDuplicate } | undefined)?.duplicate : undefined;
      if (dup) setDuplicate(dup);
      else setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  const id = (name: string) => `wine-edit-${name}-${wine.id}`;
  return (
    <div className="stock-edit">
      <p className="field__label" style={{ margin: 0 }}>Modifier le vin</p>
      <label className="field__label" htmlFor={id('producer')}>Domaine</label>
      <input id={id('producer')} value={producer} onChange={(e) => { setProducer(e.target.value); setDuplicate(null); }} />
      <label className="field__label" htmlFor={id('cuvee')}>Cuvée</label>
      <input id={id('cuvee')} value={cuvee} onChange={(e) => { setCuvee(e.target.value); setDuplicate(null); }} />
      <label className="field__label" htmlFor={id('appellation')}>Appellation</label>
      <AppellationField id={id('appellation')} value={appellation} onChange={(v) => { setAppellation(v); setDuplicate(null); }} />
      <label className="field__label" htmlFor={id('vintage')}>Millésime</label>
      <input id={id('vintage')} inputMode="numeric" value={vintage} onChange={(e) => { setVintage(e.target.value.trim()); setDuplicate(null); }} />
      <label className="field__label" htmlFor={id('color')}>Couleur</label>
      <select id={id('color')} value={color} onChange={(e) => { setColor(e.target.value as WineColor); setDuplicate(null); }}>
        {COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <label className="field__label" htmlFor={id('format')}>Format (cl)</label>
      <input id={id('format')} inputMode="numeric" value={formatCl} onChange={(e) => { setFormatCl(e.target.value.trim()); setDuplicate(null); }} />
      {error && <p role="alert" className="text-error">{error}</p>}
      {duplicate ? (
        <>
          <p role="alert" style={{ margin: 0 }}>{`Ce vin existe déjà : ${duplicateLabel(duplicate)}`}</p>
          <Button variant="dark" disabled={busy} onClick={() => save(true)}>Fusionner les deux</Button>
        </>
      ) : (
        <Button variant="dark" disabled={busy || !valid} onClick={() => save(false)}>Enregistrer</Button>
      )}
      <Button variant="link" disabled={busy} onClick={onClose}>Annuler</Button>
    </div>
  );
}
