import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../lib/api-client';
import { TraitsBlock } from './TraitsBlock';

afterEach(() => vi.restoreAllMocks());

const traits: api.WineTraits = { status: 'DONE', tannin: 'MOYEN', aromas: ['boisé'], grapes: [], country: 'FR', region: null, manualFields: [] };
const mount = (t: api.WineTraits | null, readOnly = false, domainGrapes: string | null = null) =>
  render(<QueryClientProvider client={new QueryClient()}><TraitsBlock wineId="w1" traits={t} readOnly={readOnly} domainGrapes={domainGrapes} /></QueryClientProvider>);

it('TraitsBlock : cépages du vin, sinon ceux du domaine en secours', () => {
  const { unmount } = mount({ ...traits, grapes: ['Mourvèdre', 'Grenache'] }, false, 'Syrah, Cinsault');
  expect(screen.getByText('Mourvèdre, Grenache')).toBeInTheDocument();
  expect(screen.queryByText('Cépages du domaine')).toBeNull();
  unmount();
  mount(traits, false, 'Syrah, Cinsault');
  expect(screen.getByText('Cépages du domaine')).toBeInTheDocument();
  expect(screen.getByText('Syrah, Cinsault')).toBeInTheDocument();
});

it('TraitsBlock : cépages corrigés, séparés par des virgules', async () => {
  const set = vi.spyOn(api, 'setWineTraits').mockResolvedValue(traits);
  mount({ ...traits, grapes: ['Syrah'] });
  await userEvent.click(screen.getByRole('button', { name: 'Corriger' }));
  const input = screen.getByLabelText('Cépages');
  await userEvent.clear(input);
  await userEvent.type(input, ' Mourvèdre , Grenache,, ');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(set).toHaveBeenCalledWith('w1', { grapes: ['Mourvèdre', 'Grenache'] });
});

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
  mount({ status: 'PENDING', tannin: null, aromas: [], grapes: [], country: null, region: null, manualFields: [] });
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

it('TraitsBlock : région estimée par l’IA signalée', () => {
  render(<QueryClientProvider client={new QueryClient()}><TraitsBlock wineId="w1" traits={traits} region="Bourgogne" regionSource="IA" /></QueryClientProvider>);
  expect(screen.getByText('Région : Bourgogne (estimée par l’IA)')).toBeInTheDocument();
});

it('TraitsBlock : région corrigée dans la liste, ou hors de France', async () => {
  const set = vi.spyOn(api, 'setWineTraits').mockResolvedValue(traits);
  render(<QueryClientProvider client={new QueryClient()}><TraitsBlock wineId="w1" traits={traits} region="Bourgogne" regionSource="IA" /></QueryClientProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'Corriger' }));
  const select = screen.getByLabelText('Région');
  expect(select).toHaveValue('Bourgogne');
  expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
    'Inconnue', 'Alsace', 'Beaujolais', 'Bordeaux', 'Bourgogne', 'Champagne', 'Jura', 'Languedoc-Roussillon', 'Loire', 'Provence', 'Rhône', 'Savoie', 'Sud-Ouest', 'Hors de France',
  ]);
  await userEvent.selectOptions(select, 'Rhône');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(set).toHaveBeenLastCalledWith('w1', { region: 'Rhône' });
  await userEvent.click(await screen.findByRole('button', { name: 'Corriger' }));
  await userEvent.selectOptions(screen.getByLabelText('Région'), 'Hors de France');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(set).toHaveBeenLastCalledWith('w1', { country: 'AUTRE' });
});

it('TraitsBlock : le pays publié prime sur celui de l’IA (appellation reconnue)', async () => {
  render(<QueryClientProvider client={new QueryClient()}>
    <TraitsBlock wineId="w1" traits={{ ...traits, country: 'AUTRE' }} country="FR" region="Bourgogne" regionSource="REFERENTIEL" />
  </QueryClientProvider>);
  expect(screen.getByText('Région : Bourgogne')).toBeInTheDocument();
  expect(screen.queryByText('Hors de France')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Corriger' }));
  expect(screen.getByLabelText('Région')).toHaveValue('Bourgogne');
});
