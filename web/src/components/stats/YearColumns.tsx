import type { BarRow } from './BarList';

/** Une colonne par millésime (dans l'ordre reçu, « Non millésimé » en dernier), haute selon le maximum. */
export function YearColumns({ rows }: { rows: BarRow[] }) {
  const shown = rows.filter((r) => r.bottles > 0);
  if (shown.length === 0) return null;
  const max = Math.max(...shown.map((r) => r.bottles));
  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Millésime</h2>
      <div className="years">
        {shown.map((r) => (
          <div key={r.key} className="years__col">
            <span className="years__count num" aria-hidden="true">{r.bottles}</span>
            <span className="years__bar" role="img" aria-label={`${r.label} : ${r.bottles} bouteille${r.bottles > 1 ? 's' : ''}`}
              style={{ height: `${Math.round((r.bottles / max) * 100)}%` }} />
            <span className="years__label">{r.label === 'Non millésimé' ? 'NV' : r.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
