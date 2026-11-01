import { useEffect, useState } from 'react';
import { disablePush, enablePush, PushState, pushState } from '../../lib/push';
import { Button } from '../Button';

const STATUS: Record<PushState, string> = {
  enabled: 'Activées sur cet appareil : chaque nouvelle inscription vous est signalée.',
  disabled: 'Désactivées sur cet appareil.',
  denied: 'Refusées par le navigateur : autorisez les notifications de Ma Cave dans ses réglages (ou ceux du téléphone).',
  unsupported: 'Non prises en charge par ce navigateur.',
};

/** Web Push de l'appareil courant : seule notification envoyée, une nouvelle inscription à valider. */
export function NotificationsSection() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pushState().then(setState, () => setState('unsupported'));
  }, []);

  async function run(action: () => Promise<PushState>) {
    setBusy(true);
    setError(null);
    try {
      setState(await action());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Notifications</h2>
      {state && <p className="list__meta">{STATUS[state]}</p>}
      {error && <p role="alert" className="text-error">{error}</p>}
      {state === 'disabled' && (
        <Button variant="outline" disabled={busy} onClick={() => void run(enablePush)}>Me prévenir des nouvelles inscriptions sur cet appareil</Button>
      )}
      {state === 'enabled' && <Button variant="link" disabled={busy} onClick={() => void run(disablePush)}>Désactiver sur cet appareil</Button>}
      <p className="list__meta">Sur iPhone : seulement depuis l’application installée sur l’écran d’accueil (iOS 16.4 ou plus récent).</p>
    </section>
  );
}
