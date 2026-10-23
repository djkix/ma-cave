import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../lib/api-client';
import { GeminiModelSection } from './GeminiModelSection';

afterEach(() => vi.restoreAllMocks());

const LIMITS = { rpm: 5, tpm: 250000, rpd: 20 };
const quota = (over: Partial<api.GeminiQuotaUsage> = {}): api.GeminiQuotaUsage => ({
  current: 'gemini-3.5-flash-lite',
  minute: { requests: 1, tokens: 2700 },
  dayResetsAt: '2026-10-22T07:00:00.000Z',
  models: [
    { model: 'gemini-3.5-flash', requests: 20, limits: LIMITS, exhaustedUntil: '2026-10-22T07:00:00.000Z', asideUntil: null },
    { model: 'gemini-3.5-flash-lite', requests: 7, limits: { rpm: 10, tpm: 250000, rpd: 1000 }, exhaustedUntil: null, asideUntil: null },
  ],
  error: null,
  ...over,
});

const mount = (q = quota()) => {
  vi.spyOn(api, 'getGeminiQuota').mockResolvedValue(q);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GeminiModelSection />
    </QueryClientProvider>,
  );
};
const text = (el: Element | null) => el?.textContent?.replace(/\s/g, ' ');

it('titre, règle du choix automatique, modèle en cours en évidence, aucun sélecteur de modèle', async () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Modèle Gemini (automatique)' })).toBeInTheDocument();
  expect(screen.getByText('L’application choisit seule le modèle : le plus récent dont le quota du jour n’est pas atteint et qui répond normalement, puis le suivant. Un modèle lent ou saturé est mis de côté 15 minutes.')).toBeInTheDocument();
  expect((await screen.findByText('gemini-3.5-flash-lite', { selector: 'strong' })).tagName).toBe('STRONG');
  expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && text(el) === 'Cette minute : 1 / 10 requêtes, 2 700 / 250 000 jetons')).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('modèles dans l’ordre d’emploi : requêtes du jour, épuisé signalé', async () => {
  mount();
  await screen.findByRole('group', { name: 'Modèles, dans l’ordre d’emploi' });
  expect(screen.getAllByRole('listitem').map(text)).toEqual([
    'gemini-3.5-flash : 20 / 20 requêtes aujourd’hui épuisé jusqu’à 09:00',
    'gemini-3.5-flash-lite : 7 / 1 000 requêtes aujourd’hui',
  ]);
});

it('limites du modèle en cours par défaut, puis du modèle sélectionné dans la liste', async () => {
  mount();
  expect(await screen.findByRole('heading', { name: 'Limites de gemini-3.5-flash-lite' })).toBeInTheDocument();
  expect(screen.getByLabelText('Requêtes par minute')).toHaveValue(10);
  expect(screen.getByLabelText('Requêtes par jour')).toHaveValue(1000);
  await userEvent.click(screen.getByRole('radio', { name: /^gemini-3\.5-flash :/ }));
  expect(screen.getByRole('heading', { name: 'Limites de gemini-3.5-flash' })).toBeInTheDocument();
  expect(screen.getByLabelText('Requêtes par minute')).toHaveValue(5);
  expect(screen.getByLabelText('Requêtes par jour')).toHaveValue(20);
});

it('« Enregistrer les limites » : envoie le modèle sélectionné et les trois valeurs, puis confirme', async () => {
  mount();
  const put = vi.spyOn(api, 'putGeminiQuota').mockResolvedValue(quota());
  await userEvent.click(await screen.findByRole('radio', { name: /^gemini-3\.5-flash :/ }));
  const rpd = screen.getByLabelText('Requêtes par jour');
  await userEvent.clear(rpd);
  await userEvent.type(rpd, '500');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les limites' }));
  expect(put).toHaveBeenCalledWith('gemini-3.5-flash', { rpm: 5, tpm: 250000, rpd: 500 });
  expect(await screen.findByRole('status')).toHaveTextContent('Limites enregistrées : elles s’appliquent dès le prochain appel.');
});

it('limites refusées par l’api : son message tel quel', async () => {
  mount();
  vi.spyOn(api, 'putGeminiQuota').mockRejectedValue(new Error('Limites invalides : entiers positifs attendus'));
  const rpm = await screen.findByLabelText('Requêtes par minute');
  await userEvent.clear(rpm);
  await userEvent.type(rpm, '0');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les limites' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Limites invalides : entiers positifs attendus');
});

it('tous les modèles épuisés : heure de reprise, limites du premier', async () => {
  mount(quota({ current: null, models: [{ model: 'gemini-3.5-flash', requests: 20, limits: LIMITS, exhaustedUntil: '2026-10-22T07:00:00.000Z', asideUntil: null }] }));
  expect(await screen.findByText('Tous les modèles ont atteint leur quota du jour : reprise à 09:00.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Limites de gemini-3.5-flash' })).toBeInTheDocument();
});

it('modèle lent ou saturé : badge avec l’heure de reprise ; tous écartés : la reprise la plus proche', async () => {
  mount(quota({
    current: null,
    models: [
      { model: 'gemini-3.8-flash', requests: 3, limits: LIMITS, exhaustedUntil: null, asideUntil: '2026-10-21T12:20:00.000Z' },
      { model: 'gemini-3.6-flash', requests: 20, limits: LIMITS, exhaustedUntil: '2026-10-22T07:00:00.000Z', asideUntil: null },
    ],
  }));
  expect(await screen.findByText('lent ou saturé, repris à 14:20')).toHaveClass('badge');
  expect(screen.getByText('épuisé jusqu’à 09:00')).toBeInTheDocument();
  expect(screen.getByText('Tous les modèles sont épuisés ou mis de côté : reprise à 14:20.')).toBeInTheDocument();
});

it('liste de Google indisponible : l’erreur de l’api en clair', async () => {
  mount(quota({ error: 'Liste des modèles indisponible : Google a répondu 503' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Liste des modèles indisponible : Google a répondu 503');
  await waitFor(() => expect(screen.getByLabelText('Requêtes par minute')).toHaveValue(10));
});
