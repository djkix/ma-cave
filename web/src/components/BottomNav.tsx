import { NavLink, useLocation } from 'react-router-dom';
import { useCurrentCave, usePendingRegistrations } from '../lib/use-current-cave';
import { useToConfirmCount } from '../lib/use-to-confirm';
import { Icon } from './Icon';
import { SETTINGS_PATH } from './TopBar';

/** Écrans de l'onglet Mouvements : l'écran lui-même, l'entrée, la sortie, « À confirmer » et le journal. */
export const MOVEMENTS_PATH = /^\/(mouvements|entree|sortie|a-confirmer|journal)(\/|$)/;

// Cave ouvre l'accueil et reste allumé sur la liste /cave.
const tabs = [
  { to: '/', icon: 'shelves', label: 'Cave', soon: false, ownerOnly: false },
  { to: '/mouvements', icon: 'swap_vert', label: 'Mouvements', soon: false, ownerOnly: true },
  { to: '/accords', icon: 'restaurant', label: 'Accords', soon: false, ownerOnly: false },
  { to: '/stats', icon: 'bar_chart', label: 'Stats', soon: false, ownerOnly: false },
  { to: '/compte', icon: 'settings', label: 'Réglages', soon: false, ownerOnly: false },
];

export function BottomNav() {
  // Un membre en lecture seule n'a pas l'onglet Mouvements (ni entrée, ni sortie, ni journal).
  const { me, isOwner, caves } = useCurrentCave();
  const { pathname } = useLocation();
  const pending = usePendingRegistrations() ?? 0;
  const toConfirm = useToConfirmCount();
  // Sans cave (administrateur sur l'administration), Cave et Stats ne mèneraient
  // qu'à l'écran « pas encore de cave » : pas d'onglets du tout.
  if (me && caves.length === 0) return null;
  return (
    <nav className="bottomnav" aria-label="Navigation principale">
      {tabs.filter((t) => isOwner || !t.ownerOnly).map((t) =>
        t.soon ? (
          <span key={t.to} className="bottomnav__tab bottomnav__tab--soon" aria-disabled="true" title="Bientôt disponible">
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </span>
        ) : (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `bottomnav__tab${isActive || (t.to === '/compte' && SETTINGS_PATH.test(pathname)) || (t.to === '/mouvements' && MOVEMENTS_PATH.test(pathname)) || (t.to === '/' && pathname.startsWith('/cave')) ? ' bottomnav__tab--active' : ''}`}>
            <span className="bottomnav__icon">
              <Icon name={t.icon} />
              {t.to === '/compte' && pending > 0 && (
                <span className="badge badge--warn bottomnav__badge" aria-label={`${pending} inscription${pending > 1 ? 's' : ''} à valider`}>{pending}</span>
              )}
              {t.to === '/mouvements' && toConfirm > 0 && (
                <span className="badge badge--warn bottomnav__badge" aria-label={`${toConfirm} vin${toConfirm > 1 ? 's' : ''} à confirmer`}>{toConfirm}</span>
              )}
            </span>
            <span>{t.label}</span>
          </NavLink>
        ),
      )}
    </nav>
  );
}
