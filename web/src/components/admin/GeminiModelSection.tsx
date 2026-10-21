import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { GeminiModelView, getGeminiModel, putGeminiModel } from '../../lib/api-client';

/** Modèle Gemini de tous les usages, choisi parmi les modèles Flash ou Lite que Google propose. */
export function GeminiModelSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'gemini-model'], queryFn: getGeminiModel });
  // Brouillon : absent tant que rien n'est choisi, le modèle en vigueur est alors affiché.
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (model: string) => putGeminiModel(model),
    onSuccess: (data) => {
      qc.setQueryData<GeminiModelView>(['admin', 'gemini-model'], (old) => old && { ...old, ...data });
      setDraft(null);
    },
  });
  const d = q.data;
  const selected = draft ?? d?.model ?? '';
  // Le modèle en vigueur reste proposé même si Google ne le liste plus.
  const options = d ? (d.models.includes(d.model) ? d.models : [d.model, ...d.models]) : [];
  // Valeur du .env : l'enregistrer telle quelle en fait le choix de l'Administration.
  const unchanged = !d || (selected === d.model && d.source === 'ADMIN');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!unchanged) save.mutate(selected);
  }

  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Modèle de l’IA</h2>
      <p className="list__meta">Sert à la lecture des étiquettes, aux accords, aux descriptifs, à la recherche d’image et à l’analyse des plans.</p>
      {q.isError && <p role="alert" className="text-error">{(q.error as Error).message}</p>}
      {d?.error && <p role="alert" className="text-error">{d.error}</p>}
      <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', alignItems: 'center', marginTop: 'var(--space-xs)' }}>
        <label htmlFor="gemini-model" className="field__label">Modèle</label>
        <select
          id="gemini-model"
          value={selected}
          disabled={!d}
          onChange={(e) => { setDraft(e.target.value); save.reset(); }}
        >
          {options.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button type="submit" className="btn btn--outline" disabled={unchanged || save.isPending}>Enregistrer</button>
      </form>
      {d?.source === 'ENV' && <p className="list__meta">Valeur du serveur (.env) tant qu’aucun modèle n’est choisi ici.</p>}
      {save.isError && <p role="alert" className="text-error">{(save.error as Error).message}</p>}
      {save.isSuccess && <p role="status" className="list__meta">Modèle enregistré : il sert dès le prochain appel.</p>}
    </section>
  );
}
