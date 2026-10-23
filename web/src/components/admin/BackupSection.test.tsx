import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../lib/api-client';
import { BackupSection } from './BackupSection';

afterEach(() => vi.restoreAllMocks());

const mount = (status: api.BackupStatus) => {
  const get = vi.spyOn(api, 'getBackupStatus').mockResolvedValue(status);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BackupSection />
    </QueryClientProvider>,
  );
  return get;
};

it('dernière réussite, sans alerte', async () => {
  mount({ lastSuccessAt: '2026-10-28T02:05:00Z', lastRun: null, requested: false, alert: null });
  expect(await screen.findByText(/Dernière sauvegarde réussie : 28 oct\. 2026/)).toHaveTextContent('03:05');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('alerte affichée, aucune réussite', async () => {
  mount({ lastSuccessAt: null, lastRun: { finishedAt: '2026-10-28T02:05:00Z', succeeded: false, message: 'étape base (code 1)' }, requested: false, alert: 'Dernière sauvegarde en échec : étape base (code 1).' });
  expect(await screen.findByRole('alert')).toHaveTextContent('Dernière sauvegarde en échec : étape base (code 1).');
  expect(screen.getByText(/Dernière sauvegarde réussie : aucune/)).toBeInTheDocument();
});

it('« Sauvegarder maintenant » envoie la demande, puis l’annonce', async () => {
  const get = mount({ lastSuccessAt: null, lastRun: null, requested: false, alert: null });
  const ask = vi.spyOn(api, 'requestBackup').mockResolvedValue(undefined);
  get.mockResolvedValue({ lastSuccessAt: null, lastRun: null, requested: true, alert: null });
  await userEvent.click(await screen.findByRole('button', { name: 'Sauvegarder maintenant' }));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Sauvegarde demandée : elle part dans les 5 minutes.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sauvegarder maintenant' })).toBeNull();
});
