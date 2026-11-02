import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import * as api from '../lib/api-client';
import { AccordsPage } from './AccordsPage';

const year = new Date().getFullYear();
const pick = (over: Partial<api.AccordPick> = {}): api.AccordPick => ({
  wineId: 'w1', producer: 'Domaine Raveneau', cuvee: 'Montée de Tonnerre', appellation: 'Chablis 1er cru', vintage: 2019, color: 'BLANC',
  quantity: 2, place: 'Cave 1 / A', score: 92, reason: 'Acidité tranchante pour le beurre',
  apogee: { min: year - 3, max: year, confidence: 'FAIBLE', status: 'A_BOIRE_VITE', reason: null, source: 'REGLE' }, ...over,
});
const result = (over: Partial<api.AccordsResult> = {}): api.AccordsResult => ({
  dish: 'Sole meunière', wineCount: 12, understood: ['Blanc sec', 'Belle acidité'], ideal: 'Un blanc sec et vif', picks: [pick()], ...over,
});

/** Faux SpeechRecognition : le test pilote les résultats et la fin de la dictée. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((e: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => { FakeRecognition.last = this; });
  stop = vi.fn(() => this.onend?.());
}

beforeEach(() => sessionStorage.clear());
/** Téléphone (écran tactile) ou ordinateur : la dictée n'est proposée que sur un écran tactile. */
function setTouch(touch: boolean) {
  window.matchMedia = ((q: string) => ({ matches: touch && q === '(pointer: coarse)', media: q })) as unknown as typeof window.matchMedia;
}

beforeEach(() => setTouch(true));
afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const router = createMemoryRouter(
    [{ path: '/accords', element: <AccordsPage /> }, { path: '/cave/:id', element: <p>Fiche</p> }],
    { initialEntries: ['/accords'] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

it('sans API vocale : champ texte d’office, pas de micro ; texte → vins classés, liens vers la fiche', async () => {
  const post = vi.spyOn(api, 'postAccords').mockResolvedValue(result());
  mount();
  expect(screen.queryByRole('button', { name: 'Dicter le plat' })).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Le plat'), 'Sole meunière');
  await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
  expect(post).toHaveBeenCalledWith('Sole meunière');

  const wines = await screen.findByRole('list', { name: 'Vins proposés' });
  const link = within(wines).getByRole('link', { name: /Domaine Raveneau — Montée de Tonnerre, 2019/ });
  expect(link).toHaveAttribute('href', '/cave/w1');
  expect(within(link).getByText('Chablis 1er cru · Blanc · 2 btl · Cave 1 / A')).toBeInTheDocument();
  expect(within(link).getByText('À boire cette année')).toBeInTheDocument();
  expect(within(link).getByText('92 %')).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Ce que l’IA a compris' })).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Blanc sec', 'Belle acidité']);
});

it('retour depuis la fiche : la même liste, sans nouvel appel (cache puis sessionStorage)', async () => {
  const post = vi.spyOn(api, 'postAccords').mockResolvedValue(result());
  const { router, client } = mount();
  await userEvent.type(screen.getByLabelText('Le plat'), 'Sole meunière');
  await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
  await userEvent.click(await screen.findByRole('link', { name: /Domaine Raveneau/ }));
  expect(await screen.findByText('Fiche')).toBeInTheDocument();
  expect(router.state.location.state).toEqual({ from: '/accords' });
  await act(() => router.navigate('/accords'));
  expect(await screen.findByRole('link', { name: /Domaine Raveneau/ })).toBeInTheDocument();
  expect(post).toHaveBeenCalledTimes(1);

  // Application rechargée (cache vidé) : la liste revient de sessionStorage.
  client.clear();
  document.body.innerHTML = '';
  mount();
  expect(await screen.findByRole('link', { name: /Domaine Raveneau/ })).toBeInTheDocument();
  expect(post).toHaveBeenCalledTimes(1);
});

it('dictée : texte intermédiaire en direct, la fin de la dictée lance la recherche', async () => {
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
  const post = vi.spyOn(api, 'postAccords').mockResolvedValue(result({ dish: 'Daube provençale' }));
  mount();
  expect(screen.queryByLabelText('Le plat')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Dicter le plat' }));
  const rec = FakeRecognition.last!;
  expect(rec.lang).toBe('fr-FR');
  expect(rec.interimResults).toBe(true);
  expect(screen.getByRole('button', { name: 'Arrêter l’écoute' })).toBeInTheDocument();
  act(() => rec.onresult!({ results: [[{ transcript: 'Daube ' }]] }));
  expect(screen.getByText('Daube')).toBeInTheDocument();
  act(() => rec.onresult!({ results: [[{ transcript: 'Daube ' }], [{ transcript: 'provençale' }]] }));
  expect(screen.getByText('Daube provençale')).toBeInTheDocument();
  act(() => rec.onend!());
  expect(post).toHaveBeenCalledWith('Daube provençale');
  expect(await screen.findByRole('link', { name: /Domaine Raveneau/ })).toBeInTheDocument();
});

it('micro refusé : message clair et champ texte', async () => {
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  const post = vi.spyOn(api, 'postAccords');
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Dicter le plat' }));
  act(() => { FakeRecognition.last!.onerror!({ error: 'not-allowed' }); FakeRecognition.last!.onend!(); });
  expect(screen.getByRole('alert')).toHaveTextContent('Micro refusé');
  expect(screen.getByLabelText('Le plat')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

it('« Écrire plutôt » montre le champ texte', async () => {
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Écrire plutôt' }));
  expect(screen.getByLabelText('Le plat')).toBeInTheDocument();
});

it.each([
  ['cave vide', result({ wineCount: 0, understood: [], ideal: null, picks: [] }), /Votre cave est vide/],
  ['aucun vin adapté', result({ picks: [] }), /L’idéal : Un blanc sec et vif/],
])('%s : message', async (_, value, text) => {
  vi.spyOn(api, 'postAccords').mockResolvedValue(value);
  mount();
  await userEvent.type(screen.getByLabelText('Le plat'), 'Sole');
  await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
  expect(await screen.findByText(text)).toBeInTheDocument();
});

it('IA indisponible : le message de l’api, et on peut réessayer', async () => {
  const post = vi.spyOn(api, 'postAccords').mockRejectedValueOnce(new api.ApiError(503, 'Accords impossibles : quota Gemini épuisé')).mockResolvedValueOnce(result());
  mount();
  await userEvent.type(screen.getByLabelText('Le plat'), 'Sole');
  await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Accords impossibles : quota Gemini épuisé');
  await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
  expect(await screen.findByRole('link', { name: /Domaine Raveneau/ })).toBeInTheDocument();
  expect(post).toHaveBeenCalledTimes(2);
});

it('ordinateur (pas d’écran tactile) : pas de micro, le champ texte d’office', () => {
  (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
  setTouch(false);
  mount();
  expect(screen.queryByRole('button', { name: 'Dicter le plat' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Le plat')).toBeInTheDocument();
});

describe('J’ai un vin', () => {
  const row = (over: Partial<api.CaveRow> = {}): api.CaveRow => ({
    id: 'v1', producer: 'Domaine Raveneau', cuvee: 'Montée de Tonnerre', appellationRaw: 'Chablis 1er cru', vintage: 2019,
    color: 'BLANC', formatCl: 75, referencePhotoId: null, quantity: 2, ...over,
  });
  const detail = (pairing: unknown) => ({ wine: { ...row(), pairing } }) as unknown as api.WineDetail;

  it('choisir un vin affiche ses plats en cartes', async () => {
    vi.spyOn(api, 'getCave').mockResolvedValue([row()]);
    vi.spyOn(api, 'getWine').mockResolvedValue(detail({ status: 'DONE', dishes: ['Sole meunière', 'Volaille rôtie'], errorMessage: null, generatedAt: null }));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'J’ai un vin' }));
    await userEvent.click(await screen.findByRole('button', { name: /Raveneau/ }));
    const plats = await screen.findByRole('list', { name: 'Plats conseillés' });
    expect(within(plats).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Sole meunière', 'Volaille rôtie']);
    expect(screen.getByRole('link', { name: /Raveneau/ })).toHaveAttribute('href', '/cave/v1');
  });

  it('vin sans accords : message et lien, aucun POST', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const post = vi.spyOn(api, 'postAccords');
    vi.spyOn(api, 'getCave').mockResolvedValue([row()]);
    vi.spyOn(api, 'getWine').mockResolvedValue(detail(null));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'J’ai un vin' }));
    await userEvent.click(await screen.findByRole('button', { name: /Raveneau/ }));
    expect(await screen.findByText('Pas encore d’accords pour ce vin')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /fiche/i })[0]).toHaveAttribute('href', '/cave/v1');
    expect(post).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('retour sur la page : le vin choisi est restauré', async () => {
    sessionStorage.setItem('accords:entree', JSON.stringify({ mode: 'vin', wineId: 'v1' }));
    vi.spyOn(api, 'getCave').mockResolvedValue([row()]);
    vi.spyOn(api, 'getWine').mockResolvedValue(detail({ status: 'DONE', dishes: ['Sole meunière'], errorMessage: null, generatedAt: null }));
    mount();
    expect(screen.getByRole('button', { name: 'J’ai un vin' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('list', { name: 'Plats conseillés' })).toBeInTheDocument();
  });
});
