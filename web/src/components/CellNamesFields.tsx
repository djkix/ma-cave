import { useQueryClient } from '@tanstack/react-query';
import { KeyboardEvent, useState } from 'react';
import { updateZone, type Zone } from '../lib/api-client';
import { cellNames, cleanCellNames, type CellNameMap } from '../lib/grid';
import { Button } from './Button';

const CELL_NAME_MAX = 40;

/**
 * « Noms des cases » : un champ facultatif par case de la grille (placeholder =
 * code, avec la lettre `prefix`), nom accessible « Nom de la case C15 ». Vide = la case garde son code.
 */
export function CellNamesFields({ grid, prefix, names, onChange, onEnter, idPrefix }: {
  grid: { rows: number; cols: number }; prefix: string; names: CellNameMap; onChange: (names: CellNameMap) => void;
  /** Ids des champs (`${idPrefix}-C15`) : un point du plan y met le focus. */
  idPrefix?: string;
  /** Entrée dans un champ (hors formulaire) : enregistre au lieu de soumettre le formulaire englobant. */
  onEnter?: () => void;
}) {
  function key(e: KeyboardEvent<HTMLFieldSetElement>) {
    if (!onEnter || e.key !== 'Enter') return;
    e.preventDefault();
    onEnter();
  }
  return (
    <fieldset className="cell-names" onKeyDown={key}>
      <legend className="field__label">Noms des cases</legend>
      <div className="cell-names__list">
        {cellNames(grid.rows, grid.cols, prefix).map((code) => (
          <input key={code} id={idPrefix && `${idPrefix}-${code}`} aria-label={`Nom de la case ${code}`} placeholder={code} value={names[code] ?? ''} maxLength={CELL_NAME_MAX} autoComplete="off"
            onChange={(e) => onChange({ ...names, [code]: e.target.value })} />
        ))}
      </div>
    </fieldset>
  );
}

/**
 * « Renommer les cases » sous la grille de rangement : la même liste que dans
 * « Modifier la zone », enregistrée seule (remplacement complet). Pas de
 * `<form>` : ce bloc vit souvent dans le formulaire d'une entrée. Refus de l'api tel quel.
 */
export function CellNamesEditor({ zone, grid, onDone }: { zone: Zone; grid: { rows: number; cols: number }; onDone: () => void }) {
  const qc = useQueryClient();
  const prefix = zone.cellPrefix ?? 'A';
  const [names, setNames] = useState<CellNameMap>(zone.cellNames ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateZone(zone.id, { cellNames: cleanCellNames(names, grid, prefix) });
      // Zones et libellés « Nom (code) » (emplacements, fiches, cave, journal) suivent.
      void qc.invalidateQueries({ predicate: (q) => ['zones', 'locations', 'wine', 'cave', 'movements'].includes(String(q.queryKey[0])) });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="zone-form">
      <CellNamesFields grid={grid} prefix={prefix} names={names} onChange={setNames} onEnter={() => void save()} />
      <Button variant="dark" disabled={busy} onClick={() => void save()}>Enregistrer les noms</Button>
      <Button variant="link" onClick={onDone}>Annuler</Button>
      {error && <p role="alert" className="text-error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
