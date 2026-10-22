import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import type { Location, LocationInput, Zone } from '../lib/api-client';
import { meFixture, viewerMe } from '../test-fixtures';
import { EntryLocationBlock, LocationFields } from './LocationFields';

const locations: Location[] = [
  { id: 'l1', zoneId: 'z2', zone: 'Cave 2', casier: 'B', position: '3', label: 'Cave 2 / B / 3', lastUsed: false },
  { id: 'l2', zoneId: 'z1', zone: 'Garage', casier: null, position: null, label: 'Garage', lastUsed: false },
];
// Ordre d'affichage choisi dans « Ma cave › Réglages », pas l'ordre alphabétique.
const zones: Zone[] = [
  { id: 'z1', name: 'Garage', indication: 'Au fond, derrière l’escalier', hasPhoto: true, sortOrder: 0, marker: null, grid: null },
  { id: 'z2', name: 'Cave 2', indication: null, hasPhoto: false, sortOrder: 1, marker: null, grid: null },
];

function Harness({ initial, zoneList = zones, block = true }: { initial: LocationInput; zoneList?: Zone[] | null; block?: boolean }) {
  const [v, setV] = useState(initial);
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={qc}><MemoryRouter>
      {block
        ? <EntryLocationBlock value={v} onChange={setV} locations={locations} zones={zoneList ?? undefined} />
        : <LocationFields value={v} onChange={setV} locations={locations} zones={zoneList ?? undefined} />}
    </MemoryRouter></QueryClientProvider>
  );
}

it('est replié par défaut et montre l’emplacement pré-rempli, zone par son nom, dans son titre', () => {
  const { container } = render(<Harness initial={{ zoneId: 'z2', casier: 'B', position: '3' }} />);
  const details = container.querySelector('details')!;
  expect(details).not.toHaveAttribute('open');
  expect(screen.getByText('Emplacement')).toBeInTheDocument();
  expect(screen.getByText('Cave 2 / B / 3')).toBeInTheDocument();
  expect(screen.getByLabelText('Zone')).toHaveValue('z2');
  expect(screen.getByLabelText('Casier')).toHaveValue('B');
  expect(screen.getByLabelText('Position')).toHaveValue('3');
});

it('annonce « Sans emplacement » quand rien n’est choisi ni saisi', () => {
  render(<Harness initial={{ zoneId: null, casier: null, position: null }} />);
  expect(screen.getByText('Sans emplacement')).toBeInTheDocument();
});

it('la zone se choisit dans la liste des zones de la cave, dans leur ordre, plus « Sans zone »', async () => {
  render(<Harness initial={{ zoneId: null, casier: null, position: null }} block={false} />);
  const select = screen.getByLabelText('Zone');
  expect(select.tagName).toBe('SELECT');
  expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sans zone', 'Garage', 'Cave 2']);
  expect(select).toHaveValue('');
  await userEvent.selectOptions(select, 'Cave 2');
  expect(select).toHaveValue('z2');
});

it('montre l’indication et la vignette de la zone choisie', async () => {
  render(<Harness initial={{ zoneId: null, casier: null, position: null }} block={false} />);
  expect(screen.queryByText('Au fond, derrière l’escalier')).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Zone'), 'Garage');
  expect(screen.getByText('Au fond, derrière l’escalier')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Photo de la zone Garage' })).toHaveAttribute('src', '/api/caves/zones/z1/photo');
  // Zone sans indication ni photo : rien dessous.
  await userEvent.selectOptions(screen.getByLabelText('Zone'), 'Cave 2');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByText('Au fond, derrière l’escalier')).not.toBeInTheDocument();
});

it('casier et position restent libres, avec les valeurs déjà saisies en suggestion', async () => {
  const { container } = render(<Harness initial={{ zoneId: null, casier: null, position: null }} />);
  const casier = screen.getByLabelText('Casier');
  const list = container.querySelector(`datalist#${CSS.escape(casier.getAttribute('list')!)}`)!;
  expect([...list.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual(['B']);
  const position = container.querySelector(`datalist#${CSS.escape(screen.getByLabelText('Position').getAttribute('list')!)}`)!;
  expect([...position.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual(['3']);
  expect(casier).toHaveAttribute('maxLength', '40');
  await userEvent.type(casier, 'Haut');
  expect(screen.getByText('Haut')).toBeInTheDocument();
});

it('sans aucune zone (liste lue) : lien « Créer une zone » vers « Ma cave › Réglages », la saisie en cours sera perdue', () => {
  render(<Harness initial={{ zoneId: null, casier: null, position: null }} zoneList={[]} block={false} />);
  expect(screen.getByRole('link', { name: 'Créer une zone' })).toHaveAttribute('href', '/ma-cave');
  expect(screen.getByText(/la saisie en cours sera perdue/)).toBeInTheDocument();
  expect(within(screen.getByLabelText('Zone')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sans zone']);
});

it('zones pas encore lues ou illisibles : choix grisé, zone pré-remplie affichée, pas de lien', () => {
  render(<Harness initial={{ zoneId: 'z2', casier: 'B', position: '3' }} zoneList={null} />);
  const select = screen.getByLabelText('Zone');
  expect(select).toBeDisabled();
  expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Cave 2']);
  // Le titre du bloc garde le libellé pré-rempli, nom de la zone compris.
  expect(screen.getByText('Cave 2 / B / 3')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Créer une zone' })).not.toBeInTheDocument();
});

it('avec des zones : pas de lien « Créer une zone »', () => {
  render(<Harness initial={{ zoneId: null, casier: null, position: null }} block={false} />);
  expect(screen.queryByRole('link', { name: 'Créer une zone' })).not.toBeInTheDocument();
});

describe('zone avec une grille', () => {
  const gridZones: Zone[] = [
    { id: 'z1', name: 'Garage', indication: null, hasPhoto: false, sortOrder: 0, marker: null, grid: null },
    { id: 'z3', name: 'Casier A', indication: null, hasPhoto: false, sortOrder: 1, marker: null, grid: { rows: 2, cols: 3 } },
  ];
  const casierList = (container: HTMLElement) =>
    [...container.querySelector(`datalist#${CSS.escape(screen.getByLabelText('Casier').getAttribute('list')!)}`)!.querySelectorAll('option')].map((o) => o.getAttribute('value'));
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getMe').mockResolvedValue(meFixture());
    vi.spyOn(api, 'getZoneCells').mockResolvedValue([{ casier: 'A6', quantity: 2 }, { casier: 'Z9', quantity: 1 }]);
  });

  it('montre la grille, les cases occupées, et toucher une case remplit « Casier »', async () => {
    const { container } = render(<Harness initial={{ zoneId: 'z3', casier: null, position: null }} zoneList={gridZones} block={false} />);
    const cells = within(screen.getByRole('group', { name: 'Cases de Casier A' })).getAllByRole('button');
    expect(cells.map((c) => c.textContent)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    expect(await screen.findByRole('button', { name: 'Case A6, 2 bouteilles' })).toHaveTextContent('A62');
    expect(api.getZoneCells).toHaveBeenCalledWith('z3');
    await userEvent.click(screen.getByRole('button', { name: 'Case A2' }));
    expect(screen.getByLabelText('Casier')).toHaveValue('A2');
    expect(screen.getByRole('button', { name: 'Case A2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Case A1' })).toHaveAttribute('aria-pressed', 'false');
    // Suggestions : les cases puis les valeurs déjà utilisées.
    expect(casierList(container)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B']);
  });

  it('codes de la lettre de la zone (« C ») ; sans lettre (zone d’avant la 2.27), « A »', () => {
    const lettered: Zone[] = [
      { ...gridZones[1], id: 'z4', name: 'Casier C', grid: { rows: 2, cols: 2 }, cellPrefix: 'C' },
      { ...gridZones[1], id: 'z5', name: 'Ancien', grid: { rows: 2, cols: 2 } },
    ];
    const { container, unmount } = render(<Harness initial={{ zoneId: 'z4', casier: null, position: null }} zoneList={lettered} block={false} />);
    expect(within(screen.getByRole('group', { name: 'Cases de Casier C' })).getAllByRole('button').map((c) => c.getAttribute('aria-label')))
      .toEqual(['Case C1', 'Case C2', 'Case C3', 'Case C4']);
    expect(casierList(container)).toEqual(['C1', 'C2', 'C3', 'C4', 'B']);
    unmount();
    render(<Harness initial={{ zoneId: 'z5', casier: null, position: null }} zoneList={lettered} block={false} />);
    expect(within(screen.getByRole('group', { name: 'Cases de Ancien' })).getAllByRole('button').map((c) => c.textContent)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('casier saisi en minuscules : la case correspondante est choisie', async () => {
    render(<Harness initial={{ zoneId: 'z3', casier: 'a6', position: null }} zoneList={gridZones} block={false} />);
    expect(await screen.findByRole('button', { name: 'Case A6, 2 bouteilles' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('valeur hors grille (« Z9 ») gardée dans le champ, aucune case choisie ; saisie libre conservée', async () => {
    render(<Harness initial={{ zoneId: 'z3', casier: 'Z9', position: null }} zoneList={gridZones} block={false} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Case A6, 2 bouteilles' })).toBeInTheDocument());
    expect(screen.getByLabelText('Casier')).toHaveValue('Z9');
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Casier'));
    await userEvent.type(screen.getByLabelText('Casier'), 'Haut');
    expect(screen.getByLabelText('Casier')).toHaveValue('Haut');
  });

  it('cases nommées : le bouton montre le nom et le petit code, Casier propose noms et codes, saisir le nom choisit la case', async () => {
    const named: Zone[] = [gridZones[0], { ...gridZones[1], cellNames: { A6: 'Champagnes' } }];
    const { container } = render(<Harness initial={{ zoneId: 'z3', casier: null, position: null }} zoneList={named} block={false} />);
    const a6 = await screen.findByRole('button', { name: 'Case Champagnes (A6), 2 bouteilles' });
    expect(a6).toHaveTextContent('ChampagnesA62');
    // Nom long : coupé à l'affichage (points de suspension), entier dans le nom accessible.
    expect(a6.querySelector('.cell-grid__name')).toHaveTextContent('Champagnes');
    expect(casierList(container)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'Champagnes', 'B']);
    await userEvent.type(screen.getByLabelText('Casier'), 'champagnes');
    expect(a6).toHaveAttribute('aria-pressed', 'true');
  });

  it('« Renommer les cases » (propriétaire) ouvre la liste des cases ; Enregistrer envoie les noms, le refus de l’api s’affiche tel quel', async () => {
    const update = vi.spyOn(api, 'updateZone')
      .mockRejectedValueOnce(new api.ApiError(400, 'Ce nom est déjà pris dans cette zone'))
      .mockResolvedValue({ ...gridZones[1], cellNames: { A1: 'Bordeaux' } });
    render(<Harness initial={{ zoneId: 'z3', casier: null, position: null }} zoneList={gridZones} block={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer les cases' }));
    const names = within(screen.getByRole('group', { name: 'Noms des cases' }));
    expect(names.getAllByRole('textbox')).toHaveLength(6);
    await userEvent.type(names.getByLabelText('Nom de la case A1'), 'Bordeaux');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les noms' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce nom est déjà pris dans cette zone');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les noms' }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('z3', { cellNames: { A1: 'Bordeaux' } }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Noms des cases' })).not.toBeInTheDocument());
  });

  it('membre : pas de « Renommer les cases »', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
    render(<Harness initial={{ zoneId: 'z3', casier: null, position: null }} zoneList={gridZones} block={false} />);
    await screen.findByRole('button', { name: 'Case A6, 2 bouteilles' });
    expect(screen.queryByRole('button', { name: 'Renommer les cases' })).not.toBeInTheDocument();
  });

  it('zone sans grille : aucune grille, aucune lecture des cases', async () => {
    const { container } = render(<Harness initial={{ zoneId: 'z1', casier: null, position: null }} zoneList={gridZones} block={false} />);
    expect(screen.queryByRole('group', { name: /Cases de/ })).not.toBeInTheDocument();
    expect(casierList(container)).toEqual(['B']);
    expect(api.getZoneCells).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Zone'), 'Casier A');
    expect(screen.getByRole('group', { name: 'Cases de Casier A' })).toBeInTheDocument();
    await waitFor(() => expect(api.getZoneCells).toHaveBeenCalledTimes(1));
  });
});
