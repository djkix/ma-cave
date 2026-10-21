import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { GeminiUsageKind, GeminiUsageRow, getGeminiUsage } from '../../lib/api-client';

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const euros = (cents: number) => EUR.format(cents / 100);
const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

const USAGE_LABEL: Record<GeminiUsageKind, string> = {
  LECTURE_ENTREE: 'Lecture à l’entrée',
  LECTURE_SORTIE: 'Lecture à la sortie',
  ACCORDS: 'Accords',
  DESCRIPTIF: 'Descriptifs',
  RECHERCHE_IMAGE: 'Recherche d’image',
  ANALYSE_PLAN: 'Analyse du plan',
};

/** Une couleur de la charte par usage, assez éloignées pour se distinguer dans une barre empilée. */
const USAGE_COLOR: Record<GeminiUsageKind, string> = {
  LECTURE_ENTREE: 'var(--color-primary)',
  LECTURE_SORTIE: 'var(--color-wine-rouge)',
  ACCORDS: 'var(--color-success)',
  DESCRIPTIF: 'var(--color-wine-blanc)',
  RECHERCHE_IMAGE: 'var(--color-wine-rose)',
  ANALYSE_PLAN: 'var(--color-ferronnerie)',
};
const USAGES = Object.keys(USAGE_LABEL) as GeminiUsageKind[];

const PERIODS = [7, 30] as const;

/** « 2026-10-08 » → « 08/10 » : le jour est déjà celui de Paris, calculé par l'api. */
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

const calls = (r: GeminiUsageRow) => r.ok + r.refused503 + r.refused429 + r.errors;
/** Lu par le lecteur d'écran : espaces insécables d'Intl ramenées à des espaces simples. */
const plainEuros = (cents: number) => euros(cents).replace(/\s/g, ' ');

/** Lignes regroupées par jour, du plus ancien au plus récent (l'api les renvoie du plus récent). */
function byDay(rows: GeminiUsageRow[]) {
  const days = new Map<string, { calls: number; costCents: number; rows: GeminiUsageRow[] }>();
  for (const r of rows) {
    const d = days.get(r.day) ?? { calls: 0, costCents: 0, rows: [] };
    d.calls += calls(r);
    d.costCents += r.costCents;
    d.rows.push(r);
    days.set(r.day, d);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b));
}

/** Barres empilées par jour, une couleur par usage, hauteur rapportée au jour le plus chargé. */
function DailyChart({ rows }: { rows: GeminiUsageRow[] }) {
  const days = byDay(rows);
  const max = Math.max(1, ...days.map(([, d]) => d.calls));
  // Sur 30 jours, une étiquette sur quatre environ pour rester lisible à 375 px.
  const every = Math.ceil(days.length / 8);
  return (
    <>
      <div className="usage-chart">
        {days.map(([day, d], i) => (
          <div key={day} className="usage-chart__col">
            <span className="usage-chart__bar" role="img" aria-label={`${shortDay(day)} : ${plural(d.calls, 'appel', 'appels')}, ${plainEuros(d.costCents)}`}>
              {USAGES.map((u) => {
                const n = d.rows.filter((r) => r.usage === u).reduce((sum, r) => sum + calls(r), 0);
                return n > 0 && <span key={u} className="usage-chart__seg" style={{ height: `${+((n / max) * 100).toFixed(2)}%`, background: USAGE_COLOR[u] }} />;
              })}
            </span>
            <span className="histo__label usage-chart__label" aria-hidden="true">{i % every === 0 ? shortDay(day) : ''}</span>
          </div>
        ))}
      </div>
      <ul className="usage-legend list__meta" aria-label="Légende">
        {USAGES.map((u) => (
          <li key={u}><span className="histo__key" style={{ background: USAGE_COLOR[u] }} aria-hidden="true" />{USAGE_LABEL[u]}</li>
        ))}
      </ul>
    </>
  );
}

/** Coût, réussis, refusés en % des appels (refus saturé et quota ensemble). */
function KeyFigures({ totals }: { totals: { ok: number; refused: number; errors: number; costCents: number } }) {
  const all = totals.ok + totals.refused + totals.errors;
  const refusedPct = all === 0 ? 0 : Math.round((totals.refused / all) * 100);
  return (
    <div className="stats-head" style={{ marginTop: 'var(--space-sm)' }}>
      <span><span className="stats-head__value num">{euros(totals.costCents)}</span><span className="list__meta">Coût</span></span>
      <span><span className="stats-head__value num">{totals.ok}</span><span className="list__meta">Réussis</span></span>
      <span><span className="stats-head__value num">{`${refusedPct}\u00a0%`}</span><span className="list__meta">Refusés</span></span>
    </div>
  );
}

const cell = { padding: '2px var(--space-xs)', whiteSpace: 'nowrap' } as const;
const numCell = { ...cell, textAlign: 'right' } as const;

/** Consommation Gemini par jour et par usage, refus de Google compris, et pause commune en cours. */
export function GeminiUsageSection() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const q = useQuery({ queryKey: ['admin', 'gemini-usage', days], queryFn: () => getGeminiUsage(days) });
  const d = q.data;
  // Pause échue entre deux chargements : le bandeau disparaît, rien n'est plus suspendu.
  const pauseUntil = d?.pause.until && Date.parse(d.pause.until) > Date.now() ? d.pause.until : null;
  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Consommation Gemini</h2>
      <div role="group" aria-label="Période" style={{ display: 'flex', gap: 'var(--space-xs)', margin: 'var(--space-xs) 0' }}>
        {PERIODS.map((p) => (
          <button key={p} type="button" className={`pill${days === p ? ' pill--active' : ''}`} aria-pressed={days === p} onClick={() => setDays(p)}>
            {p} jours
          </button>
        ))}
      </div>
      {q.isError && <p role="alert" className="text-error">Impossible de charger la consommation Gemini.</p>}
      {d && pauseUntil && (
        <p className="badge badge--warn" style={{ whiteSpace: 'normal' }}>
          {`Gemini en pause jusqu'à ${parisTime.format(new Date(pauseUntil))} (${d.pause.reason ?? 'refus de Google'}) : aucun appel n'est envoyé d'ici là.`}
        </p>
      )}
      {d && d.rows.length === 0 && <p className="list__meta">Aucun appel à Gemini sur {days} jours.</p>}
      {d && d.rows.length > 0 && (
        <>
          <KeyFigures totals={d.totals} />
          <DailyChart rows={d.rows} />
          <details>
            <summary className="usage-details__summary">Détail par jour</summary>
            {/* Sept colonnes : défilement horizontal dans la carte à 375 px, jamais de la page. */}
            <div style={{ overflowX: 'auto', marginTop: 'var(--space-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="list__meta">
                    <th style={{ ...cell, textAlign: 'left' }}>Jour</th>
                    <th style={{ ...cell, textAlign: 'left' }}>Usage</th>
                    <th style={numCell}>Réussis</th>
                    <th style={numCell}>Refusés (saturé)</th>
                    <th style={numCell}>Refusés (quota)</th>
                    <th style={numCell}>Erreurs</th>
                    <th style={numCell}>Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={`${r.day}|${r.usage}`}>
                      <td style={cell} className="num">{shortDay(r.day)}</td>
                      <td style={cell}>{USAGE_LABEL[r.usage] ?? r.usage}</td>
                      <td style={numCell} className="num">{r.ok}</td>
                      <td style={numCell} className="num">{r.refused503}</td>
                      <td style={numCell} className="num">{r.refused429}</td>
                      <td style={numCell} className="num">{r.errors}</td>
                      <td style={numCell} className="num">{euros(r.costCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="num" style={{ margin: 'var(--space-sm) 0' }}>
            {`Total : ${plural(d.totals.ok, 'réussi', 'réussis')}, ${plural(d.totals.refused, 'refusé', 'refusés')}, ${plural(d.totals.errors, 'erreur', 'erreurs')} — ${euros(d.totals.costCents)}`}
          </p>
        </>
      )}
      <p className="list__meta">
        Un refus de Google (saturé ou quota) compte dans ses statistiques de requêtes mais n'est pas facturé. Après un refus, l'application met Gemini en pause (5 min si saturé, 1 h si quota épuisé) au lieu de réessayer.
      </p>
    </section>
  );
}
