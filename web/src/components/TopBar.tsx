import { Link, useLocation } from 'react-router-dom';
import { APP_VERSION } from '../lib/version';
import { CaveSwitcher } from './CaveSwitcher';
import { Icon } from './Icon';

/** Écrans de l'onglet Réglages : le hub, Moi, À propos, Ma cave et l'administration. */
export const SETTINGS_PATH = /^\/(compte|ma-cave|admin)(\/|$)/;

export function TopBar({ title, back }: { title?: string; back?: string }) {
  const inSettings = SETTINGS_PATH.test(useLocation().pathname);
  return (
    <header className="topbar">
      {back ? (
        <Link to={back} aria-label="Retour" className="topbar__back">
          <Icon name="arrow_back" />
        </Link>
      ) : (
        <img src="/icons/icon.svg" alt="" className="topbar__logo" width={32} height={32} />
      )}
      <h1 className="topbar__title">{title ?? 'Ma Cave'}</h1>
      <CaveSwitcher />
      {/* Dans les Réglages, la version remplace le lien vers les Réglages eux-mêmes. */}
      {inSettings ? (
        <span className="topbar__version num" aria-label={`Version ${APP_VERSION}`}>
          v{APP_VERSION}
        </span>
      ) : (
        <Link to="/compte" aria-label="Réglages" className="topbar__account">
          <Icon name="account_circle" />
        </Link>
      )}
    </header>
  );
}
