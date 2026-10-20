import { LogoutButton } from '../components/AccountScreens';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { useSwitchCave } from '../components/CaveSwitcher';
import { Icon } from '../components/Icon';
import { PersonRow } from '../components/PersonRow';
import { TopBar } from '../components/TopBar';
import { useInstallPrompt } from '../lib/install-prompt';
import { useCurrentCave } from '../lib/use-current-cave';

function InstallCard() {
  const { state, install } = useInstallPrompt();
  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Application sur le téléphone</h2>
      {state === 'installed' && <p>L’application est installée sur cet appareil.</p>}
      {state === 'prompt' && (
        <Button variant="primary" onClick={install}>
          <Icon name="install_mobile" />
          Installer l’application
        </Button>
      )}
      {state === 'ios' && (
        <p>Dans Safari, touchez <strong>Partager</strong>, puis <strong>Sur l’écran d’accueil</strong>.</p>
      )}
      {state === 'manual' && (
        <p>Ouvrez le menu du navigateur, puis <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</p>
      )}
    </section>
  );
}

function CavesCard() {
  const { caves, caveId } = useCurrentCave();
  const change = useSwitchCave();
  if (caves.length === 0) return null;
  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Mes caves</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {caves.map((c) => (
          <li key={c.id}>
            <PersonRow
              title={c.name}
              badges={[c.role === 'OWNER' ? { label: 'Propriétaire', tone: 'ok' } : { label: 'Lecture seule', tone: 'warn' }]}
              action={c.id === caveId
                ? <span className="badge">Cave affichée</span>
                : <Button variant="outline" disabled={change.isPending} onClick={() => change.mutate(c.id)}>Afficher</Button>}
            />
          </li>
        ))}
      </ul>
      {change.isError && <p role="alert" className="text-error">{(change.error as Error).message}</p>}
    </section>
  );
}

/** Moi : mes caves (et en changer), l'application sur le téléphone, la déconnexion. Ouvert à tout compte. */
export function MoiPage() {
  return (
    <>
      <TopBar title="Moi" back="/compte" />
      <main className="page">
        <CavesCard />
        <InstallCard />
        <LogoutButton variant="dark" />
      </main>
      <BottomNav />
    </>
  );
}
