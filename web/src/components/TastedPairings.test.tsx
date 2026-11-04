import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import { TastedPairingForm, TastedPairingsBlock } from './TastedPairings';

afterEach(() => vi.restoreAllMocks());

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
const saved = (over: Partial<api.TastedPairing> = {}): api.TastedPairing => ({ id: 't1', dish: 'Poulet rôti', dishId: 'poulet-roti', good: true, createdAt: '', ...over });

describe('TastedPairingForm', () => {
  it('suggestion choisie : son entrée est envoyée, avec l’avis', async () => {
    const add = vi.spyOn(api, 'addTastedPairing').mockResolvedValue(saved());
    const done = vi.fn();
    wrap(<TastedPairingForm wineId="w1" onDone={done} />);
    await userEvent.type(screen.getByLabelText('Avec quel plat ?'), 'comt');
    await userEvent.click(screen.getByRole('button', { name: 'Comté' }));
    await userEvent.click(screen.getByRole('button', { name: /Bon accord/ }));
    expect(add).toHaveBeenCalledWith('w1', { dish: 'Comté', dishId: 'comte', good: true });
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('texte libre : la dominante reconnue, sinon aucune entrée', async () => {
    const add = vi.spyOn(api, 'addTastedPairing').mockResolvedValue(saved());
    wrap(<TastedPairingForm wineId="w1" />);
    const input = screen.getByLabelText('Avec quel plat ?');
    await userEvent.type(input, 'Poulet aux morilles');
    await userEvent.click(screen.getByRole('button', { name: /Accord raté/ }));
    expect(add).toHaveBeenLastCalledWith('w1', { dish: 'Poulet aux morilles', dishId: expect.stringMatching(/^poulet/), good: false });
    await waitFor(() => expect(input).toHaveValue(''));
    await userEvent.type(input, 'Plat mystère');
    await userEvent.click(screen.getByRole('button', { name: /Bon accord/ }));
    expect(add).toHaveBeenLastCalledWith('w1', { dish: 'Plat mystère', dishId: null, good: true });
  });

  it('plat vide : avis désactivés ; erreur affichée', async () => {
    vi.spyOn(api, 'addTastedPairing').mockRejectedValue(new Error('Vin introuvable'));
    wrap(<TastedPairingForm wineId="w1" />);
    expect(screen.getByRole('button', { name: /Bon accord/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Avec quel plat ?'), 'Comté');
    await userEvent.click(screen.getByRole('button', { name: /Bon accord/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vin introuvable');
  });
});

describe('TastedPairingsBlock', () => {
  it('liste : chaque plat ouvre Accords, l’avis, le retrait', async () => {
    const del = vi.spyOn(api, 'deleteTastedPairing').mockResolvedValue(null);
    wrap(<TastedPairingsBlock wineId="w1" items={[saved(), saved({ id: 't2', dish: 'Sushis', dishId: null, good: false })]} />);
    expect(screen.getByRole('link', { name: 'Poulet rôti' })).toHaveAttribute('href', '/accords?plat=Poulet%20r%C3%B4ti');
    expect(screen.getByText('Accord raté')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Sushis' }));
    expect(del).toHaveBeenCalledWith('t2');
  });

  it('lecture seule : ni ajout ni retrait ; rien sans accord', () => {
    const { unmount } = wrap(<TastedPairingsBlock wineId="w1" items={[saved()]} readOnly />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    wrap(<TastedPairingsBlock wineId="w1" items={[]} readOnly />);
    expect(screen.queryByText('Accords vécus')).not.toBeInTheDocument();
  });

  it('propriétaire : « Ajouter un plat » ouvre le formulaire', async () => {
    wrap(<TastedPairingsBlock wineId="w1" items={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un plat' }));
    expect(screen.getByLabelText('Avec quel plat ?')).toBeInTheDocument();
  });
});
