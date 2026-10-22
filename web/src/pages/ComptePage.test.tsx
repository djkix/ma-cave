import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import { APP_VERSION } from '../lib/version';
import { meFixture, OWNER_CAVE, VIEWER_CAVE, viewerMe } from '../test-fixtures';
import { caveSummary, ComptePage } from './ComptePage';

afterEach(() => vi.restoreAllMocks());

function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/compte']}>
        <ComptePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const plan = (id: string) => ({ id, name: id, width: 1, height: 1, updatedAt: '', analysis: 'NONE' as const, suggestions: [], analysisInfo: null });
const zone = (id: string) => ({ id, name: id, indication: null, hasPhoto: false, sortOrder: 0, marker: null, grid: null });
const member = (id: string) => ({ id, email: `${id}@example.fr`, displayName: null, role: 'VIEWER' as const, pending: false });
const registration = (id: string) => ({ id, email: `${id}@example.fr`, displayName: null, createdAt: '' });
const times = <T,>(n: number, f: (id: string) => T) => Array.from({ length: n }, (_, i) => f(`x${i}`));

function stubSummaries() {
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: times(3, plan), markers: [] });
  vi.spyOn(api, 'getZones').mockResolvedValue(times(12, zone));
  vi.spyOn(api, 'getMembers').mockResolvedValue(times(2, member));
}

it('montre le profil et les quatre cartes au propriétaire administrateur', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ isAdmin: true, displayName: 'djkix', caves: [OWNER_CAVE, VIEWER_CAVE] }));
  stubSummaries();
  vi.spyOn(api, 'getRegistrations').mockResolvedValue(times(2, registration));
  mount();
  expect(await screen.findByText('D')).toBeInTheDocument();
  expect(screen.getByText('djkix')).toBeInTheDocument();
  expect(screen.getByText('proprietaire@example.com')).toBeInTheDocument();

  const moi = screen.getByRole('link', { name: /^Moi/ });
  expect(moi).toHaveAttribute('href', '/compte/moi');
  expect(moi).toHaveTextContent('2 caves');

  const cave = screen.getByRole('link', { name: /^Ma cave/ });
  expect(cave).toHaveAttribute('href', '/ma-cave');
  expect(await within(cave).findByText('3 plans · 12 zones · 2 membres')).toBeInTheDocument();

  const app = screen.getByRole('link', { name: /^Application/ });
  expect(app).toHaveAttribute('href', '/admin');
  expect(await within(app).findByText('2 inscriptions en attente')).toHaveClass('badge--warn');

  const about = screen.getByRole('link', { name: /^À propos/ });
  expect(about).toHaveAttribute('href', '/compte/a-propos');
  expect(about).toHaveTextContent(`Version ${APP_VERSION}`);
});

it('accorde les résumés au singulier et dit « Aucun plan »', () => {
  expect(caveSummary(1, 1, 1)).toBe('1 plan · 1 zone · 1 membre');
  expect(caveSummary(0, 0, 1)).toBe('Aucun plan · 0 zone · 1 membre');
});

it('un plan en cours d’analyse : « Analyse du plan en cours » à la place du résumé de Ma cave', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture());
  stubSummaries();
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [plan('x0'), { ...plan('x1'), analysis: 'PENDING' }], markers: [] });
  mount();
  const cave = await screen.findByRole('link', { name: /^Ma cave/ });
  expect(await within(cave).findByText('Analyse du plan en cours')).toBeInTheDocument();
  expect(within(cave).queryByText(/plans ·/)).not.toBeInTheDocument();
});

it('dit « 1 cave » quand on n’en a qu’une', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture());
  stubSummaries();
  mount();
  const moi = await screen.findByRole('link', { name: /^Moi/ });
  expect(await within(moi).findByText('1 cave')).toBeInTheDocument();
});

it('ne montre à un invité que Moi et À propos, sans rien demander d’autre', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  const calls = [
    vi.spyOn(api, 'getPlans'), vi.spyOn(api, 'getZones'), vi.spyOn(api, 'getMembers'), vi.spyOn(api, 'getRegistrations'),
  ];
  mount();
  expect(await screen.findByRole('link', { name: /^Moi/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /^À propos/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^Ma cave/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^Application/ })).not.toBeInTheDocument();
  for (const c of calls) expect(c).not.toHaveBeenCalled();
});

it('résume l’Application sans inscription en attente', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ isAdmin: true }));
  stubSummaries();
  vi.spyOn(api, 'getRegistrations').mockResolvedValue([]);
  mount();
  const app = await screen.findByRole('link', { name: /^Application/ });
  expect(await within(app).findByText('Comptes, coûts de l’IA, données du vin')).toBeInTheDocument();
});

it('omet le résumé en erreur, la carte reste un lien', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture());
  vi.spyOn(api, 'getPlans').mockRejectedValue(new Error('boum'));
  vi.spyOn(api, 'getZones').mockResolvedValue([]);
  vi.spyOn(api, 'getMembers').mockResolvedValue([]);
  mount();
  const cave = await screen.findByRole('link', { name: /^Ma cave/ });
  expect(cave).toHaveAttribute('href', '/ma-cave');
  expect(cave).not.toHaveTextContent('zone');
});
