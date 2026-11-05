import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import * as api from '../lib/api-client';
import { AccordsPage } from './AccordsPage';

// Base d'accords de test : l'écran ne dépend pas de la vraie base.
vi.mock('../lib/accords-base/data', () => ({
  DISHES: [
    { id: 'poulet', name: 'Poulet', category: 'PLAT', keywords: ['poulet', 'volaille'], colors: ['ROUGE', 'BLANC'], tannin: 'LEGER', aromas: ['fruits rouges'], classics: ['Bourgogne'] },
    { id: 'champignons', name: 'Champignons', category: 'PLAT', keywords: ['champignons', 'morilles'], colors: ['BLANC'], tannin: null, aromas: [] },
    { id: 'agneau', name: 'Agneau', category: 'PLAT', keywords: ['agneau'], colors: ['ROUGE'], tannin: 'MOYEN', aromas: [] },
    { id: 'comte', name: 'Comté', category: 'FROMAGE', keywords: ['comté'], colors: ['BLANC'], tannin: null, aromas: [], classics: ['Jura'] },
    { id: 'huitres', name: 'Huîtres', category: 'ENTREE', keywords: ['huîtres'], colors: ['BLANC'], tannin: null, aromas: [] },
  ],
}));

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
/** Cave de la base locale : un rouge de Bourgogne, un blanc du Jura. */
const caveRow = (over: Partial<api.CaveRow> = {}): api.CaveRow => ({
  id: 'r1', producer: 'Domaine Rouge', cuvee: null, appellationRaw: 'Bourgogne', vintage: 2020, color: 'ROUGE', formatCl: 75,
  referencePhotoId: null, quantity: 2, tannin: 'LEGER', aromas: ['fruits rouges'], ...over,
});
const CAVE = [caveRow(), caveRow({ id: 'b1', producer: 'Domaine Jaune', appellationRaw: 'Arbois', color: 'BLANC', tannin: null, aromas: [], region: 'Jura' })];
beforeEach(() => { vi.spyOn(api, 'getCave').mockResolvedValue(CAVE); vi.spyOn(api, 'getTastedPairings').mockResolvedValue([]); });
afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } }), entry = '/accords') {
  const router = createMemoryRouter(
    [{ path: '/accords', element: <AccordsPage /> }, { path: '/cave/:id', element: <p>Fiche</p> }],
    { initialEntries: [entry] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, client };
}

/** Plat écrit puis validé ; l'IA est demandée ensuite, par son bouton. */
async function askAi(dish: string) {
  await userEvent.type(await screen.findByLabelText('Le plat'), dish);
  await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
  await userEvent.click(screen.getByRole('button', { name: 'Demander à l’IA' }));
}

it('arrivée depuis un accord de la fiche (?plat=) : accord local sur ce plat, sans IA', async () => {
  const post = vi.spyOn(api, 'postAccords');
  const { router } = mount(undefined, '/accords?plat=Volaille%20r%C3%B4tie');
  expect(screen.getByText('Poulet', { selector: 'strong' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /^Domaine Rouge/ })).toHaveAttribute('href', '/cave/r1');
  expect(post).not.toHaveBeenCalled();
  // Lu puis retiré de l'adresse : il ne réimpose plus ce plat ensuite.
  expect(router.state.location.search).toBe('');
});

it('?plat= non reconnu : message et bouton IA, pas d’appel automatique', async () => {
  const post = vi.spyOn(api, 'postAccords').mockResolvedValue(result({ dish: 'Daube provençale' }));
  mount(undefined, '/accords?plat=Daube%20proven%C3%A7ale');
  expect(screen.getByText('Plat non reconnu dans la base.')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Demander à l’IA' }));
  await screen.findByRole('list', { name: 'À ouvrir ce soir' });
  expect(post).toHaveBeenCalledWith('Daube provençale');
});

it('accord local immédiat sur l’ingrédient dominant, bascule vers un autre ingrédient reconnu', async () => {
  const post = vi.spyOn(api, 'postAccords');
  mount();
  await userEvent.type(screen.getByLabelText('Le plat'), 'Poulet aux morilles');
  await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
  expect(screen.getByText('Poulet', { selector: 'strong' })).toBeInTheDocument();
  const row = await screen.findByRole('link', { name: /^Domaine Rouge, 2020/ });
  expect(within(row).getByText('Bourgogne · Rouge · 2 btl')).toBeInTheDocument();
  expect(within(row).getByText(/Excellent accord/)).toBeInTheDocument();
  expect(within(row).getByText(/Accord classique : Bourgogne · Rouge comme conseillé · tanin léger · fruits rouges/)).toBeInTheDocument();
  expect(screen.queryByRole('tablist', { name: 'Rubriques' })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Plutôt : Champignons' }));
  expect(screen.getByText('Champignons', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /^Domaine Jaune/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^Domaine Rouge/ })).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

it('suggestions pendant la frappe : toucher une entrée lance l’accord', async () => {
  const post = vi.spyOn(api, 'postAccords');
  mount();
  await userEvent.type(screen.getByLabelText('Le plat'), 'v');
  expect(screen.queryByRole('list', { name: 'Suggestions' })).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Le plat'), 'ol');
  const list = screen.getByRole('list', { name: 'Suggestions' });
  await userEvent.click(within(list).getByRole('button', { name: 'Poulet' }));
  expect(screen.getByText('Poulet', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByLabelText('Le plat')).toHaveValue('Poulet');
  expect(screen.queryByRole('list', { name: 'Suggestions' })).not.toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /^Domaine Rouge/ })).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

it('Parcourir : onglets au clavier, pastilles en ordre alphabétique, une pastille lance l’accord', async () => {
  mount();
  const tabs = within(screen.getByRole('tablist', { name: 'Rubriques' })).getAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual(['Entrées', 'Plats', 'Fromages', 'Desserts']);
  expect(screen.getByRole('tab', { name: 'Plats' })).toHaveAttribute('aria-selected', 'true');
  expect(within(screen.getByRole('tabpanel')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Agneau', 'Champignons', 'Poulet']);
  screen.getByRole('tab', { name: 'Plats' }).focus();
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Fromages' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Fromages' })).toHaveFocus();
  await userEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Comté' }));
  expect(screen.getByText('Comté', { selector: 'strong' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /^Domaine Jaune/ })).toBeInTheDocument();
  expect(screen.queryByRole('tablist', { name: 'Rubriques' })).not.toBeInTheDocument();
});

it('plat non reconnu : message, bouton IA et Parcourir, sans appel', async () => {
  const post = vi.spyOn(api, 'postAccords');
  mount();
  await userEvent.type(screen.getByLabelText('Le plat'), 'Soupe miso');
  await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
  expect(screen.getByText('Plat non reconnu dans la base.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Demander à l’IA' })).toBeInTheDocument();
  expect(screen.getByRole('tablist', { name: 'Rubriques' })).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

it('sans API vocale : champ texte d’office, pas de micro ; texte → vins classés, liens vers la fiche', async () => {
  const post = vi.spyOn(api, 'postAccords').mockResolvedValue(result());
  mount();
  expect(screen.queryByRole('button', { name: 'Dicter le plat' })).not.toBeInTheDocument();
  await askAi('Sole meunière');
  expect(post).toHaveBeenCalledWith('Sole meunière');

  const wines = await screen.findByRole('list', { name: 'À ouvrir ce soir' });
  const link = within(wines).getByRole('link', { name: /^Domaine Raveneau — Montée de Tonnerre, 2019/ });
  expect(link).toHaveAttribute('href', '/cave/w1');
  expect(within(link).getByText('Chablis 1er cru · Blanc · 2 btl · Cave 1 / A')).toBeInTheDocument();
  expect(within(link).getByText(`À boire vite, fin d’apogée en ${year}`)).toBeInTheDocument();
  expect(within(link).getByText(/Excellent accord/)).toBeInTheDocument();
  expect(screen.queryByText('92 %')).not.toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Ce que l’IA a compris' })).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Blanc sec', 'Belle acidité']);
});

it('retour depuis la fiche : la même liste, sans nouvel appel (cache puis sessionStorage)', async () => {
  const post = vi.spyOn(api, 'postAccords').mockResolvedValue(result());
  const { router, client } = mount();
  await askAi('Sole meunière');
  await userEvent.click(await screen.findByRole('link', { name: /^Domaine Raveneau/ }));
  expect(await screen.findByText('Fiche')).toBeInTheDocument();
  expect(router.state.location.state).toEqual({ from: '/accords' });
  await act(() => router.navigate('/accords'));
  expect(await screen.findByRole('link', { name: /^Domaine Raveneau/ })).toBeInTheDocument();
  expect(post).toHaveBeenCalledTimes(1);

  // Application rechargée (cache vidé) : la liste revient de sessionStorage.
  client.clear();
  document.body.innerHTML = '';
  mount();
  expect(await screen.findByRole('link', { name: /^Domaine Raveneau/ })).toBeInTheDocument();
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
  expect(screen.getByText('Plat non reconnu dans la base.')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Demander à l’IA' }));
  expect(post).toHaveBeenCalledWith('Daube provençale');
  expect(await screen.findByRole('link', { name: /^Domaine Raveneau/ })).toBeInTheDocument();
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
  await askAi('Sole');
  expect(await screen.findByText(text)).toBeInTheDocument();
});

it('IA indisponible : le message de l’api, et on peut réessayer', async () => {
  const post = vi.spyOn(api, 'postAccords').mockRejectedValueOnce(new api.ApiError(503, 'Accords impossibles : quota Gemini épuisé')).mockResolvedValueOnce(result());
  mount();
  await askAi('Sole');
  expect(await screen.findByRole('alert')).toHaveTextContent('Accords impossibles : quota Gemini épuisé');
  await userEvent.click(screen.getByRole('button', { name: 'Demander à l’IA' }));
  expect(await screen.findByRole('link', { name: /^Domaine Raveneau/ })).toBeInTheDocument();
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

  it('filtres couleur, région et millésime transmis à la recherche ; compte des vins', async () => {
    const cave = vi.spyOn(api, 'getCave').mockImplementation(async (f) =>
      (Object.keys(f ?? {}).length ? [row()] : [row(), row({ id: 'v2', producer: 'Domaine Tempier', color: 'ROUGE', region: 'Provence' })]));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'J’ai un vin' }));
    expect(await screen.findByText('2 vins')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Couleur'), 'BLANC');
    await userEvent.selectOptions(screen.getByLabelText('Région'), 'Provence');
    await userEvent.type(screen.getByLabelText('Millésime'), '2019');
    await waitFor(() => expect(cave).toHaveBeenCalledWith({ color: 'BLANC', region: 'Provence', vintageMin: 2019, vintageMax: 2019 }));
    expect(await screen.findByText('1 vin')).toBeInTheDocument();
  });

  it('choisir un vin : plats de la base par rubrique, puis ceux de l’IA, tous cliquables', async () => {
    vi.spyOn(api, 'getCave').mockResolvedValue([row()]);
    vi.spyOn(api, 'getWine').mockResolvedValue(detail({ status: 'DONE', dishes: ['Sole meunière', 'Volaille rôtie'], errorMessage: null, generatedAt: null }));
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'J’ai un vin' }));
    await userEvent.click(await screen.findByRole('button', { name: /Raveneau/ }));
    const ia = await screen.findByRole('region', { name: 'Conseillés par l’IA' });
    expect(within(ia).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sole meunière', 'Volaille rôtie']);
    // Chablis : les huîtres sont un accord classique de la base.
    expect(within(screen.getByRole('region', { name: 'Entrées' })).getByRole('button', { name: 'Huîtres' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Raveneau/ })).toHaveAttribute('href', '/cave/v1');

    // Un plat ouvre « J'ai un plat » sur ce plat, accord immédiat de la base.
    await userEvent.click(within(ia).getByRole('button', { name: 'Volaille rôtie' }));
    expect(screen.getByRole('button', { name: 'J’ai un plat' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === 'Accord sur : Poulet')).toBeInTheDocument();
    expect(screen.getByLabelText('Le plat')).toHaveValue('Volaille rôtie');
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
    expect(await screen.findByRole('region', { name: 'Conseillés par l’IA' })).toBeInTheDocument();
  });
});

it('recherche en cours : secondes écoulées, puis explication si l’IA est lente', async () => {
  setTouch(false);
  vi.spyOn(api, 'postAccords').mockReturnValue(new Promise(() => undefined));
  mount();
  await userEvent.type(await screen.findByLabelText('Le plat'), 'côte de bœuf');
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    await userEvent.click(screen.getByRole('button', { name: 'Proposer des vins' }));
    await userEvent.click(screen.getByRole('button', { name: 'Demander à l’IA' }));
    expect(await screen.findByText(/Je cherche dans votre cave/)).toBeInTheDocument();
    expect(screen.getByText('0 s')).toBeInTheDocument();
    expect(screen.queryByText(/L’IA est lente/)).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(21_000); });
    expect(screen.getByText('21 s')).toBeInTheDocument();
    expect(screen.getByText(/L’IA est lente/)).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it('groupes selon le moment du vin et vue d’ensemble repliable avec un point par vin', async () => {
  vi.spyOn(api, 'postAccords').mockResolvedValue(result({ picks: [
    pick({ wineId: 'passe', producer: 'Château Lieujean', cuvee: null, vintage: 2005, score: 95, apogee: { min: 2012, max: year - 1, confidence: null, status: 'PASSEE', reason: null, source: 'REGLE' } }),
    pick({ wineId: 'jeune', producer: 'Pauillac', cuvee: null, score: 90, apogee: { min: year + 3, max: year + 20, confidence: null, status: 'TROP_JEUNE', reason: null, source: 'REGLE' } }),
    pick({ wineId: 'point', producer: 'Pommard', cuvee: null, score: 72, apogee: { min: year - 4, max: year + 6, confidence: null, status: 'A_BOIRE', reason: null, source: 'REGLE' } }),
  ] }));
  mount();
  await askAi('Magret');
  const lists = await screen.findAllByRole('list');
  expect(lists.map((l) => l.getAttribute('aria-label')).filter((n) => n !== 'Ce que l’IA a compris'))
    .toEqual(['À ouvrir ce soir', 'À surveiller : apogée dépassée', 'Bel accord, mais à garder']);
  const tonight = screen.getByRole('list', { name: 'À ouvrir ce soir' });
  expect(within(tonight).getByText(/Bon accord/)).toBeInTheDocument();
  expect(within(tonight).getByText(`À son apogée, jusqu’en ${year + 6}`)).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'À surveiller : apogée dépassée' })).getByText(`Apogée dépassée depuis ${year - 1}, risque de déclin`)).toBeInTheDocument();
  expect(within(screen.getByRole('list', { name: 'Bel accord, mais à garder' })).getByText(`Trop jeune, attendre ${year + 3}`)).toBeInTheDocument();
  expect(screen.getByText('Vue d’ensemble')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '1. Château Lieujean, 2005' })).toHaveAttribute('href', '/cave/passe');
});
