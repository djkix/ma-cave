import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../lib/api-client';
import { useMe } from '../lib/use-current-cave';
import { APP_VERSION } from '../lib/version';
import { Button } from './Button';

export function LogoutButton({ variant = 'outline' }: { variant?: 'outline' | 'dark' }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function run() {
    // Même si l'appel échoue (session déjà expirée), on revient à l'écran de connexion.
    await logout().catch(() => undefined);
    navigate('/login', { replace: true });
    qc.clear();
  }
  return <Button variant={variant} onClick={run}>Se déconnecter</Button>;
}

function AccountScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="login">
      <img src="/icons/icon.svg" alt="" className="login__logo" width={72} height={72} />
      <h1 className="login__title">Ma Cave</h1>
      {children}
      <LogoutButton />
      {/* Pas de barre de titre ici : la version y est répétée, comme sur l'écran de connexion. */}
      <p className="login__version" aria-label={`Version ${APP_VERSION}`}>v{APP_VERSION}</p>
    </main>
  );
}

/** Compte inscrit, pas encore validé par un administrateur : aucune route ne lui répond. */
export function PendingScreen() {
  const me = useMe();
  return (
    <AccountScreen>
      <p className="centered" role="status">
        Inscription en attente de validation — revenez plus tard : l’accès s’ouvrira dès qu’un administrateur l’aura validée.
      </p>
      {/* Relit la session : un compte validé entre-temps ouvre l'application. */}
      <Button variant="outline" disabled={me.isFetching} onClick={() => me.refetch()}>Actualiser</Button>
    </AccountScreen>
  );
}

/** Compte actif sans aucune cave (ni la sienne, ni une invitation). */
export function NoCaveScreen({ isAdmin }: { isAdmin: boolean }) {
  return (
    <AccountScreen>
      <p className="centered" role="status">
        Vous n’avez pas encore de cave. Un administrateur peut vous en créer une, ou un propriétaire peut vous inviter.
      </p>
      {isAdmin && <Link to="/admin" className="btn btn--primary">Administration</Link>}
    </AccountScreen>
  );
}
