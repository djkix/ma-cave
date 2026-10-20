import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import { APP_VERSION } from '../lib/version';
import { meFixture } from '../test-fixtures';
import { AProposPage } from './AProposPage';

afterEach(() => vi.restoreAllMocks());

it('montre la version, l’installation et les règles de confidentialité', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(meFixture());
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/compte/a-propos']}>
        <AProposPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByText(`Version ${APP_VERSION}`)).toBeInTheDocument();
  // jsdom : jamais ouverte comme application installée.
  expect(screen.getByText('Application non installée')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Règles de confidentialité' })).toHaveAttribute('href', '/confidentialite');
  expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/compte');
});
