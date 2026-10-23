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

it('montre les six onglets au propriétaire, Accords à la place du Journal, Réglages en dernier', async () => {
  mount();
  expect(await screen.findByRole('link', { name: /Entrée/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Accords/ })).toHaveAttribute('href', '/accords');
  expect(screen.queryByRole('link', { name: /Journal/ })).not.toBeInTheDocument();
  expect(labels()).toEqual(['shelvesCave', 'add_circleEntrée', 'remove_circle_outlineSortie', 'restaurantAccords', 'bar_chartStats', 'settingsRéglages']);
});

it.each(['/compte', '/compte/a-propos', '/ma-cave', '/journal', '/admin/comptes'])('allume l’onglet Réglages sur %s', async (path) => {
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

it('disparaît pour un compte sans cave (administrateur sans cave dans l’administration)', async () => {
  const me = vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ isAdmin: true, caves: [], currentCaveId: null }));
  mount();
  await waitFor(() => expect(me).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByLabelText('Navigation principale')).not.toBeInTheDocument();
});
