import { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Section repliable (`<details>` natif) de la fiche vin et des statistiques :
 * fermée par défaut, ouverte d'emblée avec `open`. `note` précise l'état dans le
 * titre (« en préparation », « 3 ») ; `disabled` : rien à montrer, la section ne
 * s'ouvre pas et son contenu n'est pas rendu.
 */
export function Fold({ title, note, icon, open = false, disabled = false, children }: {
  title: string; note?: string; icon?: string; open?: boolean; disabled?: boolean; children: ReactNode;
}) {
  return (
    <details className={`card fold${disabled ? ' fold--disabled' : ''}`} open={open && !disabled}>
      <summary className="fold__summary" aria-disabled={disabled || undefined} onClick={disabled ? (e) => e.preventDefault() : undefined}>
        {icon && <Icon name={icon} />}
        <span className="fold__title">{title}{note && <span className="fold__note"> ({note})</span>}</span>
        {!disabled && <Icon name="expand_more" className="fold__chevron" />}
      </summary>
      {!disabled && <div className="fold__body">{children}</div>}
    </details>
  );
}
