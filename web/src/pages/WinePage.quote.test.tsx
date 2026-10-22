import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/api-client';
import { viewerMe } from '../test-fixtures';
import { WinePage } from './WinePage';

afterEach(() => vi.restoreAllMocks());

const SEARCH = 'https://www.idealwine.com/fr/acheter-du-vin/recherche-domaine%20tempier%20la%20tourtine';
const searchLinks: api.SearchLink[] = [
  { site: 'idealwine', label: 'iDealwine', hint: 'enchères', url: SEARCH },
  { site: 'wine-searcher', label: 'Wine-Searcher', hint: 'prix moyen chez les cavistes', url: 'https://www.wine-searcher.com/find/domaine+tempier+la+tourtine' },
  { site: 'vivino', label: 'Vivino', hint: 'prix boutique et note', url: 'https://www.vivino.com/search/wines?q=domaine%20tempier%20la%20tourtine' },
];
const base: api.WineDetail = {
  wine: {
    id: 'w1', producer: 'Domaine Tempier', cuvee: 'La Tourtine', appellationRaw: 'Bandol', vintage: 2019, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity: 6,
    referencePhotoSource: null, referencePhotoSourceUrl: null, pairing: null, producerKey: null, producerProfile: null,
  },
  movements: [],
};
const viewerDetail = base;

let client: QueryClient;
function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cave/w1']}>
        <Routes><Route path="/cave/:wineId" element={<WinePage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('propriétaire : bloc « Cote » sans cote', async () => {
  vi.spyOn(api, 'getWine').mockResolvedValue({ ...base, quote: null, searchLinks, idealwineUrl: SEARCH, savedUrl: null });
  mount();
  expect(await screen.findByRole('heading', { name: 'Cote' })).toBeInTheDocument();
  expect(screen.getByText('Pas encore de cote')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Voir sur iDealwine (nouvel onglet)' })).toHaveAttribute('href', SEARCH);
  expect(screen.getByRole('link', { name: 'Voir sur Vivino (nouvel onglet)' })).toHaveAttribute('href', searchLinks[2].url);
});

it('propriétaire : bloc avec la cote courante', async () => {
  vi.spyOn(api, 'getWine').mockResolvedValue({
    ...base,
    quote: { coteCents: 8500, nTransactions: 12, quotedOn: '2026-03-03', sourceUrl: null, site: null, source: null, enteredBy: 'djkix', cessionCents: 7328 },
    searchLinks, idealwineUrl: SEARCH, savedUrl: null,
  });
  mount();
  expect(await screen.findByText(/^85 € — 12 transactions — cote du 3 mars 2026/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeInTheDocument();
});

it('membre : aucun bloc de cote, aucune requête de cote', async () => {
  const me = vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  const create = vi.spyOn(api, 'createQuote');
  vi.spyOn(api, 'getWine').mockResolvedValue(viewerDetail);
  mount();
  expect(await screen.findByRole('heading', { name: /Domaine Tempier/ })).toBeInTheDocument();
  await waitFor(() => expect(me).toHaveBeenCalled());
  // Session chargée et page rendue avec le rôle de membre (avant, rien n'est autorisé : le test serait vide).
  await waitFor(() => expect(client.getQueryState(['me'])?.status).toBe('success'));
  expect(screen.queryByRole('heading', { name: 'Cote' })).not.toBeInTheDocument();
  expect(screen.queryByText(/iDealwine|Vivino|Wine-Searcher|Pas encore de cote|cession/)).not.toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
});

it('membre : même si des clés de cote arrivaient, rien n’est affiché', async () => {
  const me = vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  vi.spyOn(api, 'getWine').mockResolvedValue({ ...base, quote: null, searchLinks, idealwineUrl: SEARCH, savedUrl: null });
  mount();
  expect(await screen.findByRole('heading', { name: /Domaine Tempier/ })).toBeInTheDocument();
  await waitFor(() => expect(me).toHaveBeenCalled());
  // Session chargée et page rendue avec le rôle de membre (avant, rien n'est autorisé : le test serait vide).
  await waitFor(() => expect(client.getQueryState(['me'])?.status).toBe('success'));
  expect(screen.queryByRole('heading', { name: 'Cote' })).not.toBeInTheDocument();
});

it('propriétaire, fiche sans clés de cote (ancienne api) : pas de bloc', async () => {
  vi.spyOn(api, 'getWine').mockResolvedValue(viewerDetail);
  mount();
  expect(await screen.findByRole('heading', { name: /Domaine Tempier/ })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Cote' })).not.toBeInTheDocument();
});
