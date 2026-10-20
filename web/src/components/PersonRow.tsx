import { ReactNode } from 'react';

/** Une personne (membre, invitation…) : nom, détail, badges d'état, info et action à droite. */
export function PersonRow({ title, subtitle, badges, meta, action }: {
  title: string;
  subtitle?: string | null;
  badges?: { label: string; tone: 'ok' | 'warn' }[];
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="list__row person-row">
      <div className="person-row__main">
        <strong>{title}</strong>
        {subtitle && <div className="list__meta">{subtitle}</div>}
        {(badges?.length || meta) && (
          <div className="person-row__tags">
            {badges?.map((b) => <span key={b.label} className={`badge badge--${b.tone}`}>{b.label}</span>)}
            {meta}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
