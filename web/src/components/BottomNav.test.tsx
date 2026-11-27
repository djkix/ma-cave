import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import { meFixture, viewerMe } from '../test-fixtures';
import { BottomNav } from './BottomNav';

afterEach(() => vi.restoreAllMocks());

function mount(path = '/') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <BottomNav />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const labels = () => screen.getAllByRole('link').map((l) => l.textContent);

it('montre cinq onglets au propriétaire : Mouvements à la place d’Entrée et Sortie', async () => {
  mount();
  expect(await screen.findByRole('link', { name: /Mouvements/ })).toHaveAttribute('href', '/mouvements');
  expect(screen.getByRole('link', { name: /Accords/ })).toHaveAttribute('href', '/accords');
  expect(screen.queryByRole('link', { name: /Journal/ })).not.toBeInTheDocument();
  expect(labels()).toEqual(['shelvesCave', 'swap_vertMouvements', 'restaurantAccords', 'bar_chartStats', 'settingsRéglages']);
});

it.each(['/mouvements', '/entree', '/entree/abc', '/sortie', '/sortie/abc', '/a-confirmer', '/journal'])('allume l’onglet Mouvements sur %s', async (path) => {
  mount(path);
  expect(await screen.findByRole('link', { name: /Mouvements/ })).toHaveClass('bottomnav__tab--active');
});

it('n’allume plus Réglages sur le journal', async () => {
  mount('/journal');
  expect(await screen.findByRole('link', { name: /Réglages/ })).not.toHaveClass('bottomnav__tab--active');
});

const inbox = (toConfirm: number, failed: number) =>
  ({ toConfirm: Array.from({ length: toConfirm }, (_, i) => ({ id: `t${i}` })), inProgress: [], failed: Array.from({ length: failed }, (_, i) => ({ id: `f${i}` })) }) as unknown as api.EntryInbox;

it('pastille des vins à confirmer (à valider et lecture impossible) sur Mouvements', async () => {
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(2, 1));
  mount();
  expect(await screen.findByLabelText('3 vins à confirmer')).toHaveTextContent('3');
  expect(screen.getByRole('link', { name: /Mouvements/ })).toContainElement(screen.getByLabelText('3 vins à confirmer'));
});

it('pastille au singulier', async () => {
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(1, 0));
  mount();
  expect(await screen.findByLabelText('1 vin à confirmer')).toBeInTheDocument();
});

it('aucune pastille quand rien n’attend', async () => {
  const read = vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(0, 0));
  mount();
  await waitFor(() => expect(read).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByLabelText(/à confirmer/)).not.toBeInTheDocument();
});

it.each(['/', '/cave'])('l’onglet Cave ouvre l’accueil et s’allume sur %s', async (path) => {
  mount(path);
  expect(await screen.findByRole('link', { name: /Cave/ })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /Cave/ })).toHaveClass('bottomnav__tab--active');
});

it('l’onglet Cave reste éteint ailleurs', async () => {
  mount('/stats');
  expect(await screen.findByRole('link', { name: /Cave/ })).not.toHaveClass('bottomnav__tab--active');
});

it.each(['/compte', '/compte/a-propos', '/ma-cave', '/admin/comptes'])('allume l’onglet Réglages sur %s', async (path) => {
  mount(path);
  expect(await screen.findByRole('link', { name: /Réglages/ })).toHaveAttribute('href', '/compte');
  expect(screen.getByRole('link', { name: /Réglages/ })).toHaveClass('bottomnav__tab--active');
});

it('ne garde que Cave, Accords et Stats pour un membre en lecture seule', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  mount();
  expect(await screen.findByRole('link', { name: /Stats/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Cave/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Accords/ })).toHaveAttribute('href', '/accords');
  expect(screen.queryByRole('link', { name: /Entrée/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Sortie/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Journal/ })).not.toBeInTheDocument();
});

it('membre en lecture seule : ni onglet Mouvements ni lecture des vins à confirmer', async () => {
  const me = vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  const read = vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(2, 0));
  mount();
  await waitFor(() => expect(me).toHaveBeenCalled());
  await screen.findByRole('link', { name: /Stats/ });
  await new Promise((r) => setTimeout(r, 20));
  expect(labels()).toEqual(['shelvesCave', 'restaurantAccords', 'bar_chartStats', 'settingsRéglages']);
  expect(read).not.toHaveBeenCalled();
});

it('disparaît pour un compte sans cave (administrateur sans cave dans l’administration)', async () => {
  const me = vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ isAdmin: true, caves: [], currentCaveId: null }));
  mount();
  await waitFor(() => expect(me).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByLabelText('Navigation principale')).not.toBeInTheDocument();
});

it('administrateur : pastille du nombre d’inscriptions en attente sur Réglages', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ isAdmin: true }));
  vi.spyOn(api, 'getRegistrations').mockResolvedValue([
    { id: 'r1', email: 'a@example.com', displayName: null, createdAt: '' },
    { id: 'r2', email: 'b@example.com', displayName: null, createdAt: '' },
    { id: 'r3', email: 'c@example.com', displayName: null, createdAt: '' },
  ]);
  mount();
  expect(await screen.findByLabelText('3 inscriptions à valider')).toHaveTextContent('3');
  expect(screen.getByRole('link', { name: /Réglages/ })).toContainElement(screen.getByLabelText('3 inscriptions à valider'));
});

it('non-administrateur : aucune pastille, aucune lecture des inscriptions', async () => {
  const regs = vi.spyOn(api, 'getRegistrations').mockResolvedValue([{ id: 'r1', email: 'a@example.com', displayName: null, createdAt: '' }]);
  mount();
  expect(await screen.findByRole('link', { name: /Réglages/ })).toBeInTheDocument();
  expect(regs).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/inscription/)).not.toBeInTheDocument();
});
