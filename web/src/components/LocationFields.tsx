import { useQuery } from '@tanstack/react-query';
import { Fragment, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { getZoneCells, type Location, type LocationInput, type Place, type Zone, zonePhotoUrl } from '../lib/api-client';
import { cellNames } from '../lib/grid';
import { distinctParts, inputLabel, NO_ZONE, zoneNameOf } from '../lib/locations';

const TEXT_FIELDS: Array<{ key: 'casier' | 'position'; label: string }> = [{ key: 'casier', label: 'Casier' }, { key: 'position', label: 'Position' }];

/**
 * Indication et vignette d'une zone (rien si elle n'a ni l'une ni l'autre).
 * `version` force la relecture de la photo après un remplacement.
 */
export function ZoneDetails({ zone, version }: { zone: Zone | undefined; version?: number }) {
  const [failed, setFailed] = useState(false);
  if (!zone || (!zone.indication && !zone.hasPhoto)) return null;
  return (
    <div className="zone-details">
      {zone.hasPhoto && !failed && (
        <img className="zone-details__photo" src={zonePhotoUrl(zone.id, version)} alt={`Photo de la zone ${zone.name}`}
          loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
      {zone.indication && <p className="zone-details__text">{zone.indication}</p>}
    </div>
  );
}

/**
 * Zone (liste des zones de la cave, dans leur ordre, plus « Sans zone »), puis
 * casier et position en texte libre avec les valeurs déjà utilisées en
 * suggestion (`<datalist>`). La zone choisie montre son indication et sa
 * vignette. `zones` indéfini (liste en cours de lecture ou illisible) : le choix
 * est grisé et montre la zone pré-remplie. Liste lue et vide : un lien mène à
 * « Ma cave › Réglages » pour en créer une (formulaires réservés au propriétaire).
 * Zone avec une grille : sous « Casier », un bouton par case (nombre de
 * bouteilles s'il y en a) qui remplit le champ, et les cases en suggestion.
 * La saisie libre reste possible ; la comparaison ignore la casse.
 */
export function LocationFields({ value, onChange, locations, zones }: {
  value: LocationInput; onChange: (v: LocationInput) => void; locations: Location[]; zones: Zone[] | undefined;
}) {
  const id = useId();
  const suggestions = distinctParts(locations);
  const selected = zones?.find((z) => z.id === value.zoneId);
  const grid = selected?.grid ?? null;
  const cells = useQuery({ queryKey: ['zone-cells', selected?.id], queryFn: () => getZoneCells(selected!.id), enabled: !!grid });
  const names = grid ? cellNames(grid.rows, grid.cols) : [];
  const counts = new Map((grid ? cells.data ?? [] : []).map((c) => [c.casier, c.quantity]));
  const chosen = value.casier?.trim().toUpperCase();
  const lists = {
    casier: [...names, ...suggestions.casier.filter((v) => !names.includes(v.toUpperCase()))],
    position: suggestions.position,
  };
  return (
    <div className="location-fields">
      <label className="field__label">
        Zone
        {zones ? (
          <select value={value.zoneId ?? ''} onChange={(e) => onChange({ ...value, zoneId: e.target.value || null })}>
            <option value="">{NO_ZONE}</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        ) : (
          <select value={value.zoneId ?? ''} disabled onChange={() => undefined}>
            <option value={value.zoneId ?? ''}>{value.zoneId ? (zoneNameOf(value.zoneId, zones, locations) ?? 'Zone pré-remplie') : NO_ZONE}</option>
          </select>
        )}
      </label>
      <ZoneDetails key={selected?.id} zone={selected} />
      {zones?.length === 0 && (
        <p className="list__meta" style={{ margin: 0 }}>
          <Link to="/ma-cave">Créer une zone</Link> (la saisie en cours sera perdue)
        </p>
      )}
      {TEXT_FIELDS.map(({ key, label }) => (
        <Fragment key={key}>
        <label className="field__label">
          {label}
          <input
            value={value[key] ?? ''}
            maxLength={40}
            list={`${id}-${key}`}
            autoComplete="off"
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
          <datalist id={`${id}-${key}`}>
            {lists[key].map((v) => <option key={v} value={v} />)}
          </datalist>
        </label>
          {key === 'casier' && grid && (
            <div role="group" aria-label={`Cases de ${selected!.name}`} className="cell-grid"
              style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(48px, 1fr))` }}>
              {names.map((n) => {
                const q = counts.get(n);
                return (
                  <button key={n} type="button" className="cell-grid__cell" aria-pressed={chosen === n}
                    aria-label={q ? `Case ${n}, ${q} bouteille${q > 1 ? 's' : ''}` : `Case ${n}`}
                    onClick={() => onChange({ ...value, casier: n })}>
                    {n}{q ? <span className="cell-grid__count">{q}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** Bloc replié « Emplacement » de l'entrée : le titre montre l'emplacement retenu, pré-rempli ou saisi. */
export function EntryLocationBlock({ value, onChange, locations, zones }: {
  value: LocationInput; onChange: (v: LocationInput) => void; locations: Location[]; zones: Zone[] | undefined;
}) {
  return (
    <details className="card location-block">
      <summary>
        Emplacement
        <span className="list__meta location-block__current">{inputLabel(value, zones, locations)}</span>
      </summary>
      <LocationFields value={value} onChange={onChange} locations={locations} zones={zones} />
    </details>
  );
}

/** « D'où sort-elle ? » (ou la légende donnée) : un bouton radio par endroit, avec sa quantité. */
export function PlacePicker({ places, value, onChange, legend = 'D\'où sort-elle ?' }: { places: Place[]; value: string | null; onChange: (id: string | null) => void; legend?: string }) {
  const name = useId();
  return (
    <fieldset className="place-picker">
      <legend>{legend}</legend>
      {places.map((p) => (
        <label key={p.id ?? ''} className="place-picker__option">
          <input type="radio" name={name} checked={value === p.id} onChange={() => onChange(p.id)} />
          {`${p.label} · ${p.quantity}`}
        </label>
      ))}
    </fieldset>
  );
}
