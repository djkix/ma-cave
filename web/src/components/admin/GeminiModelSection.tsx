import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { GeminiLimits, getGeminiQuota, putGeminiQuota } from '../../lib/api-client';

const n = (v: number) => v.toLocaleString('fr-FR');
const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const LIMIT_FIELDS: Array<[keyof GeminiLimits, string]> = [['rpm', 'Requêtes par minute'], ['tpm', 'Jetons par minute'], ['rpd', 'Requêtes par jour']];

/**
 * Modèle Gemini choisi seul par l'api (le plus récent dont le quota du jour n'est
 * pas atteint), modèles dans l'ordre d'emploi et limites de débit de chacun
 * (niveau sans frais de Google, compté modèle par modèle), relus toutes les 30 s.
 */
export function GeminiModelSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'gemini-quota'], queryFn: getGeminiQuota, refetchInterval: 30_000 });
  // Modèle dont les limites sont réglées : absent tant que rien n'est sélectionné, le modèle en cours.
  const [picked, setPicked] = useState<string | null>(null);
  // Brouillon : champs modifiés seulement, les autres suivent les limites en vigueur.
  const [draft, setDraft] = useState<Partial<Record<keyof GeminiLimits, string>>>({});
  const save = useMutation({
    mutationFn: ({ model, limits }: { model: string; limits: GeminiLimits }) => putGeminiQuota(model, limits),
    onSuccess: (data) => {
      qc.setQueryData(['admin', 'gemini-quota'], data);
      setDraft({});
    },
  });
  const d = q.data;
  const selected = d?.models.find((m) => m.model === picked) ?? d?.models.find((m) => m.model === d.current) ?? d?.models[0];
  const current = d?.models.find((m) => m.model === d.current);
  const value = (key: keyof GeminiLimits) => draft[key] ?? (selected ? String(selected.limits[key]) : '');

  function pick(model: string) {
    setPicked(model);
    setDraft({});
    save.reset();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    // Valeurs envoyées telles quelles : l'api refuse ce qui n'est pas un entier positif, avec son message.
    if (selected) save.mutate({ model: selected.model, limits: { rpm: Number(value('rpm')), tpm: Number(value('tpm')), rpd: Number(value('rpd')) } });
  }

  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Modèle Gemini (automatique)</h2>
      <p className="list__meta">Sert à la lecture des étiquettes, aux accords, aux descriptifs, à la recherche d’image et à l’analyse des plans.</p>
      <p className="list__meta">L’application choisit seule le modèle : le plus récent dont le quota du jour n’est pas atteint, puis le suivant.</p>
      {q.isError && <p role="alert" className="text-error">{(q.error as Error).message}</p>}
      {d?.error && <p role="alert" className="text-error">{d.error}</p>}
      {d && (
        <p style={{ margin: 'var(--space-xs) 0' }}>
          {current ? (
            <>
              Modèle en cours : <strong>{current.model}</strong>
              <span className="list__meta" style={{ display: 'block' }}>
                {`Cette minute : ${n(d.minute.requests)} / ${n(current.limits.rpm)} requêtes, ${n(d.minute.tokens)} / ${n(current.limits.tpm)} jetons`}
              </span>
            </>
          ) : d.models.length > 0 ? (
            `Tous les modèles ont atteint leur quota du jour : reprise à ${parisTime.format(new Date(d.dayResetsAt))}.`
          ) : (
            'Aucun modèle Gemini disponible.'
          )}
        </p>
      )}
      {d && d.models.length > 0 && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label">Modèles, dans l’ordre d’emploi</legend>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {d.models.map((m) => (
              <li key={m.model} className="list__meta">
                <label style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)', alignItems: 'center' }}>
                  <input type="radio" name="gemini-limits-model" checked={m.model === selected?.model} onChange={() => pick(m.model)} />
                  {`${m.model} : ${n(m.requests)} / ${n(m.limits.rpd)} requêtes aujourd’hui`}
                  {m.exhaustedUntil && <> <span className="badge badge--warn">{`épuisé jusqu’à ${parisTime.format(new Date(m.exhaustedUntil))}`}</span></>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {selected && (
        <>
          <h3 style={{ fontSize: 16, marginTop: 'var(--space-sm)' }}>{`Limites de ${selected.model}`}</h3>
          <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', alignItems: 'end', marginTop: 'var(--space-xs)' }}>
            {LIMIT_FIELDS.map(([key, label]) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <span className="field__label">{label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={value(key)}
                  onChange={(e) => { setDraft((old) => ({ ...old, [key]: e.target.value })); save.reset(); }}
                />
              </label>
            ))}
            <button type="submit" className="btn btn--outline" disabled={save.isPending}>Enregistrer les limites</button>
          </form>
        </>
      )}
      {save.isError && <p role="alert" className="text-error">{(save.error as Error).message}</p>}
      {save.isSuccess && <p role="status" className="list__meta">Limites enregistrées : elles s’appliquent dès le prochain appel.</p>}
    </section>
  );
}
