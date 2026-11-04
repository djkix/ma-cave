import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../lib/api-client';
import { WineExitBar } from './WineExitBar';

afterEach(() => vi.restoreAllMocks());

// jsdom n'a ni showModal ni close : on les simule comme les autres tests de <dialog>.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

const result = (stock: number, created = true): api.MovementResult => ({
  movement: { id: 'm9', delta: -1, type: 'OUT', occurredAt: '' },
  wine: { producer: 'Domaine Tempier', cuvee: null, appellationRaw: 'Bandol', vintage: 2019, color: 'ROUGE', formatCl: 75, id: 'w1' } as api.MovementResult['wine'],
  stock, created,
});
const cave: api.Place = { id: 'l1', label: 'Cave 1 / C15', quantity: 2, zoneId: 'z1' };
const garage: api.Place = { id: 'l2', label: 'Garage', quantity: 1, zoneId: 'z2' };

function mount(props: Partial<Parameters<typeof WineExitBar>[0]> = {}, client = new QueryClient()) {
  return { client, ...render(
    <QueryClientProvider client={client}>
      <WineExitBar wineId="w1" quantity={3} places={[cave]} {...props} />
    </QueryClientProvider>,
  ) };
}

it('un seul endroit : sortie directe d’une bouteille de là, confirmation et rafraîchissement des écrans', async () => {
  const out = vi.spyOn(api, 'createOut').mockResolvedValue(result(2));
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  mount({}, client);
  await userEvent.click(screen.getByRole('button', { name: 'Sortir une bouteille' }));
  await waitFor(() => expect(out).toHaveBeenCalledTimes(1));
  expect(out.mock.calls[0][0]).toMatchObject({ wineId: 'w1', quantity: 1, locationId: 'l1' });
  expect(out.mock.calls[0][0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(await screen.findByRole('status')).toHaveTextContent('Bouteille sortie — il en reste 2');
  const predicate = (invalidate.mock.calls[0][0] as unknown as { predicate: (q: { queryKey: unknown[] }) => boolean }).predicate;
  for (const key of ['cave', 'wine', 'movements', 'stats']) expect(predicate({ queryKey: [key] })).toBe(true);
});

it('aucun endroit : sortie sans endroit (l’api choisit) ; deux sorties de suite ont deux clés', async () => {
  const out = vi.spyOn(api, 'createOut').mockResolvedValue(result(2));
  mount({ places: [] });
  await userEvent.click(screen.getByRole('button', { name: 'Sortir une bouteille' }));
  await waitFor(() => expect(out).toHaveBeenCalledTimes(1));
  expect(out.mock.calls[0][0]).not.toHaveProperty('locationId');
  await userEvent.click(screen.getByRole('button', { name: 'Sortir une bouteille' }));
  await waitFor(() => expect(out).toHaveBeenCalledTimes(2));
  expect(out.mock.calls[1][0].idempotencyKey).not.toBe(out.mock.calls[0][0].idempotencyKey);
});

it('échec : message, et le nouvel essai garde la même clé (une seule sortie au final)', async () => {
  const out = vi.spyOn(api, 'createOut').mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(result(2));
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Sortir une bouteille' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
  await userEvent.click(screen.getByRole('button', { name: 'Sortir une bouteille' }));
  await waitFor(() => expect(out).toHaveBeenCalledTimes(2));
  expect(out.mock.calls[1][0].idempotencyKey).toBe(out.mock.calls[0][0].idempotencyKey);
});

it('plusieurs endroits : la feuille demande d’où, puis sort de l’endroit choisi', async () => {
  const out = vi.spyOn(api, 'createOut').mockResolvedValue(result(2));
  mount({ places: [cave, garage] });
  await userEvent.click(screen.getByRole('button', { name: 'Sortir une bouteille' }));
  const sheet = within(screen.getByRole('dialog', { name: 'Sortir depuis quel endroit ?' }));
  expect(out).not.toHaveBeenCalled();
  await userEvent.click(sheet.getByRole('button', { name: /Garage/ }));
  await waitFor(() => expect(out).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'l2', quantity: 1 })));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('« Annuler » annule la sortie (comme le journal) ; la dernière bouteille sortie garde la confirmation', async () => {
  vi.spyOn(api, 'createOut').mockResolvedValue(result(0));
  const cancel = vi.spyOn(api, 'cancelMovement').mockResolvedValue({ stock: 1 } as Awaited<ReturnType<typeof api.cancelMovement>>);
  const { rerender, client } = mount({ quantity: 1 });
  await userEvent.click(screen.getByRole('button', { name: 'Sortir une bouteille' }));
  await screen.findByText('Bouteille sortie — il en reste 0');
  // La fiche relue : stock à 0, plus de bouton, mais « Annuler » reste.
  rerender(<QueryClientProvider client={client}><WineExitBar wineId="w1" quantity={0} places={[]} /></QueryClientProvider>);
  expect(screen.queryByRole('button', { name: 'Sortir une bouteille' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Annuler la sortie' }));
  await waitFor(() => expect(cancel).toHaveBeenCalledWith('m9', expect.stringMatching(/^[0-9a-f-]{36}$/)));
  expect(await screen.findByRole('status')).toHaveTextContent('Sortie annulée — 1 en stock');
});

it('stock à 0 : rien', () => {
  const { container } = mount({ quantity: 0, places: [] });
  expect(container).toBeEmptyDOMElement();
});

it('hors ligne : bouton désactivé avec l’explication', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  mount();
  expect(screen.getByRole('button', { name: 'Sortir une bouteille' })).toBeDisabled();
  expect(screen.getByText('Hors ligne : la sortie sera possible au retour du réseau.')).toBeInTheDocument();
});

it('après la sortie : « Avec quel plat ? » note l’accord, facultatif', async () => {
  vi.spyOn(api, 'createOut').mockResolvedValue(result(2));
  const add = vi.spyOn(api, 'addTastedPairing').mockResolvedValue({ id: 't1', dish: 'Comté', dishId: 'comte', good: true, createdAt: '' });
  mount({ places: [cave] });
  await userEvent.click(screen.getByRole('button', { name: 'Sortir une bouteille' }));
  await userEvent.click(await screen.findByRole('button', { name: /Avec quel plat/ }));
  await userEvent.type(screen.getByLabelText('Avec quel plat ?'), 'Comté');
  await userEvent.click(screen.getByRole('button', { name: /Bon accord/ }));
  expect(add).toHaveBeenCalledWith('w1', { dish: 'Comté', dishId: 'comte', good: true });
  expect(await screen.findByText('Accord noté, merci')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Avec quel plat/ })).not.toBeInTheDocument();
});
