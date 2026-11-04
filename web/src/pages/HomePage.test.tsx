import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '../lib/api-client';
import { meFixture, viewerMe } from '../test-fixtures';
import { HomePage } from './HomePage';

// jsdom n'a ni showModal ni close : simulés comme dans les tests de BottomSheet.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});
afterEach(() => vi.restoreAllMocks());

function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const photo = (id: string, status: api.PhotoDto['status']): api.PhotoDto => ({ id, status, createdAt: '' });

it('ni cartes Rentrer et Sortir (la barre du bas les porte), ni mode campagne', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  const inbox = vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [], inProgress: [], failed: [] });
  mount();
  await waitFor(() => expect(inbox).toHaveBeenCalled());
  expect(screen.queryByRole('link', { name: /Rentrer du vin/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Sortir une bouteille/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Bientôt/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Mode campagne/)).not.toBeInTheDocument();
});

it('affiche le badge des vins à confirmer (à valider + lecture impossible)', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue({
    toConfirm: [photo('a', 'DONE'), photo('b', 'DONE')],
    inProgress: [photo('c', 'PENDING')],
    failed: [photo('d', 'FAILED')],
  });
  mount();
  expect(await screen.findByRole('link', { name: /3 vins à confirmer/ })).toHaveAttribute('href', '/a-confirmer');
});

it('accorde le badge au singulier', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [], inProgress: [], failed: [photo('d', 'FAILED')] });
  mount();
  expect(await screen.findByRole('link', { name: /1 vin à confirmer/ })).toBeInTheDocument();
});

it('masque le badge quand rien n’est à confirmer', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  const inbox = vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [], inProgress: [photo('c', 'PENDING')], failed: [] });
  mount();
  await waitFor(() => expect(inbox).toHaveBeenCalled());
  expect(screen.queryByText(/à confirmer/)).not.toBeInTheDocument();
});

it('ni « Ma cave › Réglages » ni « Administration » : ils sont dans l’onglet Réglages', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ isAdmin: true }));
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  const inbox = vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [], inProgress: [], failed: [] });
  mount();
  await waitFor(() => expect(inbox).toHaveBeenCalled());
  expect(screen.queryByRole('link', { name: 'Ma cave › Réglages' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Membres/ })).not.toBeInTheDocument();
});

it('n’offre à un membre en lecture seule que la cave et les statistiques, sans requête réservée', async () => {
  const me = vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  const movements = vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  const inbox = vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [photo('a', 'DONE')], inProgress: [], failed: [] });
  const queue = vi.spyOn(api, 'getPhotoQueueStatus').mockResolvedValue({ waiting: 3, oldestWaitingAt: null, lastReason: null });
  mount();
  expect(await screen.findByRole('link', { name: /Voir la cave/ })).toHaveAttribute('href', '/cave');
  await waitFor(() => expect(me).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(movements).not.toHaveBeenCalled();
  expect(inbox).not.toHaveBeenCalled();
  expect(queue).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: /Rentrer du vin/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Sortir une bouteille/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/à confirmer/)).not.toBeInTheDocument();
  expect(screen.queryByText(/en attente d’analyse/)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /journal/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ma cave › Réglages' })).not.toBeInTheDocument();
  expect(screen.queryByText('Derniers mouvements')).not.toBeInTheDocument();
});

const pending = (id: string): api.Registration => ({ id, email: `${id}@example.com`, displayName: null, createdAt: '2026-11-01T10:00:00Z' });

it('administrateur : bandeau des inscriptions à valider, vers Administration › Comptes', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ isAdmin: true }));
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [], inProgress: [], failed: [] });
  vi.spyOn(api, 'getRegistrations').mockResolvedValue([pending('a'), pending('b')]);
  mount();
  expect(await screen.findByRole('link', { name: '2 inscriptions à valider' })).toHaveAttribute('href', '/admin/comptes');
});

it('non-administrateur : ni bandeau ni lecture des inscriptions', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  const inbox = vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [], inProgress: [], failed: [] });
  const regs = vi.spyOn(api, 'getRegistrations').mockResolvedValue([pending('a')]);
  mount();
  await waitFor(() => expect(inbox).toHaveBeenCalled());
  expect(regs).not.toHaveBeenCalled();
  expect(screen.queryByText(/à valider/)).not.toBeInTheDocument();
});

const caveRow = (o: Partial<api.CaveRow>): api.CaveRow => ({
  id: 'x', producer: 'P', cuvee: null, appellationRaw: '', vintage: null, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity: 1, ...o,
});

it('carte de France : toucher Bourgogne ouvre le volet des domaines et le lien vers la cave filtrée', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [], inProgress: [], failed: [] });
  const cave = vi.spyOn(api, 'getCave').mockResolvedValue([
    caveRow({ id: 'a', region: 'Bourgogne', producer: 'Domaine Faiveley', producerKey: 'domaine faiveley', quantity: 8 }),
    caveRow({ id: 'b', region: 'Bourgogne', producer: 'Louis Jadot', producerKey: 'louis jadot', quantity: 2 }),
    caveRow({ id: 'c', region: 'Loire', quantity: 3 }),
  ]);
  mount();
  expect(await screen.findByRole('heading', { name: 'Ma cave en France · 13 btl' })).toBeInTheDocument();
  expect(cave).toHaveBeenCalledWith({});
  await userEvent.click(screen.getByRole('button', { name: 'Bourgogne, 10 bouteilles' }));
  const sheet = screen.getByRole('dialog', { name: 'Bourgogne · 10 bouteilles' });
  expect(within(sheet).getByRole('link', { name: /Domaine Faiveley/ })).toHaveAttribute('href', '/domaine/domaine%20faiveley');
  expect(within(sheet).getByRole('link', { name: /Voir ces 2 vins dans la cave/ })).toHaveAttribute('href', '/cave?region=Bourgogne');
});

it('carte de France aussi pour un membre en lecture seule', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  vi.spyOn(api, 'getCave').mockResolvedValue([caveRow({ region: 'Loire', quantity: 3 })]);
  mount();
  expect(await screen.findByRole('heading', { name: 'Ma cave en France · 3 btl' })).toBeInTheDocument();
});

it('pastilles de régions : la plus fournie d’abord, toucher une pastille ouvre le volet', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue({ toConfirm: [], inProgress: [], failed: [] });
  vi.spyOn(api, 'getCave').mockResolvedValue([
    caveRow({ id: 'c', region: 'Loire', quantity: 3 }),
    caveRow({ id: 'a', region: 'Bourgogne', producer: 'Domaine Faiveley', producerKey: 'domaine faiveley', quantity: 8 }),
  ]);
  mount();
  expect(await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === '2 terroirs actifs')).toBeInTheDocument();
  const chips = screen.getAllByRole('button', { name: /^(Bourgogne|Loire) \d+$/ });
  expect(chips.map((c) => c.textContent)).toEqual(['Bourgogne 8', 'Loire 3']);
  await userEvent.click(chips[1]);
  expect(screen.getByRole('dialog', { name: 'Loire · 3 bouteilles' })).toBeInTheDocument();
});
