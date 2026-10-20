import { Link } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { TopBar } from '../components/TopBar';
import { useInstallPrompt } from '../lib/install-prompt';
import { APP_VERSION } from '../lib/version';

/** À propos : version, application installée ou non (même détection que « Moi »), confidentialité. */
export function AProposPage() {
  const { state } = useInstallPrompt();
  return (
    <>
      <TopBar title="À propos" back="/compte" />
      <main className="page">
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          <p style={{ margin: 0 }}>Version {APP_VERSION}</p>
          <p className="list__meta" style={{ margin: 0 }}>
            {state === 'installed' ? 'Application installée sur cet appareil' : 'Application non installée'}
          </p>
          <Link to="/confidentialite" className="btn btn--link">Règles de confidentialité</Link>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
