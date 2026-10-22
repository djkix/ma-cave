import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import type { LocationInput, PlanMarker, Zone } from '../lib/api-client';
import { PlanCellPicker } from './PlanCellPicker';

const plan = (id: string, name: string) => ({ id, name, width: 1200, height: 800, updatedAt: '2026-10-13T10:00:00.000Z', analysis: 'DONE' as const, suggestions: [], analysisInfo: null });
const casierC: PlanMarker = {
  zoneId: 'z3', planId: 'p1', name: 'Casier C', number: 1, x: 0.4, y: 0.3,
  cellBoxes: { C1: [0.1, 0.1, 0.2, 0.2], C2: [0.2, 0.1, 0.3, 0.2] }, cellNames: { C2: 'Champagnes' },
};
const casierD: PlanMarker = { zoneId: 'z4', planId: 'p2', name: 'Casier D', number: 1, x: 0.5, y: 0.5, cellBoxes: { D1: [0.4, 0.4, 0.6, 0.6] } };
const zones: Zone[] = [
  { id: 'z3', name: 'Casier C', indication: null, hasPhoto: false, sortOrder: 0, marker: { planId: 'p1', x: 0.4, y: 0.3 }, grid: { rows: 1, cols: 2 }, cellPrefix: 'C', cellNames: { C2: 'Champagnes' } },
  { id: 'z9', name: 'Garage', indication: null, hasPhoto: false, sortOrder: 1, marker: null, grid: null },
];
const EMPTY: LocationInput = { zoneId: null, casier: null, position: null };

let last: LocationInput;
function Harness({ initial = EMPTY }: { initial?: LocationInput }) {
  const [v, setV] = useState(initial);
  last = v;
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={qc}><MemoryRouter><PlanCellPicker value={v} onChange={setV} locations={[]} zones={zones} /></MemoryRouter></QueryClientProvider>;
}

beforeEach(() => {
  vi.spyOn(api, 'getZoneCells').mockResolvedValue([{ casier: 'C2', quantity: 3 }]);
});

it('toucher une case la choisit (zone + code), l’allume et dit combien de bouteilles y sont', async () => {
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [plan('p1', 'Cellier')], markers: [casierC] });
  render(<Harness initial={{ ...EMPTY, position: '3' }} />);
  const cell = await screen.findByRole('button', { name: 'Case Champagnes (C2), Casier C' });
  expect(screen.queryByRole('tablist')).toBeNull();
  // Position seule : pas une case, les champs sont ouverts d'office ; la case choisie les referme.
  expect(screen.getByLabelText('Zone')).toBeInTheDocument();
  await userEvent.click(cell);
  expect(last).toEqual({ zoneId: 'z3', casier: 'C2', position: '3' });
  expect(screen.queryByLabelText('Zone')).toBeNull();
  expect(cell).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByRole('status')).toHaveTextContent('Casier C · case Champagnes (C2) · 3 bouteilles déjà');
});

it('un toucher hors de toute case ne change rien et demande de toucher une case', async () => {
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [plan('p1', 'Cellier')], markers: [casierC] });
  render(<Harness />);
  await userEvent.click(await screen.findByRole('img', { name: 'Plan : Cellier' }));
  expect(screen.getByRole('status')).toHaveTextContent('Touchez une case');
  expect(last).toEqual(EMPTY);
});

it('au clavier : chaque case est un bouton, Entrée la choisit', async () => {
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [plan('p1', 'Cellier')], markers: [casierC] });
  render(<Harness />);
  await screen.findByRole('button', { name: 'Case C1, Casier C' });
  await userEvent.tab();
  expect(screen.getByRole('button', { name: 'Case C1, Casier C' })).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  expect(last).toEqual({ zoneId: 'z3', casier: 'C1', position: null });
});

it('plusieurs plans à cases : un onglet par plan, ouvert sur celui de la case courante (nom de case traduit en code)', async () => {
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [plan('p1', 'Cellier'), plan('p2', 'Garage'), plan('p3', 'Sans cases')], markers: [casierC, casierD] });
  render(<Harness initial={{ zoneId: 'z3', casier: 'champagnes', position: null }} />);
  const tabs = await screen.findAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual(['Cellier', 'Garage']);
  expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Case Champagnes (C2), Casier C' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByLabelText('Zone')).toBeNull();
  await userEvent.click(tabs[1]);
  await userEvent.click(screen.getByRole('button', { name: 'Case D1, Casier D' }));
  expect(last).toEqual({ zoneId: 'z4', casier: 'D1', position: null });
});

it('« Saisir à la main » montre les champs habituels ; ouverts d’office pour un emplacement hors plan', async () => {
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [plan('p1', 'Cellier')], markers: [casierC] });
  const { unmount } = render(<Harness />);
  const toggle = await screen.findByRole('button', { name: 'Saisir à la main' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(toggle);
  await userEvent.selectOptions(screen.getByLabelText('Zone'), 'Garage');
  expect(last.zoneId).toBe('z9');
  unmount();
  render(<Harness initial={{ zoneId: 'z9', casier: null, position: null }} />);
  await screen.findByRole('button', { name: 'Case C1, Casier C' });
  expect(screen.getByLabelText('Zone')).toHaveValue('z9');
});

it('sans plan à cases : seulement les champs habituels', async () => {
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [plan('p3', 'Sans cases')], markers: [{ ...casierC, cellBoxes: {} }] });
  render(<Harness />);
  await waitFor(() => expect(api.getPlans).toHaveBeenCalled());
  expect(screen.getByLabelText('Zone')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Saisir à la main' })).toBeNull();
});
