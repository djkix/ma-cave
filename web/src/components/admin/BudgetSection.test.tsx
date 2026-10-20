import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as api from '../../lib/api-client';
import { BudgetSection } from './BudgetSection';

afterEach(() => vi.restoreAllMocks());

const mount = (budget: api.AdminBudget) => {
  vi.spyOn(api, 'getAdminBudget').mockResolvedValue(budget);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BudgetSection />
    </QueryClientProvider>,
  );
};

it('jauge du mois : dépensé sur plafond', async () => {
  mount({ caveShare: 0.3, invitedShare: 0.5, capCents: 1000, spentThisMonthCents: 342 });
  const meter = await screen.findByRole('meter');
  expect(meter).toHaveAttribute('aria-valuenow', '342');
  expect(meter).toHaveAttribute('aria-valuemax', '1000');
  expect(meter).toHaveAccessibleName(/Dépensé ce mois : 3,42\s€ sur 10,00\s€/);
  expect(screen.getByText(/Dépensé ce mois/)).toHaveTextContent('Dépensé ce mois : 3,42 € sur 10,00 €');
  expect(meter.firstElementChild).toHaveStyle({ width: '34.2%' });
  expect(screen.getByLabelText('Part maximale par cave (%)')).toHaveValue(30);
});

it('plafond nul : jauge vide, sans erreur', async () => {
  mount({ caveShare: 0.3, invitedShare: 0.5, capCents: 0, spentThisMonthCents: 0 });
  const meter = await screen.findByRole('meter');
  expect(meter).toHaveAttribute('aria-valuemax', '0');
  expect(meter.firstElementChild).toHaveStyle({ width: '0%' });
});

it('dépassement du plafond : jauge pleine, texte avec le vrai montant', async () => {
  mount({ caveShare: 0.3, invitedShare: 0.5, capCents: 1000, spentThisMonthCents: 1250 });
  const meter = await screen.findByRole('meter');
  expect(meter).toHaveAttribute('aria-valuenow', '1000');
  expect(meter).toHaveAttribute('aria-valuemax', '1000');
  expect(meter.firstElementChild).toHaveStyle({ width: '100%' });
  expect(screen.getByText(/Dépensé ce mois/)).toHaveTextContent('Dépensé ce mois : 12,50 € sur 10,00 €');
});
