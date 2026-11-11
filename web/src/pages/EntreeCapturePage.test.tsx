import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import * as queue from '../lib/offline-queue';
import { _resetForTests, QueueFullError, queueStats } from '../lib/offline-queue';
import * as sender from '../lib/photo-sender';
import { _resetSenderForTests, setSenderAccount } from '../lib/photo-sender';
import { EntreeCapturePage } from './EntreeCapturePage';

// La caméra n'existe pas sous jsdom : le scanner rend un bouton qui « lit » un code.
vi.mock('../components/BarcodeScanner', () => ({
  BarcodeScanner: ({ onCode }: { onCode: (c: string) => void }) => <button type="button" onClick={() => onCode('3760123456789')}>Lire le code</button>,
}));

// jsdom n'a ni showModal ni close : on les simule comme les autres tests de <dialog>.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

beforeEach(async () => {
  await _resetForTests();
  _resetSenderForTests();
  // Posé par RequireAuth dans l'application : le propriétaire connecté.
  setSenderAccount('u1');
});

afterEach(() => {
  vi.restoreAllMocks();
  _resetSenderForTests();
});

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <EntreeCapturePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const photo = (n: number) => new File([new Uint8Array(10 + n)], `p${n}.jpg`, { type: 'image/jpeg' });

it('range trois photos dans la file sans attendre aucun envoi, et compte 3', async () => {
  // L'envoi ne répond jamais : si l'écran l'attendait, le compteur resterait bloqué.
  const upload = vi.spyOn(api, 'uploadPhoto').mockReturnValue(new Promise(() => {}));
  const enqueue = vi.spyOn(queue, 'enqueuePhoto');
  const kick = vi.spyOn(sender, 'kickSender');
  mount();
  // La session (/auth/me) est chargée avant toute photo, comme derrière RequireAuth.
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));

  const input = screen.getByLabelText('Prendre une photo');
  expect(input).toHaveAttribute('accept', 'image/*');
  expect(input).toHaveAttribute('capture', 'environment');
  expect(screen.getByRole('button', { name: /Prendre une photo/ })).toBeInTheDocument();

  fireEvent.change(input, { target: { files: [photo(1)] } });
  fireEvent.change(input, { target: { files: [photo(2)] } });
  fireEvent.change(input, { target: { files: [photo(3)] } });

  expect(await screen.findByText('3 photos prises')).toBeInTheDocument();
  // Le bandeau de file compte les photos encore sur le téléphone.
  expect(await screen.findByText('3 photos en cours d’envoi')).toBeInTheDocument();
  expect(enqueue).toHaveBeenCalledTimes(3);
  enqueue.mock.calls.forEach((call) => expect(call[1]).toBe('entry'));
  // Chaque photo porte le compte qui l'a prise.
  enqueue.mock.calls.forEach((call) => expect(call[2]).toBe('u1'));
  // Une rafale = un lot : les trois photos portent le même identifiant (uuid).
  expect(new Set(enqueue.mock.calls.map((call) => call[4])).size).toBe(1);
  expect(enqueue.mock.calls[0][4]).toMatch(/^[0-9a-f-]{36}$/);
  expect(kick).toHaveBeenCalledTimes(3);
  expect((await queueStats()).count).toBe(3);
  // L'envoyeur a bien été relancé, mais l'écran n'a pas attendu sa réponse.
  await waitFor(() => expect(upload).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: /Photo suivante/ })).toBeEnabled();
  expect(input).toHaveValue('');
});

it('accorde le compteur au singulier', async () => {
  vi.spyOn(api, 'uploadPhoto').mockReturnValue(new Promise(() => {}));
  mount();
  fireEvent.change(screen.getByLabelText('Prendre une photo'), { target: { files: [photo(1)] } });
  expect(await screen.findByText('1 photo prise')).toBeInTheDocument();
});

it('affiche l’erreur de file pleine et ne compte pas la photo', async () => {
  vi.spyOn(queue, 'enqueuePhoto').mockRejectedValue(new QueueFullError());
  const kick = vi.spyOn(sender, 'kickSender');
  mount();
  // La session (/auth/me) est chargée avant toute photo, comme derrière RequireAuth.
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  fireEvent.change(screen.getByLabelText('Prendre une photo'), { target: { files: [photo(1)] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('File d’envoi pleine (200 photos) — attendez que les envois partent');
  expect(screen.getByText('0 photo prise')).toBeInTheDocument();
  expect(kick).not.toHaveBeenCalled();
});

it('mène à la liste des vins à confirmer', () => {
  mount();
  expect(screen.getByRole('link', { name: /Voir les vins à confirmer/ })).toHaveAttribute('href', '/a-confirmer');
});

it('propose le nombre de bouteilles avant la prise, l’envoie avec la photo puis revient à 1', async () => {
  vi.spyOn(api, 'uploadPhoto').mockReturnValue(new Promise(() => {}));
  const enqueue = vi.spyOn(queue, 'enqueuePhoto');
  mount();
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  const group = screen.getByRole('group', { name: 'Bouteilles' });
  expect(within(group).getByRole('button', { name: /^1 ?btl/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(group).getByRole('button', { name: /^6/ }));
  fireEvent.change(screen.getByLabelText('Prendre une photo'), { target: { files: [photo(1)] } });
  expect(await screen.findByText('1 photo prise')).toBeInTheDocument();
  expect(enqueue.mock.calls[0][3]).toBe(6);
  expect(within(screen.getByRole('group', { name: 'Bouteilles' })).getByRole('button', { name: /^1 ?btl/ })).toHaveAttribute('aria-pressed', 'true');
});

const scanned = (o: Partial<api.CaveRow> = {}): api.CaveRow => ({
  id: 'w1', producer: 'Domaine du Code', cuvee: null, appellationRaw: 'Cahors', vintage: 2019, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity: 4, ...o,
});

it('code-barres connu : ajoute les bouteilles au vin choisi, sans photo', async () => {
  vi.spyOn(api, 'getWinesByEan').mockResolvedValue([scanned()]);
  const create = vi.spyOn(api, 'createMovement').mockResolvedValue({} as api.MovementResult);
  const enqueue = vi.spyOn(queue, 'enqueuePhoto');
  mount();
  fireEvent.click(screen.getByRole('button', { name: /Scanner le code-barres/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Lire le code' }));
  expect(api.getWinesByEan).toHaveBeenCalledWith('3760123456789');
  expect(await screen.findByText(/2019 · 4 en stock/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter 1' }));
  expect(await screen.findByRole('status')).toHaveTextContent('+1 · Domaine du Code 2019');
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    quantity: 1, wine: expect.objectContaining({ producer: 'Domaine du Code', appellationRaw: 'Cahors', vintage: 2019, color: 'ROUGE', formatCl: 75 }),
  }));
  expect(create.mock.calls[0][0]).not.toHaveProperty('photoId');
  expect(enqueue).not.toHaveBeenCalled();
});

it('code-barres inconnu : la photo suivante emporte le code', async () => {
  vi.spyOn(api, 'getWinesByEan').mockResolvedValue([]);
  vi.spyOn(api, 'uploadPhoto').mockReturnValue(new Promise(() => {}));
  const enqueue = vi.spyOn(queue, 'enqueuePhoto');
  mount();
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  fireEvent.click(screen.getByRole('button', { name: /Scanner le code-barres/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Lire le code' }));
  expect(await screen.findByText(/Code inconnu dans votre cave/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Prendre la photo/ }));
  expect(screen.getByText(/joint à la prochaine photo/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Prendre une photo'), { target: { files: [photo(1)] } });
  await waitFor(() => expect(enqueue).toHaveBeenCalled());
  expect(enqueue.mock.calls[0][5]).toBe('3760123456789');
  // Une seule photo emporte le code.
  expect(screen.queryByText(/joint à la prochaine photo/)).not.toBeInTheDocument();
});

it('recherche impossible (réseau) : la photo reste proposée avec le code', async () => {
  vi.spyOn(api, 'getWinesByEan').mockRejectedValue(new TypeError('Failed to fetch'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: /Scanner le code-barres/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Lire le code' }));
  expect(await screen.findByText(/Recherche impossible \(réseau\)/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Prendre la photo/ })).toBeInTheDocument();
});
