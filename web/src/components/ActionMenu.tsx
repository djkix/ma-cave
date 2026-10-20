import { useEffect, useRef, useState } from 'react';

/** Bouton « ⋯ » qui ouvre un petit menu d'actions ; se ferme par Échap, clic extérieur ou choix. */
export function ActionMenu({ label, items }: { label: string; items: { label: string; onSelect: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="action-menu">
      <button type="button" className="action-menu__button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div role="menu" className="action-menu__list">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className="action-menu__item" disabled={it.disabled} onClick={() => { setOpen(false); it.onSelect(); }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
