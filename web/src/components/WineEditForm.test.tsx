import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/api-client';
import { WineEditForm } from './WineEditForm';

afterEach(() => vi.restoreAllMocks());

const wine: api.CaveRow = {
  id: 'w1', producer: 'Domaine X', cuvee: null, appellationRaw: 'Pommard', vintage: 2018, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity: 2,
};

function mount(onClose = vi.fn()) {
  vi.spyOn(api, 'getAppellations').mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/cave/w1']}>
        <Routes>
          <Route path="/cave/w1" element={<WineEditForm wine={wine} onClose={onClose} />} />
          <Route path="/cave/:id" element={<p>Fiche cible</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onClose;
}

it('enregistre les champs modifiés puis se ferme', async () => {
  const update = vi.spyOn(api, 'updateWine').mockResolvedValue({ id: 'w1' });
  const onClose = mount();
  await userEvent.clear(screen.getByLabelText('Domaine'));
  await userEvent.type(screen.getByLabelText('Domaine'), 'Domaine Y');
  await userEvent.type(screen.getByLabelText('Cuvée'), 'Les Rugiens');
  await userEvent.selectOptions(screen.getByLabelText('Couleur'), 'BLANC');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(update).toHaveBeenCalledWith('w1', {
    producer: 'Domaine Y', cuvee: 'Les Rugiens', appellationRaw: 'Pommard', vintage: 2018, color: 'BLANC', formatCl: 75,
  });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it('doublon : annonce le vin existant, puis fusionne et ouvre la fiche gardée', async () => {
  const update = vi.spyOn(api, 'updateWine')
    .mockRejectedValueOnce(new api.ApiError(409, 'Ce vin existe déjà', {
      message: 'Ce vin existe déjà', duplicate: { id: 'w9', producer: 'Pommard', cuvee: null, vintage: 2018, quantity: 3 },
    }))
    .mockResolvedValueOnce({ id: 'w9', merged: true });
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByText('Ce vin existe déjà : Pommard 2018, 3 bouteilles')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fusionner les deux' }));
  expect(update).toHaveBeenLastCalledWith('w1', expect.objectContaining({ merge: true }));
  expect(await screen.findByText('Fiche cible')).toBeInTheDocument();
});

it('« Annuler » ferme sans rien envoyer', async () => {
  const update = vi.spyOn(api, 'updateWine');
  const onClose = mount();
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(onClose).toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

it('domaine vide : enregistrement impossible', async () => {
  mount();
  await userEvent.clear(screen.getByLabelText('Domaine'));
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
});

it('millésime ou format mal tapé : enregistrement impossible, rien n’est envoyé', async () => {
  const update = vi.spyOn(api, 'updateWine');
  mount();
  await userEvent.clear(screen.getByLabelText('Millésime'));
  await userEvent.type(screen.getByLabelText('Millésime'), '2O18');
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await userEvent.clear(screen.getByLabelText('Millésime'));
  await userEvent.clear(screen.getByLabelText('Format (cl)'));
  await userEvent.type(screen.getByLabelText('Format (cl)'), '0');
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  expect(update).not.toHaveBeenCalled();
});

it('après enregistrement, les stats sont aussi rafraîchies', async () => {
  vi.spyOn(api, 'updateWine').mockResolvedValue({ id: 'w1' });
  const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
  mount();
  await userEvent.type(screen.getByLabelText('Cuvée'), 'X');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(invalidate).toHaveBeenCalled());
  const { predicate } = invalidate.mock.calls[0][0] as unknown as { predicate: (q: { queryKey: unknown[] }) => boolean };
  expect(predicate({ queryKey: ['stats'] })).toBe(true);
});
