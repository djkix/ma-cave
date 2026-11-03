import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../lib/api-client';
import { TraitsBlock } from './TraitsBlock';

afterEach(() => vi.restoreAllMocks());

const traits: api.WineTraits = { status: 'DONE', tannin: 'MOYEN', aromas: ['boisé'], country: 'FR', region: null, manualFields: [] };
const mount = (t: api.WineTraits | null, readOnly = false) =>
  render(<QueryClientProvider client={new QueryClient()}><TraitsBlock wineId="w1" traits={t} readOnly={readOnly} /></QueryClientProvider>);

it('TraitsBlock : six arômes impossibles, le sixième est désactivé', async () => {
  mount({ ...traits, aromas: ['fruits rouges', 'fruits noirs', 'agrumes', 'floral'] });
  await userEvent.click(screen.getByRole('button', { name: 'Corriger' }));
  await userEvent.click(screen.getByLabelText('boisé'));
  expect(screen.getByLabelText('cuir')).toBeDisabled();
  expect(screen.getByLabelText('boisé')).toBeEnabled();
});

it('TraitsBlock : membre sans Corriger', () => {
  mount(traits, true);
  expect(screen.getByText('boisé')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Corriger' })).toBeNull();
});

it('TraitsBlock : n’envoie que les clés modifiées', async () => {
  const set = vi.spyOn(api, 'setWineTraits').mockResolvedValue(traits);
  mount(traits);
  await userEvent.click(screen.getByRole('button', { name: 'Corriger' }));
  await userEvent.selectOptions(screen.getByLabelText('Tanin'), 'PUISSANT');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(set).toHaveBeenCalledWith('w1', { tannin: 'PUISSANT' });
});

it('TraitsBlock : en préparation et pays hors de France', () => {
  mount({ status: 'PENDING', tannin: null, aromas: [], country: null, region: null, manualFields: [] });
  expect(screen.getByText('Caractéristiques en préparation')).toBeInTheDocument();
});

it('TraitsBlock : sans ligne, le propriétaire peut corriger, le membre ne voit rien', async () => {
  const set = vi.spyOn(api, 'setWineTraits').mockResolvedValue(traits);
  const { container, unmount } = mount(null, true);
  expect(container).toBeEmptyDOMElement();
  unmount();
  mount(null);
  await userEvent.click(screen.getByRole('button', { name: 'Corriger' }));
  await userEvent.selectOptions(screen.getByLabelText('Tanin'), 'LEGER');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(set).toHaveBeenCalledWith('w1', { tannin: 'LEGER' });
});
