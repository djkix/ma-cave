import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getZoneCells, type Location, type LocationInput, planImageUrl, type Zone } from '../lib/api-client';
import { cellCodeOf } from '../lib/grid';
import { inputLabel, usePlans } from '../lib/locations';
import { LocationFields } from './LocationFields';
import { PlanView } from './PlanView';

/**
 * « Où est la bouteille ? » : la photo d'un plan de la cave avec les cases que
 * l'analyse y a placées ; toucher une case (doigt, souris, ou bouton « Case C15 »
 * au clavier) la choisit : zone et casier (code de la case), la position est
 * gardée. Onglets quand plusieurs plans portent des cases. Sous le plan, la case
 * choisie et ses bouteilles déjà rangées. « Saisir à la main » montre les champs
 * habituels (`LocationFields`) : ouverts d'office sans plan à cases, ou quand
 * l'emplacement saisi n'est pas une case d'un plan.
 */
export function PlanCellPicker({ value, onChange, locations, zones }: {
  value: LocationInput; onChange: (v: LocationInput) => void; locations: Location[]; zones: Zone[] | undefined;
}) {
  const data = usePlans().data;
  const markers = (data?.markers ?? []).filter((m) => Object.keys(m.cellBoxes ?? {}).length > 0);
  const plans = (data?.plans ?? []).filter((p) => markers.some((m) => m.planId === p.id));
  const marker = markers.find((m) => m.zoneId === value.zoneId);
  const code = marker && cellCodeOf(value.casier, marker.cellNames)?.trim().toUpperCase();
  const onCell = !!marker && !!code && !!marker.cellBoxes![code];
  const empty = !value.zoneId && !value.casier?.trim() && !value.position?.trim();
  const [manual, setManual] = useState<boolean | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const cells = useQuery({ queryKey: ['zone-cells', value.zoneId], queryFn: () => getZoneCells(value.zoneId!), enabled: onCell });
  const showManual = manual ?? (plans.length === 0 || (!empty && !onCell));
  const plan = plans.find((p) => p.id === planId) ?? plans.find((p) => p.id === marker?.planId) ?? plans[0];

  let status = 'Touchez la case où se trouve la bouteille.';
  if (missed) status = 'Touchez une case';
  else if (onCell) {
    const name = marker.cellNames?.[code];
    const q = cells.data?.find((c) => c.casier === code)?.quantity ?? 0;
    status = `${marker.name} · case ${name ? `${name} (${code})` : code}${q ? ` · ${q} bouteille${q > 1 ? 's' : ''} déjà` : ''}`;
  }

  return (
    <div className="plan-cell-picker">
      {plan && (
        <>
          {plans.length > 1 && (
            <div role="tablist" aria-label="Plans de la cave" className="plan-tabs">
              {plans.map((p) => (
                <button key={p.id} type="button" role="tab" className="plan-tabs__tab" aria-selected={p.id === plan.id}
                  onClick={() => { setPlanId(p.id); setMissed(false); }}>{p.name}</button>
              ))}
            </div>
          )}
          {/* Un toucher entre les cases arrive ici (les cases arrêtent le leur). */}
          <div className="plan-cell-picker__plan" onClick={() => setMissed(true)}>
            <PlanView src={planImageUrl(plan.id, plan.updatedAt)} plan={plan} markers={markers.filter((m) => m.planId === plan.id)}
              highlightZoneId={onCell ? value.zoneId : null} highlightCell={onCell ? code : null} alt={`Plan : ${plan.name}`}
              onCellPick={(zoneId, casier) => { setMissed(false); onChange({ ...value, zoneId, casier }); }} />
          </div>
          <p role="status" className="list__meta plan-cell-picker__status">{status}</p>
          <button type="button" className="btn btn--link" aria-expanded={showManual} onClick={() => setManual(!showManual)}>Saisir à la main</button>
        </>
      )}
      {showManual && <LocationFields value={value} onChange={onChange} locations={locations} zones={zones} />}
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
      <PlanCellPicker value={value} onChange={onChange} locations={locations} zones={zones} />
    </details>
  );
}
