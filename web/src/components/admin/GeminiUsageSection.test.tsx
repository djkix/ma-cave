import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as api from '../../lib/api-client';
import { GeminiUsageSection } from './GeminiUsageSection';

afterEach(() => vi.restoreAllMocks());

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GeminiUsageSection />
    </QueryClientProvider>,
  );

const usage = (over: Partial<api.GeminiUsage> = {}): api.GeminiUsage => ({
  rows: [
    { day: '2026-10-08', usage: 'LECTURE_ENTREE', ok: 3, refused503: 2, refused429: 1, errors: 1, costCents: 12 },
    { day: '2026-10-07', usage: 'ACCORDS', ok: 5, refused503: 0, refused429: 0, errors: 0, costCents: 1 },
  ],
  totals: { ok: 8, refused: 3, errors: 1, costCents: 13 },
  pause: { until: null, reason: null },
  ...over,
});

it('affiche une ligne par jour et par usage, et les totaux', async () => {
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValue(usage());
  mount();
  const table = await screen.findByRole('table');
  const row = within(table).getByText('Lecture à l’entrée').closest('tr')!;
  expect(within(row).getByText('08/10')).toBeInTheDocument();
  expect(within(row).getAllByRole('cell').map((c) => c.textContent?.replace(/\s/g, ' '))).toEqual(['08/10', 'Lecture à l’entrée', '3', '2', '1', '1', '0,12 €']);
  expect(within(table).getByText('Accords').closest('tr')).toHaveTextContent('07/10');
  for (const h of ['Jour', 'Usage', 'Réussis', 'Refusés (saturé)', 'Refusés (quota)', 'Erreurs', 'Coût']) {
    expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
  }
  expect(screen.getByText(/Total : 8 réussis, 3 refusés, 1 erreur/)).toHaveTextContent('0,13 €');
  expect(screen.getByText(/compte dans ses statistiques de requêtes mais n'est pas facturé/)).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: /pause/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/aucun appel n'est envoyé/)).not.toBeInTheDocument();
});

it('annonce une pause en cours, heure de Paris', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-08T12:00:00.000Z').getTime());
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValue(usage({ pause: { until: '2026-10-08T12:05:00.000Z', reason: 'modèle saturé' } }));
  mount();
  expect(await screen.findByText(`Gemini en pause jusqu'à 14:05 (modèle saturé) : aucun appel n'est envoyé d'ici là.`)).toBeInTheDocument();
});

it('n’affiche plus une pause échue', async () => {
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValue(usage({ pause: { until: new Date(Date.now() - 1000).toISOString(), reason: 'modèle saturé' } }));
  mount();
  await screen.findByRole('table');
  expect(screen.queryByText(/aucun appel n'est envoyé/)).not.toBeInTheDocument();
});

it('7 jours par défaut, 30 jours au choix', async () => {
  const get = vi.spyOn(api, 'getGeminiUsage').mockResolvedValue(usage());
  mount();
  await screen.findByRole('table');
  expect(get).toHaveBeenCalledWith(7);
  expect(screen.getByRole('button', { name: '7 jours' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: '30 jours' }));
  await waitFor(() => expect(get).toHaveBeenCalledWith(30));
  expect(screen.getByRole('button', { name: '30 jours' })).toHaveAttribute('aria-pressed', 'true');
});

it('période vide : aucun tableau', async () => {
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValueOnce(usage({ rows: [], totals: { ok: 0, refused: 0, errors: 0, costCents: 0 } }));
  mount();
  expect(await screen.findByText('Aucun appel à Gemini sur 7 jours.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByText('Détail par jour')).not.toBeInTheDocument();
});

it('dit quand la consommation ne se charge pas', async () => {
  vi.spyOn(api, 'getGeminiUsage').mockRejectedValue(new Error('boom'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la consommation Gemini.');
});

const chart = (): api.GeminiUsage => usage({
  rows: [
    { day: '2026-10-18', usage: 'LECTURE_ENTREE', ok: 10, refused503: 1, refused429: 1, errors: 0, costCents: 30 },
    { day: '2026-10-18', usage: 'ACCORDS', ok: 2, refused503: 0, refused429: 0, errors: 0, costCents: 5 },
    { day: '2026-10-17', usage: 'DESCRIPTIF', ok: 7, refused503: 0, refused429: 0, errors: 0, costCents: 18 },
  ],
  totals: { ok: 19, refused: 2, errors: 0, costCents: 53 },
});
const segments = (bar: HTMLElement) => Array.from(bar.querySelectorAll<HTMLElement>('.usage-chart__seg'));

it('trois chiffres clés : coût, réussis, refusés en % des appels', async () => {
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValue(chart());
  mount();
  const figure = (label: string) => screen.getByText(label, { selector: '.list__meta' }).parentElement!;
  await screen.findByRole('table');
  expect(figure('Coût')).toHaveTextContent('0,53 €');
  expect(figure('Réussis')).toHaveTextContent('19');
  // 2 refus sur 21 appels : 9,5 % arrondi.
  expect(figure('Refusés')).toHaveTextContent('10 %');
});

it('une barre empilée par jour, du plus ancien au plus récent, et la légende des cinq usages', async () => {
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValue(chart());
  mount();
  const day18 = await screen.findByRole('img', { name: '18/10 : 14 appels, 0,35 €' });
  const day17 = screen.getByRole('img', { name: '17/10 : 7 appels, 0,18 €' });
  expect(screen.getAllByRole('img')).toEqual([day17, day18]);
  // Hauteurs rapportées au jour le plus chargé (14 appels).
  expect(segments(day18).map((s) => s.style.height)).toEqual(['85.71%', '14.29%']);
  expect(segments(day17).map((s) => s.style.height)).toEqual(['50%']);
  const legend = screen.getByRole('list', { name: 'Légende' });
  expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'Lecture à l’entrée', 'Lecture à la sortie', 'Accords', 'Descriptifs', 'Recherche d’image',
  ]);
});

it('un seul jour, un seul usage : une barre pleine', async () => {
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValue(usage({
    rows: [{ day: '2026-10-18', usage: 'ACCORDS', ok: 1, refused503: 0, refused429: 0, errors: 0, costCents: 2 }],
    totals: { ok: 1, refused: 0, errors: 0, costCents: 2 },
  }));
  mount();
  const bar = await screen.findByRole('img', { name: '18/10 : 1 appel, 0,02 €' });
  expect(segments(bar).map((s) => s.style.height)).toEqual(['100%']);
  expect(screen.getByText('Refusés', { selector: '.list__meta' }).parentElement).toHaveTextContent('0 %');
});

it('le détail par jour est replié dans un <details>', async () => {
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValue(usage());
  mount();
  const table = await screen.findByRole('table');
  const details = table.closest('details')!;
  expect(details).not.toHaveAttribute('open');
  expect(within(details).getByText('Détail par jour').tagName).toBe('SUMMARY');
});
