import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { getRecentMovements } from '../lib/api-client';
import { useToConfirmCount } from '../lib/use-to-confirm';
import { MovementRow } from './JournalPage';

/**
 * Onglet Mouvements (propriétaire) : rentrer ou sortir du vin, les vins qui
 * attendent une confirmation, puis les derniers mouvements et le journal.
 */
export function MouvementsPage() {
  const toConfirm = useToConfirmCount();
  const movements = useQuery({ queryKey: ['movements', 'recent', 10], queryFn: () => getRecentMovements(10) });
  return (
    <>
      <TopBar title="Mouvements" />
      <main className="page">
        <div className="mv-actions">
          <Link to="/entree" className="mv-action">
            <Icon name="add_circle" />
            Rentrer
          </Link>
          <Link to="/sortie" className="mv-action">
            <Icon name="remove_circle_outline" />
            Sortir
          </Link>
        </div>
        {toConfirm > 0 && (
          <Link to="/a-confirmer" className="home-confirm">
            <Icon name="fact_check" />
            <span className="home-confirm__text"><span className="num">{toConfirm}</span> vin{toConfirm > 1 ? 's' : ''} à confirmer</span>
            <Icon name="chevron_right" />
          </Link>
        )}
        <section className="card">
          <header className="home-head">
            <div>
              <p className="home-eyebrow">Historique</p>
              <h2 className="home-title">Derniers mouvements</h2>
            </div>
          </header>
          <div className="mv-list">
            {movements.data?.map((m) => <MovementRow key={m.id} m={m} all={movements.data} />)}
            {movements.data?.length === 0 && <p className="centered">Aucun mouvement pour l’instant.</p>}
          </div>
          <Link to="/journal" className="home-wide-btn">Voir le journal complet <Icon name="arrow_forward" /></Link>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
