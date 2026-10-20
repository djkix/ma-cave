import { ReactNode, useEffect, useId, useRef } from 'react';

/**
 * Feuille collée en bas de l'écran. `<dialog>` natif ouvert par `showModal()` :
 * focus piégé et fond gérés par le navigateur. Échap et clic sur le fond appellent
 * `onClose` ; le focus revient à l'élément actif au moment de l'ouverture.
 */
export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <h2 id={titleId} style={{ fontSize: 18, marginTop: 0 }}>{title}</h2>
      {open && children}
    </dialog>
  );
}
