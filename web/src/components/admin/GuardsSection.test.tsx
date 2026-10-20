import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../lib/api-client';
import { GuardsSection } from './GuardsSection';

afterEach(() => vi.restoreAllMocks());

// jsdom n'a ni showModal ni close : simulés comme dans les tests de BottomSheet.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

const cdp: api.GuardAppellation = {
  id: '11111111-1111-4111-8111-111111111111', canonicalName: 'Châteauneuf-du-Pape', region: 'Rhône', guardMinYears: 8, guardMaxYears: 20,
  overrides: [{ id: '22222222-2222-4222-8222-222222222222', color: 'ROSE', min: 1, max: 2 }],
};

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GuardsSection />
    </QueryClientProvider>,
  );
}

it('explique la règle spéciale des rosés', () => {
  vi.spyOn(api, 'searchGuards').mockResolvedValue([]);
  mount();
  expect(
    screen.getByText('Les rosés se gardent 1 à 3 ans, sauf ajustement « Rosé » : un ajustement « Toutes couleurs » ne s’applique pas à eux.'),
  ).toBeInTheDocument();
});

it('cherche une appellation et montre sa garde et ses ajustements', async () => {
  const search = vi.spyOn(api, 'searchGuards').mockResolvedValue([cdp]);
  mount();
  await userEvent.type(screen.getByLabelText('Appellation'), 'chateauneuf');
  await waitFor(() => expect(search).toHaveBeenLastCalledWith('chateauneuf'));
  expect(await screen.findByText('Garde du référentiel : 8 à 20 ans')).toBeInTheDocument();
  expect(screen.getByText('Rosé : 1 à 2 ans')).toBeInTheDocument();
});

it('ajuste la garde pour toutes les couleurs', async () => {
  vi.spyOn(api, 'searchGuards').mockResolvedValue([cdp]);
  const put = vi.spyOn(api, 'putGuard').mockResolvedValue({ id: 'o9', color: null, min: 10, max: 25 });
  mount();
  await userEvent.type(screen.getByLabelText('Appellation'), 'chateauneuf');
  await userEvent.click(await screen.findByRole('button', { name: 'Ajuster Châteauneuf-du-Pape' }));
  await userEvent.type(screen.getByLabelText('Garde minimale'), '10');
  await userEvent.type(screen.getByLabelText('Garde maximale'), '25');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la garde' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith({ appellationId: cdp.id, color: null, min: 10, max: 25 }));
});

it('refuse une garde minimale supérieure à la maximale', async () => {
  vi.spyOn(api, 'searchGuards').mockResolvedValue([cdp]);
  mount();
  await userEvent.type(screen.getByLabelText('Appellation'), 'chateauneuf');
  await userEvent.click(await screen.findByRole('button', { name: 'Ajuster Châteauneuf-du-Pape' }));
  await userEvent.type(screen.getByLabelText('Garde minimale'), '9');
  await userEvent.type(screen.getByLabelText('Garde maximale'), '3');
  expect(screen.getByRole('button', { name: 'Enregistrer la garde' })).toBeDisabled();
});

it('retire un ajustement', async () => {
  vi.spyOn(api, 'searchGuards').mockResolvedValue([cdp]);
  const del = vi.spyOn(api, 'deleteGuard').mockResolvedValue(undefined);
  mount();
  await userEvent.type(screen.getByLabelText('Appellation'), 'chateauneuf');
  await userEvent.click(await screen.findByRole('button', { name: 'Retirer l’ajustement Rosé' }));
  await waitFor(() => expect(del).toHaveBeenCalledWith(cdp.overrides[0].id));
});

it('n’affiche plus l’erreur d’un enregistrement raté une fois une suppression réussie', async () => {
  vi.spyOn(api, 'searchGuards').mockResolvedValue([cdp]);
  vi.spyOn(api, 'putGuard').mockRejectedValue(new api.ApiError(400, 'Garde invalide'));
  vi.spyOn(api, 'deleteGuard').mockResolvedValue(undefined);
  mount();
  await userEvent.type(screen.getByLabelText('Appellation'), 'chateauneuf');
  await userEvent.click(await screen.findByRole('button', { name: 'Ajuster Châteauneuf-du-Pape' }));
  await userEvent.type(screen.getByLabelText('Garde minimale'), '10');
  await userEvent.type(screen.getByLabelText('Garde maximale'), '25');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la garde' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Garde invalide');
  await userEvent.click(screen.getByRole('button', { name: 'Retirer l’ajustement Rosé' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

it('« Ajuster » ouvre la feuille de l’appellation, « Annuler » la ferme sans appel', async () => {
  const pauillac: api.GuardAppellation = { ...cdp, id: '33333333-3333-4333-8333-333333333333', canonicalName: 'Pauillac', overrides: [] };
  vi.spyOn(api, 'searchGuards').mockResolvedValue([pauillac]);
  const put = vi.spyOn(api, 'putGuard');
  mount();
  await userEvent.type(screen.getByLabelText('Appellation'), 'pauillac');
  await userEvent.click(await screen.findByRole('button', { name: 'Ajuster Pauillac' }));
  const sheet = screen.getByRole('dialog', { name: 'Ajuster la garde de Pauillac' });
  expect(within(sheet).getByLabelText('Couleur')).toHaveValue('');
  expect(within(sheet).getByLabelText('Garde minimale')).toBeInTheDocument();
  expect(within(sheet).getByLabelText('Garde maximale')).toBeInTheDocument();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Annuler' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(put).not.toHaveBeenCalled();
});

it('ferme la feuille une fois la garde enregistrée', async () => {
  vi.spyOn(api, 'searchGuards').mockResolvedValue([cdp]);
  vi.spyOn(api, 'putGuard').mockResolvedValue({ id: 'o9', color: 'ROUGE', min: 10, max: 25 });
  mount();
  await userEvent.type(screen.getByLabelText('Appellation'), 'chateauneuf');
  await userEvent.click(await screen.findByRole('button', { name: 'Ajuster Châteauneuf-du-Pape' }));
  await userEvent.selectOptions(screen.getByLabelText('Couleur'), 'ROUGE');
  await userEvent.type(screen.getByLabelText('Garde minimale'), '10');
  await userEvent.type(screen.getByLabelText('Garde maximale'), '25');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la garde' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
