import type { KeyboardEvent } from 'react';
import type { regionCounts } from '../lib/region-counts';
import { FRANCE_OUTLINE, FRANCE_REGIONS } from './france-regions';

/** Valeur passée à `onSelect` (et au filtre `?region=` de la cave) pour les vins étrangers. */
export const HORS_FRANCE = 'HORS_FRANCE';

/** Régions trop petites pour le doigt : un cercle transparent élargit la zone tactile. */
const SMALL = new Set(['Alsace', 'Jura', 'Savoie', 'Beaujolais']);

const bouteilles = (n: number) => `${n} bouteille${n > 1 ? 's' : ''}`;

/** Classe de remplissage 0 (aucune bouteille) à 4 (le maximum). */
const level = (n: number, max: number) => (n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 4)));

/** Carte de la cave : bouteilles par région viticole, une région touchée appelle `onSelect(nom)`. */
export function FranceMap({ counts, onSelect }: { counts: ReturnType<typeof regionCounts>; onSelect: (regionOrHorsFrance: string) => void }) {
  if (counts.total === 0) return <p className="centered">Aucune bouteille pour l’instant</p>;
  const n = (name: string) => counts.byRegion.get(name)?.bottles ?? 0;
  const max = Math.max(1, ...FRANCE_REGIONS.map((r) => n(r.name)), counts.horsFrance.bottles);
  const onKey = (name: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(name); }
  };
  const hors = counts.horsFrance.bottles;
  return (
    <div className="france-map">
      <svg viewBox="0 0 300 300" className="france-map__svg">
        <path d={FRANCE_OUTLINE} className="france-map__land" />
        {FRANCE_REGIONS.map((r) => {
          const count = n(r.name);
          const l = level(count, max);
          return (
            <g key={r.name} className={`france-map__region france-map__region--${l}`}>
              <path
                d={r.d}
                role="button"
                tabIndex={0}
                aria-label={`${r.name}, ${bouteilles(count)}`}
                onClick={() => onSelect(r.name)}
                onKeyDown={onKey(r.name)}
              />
              {SMALL.has(r.name) && <circle cx={r.labelX} cy={r.labelY} r={14} className="france-map__hit" aria-hidden="true" onClick={() => onSelect(r.name)} />}
              <text x={r.nameAt?.x ?? r.labelX} y={r.nameAt ? r.nameAt.y : r.labelY - 5} textAnchor={r.nameAt?.anchor ?? 'middle'} className="france-map__name" aria-hidden="true">{r.name}</text>
              <text x={r.labelX} y={r.labelY + (r.nameAt ? 3 : 6)} textAnchor="middle" className="france-map__count" aria-hidden="true">{count}</text>
            </g>
          );
        })}
      </svg>
      <div className="france-map__side">
        <button type="button" className={`france-map__abroad france-map__region--${level(hors, max)}`} onClick={() => onSelect(HORS_FRANCE)}>
          Hors de France <span className="num">{hors}</span>
        </button>
        <div className="france-map__legend" aria-hidden="true">
          0 {[0, 1, 2, 3, 4].map((i) => <i key={i} className={`france-map__region--${i}`} />)} {max}
        </div>
      </div>
      {counts.sansRegion > 0 && <p className="france-map__note">dont {counts.sansRegion} sans région</p>}
    </div>
  );
}
