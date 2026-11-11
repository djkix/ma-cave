import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/api-client';
import { SortieCapturePage } from './SortieCapturePage';

// La caméra n'existe pas sous jsdom : le scanner rend un bouton qui « lit » un code.
vi.mock('../components/BarcodeScanner', () => ({
  BarcodeScanner: ({ onCode }: { onCode: (c: string) => void }) => <button type="button" onClick={() => onCode('3760123456784')}>Lire le code</button>,
}));

// jsdom n'a ni showModal ni close : on les simule comme les autres tests de <dialog>.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

afterEach(() => vi.restoreAllMocks());

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/sortie']}>
        <Routes>
          <Route path="/sortie" element={<SortieCapturePage />} />
          <Route path="/sortie/:photoId" element={<p>Résolution</p>} />
          <Route path="/cave/:id" element={<p>Fiche</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('envoie la photo comme photo de sortie puis ouvre la résolution', async () => {
  const upload = vi.spyOn(api, 'uploadPhoto').mockResolvedValue({ id: 'p9', status: 'PENDING', duplicate: false });
  mount();
  await userEvent.upload(screen.getByLabelText('Photographier l’étiquette'), new File(['x'], 'b.jpg', { type: 'image/jpeg' }));
  await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.any(File), 'EXIT'));
  expect(await screen.findByText('Résolution')).toBeInTheDocument();
});

it('propose la recherche dans la cave quand l’envoi échoue', async () => {
  vi.spyOn(api, 'uploadPhoto').mockRejectedValue(new Error('Réseau indisponible'));
  mount();
  await userEvent.upload(screen.getByLabelText('Photographier l’étiquette'), new File(['x'], 'b.jpg', { type: 'image/jpeg' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Réseau indisponible');
  expect(screen.getByRole('link', { name: 'Chercher dans la cave' })).toHaveAttribute('href', '/cave');
});

it('réessaie l’envoi de la même photo puis ouvre la résolution', async () => {
  const file = new File(['x'], 'b.jpg', { type: 'image/jpeg' });
  const upload = vi
    .spyOn(api, 'uploadPhoto')
    .mockRejectedValueOnce(new Error('Réseau indisponible'))
    .mockResolvedValueOnce({ id: 'p9', status: 'PENDING', duplicate: false });
  mount();
  await userEvent.upload(screen.getByLabelText('Photographier l’étiquette'), file);
  expect(await screen.findByRole('alert')).toHaveTextContent('Réseau indisponible');
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer l’envoi' }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  expect(upload).toHaveBeenNthCalledWith(2, file, 'EXIT');
  expect(await screen.findByText('Résolution')).toBeInTheDocument();
});

const row = (o: Partial<api.CaveRow>): api.CaveRow => ({
  id: 'w1', producer: 'Domaine du Code', cuvee: null, appellationRaw: 'Cahors', vintage: 2019, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity: 2, ...o,
});

async function scanCode() {
  await userEvent.click(screen.getByRole('button', { name: /Scanner le code-barres/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Lire le code' }));
}

it('code-barres : un seul vin en stock ouvre sa fiche (sortie depuis la fiche)', async () => {
  vi.spyOn(api, 'getWinesByEan').mockResolvedValue([row({}), row({ id: 'w2', vintage: 2016, quantity: 0 })]);
  mount();
  await scanCode();
  expect(await screen.findByText('Fiche')).toBeInTheDocument();
});

it('code-barres : plusieurs millésimes en stock, on choisit', async () => {
  vi.spyOn(api, 'getWinesByEan').mockResolvedValue([row({}), row({ id: 'w2', vintage: 2016 })]);
  mount();
  await scanCode();
  expect(await screen.findByText(/2016 · 2 en stock/)).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Choisir' }).map((l) => l.getAttribute('href'))).toEqual(['/cave/w1', '/cave/w2']);
});

it('code-barres sans vin en stock : retour à la photo', async () => {
  vi.spyOn(api, 'getWinesByEan').mockResolvedValue([row({ quantity: 0 })]);
  mount();
  await scanCode();
  expect(await screen.findByText(/Aucun vin en stock avec ce code/)).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Prendre la photo/ })).toBeInTheDocument();
});
