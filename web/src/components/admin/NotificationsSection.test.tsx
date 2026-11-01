import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../lib/api-client';
import { NotificationsSection } from './NotificationsSection';

const ENDPOINT = 'https://push.example.test/abc';

/** Navigateur avec Web Push : `existing` abonnement déjà présent, `permission` actuelle et réponse à la demande. */
function browser({ permission = 'default' as NotificationPermission, answer = 'granted' as NotificationPermission, existing = false } = {}) {
  const sub = { endpoint: ENDPOINT, toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'k', auth: 'a' } }), unsubscribe: vi.fn(async () => true) };
  let current: typeof sub | null = existing ? sub : null;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => (current = sub)),
  };
  sub.unsubscribe.mockImplementation(async () => ((current = null), true));
  const Notification = { permission, requestPermission: vi.fn(async () => answer) };
  vi.stubGlobal('Notification', Notification);
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn(async () => ({ pushManager })) } });
  return { pushManager, sub, Notification };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
});

it('non pris en charge (sans service worker ni PushManager), avec l’aide pour iPhone', async () => {
  render(<NotificationsSection />);
  expect(await screen.findByText('Non prises en charge par ce navigateur.')).toBeInTheDocument();
  expect(screen.getByText(/écran d’accueil \(iOS 16\.4/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

it('refusées par le navigateur : explication, aucun bouton', async () => {
  browser({ permission: 'denied' });
  render(<NotificationsSection />);
  expect(await screen.findByText(/Refusées par le navigateur/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

it('activer : permission, abonnement avec la clé du serveur, envoi à l’api', async () => {
  const { pushManager, Notification } = browser();
  vi.spyOn(api, 'getPushKey').mockResolvedValue({ publicKey: 'AQID' });
  const save = vi.spyOn(api, 'savePushSubscription').mockResolvedValue(undefined);
  render(<NotificationsSection />);
  await userEvent.click(await screen.findByRole('button', { name: 'Me prévenir des nouvelles inscriptions sur cet appareil' }));
  expect(Notification.requestPermission).toHaveBeenCalled();
  expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) });
  expect(save).toHaveBeenCalledWith({ endpoint: ENDPOINT, keys: { p256dh: 'k', auth: 'a' } });
  expect(await screen.findByText(/Activées sur cet appareil/)).toBeInTheDocument();
});

it('permission refusée à la demande : rien n’est envoyé', async () => {
  const { pushManager } = browser({ answer: 'denied' });
  const save = vi.spyOn(api, 'savePushSubscription');
  render(<NotificationsSection />);
  await userEvent.click(await screen.findByRole('button', { name: /Me prévenir/ }));
  expect(await screen.findByText(/Refusées par le navigateur/)).toBeInTheDocument();
  expect(pushManager.subscribe).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it('désactiver : supprime l’abonnement côté api puis sur l’appareil', async () => {
  const { sub } = browser({ permission: 'granted', existing: true });
  const del = vi.spyOn(api, 'deletePushSubscription').mockResolvedValue(undefined);
  render(<NotificationsSection />);
  await userEvent.click(await screen.findByRole('button', { name: 'Désactiver sur cet appareil' }));
  expect(del).toHaveBeenCalledWith(ENDPOINT);
  expect(sub.unsubscribe).toHaveBeenCalled();
  expect(await screen.findByText('Désactivées sur cet appareil.')).toBeInTheDocument();
});
