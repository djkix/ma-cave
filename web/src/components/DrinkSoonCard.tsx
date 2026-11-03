import { Link } from 'react-router-dom';
import { apogeeShortLabel } from '../lib/apogee';
import { useDrinkSoon, whereLabel } from '../lib/drink-soon';
import { Icon } from './Icon';

const SHOWN = 3;

/** Chip d'état d'apogée : à point (lichen), à boire vite (terre cuite), passée (erreur). */
const chipClass = (status: string) => (status === 'A_BOIRE_VITE' ? 'warn' : status === 'PASSEE' ? 'error' : 'ok');

/** Accueil : les vins les plus urgents à boire, avec l'endroit où ils sont rangés. */
export function DrinkSoonCard() {
  const soon = useDrinkSoon();
  if (!soon.data) return null;
  return (
    <section className="card drink-soon">
      <header className="home-head">
        <div>
          <p className="home-eyebrow">Garde &amp; maturité</p>
          <h2 className="home-title">À boire prochainement</h2>
        </div>
        {soon.data.length > 0 && <Link to="/a-boire" className="home-head__link">Tout voir ({soon.data.length}) <Icon name="arrow_forward" /></Link>}
      </header>
      {soon.data.length === 0 ? (
        <p className="list__meta">Rien d’urgent à boire.</p>
      ) : (
        <div className="drink-soon__list">
          {soon.data.slice(0, SHOWN).map((w) => {
            const label = w.apogee && apogeeShortLabel(w.apogee);
            return (
              <Link key={w.id} to={`/cave/${w.id}`} className="drink-soon__item">
                <span className="drink-soon__top">
                  <span className="drink-soon__producer">{w.producer}</span>
                  {label && <span className={`badge badge--${chipClass(w.apogee!.status ?? '')}`}>{label}</span>}
                </span>
                <span className="drink-soon__wine">{[w.cuvee ?? w.appellationRaw, w.vintage ?? 'NV'].filter(Boolean).join(' ')}</span>
                <span className="drink-soon__bottom">
                  <span className="drink-soon__where"><Icon name="location_on" />{whereLabel(w)}</span>
                  <span className="num">{w.quantity} btl</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
