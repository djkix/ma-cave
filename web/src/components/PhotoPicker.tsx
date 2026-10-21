import { ChangeEvent } from 'react';

/**
 * Choix d'une photo : le champ fichier natif (gris, mal aligné, libellé du
 * navigateur) est caché, et son libellé fait office de bouton. Sans `capture` :
 * le téléphone propose l'appareil photo ou la galerie, l'ordinateur un fichier.
 * `fileName` : photo déjà choisie, affichée à côté du bouton. L'icône est posée
 * en CSS : le libellé reste le seul texte, donc le nom du champ.
 */
export function PhotoPicker({ id, label, disabled, fileName, onChange }: {
  id: string; label: string; disabled?: boolean; fileName?: string | null; onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="photo-picker">
      <input id={id} type="file" accept="image/*" className="visually-hidden photo-picker__input" disabled={disabled} onChange={onChange} />
      <label htmlFor={id} className={`btn btn--outline photo-picker__button${disabled ? ' photo-picker__button--disabled' : ''}`}>
        {label}
      </label>
      {fileName && <span className="photo-picker__name">{fileName}</span>}
    </div>
  );
}
