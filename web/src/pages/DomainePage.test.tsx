import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import * as api from '../lib/api-client';
import { meFixture } from '../test-fixtures';
import { DomainePage } from './DomainePage';

afterEach(() => vi.restoreAllMocks());

const page: api.ProducerPage = {
  profile: {
    key: 'domaine tempier', displayName: 'Domaine Tempier', status: 'DONE', description: null,
    fields: { histoire: 'Fondé en 1834.', terroir: 'Argilo-calcaire.', cepages: 'Mourvèdre.', style: 'Puissant.', nez: 'Garrigue.' },
    manualFields: [], source: 'GEMINI', errorMessage: null, generatedAt: null, updatedBy: null,
  },
  wines: [{ id: 'w1', cuvee: 'La Tourtine', vintage: 2019, color: 'ROUGE', quantity: 6, referencePhotoId: null }],
};

function mount(key = 'domaine tempier', admin = false) {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture({ isAdmin: admin }));
  const router = createMemoryRouter(
    [{ path: '/domaine/:key', element: <DomainePage /> }, { path: '/cave/:id', element: <p>Fiche</p> }],
    { initialEntries: [`/domaine/${encodeURIComponent(key)}`] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

it('affiche les cinq champs et les vins', async () => {
  vi.spyOn(api, 'getProducer').mockResolvedValue(page);
  mount();
  for (const t of ['Histoire', 'Terroir', 'Cépages', 'Style', 'Nez']) expect(await screen.findByRole('heading', { name: t })).toBeInTheDocument();
  expect(screen.getByText('Fondé en 1834.')).toBeInTheDocument();
  expect(screen.getByText('Garrigue.')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: /La Tourtine/ });
  expect(link).toHaveAttribute('href', '/cave/w1');
  expect(link).toHaveTextContent('2019');
  expect(link).toHaveTextContent('6');
});

it('un membre ne voit pas Corriger', async () => {
  vi.spyOn(api, 'getProducer').mockResolvedValue(page);
  mount();
  await screen.findByText('Fondé en 1834.');
  expect(screen.queryByRole('button', { name: /Corriger/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Régénérer' })).not.toBeInTheDocument();
});

it('un administrateur corrige un champ', async () => {
  vi.spyOn(api, 'getProducer').mockResolvedValue(page);
  const save = vi.spyOn(api, 'setProducerField').mockResolvedValue(page.profile!);
  mount('domaine tempier', true);
  await userEvent.click((await screen.findAllByRole('button', { name: 'Corriger' }))[1]);
  const ta = screen.getByRole('textbox');
  expect(ta).toHaveAttribute('maxlength', '600');
  await userEvent.clear(ta);
  await userEvent.type(ta, 'Calcaire.');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith('domaine tempier', 'terroir', 'Calcaire.'));
  expect(screen.getByRole('button', { name: 'Régénérer' })).toBeInTheDocument();
});

it('annonce la préparation et l’ignorance de l’IA', async () => {
  vi.spyOn(api, 'getProducer').mockResolvedValue({ ...page, profile: { ...page.profile!, status: 'PENDING', fields: { histoire: null, terroir: null, cepages: null, style: null, nez: null } } });
  mount();
  expect(await screen.findByText('Fiche du domaine en préparation')).toBeInTheDocument();
});

it('fiche en échec : indisponible, pas en préparation', async () => {
  vi.spyOn(api, 'getProducer').mockResolvedValue({ ...page, profile: { ...page.profile!, status: 'FAILED', fields: { histoire: null, terroir: null, cepages: null, style: null, nez: null } } });
  mount();
  expect(await screen.findByText('Fiche du domaine indisponible')).toBeInTheDocument();
  expect(screen.queryByText('Fiche du domaine en préparation')).toBeNull();
});

it('Domaine inconnu de l’IA', async () => {
  vi.spyOn(api, 'getProducer').mockResolvedValue({ ...page, profile: { ...page.profile!, status: 'UNKNOWN', fields: { histoire: null, terroir: null, cepages: null, style: null, nez: null } } });
  mount();
  expect(await screen.findByText('Domaine inconnu de l’IA')).toBeInTheDocument();
});

it('charge une clé accentuée', async () => {
  const get = vi.spyOn(api, 'getProducer').mockResolvedValue(page);
  const router = mount('château x');
  await screen.findByText('Fondé en 1834.');
  expect(router.state.location.pathname).toBe(`/domaine/${encodeURIComponent('château x')}`);
  expect(get).toHaveBeenCalledWith('château x');
});
