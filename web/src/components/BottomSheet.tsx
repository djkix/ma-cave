import { ReactNode, useEffect, useId, useRef } from 'react';

/**
 * Feuille collée en bas de l'écran. `<dialog>` natif ouvert par `showModal()` :
 * focus piégé et fond gérés par le navigateur. Échap et clic sur le fond appellent
 * `onClose` ; le focus revient à l'élément actif au moment de l'ouverture.
 */
export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const el = dialog.current;
    if (!el || !open) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!el.open) el.showModal();
    return () => {
      el.close();
      opener?.focus();
    };
  }, [open]);

  // Le corps porte le padding : un clic sur le <dialog> lui-même ne peut venir que du fond.
  // `onClose` natif : filet si le navigateur ferme malgré `cancel` (ignoré quand c'est React qui ferme).
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClose={(e) => { if (openRef.current && !e.currentTarget.open) onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sheet__body">
        <h2 id={titleId} className="sheet__title">{title}</h2>
        {open && children}
      </div>
    </dialog>
  );
}
