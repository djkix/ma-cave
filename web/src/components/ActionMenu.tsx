import { useEffect, useId, useRef, useState } from 'react';

/**
 * Bouton « ⋯ » qui déplie une liste de boutons d'actions (motif « disclosure »).
 * Se ferme par Échap, clic extérieur, Tab hors du menu ou choix ; le focus revient alors
 * au « ⋯ » avant l'action, pour qu'une feuille ouverte par l'action lui rende le focus.
 */
export function ActionMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { button.current?.focus(); setOpen(false); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="action-menu" onBlur={(e) => { // relatedTarget nul (Safari ne focalise pas un bouton cliqué) : on ne ferme pas, le clic extérieur s'en charge.
      if (open && e.relatedTarget && !root.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button ref={button} type="button" className="action-menu__button" aria-label={label} aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div id={listId} className="action-menu__list">
          {items.map((it) => (
            <button key={it.label} type="button" className="action-menu__item" disabled={it.disabled} onClick={() => { button.current?.focus(); setOpen(false); it.onSelect(); }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
