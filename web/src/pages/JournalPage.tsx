import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { movementNote } from '../lib/movement-note';
import { useState } from 'react';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { cancelMovement, exportUrl, getRecentMovements, MovementWithWine, WineColor } from '../lib/api-client';
import { NO_LOCATION } from '../lib/locations';

const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** `all` : la liste affichée, où une annulation retrouve le mouvement qu'elle annule (voir movementNote). */
const TYPE_LABEL = { IN: 'Entrée', OUT: 'Sortie', MOVE: 'Déplacement', ADJUST: 'Ajustement' } as const;

export function MovementRow({ m, all = [m], onCancel, cancelling, cancelled }: { m: MovementWithWine; all?: MovementWithWine[]; onCancel?: (id: string) => void; cancelling?: boolean; cancelled?: boolean }) {
  const note = movementNote(m, all);
  const isIn = m.delta > 0;
  return (
    <div className="mv">
      <span className={`mv__badge${isIn ? ' mv__badge--in' : ''}`}><Icon name={isIn ? 'add' : 'remove'} /></span>
      <div className="mv__body">
        <p className="mv__title">{TYPE_LABEL[m.type]} · {m.wine.producer}</p>
        <span className="mv__meta">
          {[[m.wine.cuvee, m.wine.vintage].filter(Boolean).join(' '), fmt.format(new Date(m.occurredAt))].filter(Boolean).join(' · ')}
          {/* Une moitié de déplacement : l'emplacement d'origine (−) ou de destination (+). */}
          {m.type === 'MOVE' && <span>{` · Déplacé · ${m.locationLabel ?? NO_LOCATION}`}</span>}
        </span>
        <span className="mv__meta">{m.wine.appellationRaw}{m.type !== 'MOVE' && m.locationLabel ? ` · ${m.locationLabel}` : ''}{note ? ` · ${note}` : ''}</span>
      </div>
      <span className="mv__side">
        <span className={`mv__delta num${isIn ? ' mv__delta--in' : ''}`}>{isIn ? `+${m.delta}` : m.delta} btl</span>
        {onCancel && !m.reversesId && !cancelled && (
          <Button variant="outline" onClick={() => onCancel(m.id)} disabled={cancelling}>Annuler</Button>
        )}
      </span>
    </div>
  );
}

export function JournalPage() {
  const qc = useQueryClient();
  const movements = useQuery({ queryKey: ['movements', 'recent'], queryFn: () => getRecentMovements(20) });
  const [color, setColor] = useState<WineColor | ''>('');
  const [drinkSoon, setDrinkSoon] = useState(false);
  // Mouvements déjà annulés (leur annulation figure dans la liste) : plus de bouton « Annuler ».
  // Un déplacement annulé l'est par paire, ses deux moitiés ont chacune leur annulation.
  const reversed = new Set(movements.data?.map((m) => m.reversesId).filter((id): id is string => !!id));
  const cancel = useMutation({
    mutationFn: (id: string) => cancelMovement(id, crypto.randomUUID()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['movements'] }),
  });

  return (
    <>
      <TopBar title="Journal" back="/compte" />
      <main className="page">
        <section className="card">
          <h2 style={{ fontSize: 18 }}>Export Excel</h2>
          <label className="field__label" style={{ marginTop: 'var(--space-sm)' }}>
            Filtre couleur
            <select value={color} onChange={(e) => setColor(e.target.value as WineColor | '')}>
              <option value="">Toute la cave</option>
              <option value="ROUGE">Rouge</option>
              <option value="BLANC">Blanc</option>
              <option value="ROSE">Rosé</option>
              <option value="PETILLANT">Pétillant</option>
            </select>
          </label>
          <label className="field__label" style={{ marginTop: 'var(--space-sm)' }}>
            <input type="checkbox" checked={drinkSoon} onChange={(e) => setDrinkSoon(e.target.checked)} aria-label="Seulement les vins à boire en priorité" />
            Seulement les vins à boire en priorité
          </label>
          <a className="btn btn--primary" style={{ width: '100%', marginTop: 'var(--space-sm)' }} href={exportUrl({ ...(color ? { color } : {}), drinkSoon })} download>
            <Icon name="download" />
            Exporter le classeur
          </a>
        </section>
        <h2 style={{ fontSize: 14, letterSpacing: '0.08em', color: 'var(--color-secondary)' }}>20 DERNIERS MOUVEMENTS</h2>
        {cancel.isError && <p role="alert" className="text-error">{(cancel.error as Error).message}</p>}
        <div className="list">
          {movements.data?.map((m) => (
            <MovementRow key={m.id} m={m} all={movements.data} onCancel={(id) => cancel.mutate(id)} cancelling={cancel.isPending} cancelled={reversed.has(m.id)} />
          ))}
          {movements.data?.length === 0 && <p className="centered">Aucun mouvement pour l’instant.</p>}
        </div>
      </main>
      <BottomNav />
    </>
  );
}
