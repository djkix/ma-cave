import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import { MouvementsPage } from './MouvementsPage';

afterEach(() => vi.restoreAllMocks());

const wine = { id: 'w1', producer: 'Domaine Tempier', cuvee: 'La Tourtine', appellationRaw: 'Bandol', vintage: 2019 };
const inbox = (toConfirm: number, failed: number) =>
  ({ toConfirm: Array.from({ length: toConfirm }, (_, i) => ({ id: `t${i}` })), inProgress: [], failed: Array.from({ length: failed }, (_, i) => ({ id: `f${i}` })) }) as unknown as api.EntryInbox;

function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/mouvements']}>
        <MouvementsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('propose de rentrer ou de sortir du vin', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(0, 0));
  mount();
  expect(screen.getByRole('link', { name: /Rentrer/ })).toHaveAttribute('href', '/entree');
  expect(screen.getByRole('link', { name: /Sortir/ })).toHaveAttribute('href', '/sortie');
  expect(screen.getByRole('link', { name: /Voir le journal complet/ })).toHaveAttribute('href', '/journal');
});

it('mène aux vins à confirmer (à valider et lecture impossible)', async () => {
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(2, 1));
  mount();
  const links = await screen.findAllByRole('link', { name: /3 vins à confirmer/ });
  expect(links.map((l) => l.getAttribute('href'))).toContain('/a-confirmer');
});

it('sans vin à confirmer, pas de ligne « à confirmer »', async () => {
  const read = vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(0, 0));
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  mount();
  await waitFor(() => expect(read).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText(/à confirmer/)).not.toBeInTheDocument();
});

it('montre les dix derniers mouvements', async () => {
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(0, 0));
  const recent = vi.spyOn(api, 'getRecentMovements').mockResolvedValue([
    { id: 'm1', delta: -1, type: 'OUT', occurredAt: '2026-11-20T10:00:00Z', note: null, reversesId: null, locationId: null, locationLabel: null, wine } as api.MovementWithWine,
  ]);
  mount();
  expect(await screen.findByText(/Sortie · Domaine Tempier/)).toBeInTheDocument();
  expect(recent).toHaveBeenCalledWith(10);
});

it('sans mouvement : le dit', async () => {
  vi.spyOn(api, 'getEntryInbox').mockResolvedValue(inbox(0, 0));
  vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  mount();
  expect(await screen.findByText('Aucun mouvement pour l’instant.')).toBeInTheDocument();
});
