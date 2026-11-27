import type { BarRow } from './BarList';

const R = 40;
const C = 2 * Math.PI * R;

/** Anneau des couleurs : un arc par couleur présente, et la légende chiffrée en texte à côté. */
export function ColorRing({ rows }: { rows: BarRow[] }) {
  const shown = rows.filter((r) => r.bottles > 0);
  if (shown.length === 0) return null;
  const total = shown.reduce((n, r) => n + r.bottles, 0);
  let offset = 0;
  return (
    <section className="card ring">
      <h2 style={{ fontSize: 18 }}>Couleur</h2>
      <div className="ring__body">
        <svg viewBox="0 0 100 100" className="ring__svg" aria-hidden="true">
          {shown.map((r) => {
            const len = (r.bottles / total) * C;
            const arc = <circle key={r.key} className="ring__arc" cx="50" cy="50" r={R} fill="none" stroke={r.color} strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />;
            offset += len;
            return arc;
          })}
        </svg>
        <ul className="ring__legend">
          {shown.map((r) => <li key={r.key}><i style={{ background: r.color }} />{`${r.label} ${r.bottles}`}</li>)}
        </ul>
      </div>
    </section>
  );
}
