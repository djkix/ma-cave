import { useEffect, useState } from 'react';
import { getAppellations, type AppellationSuggestion } from '../lib/api-client';

// Même seuil que RECOGNIZED_SIMILARITY côté api (au-dessous, l'appellation est inconnue du référentiel).
const RECOGNIZED_SIMILARITY = 0.5;

interface Props { id: string; value: string; onChange: (value: string) => void }

/** Champ appellation avec suggestions du référentiel ; le libellé est fourni par l'appelant (`<label htmlFor={id}>`). */
export function AppellationField({ id, value, onChange }: Props) {
  // Réponse accompagnée de la saisie qui l'a produite : pas de message avant qu'elle n'arrive.
  const [result, setResult] = useState<{ q: string; items: AppellationSuggestion[] } | null>(null);
  const q = value.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      getAppellations(q)
        .then((items) => { if (!cancelled) setResult({ q, items }); })
        .catch(() => { /* suggestions facultatives : jamais bloquant */ });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const items = result?.items ?? [];
  const unknown = q.length >= 2 && result?.q === q && !items.some((s) => s.similarity >= RECOGNIZED_SIMILARITY);
  return (
    <>
      <input id={id} list={`${id}-list`} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      <datalist id={`${id}-list`}>
        {items.map((s) => <option key={s.name} value={s.name} />)}
      </datalist>
      {unknown && <p className="field__hint" role="status">Appellation inconnue du référentiel : la région et l’apogée seront estimées par l’IA.</p>}
    </>
  );
}
