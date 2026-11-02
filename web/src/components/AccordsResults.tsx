import { Link } from 'react-router-dom';
import { AccordPick, WineColor } from '../lib/api-client';
import {
  accordLevel, AccordLevel, at, GROUPS, LEVEL_LABEL, Moment, MOMENT_SHORT, MOMENTS, momentLabel, momentOf, timelineScale,
} from '../lib/accord-view';

const COLOR_LABEL: Record<WineColor, string> = { ROUGE: 'Rouge', BLANC: 'Blanc', ROSE: 'Rosé', PETILLANT: 'Pétillant' };
const LEVELS: AccordLevel[] = [3, 2, 1];
const LEVEL_SHORT: Record<AccordLevel, string> = { 3: 'Excellent', 2: 'Bon', 1: 'Correct' };
const DOTS: Record<AccordLevel, string> = { 3: '●●●', 2: '●●○', 1: '●○○' };

const name = (p: AccordPick) => `${p.producer}${p.cuvee ? ` — ${p.cuvee}` : ''}, ${p.vintage ?? 'NV'}`;

/** Vue d'ensemble repliable : accord (lignes) × moment du vin (colonnes), un point numéroté par vin. */
function Matrix({ picks }: { picks: AccordPick[] }) {
  const left = 64, top = 4, cw = 69, rh = 46;
  const inCell = new Map<string, number>();
  return (
    <details className="card accord-matrix">
      <summary>Vue d’ensemble</summary>
      <svg viewBox="0 0 340 176" width="100%" role="img" aria-label="Accord avec le plat selon le moment du vin">
        <rect className="accord-matrix__tonight" x={left + cw} y={top} width={cw * 2} height={rh * 3} rx="6" />
        {LEVELS.map((l, r) => (
          <text key={l} x={left - 6} y={top + r * rh + rh / 2 + 4} textAnchor="end">{LEVEL_SHORT[l]}</text>
        ))}
        {MOMENTS.map((m, c) => (
          <text key={m} x={left + c * cw + cw / 2} y={top + rh * 3 + 16} textAnchor="middle">{MOMENT_SHORT[m]}</text>
        ))}
        <rect className="accord-matrix__grid" x={left} y={top} width={cw * 4} height={rh * 3} />
        {picks.map((p, i) => {
          const c = MOMENTS.indexOf(momentOf(p));
          const r = LEVELS.indexOf(accordLevel(p.score));
          const k = inCell.get(`${r}-${c}`) ?? 0;
          inCell.set(`${r}-${c}`, k + 1);
          const cx = left + c * cw + 14 + (k % 3) * 20;
          const cy = top + r * rh + 14 + Math.floor(k / 3) * 19;
          return (
            <Link key={p.wineId} to={`/cave/${p.wineId}`} state={{ from: '/accords' }} aria-label={`${i + 1}. ${name(p)}`}>
              <circle className={`moment--${momentOf(p)}`} cx={cx} cy={cy} r="9" />
              <text className="accord-matrix__num" x={cx} y={cy + 4} textAnchor="middle">{i + 1}</text>
            </Link>
          );
        })}
      </svg>
    </details>
  );
}

/** Résultats d'« Accords » : la vue d'ensemble, puis les vins en groupes selon le moment de les boire. */
export function AccordsResults({ picks, year }: { picks: AccordPick[]; year: number }) {
  const scale = timelineScale(picks, year);
  const numbered = picks.map((p, i) => ({ p, n: i + 1 }));
  return (
    <>
      <Matrix picks={picks} />
      {GROUPS.map((g) => {
        const items = numbered.filter(({ p }) => g.moments.includes(momentOf(p)));
        if (items.length === 0) return null;
        return (
          <section key={g.title} className="accord-group">
            <h3 className="field__label" style={{ margin: 0 }}>{g.title}</h3>
            <ol className="list" aria-label={g.title} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {items.map(({ p, n }) => {
                const m: Moment = momentOf(p);
                const level = accordLevel(p.score);
                const { min, max } = p.apogee;
                return (
                  <li key={p.wineId}>
                    <Link to={`/cave/${p.wineId}`} state={{ from: '/accords' }} className="cave-row accord-row">
                      <span className={`accord-row__num moment--${m}`} aria-hidden="true">{n}</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="list__title" style={{ display: 'block' }}>{name(p)}</span>
                        <span className="list__meta" style={{ display: 'block' }}>
                          {[p.appellation, COLOR_LABEL[p.color], `${p.quantity} btl`, p.place].filter(Boolean).join(' · ')}
                        </span>
                        <span style={{ display: 'block', fontSize: 13, marginTop: 4 }}>
                          <span className="accord-row__dots" aria-hidden="true">{DOTS[level]}</span> {LEVEL_LABEL[level]}
                          {p.reason && <span className="list__meta"> — {p.reason}</span>}
                        </span>
                        {min != null && max != null && (
                          <span className="accord-timeline" aria-hidden="true">
                            <span className={`moment--${m}`} style={{ left: `${at(min, scale)}%`, width: `${at(max + 1, scale) - at(min, scale)}%` }} />
                            <i style={{ left: `${at(year + 0.5, scale)}%` }} />
                          </span>
                        )}
                        <span className={`accord-row__moment moment-text--${m}`}>{momentLabel(p)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </>
  );
}
