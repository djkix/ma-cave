import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import * as install from '../lib/install-prompt';
import { meFixture, OWNER_CAVE, VIEWER_CAVE } from '../test-fixtures';
import { MoiPage } from './MoiPage';

afterEach(() => vi.restoreAllMocks());

function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/compte/moi']}>
        <MoiPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('liste les caves avec leur rôle et permet d’en afficher une autre', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ caves: [OWNER_CAVE, VIEWER_CAVE], currentCaveId: OWNER_CAVE.id }));
  const set = vi.spyOn(api, 'setCurrentCave').mockResolvedValue(meFixture({ caves: [OWNER_CAVE, VIEWER_CAVE], currentCaveId: VIEWER_CAVE.id }));
  mount();
  expect(await screen.findByText('Cave de Paul')).toBeInTheDocument();
  expect(screen.getByText('Propriétaire')).toHaveClass('badge--ok');
  expect(screen.getByText('Lecture seule')).toHaveClass('badge--warn');
  expect(screen.getByText('Cave affichée')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Afficher' }));
  await waitFor(() => expect(set).toHaveBeenCalledWith(VIEWER_CAVE.id));
});

it('remonte vers le hub, déconnecte en bouton sombre, sans sauvegarde ni version', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture());
  const out = vi.spyOn(api, 'logout').mockResolvedValue({ ok: true });
  mount();
  const logout = await screen.findByRole('button', { name: 'Se déconnecter' });
  expect(logout).toHaveClass('btn--dark');
  expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/compte');
  expect(screen.queryByText(/sauvegarde/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Version/)).not.toBeInTheDocument();
  await userEvent.click(logout);
  await waitFor(() => expect(out).toHaveBeenCalled());
});

it('explique comment installer l’application quand le navigateur ne la propose pas', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture());
  mount();
  expect(await screen.findByText('Application sur le téléphone')).toBeInTheDocument();
  // jsdom : ni invitation du navigateur, ni iPhone, ni mode installé.
  expect(screen.getByText(/Ouvrez le menu du navigateur/)).toBeInTheDocument();
});

it.each([
  ['installed', /L’application est installée sur cet appareil/],
  ['prompt', /Installer l’application/],
  ['ios', /Dans Safari, touchez/],
] as const)('affiche l’état d’installation « %s »', async (state, text) => {
  vi.spyOn(install, 'useInstallPrompt').mockReturnValue({ state, install: async () => undefined });
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture());
  mount();
  expect(await screen.findByText(text)).toBeInTheDocument();
});
