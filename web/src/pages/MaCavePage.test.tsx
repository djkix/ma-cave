import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import css from '../styles/base.css?raw';
import { MaCavePage } from './MaCavePage';

afterEach(() => vi.restoreAllMocks());

// jsdom n'a ni showModal ni close : simulés comme dans les tests de BottomSheet.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

const zones: api.Zone[] = [
  { id: 'z1', name: 'Cave 1', indication: 'À gauche en entrant', hasPhoto: true, sortOrder: 0, marker: null, grid: null },
  { id: 'z2', name: 'Garage', indication: null, hasPhoto: false, sortOrder: 1, marker: null, grid: null },
  { id: 'z3', name: 'Cellier', indication: 'Au fond, derrière l’escalier', hasPhoto: false, sortOrder: 2, marker: null, grid: null },
];

// Zones lues par défaut (vide) : les tests des membres et du nom n'en dépendent pas.
beforeEach(() => {
  vi.spyOn(api, 'getZones').mockResolvedValue([]);
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [], markers: [] });
});

const members: api.MemberView[] = [
  { id: 'm1', email: 'proprietaire@example.com', displayName: 'djkix', role: 'OWNER', pending: false },
  { id: 'm2', email: 'paul@example.com', displayName: 'Paul', role: 'VIEWER', pending: false },
  { id: 'm3', email: 'lea@example.com', displayName: null, role: 'VIEWER', pending: true },
];

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/ma-cave']}>
        <MaCavePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

const rowOf = (email: string) => screen.getByText(email).closest<HTMLElement>('.list__row')!;
const zonesCard = () => within(screen.getByRole('region', { name: 'Zones' }));
const zoneRow = (name: string) => within(zonesCard().getByRole('listitem', { name }));

it('regroupe le nom de la cave, le plan, les zones, les membres puis la sauvegarde, sous le titre « Ma cave », retour vers les Réglages', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  mount();
  expect(screen.getByRole('heading', { level: 1, name: 'Ma cave' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /retour/i })).toHaveAttribute('href', '/compte');
  await screen.findByText('proprietaire@example.com');
  const order = [screen.getByLabelText('Nom de la cave'), screen.getByRole('region', { name: 'Plans de la cave' }), screen.getByRole('region', { name: 'Zones' }), screen.getByRole('region', { name: 'Membres' }), screen.getByRole('region', { name: 'Sauvegarde' })];
  for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('carte « Sauvegarde » : texte et lien de téléchargement du classeur Excel', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue([]);
  mount();
  const card = within(screen.getByRole('region', { name: 'Sauvegarde' }));
  expect(card.getByText('Toute la cave dans un classeur Excel : stock, journal, cotes.')).toBeInTheDocument();
  const link = card.getByRole('link', { name: 'Télécharger la sauvegarde Excel' });
  expect(link).toHaveAttribute('href', '/api/export.xlsx');
  expect(link).toHaveAttribute('download');
});

describe('zones', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getMembers').mockResolvedValue([]);
  });

  it('liste les zones dans leur ordre, avec indication et vignette', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    mount();
    await zonesCard().findByText('Cave 1');
    expect(zonesCard().getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Cave 1', 'Garage', 'Cellier']);
    expect(zoneRow('Cave 1').getByText('À gauche en entrant')).toBeInTheDocument();
    expect(zoneRow('Cave 1').getByRole('img', { name: 'Photo de la zone Cave 1' })).toHaveAttribute('src', '/api/caves/zones/z1/photo');
    expect(zoneRow('Garage').queryByRole('img')).not.toBeInTheDocument();
    expect(zoneRow('Cave 1').getByRole('button', { name: 'Retirer la photo' })).toBeInTheDocument();
    expect(zoneRow('Garage').queryByRole('button', { name: 'Retirer la photo' })).not.toBeInTheDocument();
    // Libellé visible, nom de la zone compris, sans aria-label qui le remplacerait.
    expect(zoneRow('Cave 1').getByLabelText('Changer la photo de Cave 1')).toBeInTheDocument();
    const input = zoneRow('Garage').getByLabelText('Ajouter une photo de Garage');
    expect(input).not.toHaveAttribute('aria-label');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/*');
    // Sans « capture » : le téléphone propose l'appareil photo ou la galerie.
    expect(input).not.toHaveAttribute('capture');
  });

  it('sans zone : le dit, et propose d’en ajouter une', async () => {
    mount();
    expect(await zonesCard().findByText(/Aucune zone pour l’instant/)).toBeInTheDocument();
    expect(zonesCard().getByRole('button', { name: 'Ajouter une zone' })).toBeInTheDocument();
  });

  it('ajoute une zone (nom et indication) puis relit la liste', async () => {
    const list = vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const create = vi.spyOn(api, 'createZone').mockResolvedValue({ id: 'z4', name: 'Placard', indication: null, hasPhoto: false, sortOrder: 3, marker: null, grid: null });
    mount();
    await zonesCard().findByText('Cave 1');
    await userEvent.type(zonesCard().getByLabelText('Nom de la nouvelle zone'), '  Placard ');
    await userEvent.type(zonesCard().getByLabelText('Indication de la nouvelle zone'), 'Dans l’entrée');
    await userEvent.click(zonesCard().getByRole('button', { name: 'Ajouter une zone' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'Placard', indication: 'Dans l’entrée' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(zonesCard().getByLabelText('Nom de la nouvelle zone')).toHaveValue('');
  });

  it('affiche tel quel le refus de l’api (nom déjà pris)', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    vi.spyOn(api, 'createZone').mockRejectedValue(new api.ApiError(409, 'Une zone porte déjà ce nom'));
    mount();
    await zonesCard().findByText('Cave 1');
    await userEvent.type(zonesCard().getByLabelText('Nom de la nouvelle zone'), 'garage');
    await userEvent.click(zonesCard().getByRole('button', { name: 'Ajouter une zone' }));
    expect(await zonesCard().findByRole('alert')).toHaveTextContent('Une zone porte déjà ce nom');
  });

  it('↑ et ↓ échangent une zone avec sa voisine ; pas de ↑ en tête ni de ↓ en fin', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const reorder = vi.spyOn(api, 'reorderZones').mockResolvedValue(zones);
    mount();
    await zonesCard().findByText('Cave 1');
    expect(zoneRow('Cave 1').getByRole('button', { name: 'Monter Cave 1' })).toBeDisabled();
    expect(zoneRow('Cellier').getByRole('button', { name: 'Descendre Cellier' })).toBeDisabled();
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Descendre Garage' }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith(['z1', 'z3', 'z2']));
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Monter Garage' }));
    await waitFor(() => expect(reorder).toHaveBeenLastCalledWith(['z2', 'z1', 'z3']));
  });

  it('« Modifier » ouvre la feuille « Modifier Cellier » préremplie et enregistre nom et indication', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const update = vi.spyOn(api, 'updateZone').mockResolvedValue({ ...zones[2], name: 'Cellier du bas', indication: null });
    mount();
    await zonesCard().findByText('Cellier');
    await userEvent.click(zoneRow('Cellier').getByRole('button', { name: 'Modifier' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Modifier Cellier' }));
    const name = sheet.getByLabelText('Nom');
    expect(name).toHaveValue('Cellier');
    expect(sheet.getByLabelText('Indication')).toHaveValue('Au fond, derrière l’escalier');
    await userEvent.clear(name);
    await userEvent.type(name, 'Cellier du bas');
    await userEvent.clear(sheet.getByLabelText('Indication'));
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('z3', { name: 'Cellier du bas', indication: null, grid: null }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modifier Cellier' })).not.toBeInTheDocument());
  });

  it('« Modifier » : le refus de l’api s’affiche dans la feuille, et ne revient pas à la réouverture', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    vi.spyOn(api, 'updateZone').mockRejectedValue(new api.ApiError(409, 'Une zone porte déjà ce nom'));
    mount();
    await zonesCard().findByText('Cellier');
    await userEvent.click(zoneRow('Cellier').getByRole('button', { name: 'Modifier' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Modifier Cellier' }));
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    expect(await sheet.findByRole('alert')).toHaveTextContent('Une zone porte déjà ce nom');
    await userEvent.click(sheet.getByRole('button', { name: 'Annuler' }));
    await userEvent.click(zoneRow('Cellier').getByRole('button', { name: 'Modifier' }));
    expect(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('« Modifier » : Lignes et Colonnes donnent la grille de la zone, avec l’aperçu des cases ; vides, pas de grille', async () => {
    const gridded: api.Zone[] = [zones[0], { ...zones[1], grid: { rows: 2, cols: 3 } }, zones[2]];
    vi.spyOn(api, 'getZones').mockResolvedValue(gridded);
    const update = vi.spyOn(api, 'updateZone').mockResolvedValue(gridded[1]);
    mount();
    await zonesCard().findByText('Garage');
    await userEvent.click(zoneRow('Cellier').getByRole('button', { name: 'Modifier' }));
    let sheet = within(screen.getByRole('dialog', { name: 'Modifier Cellier' }));
    expect(sheet.getByLabelText('Lignes')).toHaveValue(null);
    expect(sheet.getByLabelText('Colonnes')).toHaveValue(null);
    await userEvent.type(sheet.getByLabelText('Lignes'), '6');
    await userEvent.type(sheet.getByLabelText('Colonnes'), '4');
    expect(sheet.getByText('Cases A1 à A24')).toBeInTheDocument();
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('z3', { name: 'Cellier', indication: 'Au fond, derrière l’escalier', grid: { rows: 6, cols: 4 }, cellPrefix: 'A', cellNames: {} }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Modifier' }));
    sheet = within(screen.getByRole('dialog', { name: 'Modifier Garage' }));
    expect(sheet.getByLabelText('Lignes')).toHaveValue(2);
    expect(sheet.getByLabelText('Colonnes')).toHaveValue(3);
    expect(sheet.getByText('Cases A1 à A6')).toBeInTheDocument();
    await userEvent.clear(sheet.getByLabelText('Lignes'));
    await userEvent.clear(sheet.getByLabelText('Colonnes'));
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('z2', { name: 'Garage', indication: null, grid: null }));
  });

  it('« Modifier » une zone à grille : section « Noms des cases », un champ facultatif par case (placeholder = code), enregistrés avec le reste', async () => {
    const gridded: api.Zone[] = [zones[0], { ...zones[1], grid: { rows: 2, cols: 2 }, cellPrefix: 'A', cellNames: { A4: 'Loire' } }, zones[2]];
    vi.spyOn(api, 'getZones').mockResolvedValue(gridded);
    const update = vi.spyOn(api, 'updateZone').mockResolvedValue(gridded[1]);
    mount();
    await zonesCard().findByText('Garage');
    // Zone sans grille : ni section, ni lettre.
    await userEvent.click(zoneRow('Cellier').getByRole('button', { name: 'Modifier' }));
    expect(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).queryByRole('group', { name: 'Noms des cases' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).queryByLabelText('Lettre des cases')).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).getByRole('button', { name: 'Annuler' }));

    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Modifier' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Modifier Garage' }));
    const names = within(sheet.getByRole('group', { name: 'Noms des cases' }));
    expect(names.getAllByRole('textbox').map((i) => i.getAttribute('placeholder'))).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(names.getByLabelText('Nom de la case A4')).toHaveValue('Loire');
    await userEvent.type(names.getByLabelText('Nom de la case A1'), ' Bordeaux ');
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('z2', { name: 'Garage', indication: null, grid: { rows: 2, cols: 2 }, cellPrefix: 'A', cellNames: { A1: 'Bordeaux', A4: 'Loire' } }));
  });

  it('« Modifier » : réduire la grille n’envoie que les noms des cases restantes ; le refus de l’api s’affiche tel quel', async () => {
    const gridded: api.Zone[] = [{ ...zones[1], grid: { rows: 2, cols: 2 }, cellPrefix: 'A', cellNames: { A1: 'Bordeaux', A4: 'Loire' } }];
    vi.spyOn(api, 'getZones').mockResolvedValue(gridded);
    const update = vi.spyOn(api, 'updateZone').mockRejectedValue(new api.ApiError(400, 'Ce nom est déjà pris dans cette zone'));
    mount();
    await zonesCard().findByText('Garage');
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Modifier' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Modifier Garage' }));
    await userEvent.clear(sheet.getByLabelText('Lignes'));
    await userEvent.type(sheet.getByLabelText('Lignes'), '1');
    expect(within(sheet.getByRole('group', { name: 'Noms des cases' })).getAllByRole('textbox')).toHaveLength(2);
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('z2', { name: 'Garage', indication: null, grid: { rows: 1, cols: 2 }, cellPrefix: 'A', cellNames: { A1: 'Bordeaux' } }));
    expect(await sheet.findByRole('alert')).toHaveTextContent('Ce nom est déjà pris dans cette zone');
  });

  it('« Modifier » : « Lettre des cases » préremplie, aperçu et noms avec la lettre ; la changer renomme les champs et l’envoie', async () => {
    const gridded: api.Zone[] = [{ ...zones[1], name: 'Casier C', grid: { rows: 4, cols: 12 }, cellPrefix: 'C', cellNames: { C5: 'Loire' } }];
    vi.spyOn(api, 'getZones').mockResolvedValue(gridded);
    const update = vi.spyOn(api, 'updateZone').mockResolvedValue(gridded[0]);
    mount();
    await zonesCard().findByText('Casier C');
    await userEvent.click(zoneRow('Casier C').getByRole('button', { name: 'Modifier' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Modifier Casier C' }));
    const letter = sheet.getByLabelText('Lettre des cases');
    expect(letter).toHaveValue('C');
    expect(sheet.getByText('Cases C1 à C48')).toBeInTheDocument();
    expect(sheet.getByLabelText('Nom de la case C1')).toBeInTheDocument();
    expect(sheet.getByLabelText('Nom de la case C5')).toHaveValue('Loire');
    await userEvent.clear(letter);
    await userEvent.type(letter, 'd');
    expect(letter).toHaveValue('D');
    expect(sheet.getByText('Cases D1 à D48')).toBeInTheDocument();
    expect(sheet.getByLabelText('Nom de la case D5')).toHaveValue('Loire');
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('z2', { name: 'Casier C', indication: null, grid: { rows: 4, cols: 12 }, cellPrefix: 'D', cellNames: { D5: 'Loire' } }));
  });

  it('« Modifier » une zone à grille sans lettre (« Casier F ») : lettre finale du nom si libre ; une lettre invalide ne s’enregistre pas', async () => {
    const gridded: api.Zone[] = [
      { ...zones[0], grid: { rows: 1, cols: 2 }, cellPrefix: 'A' },
      { ...zones[1], name: 'Casier F', grid: { rows: 2, cols: 2 } },
      { ...zones[2], name: 'Cellier A', grid: { rows: 1, cols: 1 } },
    ];
    vi.spyOn(api, 'getZones').mockResolvedValue(gridded);
    mount();
    await zonesCard().findByText('Casier F');
    await userEvent.click(zoneRow('Casier F').getByRole('button', { name: 'Modifier' }));
    let sheet = within(screen.getByRole('dialog', { name: 'Modifier Casier F' }));
    expect(sheet.getByLabelText('Lettre des cases')).toHaveValue('F');
    await userEvent.clear(sheet.getByLabelText('Lettre des cases'));
    await userEvent.type(sheet.getByLabelText('Lettre des cases'), '1');
    expect(sheet.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(sheet.getByLabelText('Lettre des cases')).toHaveAccessibleDescription('Une lettre de A à Z.');
    await userEvent.click(sheet.getByRole('button', { name: 'Annuler' }));
    // « A » est prise par Cave 1 : la première lettre libre.
    await userEvent.click(zoneRow('Cellier A').getByRole('button', { name: 'Modifier' }));
    sheet = within(screen.getByRole('dialog', { name: 'Modifier Cellier A' }));
    expect(sheet.getByLabelText('Lettre des cases')).toHaveValue('B');
  });

  it('« Modifier » : une seule des deux dimensions, ou hors bornes, ne s’enregistre pas', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    mount();
    await zonesCard().findByText('Garage');
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Modifier' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Modifier Garage' }));
    await userEvent.type(sheet.getByLabelText('Lignes'), '3');
    expect(sheet.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await userEvent.type(sheet.getByLabelText('Colonnes'), '31');
    expect(sheet.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('« Modifier » puis « Annuler » ferme la feuille sans appel', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const update = vi.spyOn(api, 'updateZone');
    mount();
    await zonesCard().findByText('Garage');
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Modifier' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Modifier Garage' }));
    expect(sheet.getByLabelText('Nom')).toHaveValue('Garage');
    expect(sheet.getByLabelText('Indication')).toHaveValue('');
    await userEvent.click(sheet.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog', { name: 'Modifier Garage' })).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('« Supprimer » demande confirmation : les bouteilles restent en stock, sans emplacement', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const remove = vi.spyOn(api, 'deleteZone').mockResolvedValue({ archived: true, unplaced: 0 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mount();
    await zonesCard().findByText('Garage');
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Supprimer' }));
    expect(confirm).toHaveBeenCalledWith('Supprimer la zone Garage ? Les bouteilles qui y sont rangées restent en stock, sans emplacement.');
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('z2'));
  });

  it.each([
    [false, 0, 'Zone supprimée'],
    [true, 0, 'Zone archivée (elle reste dans l’historique)'],
    [true, 1, 'Zone archivée : 1 bouteille sans emplacement'],
    [true, 12, 'Zone archivée : 12 bouteilles sans emplacement'],
  ])('après « Supprimer » (archived: %s, unplaced: %s) : « %s »', async (archived, unplaced, message) => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const remove = vi.spyOn(api, 'deleteZone').mockResolvedValue({ archived, unplaced });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount();
    await zonesCard().findByText('Garage');
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('z2'));
    expect(await zonesCard().findByRole('status')).toHaveTextContent(message);
  });

  it('envoie la photo choisie et retire la photo', async () => {
    const list = vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const upload = vi.spyOn(api, 'uploadZonePhoto').mockResolvedValue({ ...zones[1], hasPhoto: true });
    const removePhoto = vi.spyOn(api, 'removeZonePhoto').mockResolvedValue({ ...zones[0], hasPhoto: false });
    mount();
    await zonesCard().findByText('Garage');
    const file = new File(['jpeg'], 'garage.jpg', { type: 'image/jpeg' });
    await userEvent.upload(zoneRow('Garage').getByLabelText('Ajouter une photo de Garage'), file);
    await waitFor(() => expect(upload).toHaveBeenCalledWith('z2', expect.any(Blob)));
    await userEvent.click(zoneRow('Cave 1').getByRole('button', { name: 'Retirer la photo' }));
    await waitFor(() => expect(removePhoto).toHaveBeenCalledWith('z1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
  });
});


it('liste les membres avec leur rôle, l’invitation en attente et « Retirer » hors propriétaire', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  mount();
  expect(await screen.findByText('proprietaire@example.com')).toBeInTheDocument();
  // Ligne de personne commune : nom affiché en titre, e-mail dessous ; sans nom, l'e-mail en titre.
  expect(rowOf('proprietaire@example.com')).toHaveClass('person-row');
  const owner = within(rowOf('proprietaire@example.com'));
  expect(owner.getByText('djkix').tagName).toBe('STRONG');
  expect(owner.getByText('Propriétaire')).toBeInTheDocument();
  expect(owner.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  const paul = within(rowOf('paul@example.com'));
  expect(paul.getByText('Paul')).toBeInTheDocument();
  expect(paul.getByText('Lecture seule')).toBeInTheDocument();
  expect(paul.getByRole('button', { name: /Retirer/ })).toBeInTheDocument();
  expect(screen.getByText('lea@example.com').tagName).toBe('STRONG');
  const lea = within(rowOf('lea@example.com'));
  expect(lea.getByText('Lecture seule')).toBeInTheDocument();
  expect(lea.getByText('Invitation en attente')).toBeInTheDocument();
  expect(lea.queryByText(/null/)).not.toBeInTheDocument();
  expect(lea.getByRole('button', { name: /Retirer/ })).toBeInTheDocument();
});

it('invite une adresse puis recharge la liste', async () => {
  const list = vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  const invite = vi.spyOn(api, 'inviteMember').mockResolvedValue({ id: 'm4', email: 'zoe@example.com', displayName: null, role: 'VIEWER', pending: true });
  mount();
  await screen.findByText('paul@example.com');
  await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'zoe@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));
  await waitFor(() => expect(invite).toHaveBeenCalledWith('zoe@example.com'));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Adresse e-mail')).toHaveValue('');
});

it('affiche tel quel le refus de l’api pour une adresse déjà membre', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  vi.spyOn(api, 'inviteMember').mockRejectedValue(new api.ApiError(409, 'Cette adresse est déjà membre'));
  mount();
  await screen.findByText('paul@example.com');
  await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'paul@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Inviter' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cette adresse est déjà membre');
});

it('retire un membre après confirmation, et rien sans confirmation', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  const remove = vi.spyOn(api, 'removeMember').mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  mount();
  await screen.findByText('paul@example.com');
  const button = within(rowOf('paul@example.com')).getByRole('button', { name: /Retirer/ });
  await userEvent.click(button);
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('paul@example.com'));
  expect(remove).not.toHaveBeenCalled();
  await userEvent.click(button);
  await waitFor(() => expect(remove).toHaveBeenCalledWith('m2'));
});

it('affiche l’erreur de l’api au retrait', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  vi.spyOn(api, 'removeMember').mockRejectedValue(new api.ApiError(404, 'Membre introuvable'));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  mount();
  await screen.findByText('paul@example.com');
  await userEvent.click(within(rowOf('paul@example.com')).getByRole('button', { name: /Retirer/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Membre introuvable');
});

it('renomme la cave, nom prérempli, et rafraîchit la session', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  const rename = vi.spyOn(api, 'renameCave').mockResolvedValue({ id: 'c1', name: 'Cave du Var' });
  const qc = mount();
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const input = screen.getByLabelText('Nom de la cave');
  await waitFor(() => expect(input).toHaveValue('Cave de djkix'));
  await userEvent.clear(input);
  await userEvent.type(input, '  Cave du Var ');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(rename).toHaveBeenCalledWith('Cave du Var'));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] }));
});

it('refuse un nom vide ou de plus de 80 caractères, sans appel', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  const rename = vi.spyOn(api, 'renameCave');
  mount();
  const input = screen.getByLabelText('Nom de la cave');
  await waitFor(() => expect(input).toHaveValue('Cave de djkix'));
  await userEvent.clear(input);
  await userEvent.type(input, '   ');
  expect(screen.getByText('Le nom de la cave doit faire de 1 à 80 caractères')).toBeInTheDocument();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('Le nom de la cave doit faire de 1 à 80 caractères');
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  await userEvent.clear(input);
  await userEvent.type(input, 'x'.repeat(81));
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  await userEvent.clear(input);
  await userEvent.type(input, 'x'.repeat(80));
  expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  expect(screen.queryByText('Le nom de la cave doit faire de 1 à 80 caractères')).not.toBeInTheDocument();
  expect(input).toHaveAttribute('aria-invalid', 'false');
  expect(rename).not.toHaveBeenCalled();
});

it('affiche le refus de l’api au renommage', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  vi.spyOn(api, 'renameCave').mockRejectedValue(new api.ApiError(400, 'Le nom de la cave doit faire de 1 à 80 caractères'));
  mount();
  const input = screen.getByLabelText('Nom de la cave');
  await waitFor(() => expect(input).toHaveValue('Cave de djkix'));
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Le nom de la cave doit faire de 1 à 80 caractères');
});

describe('plan de la cave', () => {
  const main: api.CavePlan = { id: 'p1', name: 'Plan principal', width: 2000, height: 1000, updatedAt: '2026-10-13T10:00:00.000Z', analysis: 'NONE', suggestions: [], analysisInfo: null };
  const cellier: api.CavePlan = { id: 'p2', name: 'Cellier', width: 800, height: 600, updatedAt: '2026-10-20T09:00:00.000Z', analysis: 'NONE', suggestions: [], analysisInfo: null };
  const m1: api.PlanMarker = { zoneId: 'z1', planId: 'p1', name: 'Cave 1', number: 1, x: 0.1, y: 0.2 };
  const m3: api.PlanMarker = { zoneId: 'z3', planId: 'p2', name: 'Cellier', number: 1, x: 0.6, y: 0.4 };
  const placed: api.Zone[] = [{ ...zones[0], marker: { planId: 'p1', x: 0.1, y: 0.2 } }, zones[1], zones[2]];
  const withPlan = { plans: [main], markers: [m1] };
  const twoPlans = { plans: [main, cellier], markers: [m1, m3] };
  const twoPlaced: api.Zone[] = [placed[0], zones[1], { ...zones[2], marker: { planId: 'p2', x: 0.6, y: 0.4 } }];
  const planCard = () => within(screen.getByRole('region', { name: 'Plans de la cave' }));
  const tabs = () => within(planCard().getByRole('tablist', { name: 'Plans de la cave' }));
  /** Onglet nommé, une fois les plans lus. */
  const findTab = async (name: string) => within(await planCard().findByRole('tablist', { name: 'Plans de la cave' })).getByRole('tab', { name });
  const planImage = () => planCard().findByRole('img', { name: 'Plan de la cave' });
  /** Toucher le plan à (x, y) en fractions : boîte rendue simulée de 400 × 200 px. */
  async function tapPlan(x: number, y: number) {
    const box = (await planImage()).parentElement!;
    box.getBoundingClientRect = () => ({ left: 10, top: 50, width: 400, height: 200, right: 410, bottom: 250, x: 10, y: 50, toJSON: () => ({}) });
    fireEvent.click(box, { clientX: 10 + x * 400, clientY: 50 + y * 200 });
  }

  beforeEach(() => {
    vi.spyOn(api, 'getMembers').mockResolvedValue([]);
  });

  it('sans plan : l’explique, onglet « + Ajouter un plan » et formulaire d’ajout (photo sans capture)', async () => {
    mount();
    expect(await planCard().findByText('Photographiez la pièce ou un schéma dessiné à la main, puis placez vos zones dessus.')).toBeInTheDocument();
    expect(tabs().getAllByRole('tab').map((t) => t.textContent)).toEqual(['+ Ajouter un plan']);
    expect(planCard().getByLabelText('Nom du plan')).toBeInTheDocument();
    const input = planCard().getByLabelText('Choisir une photo');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/*');
    // Sans « capture » : le téléphone propose l'appareil photo ou la galerie.
    expect(input).not.toHaveAttribute('capture');
    expect(planCard().queryByRole('button', { name: /^Actions du plan/ })).not.toBeInTheDocument();
  });

  it('deux plans : un onglet par plan puis « + Ajouter un plan », le premier choisi ; un autre onglet montre son image et ses repères', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    vi.spyOn(api, 'getZones').mockResolvedValue(twoPlaced);
    mount();
    expect(await planImage()).toHaveAttribute('src', '/api/caves/plans/p1/image?v=2026-10-13T10%3A00%3A00.000Z');
    expect(tabs().getAllByRole('tab').map((t) => t.textContent)).toEqual(['Plan principal', 'Cellier', '+ Ajouter un plan']);
    expect(tabs().getByRole('tab', { name: 'Plan principal' })).toHaveAttribute('aria-selected', 'true');
    expect(tabs().getByRole('tab', { name: 'Cellier' })).toHaveAttribute('aria-selected', 'false');
    expect(planCard().getByRole('button', { name: 'Zone 1 : Cave 1' })).toBeInTheDocument();
    await userEvent.click(tabs().getByRole('tab', { name: 'Cellier' }));
    expect(tabs().getByRole('tab', { name: 'Cellier' })).toHaveAttribute('aria-selected', 'true');
    expect(await planImage()).toHaveAttribute('src', '/api/caves/plans/p2/image?v=2026-10-20T09%3A00%3A00.000Z');
    expect(planCard().getByRole('button', { name: 'Zone 1 : Cellier' })).toBeInTheDocument();
    expect(planCard().queryByRole('button', { name: 'Zone 1 : Cave 1' })).not.toBeInTheDocument();
  });

  it('« + Ajouter un plan » : nom puis photo, le plan est créé et son onglet choisi', async () => {
    const garage: api.CavePlan = { id: 'p3', name: 'Garage', width: 1000, height: 1000, updatedAt: '2026-10-20T10:00:00.000Z', analysis: 'NONE', suggestions: [], analysisInfo: null };
    const get = vi.spyOn(api, 'getPlans').mockResolvedValueOnce(twoPlans).mockResolvedValue({ plans: [main, cellier, garage], markers: [m1, m3] });
    const create = vi.spyOn(api, 'createPlan').mockResolvedValue(garage);
    mount();
    await userEvent.click(await findTab('+ Ajouter un plan'));
    expect(tabs().getByRole('tab', { name: '+ Ajouter un plan' })).toHaveAttribute('aria-selected', 'true');
    const createButton = planCard().getByRole('button', { name: 'Créer le plan' });
    expect(createButton).toBeDisabled();
    // La photo se choisit avant le nom : le champ n'est jamais désactivé faute de nom.
    const file = new File(['x'], 'garage.jpg', { type: 'image/jpeg' });
    expect(planCard().getByLabelText('Choisir une photo')).toBeEnabled();
    await userEvent.upload(planCard().getByLabelText('Choisir une photo'), file);
    expect(planCard().getByText('garage.jpg')).toBeInTheDocument();
    expect(createButton).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
    await userEvent.type(planCard().getByLabelText('Nom du plan'), ' Garage ');
    await userEvent.click(createButton);
    await waitFor(() => expect(create).toHaveBeenCalledWith('Garage', file));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await tabs().findByRole('tab', { name: 'Garage' })).toHaveAttribute('aria-selected', 'true');
    expect(await planImage()).toHaveAttribute('src', '/api/caves/plans/p3/image?v=2026-10-20T10%3A00%3A00.000Z');
  });

  /** Choisit une action du menu « ⋯ » du plan affiché. */
  async function planAction(plan: string, action: string) {
    await userEvent.click(planCard().getByRole('button', { name: `Actions du plan ${plan}` }));
    await userEvent.click(planCard().getByRole('button', { name: action }));
  }

  it('menu « ⋯ » du plan affiché : Renommer, Remplacer la photo, Relancer l’analyse, Supprimer le plan', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    mount();
    await userEvent.click(await findTab('Cellier'));
    expect(planCard().queryByRole('button', { name: 'Renommer' })).not.toBeInTheDocument();
    const menu = planCard().getByRole('button', { name: 'Actions du plan Cellier' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Renommer', 'Remplacer la photo', 'Relancer l’analyse', 'Supprimer le plan']) expect(planCard().getByRole('button', { name })).toBeInTheDocument();
  });

  it('« Renommer » : feuille « Renommer le plan », champ prérempli, puis le nouveau nom est envoyé', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    const rename = vi.spyOn(api, 'renamePlan').mockResolvedValue({ ...cellier, name: 'Cave du fond' });
    mount();
    await userEvent.click(await findTab('Cellier'));
    await planAction('Cellier', 'Renommer');
    const sheet = within(screen.getByRole('dialog', { name: 'Renommer le plan' }));
    const input = sheet.getByLabelText('Nom du plan');
    expect(input).toHaveValue('Cellier');
    await userEvent.clear(input);
    await userEvent.type(input, 'Cave du fond');
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rename).toHaveBeenCalledWith('p2', 'Cave du fond'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renommer le plan' })).not.toBeInTheDocument());
  });

  it('« Renommer » : le refus de l’api s’affiche dans la feuille, qui reste ouverte', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    vi.spyOn(api, 'renamePlan').mockRejectedValue(new api.ApiError(409, 'Un plan porte déjà ce nom'));
    mount();
    await userEvent.click(await findTab('Cellier'));
    await planAction('Cellier', 'Renommer');
    const sheet = within(screen.getByRole('dialog', { name: 'Renommer le plan' }));
    await userEvent.type(sheet.getByLabelText('Nom du plan'), ' bis');
    await userEvent.click(sheet.getByRole('button', { name: 'Enregistrer' }));
    expect(await sheet.findByRole('alert')).toHaveTextContent('Un plan porte déjà ce nom');
  });

  it('« Renommer » puis « Annuler » ferme la feuille sans appel', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    const rename = vi.spyOn(api, 'renamePlan');
    mount();
    await userEvent.click(await findTab('Cellier'));
    await planAction('Cellier', 'Renommer');
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Renommer le plan' })).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog', { name: 'Renommer le plan' })).not.toBeInTheDocument();
    expect(rename).not.toHaveBeenCalled();
  });

  it('« Remplacer la photo » ouvre le choix de fichier et envoie la nouvelle image du plan affiché', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    const replace = vi.spyOn(api, 'replacePlanImage').mockResolvedValue(cellier);
    mount();
    await userEvent.click(await findTab('Cellier'));
    const input = planCard().getByLabelText('Photo de remplacement du plan Cellier');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).not.toHaveAttribute('capture');
    const click = vi.spyOn(input, 'click');
    await planAction('Cellier', 'Remplacer la photo');
    expect(click).toHaveBeenCalledTimes(1);
    const file = new File(['x'], 'cellier.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('p2', file));
  });

  it('« Supprimer le plan » demande confirmation, puis revient au premier plan', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValueOnce(twoPlans).mockResolvedValue(withPlan);
    const remove = vi.spyOn(api, 'deletePlan').mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mount();
    await userEvent.click(await findTab('Cellier'));
    await planAction('Cellier', 'Supprimer le plan');
    expect(confirm).toHaveBeenLastCalledWith('Supprimer le plan « Cellier » ? Les zones et leurs bouteilles sont gardées.');
    expect(remove).not.toHaveBeenCalled();
    await planAction('Cellier', 'Supprimer le plan');
    await waitFor(() => expect(remove).toHaveBeenCalledWith('p2'));
    await waitFor(() => expect(tabs().queryByRole('tab', { name: 'Cellier' })).not.toBeInTheDocument());
    expect(tabs().getByRole('tab', { name: 'Plan principal' })).toHaveAttribute('aria-selected', 'true');
    expect(await planImage()).toHaveAttribute('src', '/api/caves/plans/p1/image?v=2026-10-13T10%3A00%3A00.000Z');
  });

  it('sur l’onglet Cellier : toucher puis nommer crée la zone et son repère sur ce plan ; le raccourci aussi', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    vi.spyOn(api, 'getZones').mockResolvedValue(twoPlaced);
    const create = vi.spyOn(api, 'createZone').mockResolvedValue({ ...zones[0], id: 'zn', name: 'Casier gauche' });
    const set = vi.spyOn(api, 'setZoneMarker').mockResolvedValue({ ...zones[0], id: 'zn', marker: { planId: 'p2', x: 0.5, y: 0.25 } });
    mount();
    await userEvent.click(await findTab('Cellier'));
    await tapPlan(0.5, 0.25);
    let chooser = within(planCard().getByRole('group', { name: 'Nommer cet endroit' }));
    await userEvent.type(chooser.getByLabelText('Nom de l’endroit'), 'Casier gauche');
    await userEvent.click(chooser.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('zn', 'p2', 0.5, 0.25));
    expect(create).toHaveBeenCalledWith({ name: 'Casier gauche' });
    await waitFor(() => expect(planCard().queryByRole('group', { name: 'Nommer cet endroit' })).not.toBeInTheDocument());
    await tapPlan(0.25, 0.5);
    chooser = within(planCard().getByRole('group', { name: 'Nommer cet endroit' }));
    await userEvent.click(chooser.getByRole('button', { name: 'Garage' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('z2', 'p2', 0.25, 0.5));
  });

  it('un « + » en attente disparaît quand on change d’onglet', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    vi.spyOn(api, 'getZones').mockResolvedValue(twoPlaced);
    mount();
    await findTab('Cellier');
    await tapPlan(0.5, 0.5);
    expect(planCard().getByRole('img', { name: 'Nouveau repère' })).toBeInTheDocument();
    await userEvent.click(tabs().getByRole('tab', { name: 'Cellier' }));
    expect(planCard().queryByRole('img', { name: 'Nouveau repère' })).not.toBeInTheDocument();
    expect(planCard().queryByRole('group', { name: 'Nommer cet endroit' })).not.toBeInTheDocument();
  });

  it('toucher le plan puis nommer l’endroit crée la zone avec son repère ; plus d’ajout dans la liste des zones', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [main], markers: [] });
    vi.spyOn(api, 'getZones').mockResolvedValue([]);
    const create = vi.spyOn(api, 'createZone').mockResolvedValue({ ...zones[0], id: 'zn', name: 'Casier gauche' });
    const set = vi.spyOn(api, 'setZoneMarker').mockResolvedValue({ ...zones[0], id: 'zn', marker: { planId: 'p1', x: 0.5, y: 0.25 } });
    mount();
    expect(await planCard().findByText('Touchez le plan à l’endroit où vous rangez des bouteilles, puis nommez-le.')).toBeInTheDocument();
    expect(await screen.findByText('Pour ajouter une zone, touchez un plan ci-dessus à son endroit.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Ajouter une zone' })).not.toBeInTheDocument();
    await tapPlan(0.5, 0.25);
    const chooser = within(planCard().getByRole('group', { name: 'Nommer cet endroit' }));
    expect(chooser.queryByText('ou choisir une zone existante :')).not.toBeInTheDocument();
    await userEvent.type(chooser.getByLabelText('Nom de l’endroit'), '  Casier gauche ');
    await userEvent.click(chooser.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('zn', 'p1', 0.5, 0.25));
    expect(create).toHaveBeenCalledWith({ name: 'Casier gauche' });
    expect(await planCard().findByRole('status')).toHaveTextContent('Zone « Casier gauche » ajoutée.');
  });

  it('toucher le plan propose aussi les zones existantes encore sans repère', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(withPlan);
    vi.spyOn(api, 'getZones').mockResolvedValue(placed);
    const set = vi.spyOn(api, 'setZoneMarker').mockResolvedValue({ ...zones[2], marker: { planId: 'p1', x: 0.5, y: 0.25 } });
    mount();
    await planCard().findByRole('button', { name: 'Zone 1 : Cave 1' });
    await tapPlan(0.5, 0.25);
    expect(planCard().getByRole('img', { name: 'Nouveau repère' })).toHaveTextContent('+');
    const chooser = within(planCard().getByRole('group', { name: 'Nommer cet endroit' }));
    expect(chooser.getAllByRole('button').map((b) => b.textContent)).toEqual(['Enregistrer', 'Garage', 'Cellier', 'Annuler']);
    await userEvent.click(chooser.getByRole('button', { name: 'Cellier' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('z3', 'p1', 0.5, 0.25));
    await waitFor(() => expect(planCard().queryByRole('group', { name: 'Nommer cet endroit' })).not.toBeInTheDocument());
  });

  it('toucher un repère montre sa zone ; « Déplacer » puis un toucher le déplace ; « Retirer le repère »', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(withPlan);
    vi.spyOn(api, 'getZones').mockResolvedValue(placed);
    const set = vi.spyOn(api, 'setZoneMarker').mockResolvedValue(placed[0]);
    const remove = vi.spyOn(api, 'removeZoneMarker').mockResolvedValue(zones[0]);
    mount();
    await userEvent.click(await planCard().findByRole('button', { name: 'Zone 1 : Cave 1' }));
    expect(planCard().getByText('À gauche en entrant')).toBeInTheDocument();
    await userEvent.click(planCard().getByRole('button', { name: 'Déplacer' }));
    expect(planCard().getByText('Touchez le nouvel endroit de Cave 1 sur le plan, ou déplacez le « + » avec les flèches puis Entrée.')).toBeInTheDocument();
    // Pendant le déplacement, les repères ne captent pas le toucher : on peut poser tout près d'un autre.
    expect(planCard().queryByRole('button', { name: /^Zone \d/ })).not.toBeInTheDocument();
    await tapPlan(0.75, 0.5);
    await waitFor(() => expect(set).toHaveBeenCalledWith('z1', 'p1', 0.75, 0.5));
    await userEvent.click(await planCard().findByRole('button', { name: 'Zone 1 : Cave 1' }));
    await userEvent.click(planCard().getByRole('button', { name: 'Retirer le repère' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('z1'));
  });

  it('au clavier : Entrée pose un « + » au centre, les flèches le déplacent, puis on choisit la zone', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(withPlan);
    vi.spyOn(api, 'getZones').mockResolvedValue(placed);
    const set = vi.spyOn(api, 'setZoneMarker').mockResolvedValue({ ...zones[1], marker: { planId: 'p1', x: 0.54, y: 0.4 } });
    mount();
    const box = await planCard().findByRole('group', { name: /^Plan de la cave\. Entrée pour poser un repère/ });
    box.focus();
    await userEvent.keyboard('{Enter}{ArrowRight}{ArrowRight}{Shift>}{ArrowUp}{/Shift}');
    expect(planCard().getByRole('img', { name: 'Nouveau repère' }).style.left).toBe('54%');
    await userEvent.click(within(planCard().getByRole('group', { name: 'Nommer cet endroit' })).getByRole('button', { name: 'Garage' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('z2', 'p1', 0.54, 0.4));
  });

  it('au clavier : « Déplacer » met le focus sur le plan, flèches puis Entrée enregistrent ; Échap annule', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(withPlan);
    vi.spyOn(api, 'getZones').mockResolvedValue(placed);
    const set = vi.spyOn(api, 'setZoneMarker').mockResolvedValue(placed[0]);
    mount();
    await userEvent.click(await planCard().findByRole('button', { name: 'Zone 1 : Cave 1' }));
    await userEvent.click(planCard().getByRole('button', { name: 'Déplacer' }));
    await userEvent.keyboard('{Escape}');
    expect(planCard().queryByRole('img', { name: 'Nouveau repère' })).not.toBeInTheDocument();
    await userEvent.click(planCard().getByRole('button', { name: 'Zone 1 : Cave 1' }));
    await userEvent.click(planCard().getByRole('button', { name: 'Déplacer' }));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(set).toHaveBeenCalledWith('z1', 'p1', 0.1, 0.22));
  });

  it('affiche tel quel le refus de l’api', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(withPlan);
    vi.spyOn(api, 'getZones').mockResolvedValue(placed);
    vi.spyOn(api, 'setZoneMarker').mockRejectedValue(new api.ApiError(404, 'Plan introuvable'));
    mount();
    await planCard().findByRole('button', { name: 'Zone 1 : Cave 1' });
    await tapPlan(0.3, 0.3);
    await userEvent.click(planCard().getByRole('button', { name: 'Garage' }));
    expect(await planCard().findByRole('alert')).toHaveTextContent('Plan introuvable');
  });

  describe('propositions de zones', () => {
    const casierA: api.PlanSuggestion = { id: 's1', kind: 'CASIER', name: 'Casier A', box: [0.1, 0.1, 0.4, 0.5], rows: 6, cols: 4 };
    const etagereA: api.PlanSuggestion = { id: 's2', kind: 'ETAGERE', name: 'Étagère A', box: [0.5, 0.1, 0.7, 0.3], rows: 1, cols: 5 };
    const rangementA: api.PlanSuggestion = { id: 's3', kind: 'AUTRE', name: 'Rangement A', box: [0.75, 0.1, 0.8, 0.2], rows: 1, cols: 1 };
    const analysed = (suggestions: api.PlanSuggestion[]) => ({ plans: [{ ...main, analysis: 'DONE' as const, suggestions }], markers: [] });
    const sheet = () => within(screen.getByRole('dialog', { name: 'Proposition' }));
    async function openProposal(name: string) {
      await userEvent.click(await planCard().findByRole('button', { name: `Proposition ${name}` }));
      return sheet();
    }

    afterEach(() => vi.useRealTimers());

    /** Bandeau d'analyse du plan affiché. */
    const banner = () => planCard().getByRole('status', { name: 'Analyse du plan' });
    const findBanner = () => planCard().findByRole('status', { name: 'Analyse du plan' });
    const SINCE = '2026-10-21T10:00:00.000Z';
    const pending = (info: Partial<Extract<api.PlanAnalysisInfo, { waiting: unknown }>> = {}): api.CavePlan => ({
      ...main, analysis: 'PENDING',
      analysisInfo: { since: SINCE, attempt: 1, maxAttempts: 10, nextAttemptAt: null, waiting: 'RUNNING', pauseUntil: null, ...info },
    });
    const failed = (failedReason: Extract<api.PlanAnalysisInfo, { failedReason: unknown }>['failedReason']): api.CavePlan => ({ ...main, analysis: 'FAILED', analysisInfo: { since: SINCE, failedReason } });
    /** Date ISO d'une heure locale du 21 octobre 2026 (ou du 1er novembre). */
    const local = (h: number, m: number, day = 21, month = 9) => new Date(2026, month, day, h, m).toISOString();

    it('analyse en cours : bandeau « Analyse du plan en cours » au-dessus du plan, relu toutes les 10 s jusqu’à la fin', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-10-21T10:00:20.000Z'));
      const getPlans = vi.spyOn(api, 'getPlans')
        .mockResolvedValueOnce({ plans: [pending()], markers: [] })
        .mockResolvedValue(analysed([casierA]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const b = await findBanner();
      expect(b).toHaveTextContent('Analyse du plan en cours');
      expect(b.compareDocumentPosition(await planImage()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(planCard().queryByText('Analyse du plan en cours…')).not.toBeInTheDocument();
      expect(getPlans).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(await planCard().findByRole('button', { name: 'Proposition Casier A' })).toBeInTheDocument();
      expect(getPlans).toHaveBeenCalledTimes(2);
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(getPlans).toHaveBeenCalledTimes(2);
    });

    it('envoyée à l’IA : durée relative chaque seconde, puis chaque minute, puis « plus long que prévu » au-delà de 3 min', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-10-21T10:00:20.000Z'));
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [pending({ waiting: 'QUEUED' })], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      expect(await findBanner()).toHaveTextContent('Envoyée à l’IA il y a 20 s · résultat attendu d’ici une minute');
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(banner()).toHaveTextContent('Envoyée à l’IA il y a 21 s · résultat attendu d’ici une minute');
      await act(() => vi.advanceTimersByTimeAsync(40_000));
      expect(banner()).toHaveTextContent('Envoyée à l’IA il y a 1 min · résultat attendu d’ici une minute');
      await act(() => vi.advanceTimersByTimeAsync(140_000));
      expect(banner()).toHaveTextContent('Envoyée à l’IA il y a 3 min · plus long que prévu, l’analyse continue');
    });

    it('durée relative alignée sur la demande : « 2 min » dès 120 s, « plus long que prévu » dès 3 min', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-10-21T10:00:20.500Z'));
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [pending({ waiting: 'QUEUED' })], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      await findBanner();
      await act(() => vi.advanceTimersByTimeAsync(99_800));
      expect(banner()).toHaveTextContent('Envoyée à l’IA il y a 2 min · résultat attendu d’ici une minute');
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(banner()).toHaveTextContent('Envoyée à l’IA il y a 3 min · plus long que prévu, l’analyse continue');
    });

    it('nouvel essai puis reprise : la durée part de la nouvelle demande, sans heure figée', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-10-21T10:00:20.000Z'));
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [pending({ waiting: 'RETRY', attempt: 2 })], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      const qc = mount();
      await findBanner();
      await act(() => vi.advanceTimersByTimeAsync(120_000));
      const since = new Date(Date.now() - 30_000).toISOString();
      qc.setQueryData(['plans'], { plans: [pending({ waiting: 'RUNNING', since })], markers: [] });
      // Notification de la requête (différée d'un tour), sans laisser passer de seconde.
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(banner()).toHaveTextContent('Envoyée à l’IA il y a 30 s · résultat attendu d’ici une minute');
    });

    it('la durée qui change chaque seconde n’est pas relue par les lecteurs d’écran', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [pending({ waiting: 'RUNNING' })], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      expect(within(await findBanner()).getByText(/^Envoyée à l’IA/)).toHaveAttribute('aria-hidden', 'true');
    });

    it('en cours (RUNNING) : même phrase que QUEUED', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-10-21T10:00:20.000Z'));
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [pending({ waiting: 'RUNNING' })], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      expect(await findBanner()).toHaveTextContent('Envoyée à l’IA il y a 20 s · résultat attendu d’ici une minute');
    });

    it.each([
      ['GEMINI_PAUSE', { waiting: 'GEMINI_PAUSE' as const, pauseUntil: local(15, 40), nextAttemptAt: local(15, 41) }, 'En attente : Gemini est en pause jusqu’à 15:40. Nouvel essai à 15:41.'],
      ['GEMINI_PAUSE sans reprise', { waiting: 'GEMINI_PAUSE' as const, pauseUntil: local(15, 40) }, 'En attente : Gemini est en pause jusqu’à 15:40.'],
      ['BUDGET', { waiting: 'BUDGET' as const, nextAttemptAt: local(0, 5, 1, 10) }, 'En attente : budget de l’IA atteint ce mois-ci. Nouvel essai le 1 nov. à 00:05.'],
      ['BUDGET sans reprise', { waiting: 'BUDGET' as const }, 'En attente : budget de l’IA atteint ce mois-ci. Nouvel essai plus tard.'],
      ['RETRY', { waiting: 'RETRY' as const, attempt: 2, nextAttemptAt: local(10, 52) }, 'Nouvel essai à 10:52 (tentative 2 sur 10).'],
      [
        'QUOTA (jour)',
        { waiting: 'QUOTA' as const, pauseUntil: local(9, 0), quotaKind: 'JOUR' as const, message: 'Quota Gemini du jour atteint (20 requêtes) : reprise jeudi à 09:00.' },
        'Quota Gemini du jour atteint (20 requêtes) : reprise jeudi à 09:00.',
      ],
      [
        'QUOTA (minute)',
        { waiting: 'QUOTA' as const, pauseUntil: local(14, 3), quotaKind: 'MINUTE' as const, message: 'Limite de 5 requêtes par minute atteinte : reprise à 14:03.' },
        'Limite de 5 requêtes par minute atteinte : reprise à 14:03.',
      ],
    ])('en attente (%s) : le dit', async (_, info, text) => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [pending(info)], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const b = await findBanner();
      expect(b).toHaveTextContent('Analyse du plan en cours');
      expect(within(b).getByText(text)).toBeInTheDocument();
    });

    it('icône animée, sans animation sous prefers-reduced-motion', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [pending()], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const icon = (await findBanner()).querySelector('.material-symbols-outlined');
      expect(icon).toHaveTextContent('progress_activity');
      expect(icon).toHaveClass('spin');
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.spin[^}]*animation: none/);
    });

    it.each([
      ['GEMINI', 'L’IA n’a pas répondu après plusieurs essais.'],
      ['REFUS', 'L’IA a refusé la demande. Réessayez, ou choisissez un autre modèle dans l’Administration.'],
      ['BUDGET', 'Le budget de l’IA est épuisé.'],
      ['ILLISIBLE', 'L’IA n’a pas su lire cette photo : essayez une photo plus nette, prise de face.'],
      ['ERREUR', 'Une erreur est survenue.'],
    ] as const)('analyse en échec (%s) : bandeau d’erreur, raison et « Relancer l’analyse »', async (reason, text) => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [failed(reason)], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const b = await findBanner();
      expect(b).toHaveClass('analysis-banner--error');
      expect(b).toHaveTextContent('Les zones n’ont pas pu être proposées');
      expect(within(b).getByText(text)).toBeInTheDocument();
      expect(within(b).getByRole('button', { name: 'Relancer l’analyse' })).toBeInTheDocument();
      expect(within(b).getByText('Vous pouvez aussi placer les zones à la main.')).toBeInTheDocument();
      expect(planCard().queryByRole('button', { name: /^Proposition/ })).not.toBeInTheDocument();
    });

    it('analyse en échec (IMAGE) : pas de relance, il faut remplacer la photo', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [failed('IMAGE')], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const b = await findBanner();
      expect(within(b).getByText('La photo du plan est introuvable : remplacez-la.')).toBeInTheDocument();
      expect(within(b).queryByRole('button', { name: 'Relancer l’analyse' })).not.toBeInTheDocument();
    });

    it('« Relancer l’analyse » relance et repasse le bandeau en cours', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [failed('GEMINI')], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      const relaunch = vi.spyOn(api, 'relaunchAnalysis').mockResolvedValue(pending({ waiting: 'QUEUED' }));
      mount();
      await userEvent.click(within(await findBanner()).getByRole('button', { name: 'Relancer l’analyse' }));
      await waitFor(() => expect(relaunch).toHaveBeenCalledWith('p1'));
      await waitFor(() => expect(banner()).toHaveTextContent('Analyse du plan en cours'));
      expect(banner()).not.toHaveClass('analysis-banner--error');
    });

    it('relance refusée (409) : le refus s’affiche dans le bandeau et les plans sont relus', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [failed('GEMINI')], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      vi.spyOn(api, 'relaunchAnalysis').mockRejectedValue(new api.ApiError(409, 'Une analyse est déjà en cours'));
      const getPlans = vi.mocked(api.getPlans);
      mount();
      await userEvent.click(within(await findBanner()).getByRole('button', { name: 'Relancer l’analyse' }));
      expect(await within(banner()).findByRole('alert')).toHaveTextContent('Une analyse est déjà en cours');
      // L'état du serveur (déjà en cours) est relu : la relecture des 10 s reprend.
      await waitFor(() => expect(getPlans).toHaveBeenCalledTimes(2));
    });

    it('menu « ⋯ » : « Relancer l’analyse », désactivé pendant une analyse en cours', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [pending()], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      await findBanner();
      await userEvent.click(planCard().getByRole('button', { name: 'Actions du plan Plan principal' }));
      expect(planCard().getByRole('button', { name: 'Relancer l’analyse' })).toBeDisabled();
    });

    it('menu « ⋯ » « Relancer l’analyse » avec des propositions en attente : confirmation, puis relance et bandeau en cours', async () => {
      // Relecture après la relance laissée en suspens : le bandeau vient du plan rendu par la relance, mis en cache.
      vi.spyOn(api, 'getPlans').mockResolvedValueOnce(analysed([casierA, etagereA])).mockReturnValue(new Promise(() => undefined));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      const relaunch = vi.spyOn(api, 'relaunchAnalysis').mockResolvedValue(pending({ waiting: 'QUEUED' }));
      const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
      mount();
      await planCard().findByRole('button', { name: 'Proposition Casier A' });
      await planAction('Plan principal', 'Relancer l’analyse');
      expect(confirm).toHaveBeenLastCalledWith('Relancer l’analyse ? Les propositions en attente seront remplacées.');
      expect(relaunch).not.toHaveBeenCalled();
      await planAction('Plan principal', 'Relancer l’analyse');
      await waitFor(() => expect(relaunch).toHaveBeenCalledWith('p1'));
      expect(await findBanner()).toHaveTextContent('Analyse du plan en cours');
      expect(planCard().queryByRole('button', { name: 'Proposition Casier A' })).not.toBeInTheDocument();
    });

    it('menu « ⋯ » « Relancer l’analyse » sans proposition en attente : relance sans confirmation', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValueOnce(analysed([])).mockReturnValue(new Promise(() => undefined));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      const relaunch = vi.spyOn(api, 'relaunchAnalysis').mockResolvedValue(pending({ waiting: 'QUEUED' }));
      const confirm = vi.spyOn(window, 'confirm');
      mount();
      await planCard().findByRole('button', { name: 'Actions du plan Plan principal' });
      await planAction('Plan principal', 'Relancer l’analyse');
      await waitFor(() => expect(relaunch).toHaveBeenCalledWith('p1'));
      expect(confirm).not.toHaveBeenCalled();
      expect(await findBanner()).toHaveTextContent('Analyse du plan en cours');
    });

    it('plan jamais analysé : lien « Proposer des zones » qui lance l’analyse', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue(withPlan);
      vi.spyOn(api, 'getZones').mockResolvedValue(placed);
      const relaunch = vi.spyOn(api, 'relaunchAnalysis').mockResolvedValue(pending({ waiting: 'QUEUED' }));
      mount();
      await userEvent.click(await planCard().findByRole('button', { name: 'Proposer des zones' }));
      await waitFor(() => expect(relaunch).toHaveBeenCalledWith('p1'));
      expect(await findBanner()).toHaveTextContent('Analyse du plan en cours');
      expect(planCard().queryByRole('button', { name: 'Proposer des zones' })).not.toBeInTheDocument();
    });

    it('fin de l’analyse écran ouvert : bandeau de succès sans la phrase en double, jusqu’à la prochaine action', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(api, 'getPlans').mockResolvedValueOnce({ plans: [pending()], markers: [] }).mockResolvedValue(analysed([casierA, etagereA, rangementA]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      await findBanner();
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      await waitFor(() => expect(banner()).toHaveTextContent('3 zones proposées : touchez-les sur le plan pour les accepter.'));
      expect(planCard().queryByText('3 zones proposées : touchez-les pour les accepter.')).not.toBeInTheDocument();
      await tapPlan(0.9, 0.9);
      expect(planCard().queryByRole('status', { name: 'Analyse du plan' })).not.toBeInTheDocument();
      expect(planCard().getByText('3 zones proposées : touchez-les pour les accepter.')).toBeInTheDocument();
    });

    it('fin de l’analyse sans proposition : « Aucune zone détectée sur cette photo. Placez-les à la main. »', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(api, 'getPlans').mockResolvedValueOnce({ plans: [pending()], markers: [] }).mockResolvedValue(analysed([]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      await findBanner();
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      await waitFor(() => expect(banner()).toHaveTextContent('Aucune zone détectée sur cette photo. Placez-les à la main.'));
    });

    it('onglet d’un plan en cours d’analyse : point animé et « Cellier, analyse en cours »', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [main, { ...cellier, analysis: 'PENDING', analysisInfo: pending().analysisInfo }], markers: [] });
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const tab = await findTab('Cellier, analyse en cours');
      expect(tab).toHaveTextContent('Cellier');
      expect(tab.querySelector('.plan-tabs__dot')).toBeInTheDocument();
      expect(tabs().getByRole('tab', { name: 'Plan principal' }).querySelector('.plan-tabs__dot')).not.toBeInTheDocument();
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.plan-tabs__dot[^}]*animation: none/);
    });

    it('analyse faite : un cadre par proposition, étiquette « Casier A · 24 cases », phrase au-dessus du plan', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([casierA, etagereA, rangementA]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const sentence = await planCard().findByText('3 zones proposées : touchez-les pour les accepter.');
      const frame = planCard().getByRole('button', { name: 'Proposition Casier A' });
      expect(frame).toHaveTextContent('Casier A · 24 cases');
      expect(sentence.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(planCard().getByRole('button', { name: 'Proposition Étagère A' })).toHaveTextContent('Étagère A · 5 cases');
      expect(planCard().getByRole('button', { name: 'Proposition Rangement A' })).toHaveTextContent('Rangement A · 1 case');
    });

    it('une seule proposition : phrase au singulier', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([casierA]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      expect(await planCard().findByText('1 zone proposée : touchez-la pour l’accepter.')).toBeInTheDocument();
    });

    it('toucher un cadre ouvre « Proposition » préremplie ; Accepter envoie les valeurs modifiées puis ferme', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValueOnce(analysed([casierA])).mockResolvedValue(analysed([]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      const accept = vi.spyOn(api, 'acceptSuggestion').mockResolvedValue({ ...zones[0], id: 'zn', name: 'Casier du fond', grid: { rows: 5, cols: 4 } });
      mount();
      const s = await openProposal('Casier A');
      expect(s.getByLabelText('Nom')).toHaveValue('Casier A');
      expect(s.getByLabelText('Lignes')).toHaveValue(6);
      expect(s.getByLabelText('Colonnes')).toHaveValue(4);
      expect(s.getByText('Cases A1 à A24')).toBeInTheDocument();
      await userEvent.clear(s.getByLabelText('Nom'));
      await userEvent.type(s.getByLabelText('Nom'), ' Casier du fond ');
      await userEvent.clear(s.getByLabelText('Lignes'));
      await userEvent.type(s.getByLabelText('Lignes'), '5');
      expect(s.getByText('Cases A1 à A20')).toBeInTheDocument();
      await userEvent.click(s.getByRole('button', { name: 'Accepter' }));
      // Proposition d'avant la 2.27 (sans lettre) : l'api choisit la lettre.
      await waitFor(() => expect(accept).toHaveBeenCalledWith('p1', 's1', { name: 'Casier du fond', rows: 5, cols: 4, cellNames: {} }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Proposition' })).not.toBeInTheDocument());
      await waitFor(() => expect(planCard().queryByRole('button', { name: 'Proposition Casier A' })).not.toBeInTheDocument());
    });

    it('proposition ouverte : cases repérées nommées sur le plan et phrase « 3 cases repérées… » ; refermée : plus de cases', async () => {
      const cells: api.DetectedCell[] = [
        { box: [0.1, 0.1, 0.25, 0.3], row: 0, col: 0, name: 'C1' },
        { box: [0.25, 0.1, 0.4, 0.3], row: 0, col: 1, name: 'C2' },
        { box: [0.1, 0.3, 0.25, 0.5], row: 1, col: 0, name: 'C3' },
      ];
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([{ ...casierA, rows: 2, cols: 2, cellCount: 3, cells, cellPrefix: 'C' }, { ...etagereA, cellCount: 1, cells: [] }]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      expect(await planCard().findByRole('button', { name: 'Proposition Casier A' })).toHaveTextContent('Casier A · 3 cases');
      expect(planCard().queryByText('C3')).not.toBeInTheDocument();
      const s = await openProposal('Casier A');
      expect(s.getByText('3 cases repérées sur la photo · grille proposée : 2 rangées × 2 colonnes')).toBeInTheDocument();
      // Sur le plan de la carte et sur celui repris dans la feuille.
      expect(planCard().getAllByText('C1')).toHaveLength(2);
      expect(planCard().getAllByText('C3')).toHaveLength(2);
      // Toucher le fond referme la feuille.
      fireEvent.click(screen.getByRole('dialog', { name: 'Proposition' }));
      await waitFor(() => expect(planCard().queryByText('C3')).not.toBeInTheDocument());
      const e = await openProposal('Étagère A');
      expect(e.getByText('1 case repérée sur la photo · grille proposée : 1 rangée × 5 colonnes')).toBeInTheDocument();
    });

    it('feuille ouverte : plan recadré sur la proposition, liste « Noms des cases » de la grille saisie ; toucher un point met le focus sur son champ ; Accepter envoie les noms', async () => {
      const cells: api.DetectedCell[] = [
        { box: [0.1, 0.1, 0.25, 0.3], row: 0, col: 0, name: 'C1' },
        { box: [0.25, 0.1, 0.4, 0.3], row: 0, col: 1, name: 'C2' },
        { box: [0.1, 0.3, 0.25, 0.5], row: 1, col: 0, name: 'C3' },
      ];
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([{ ...casierA, rows: 2, cols: 2, cellCount: 3, cells, cellPrefix: 'C' }]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      const accept = vi.spyOn(api, 'acceptSuggestion').mockResolvedValue({ ...zones[0], id: 'zn', name: 'Casier A', grid: { rows: 2, cols: 2 } });
      mount();
      // Hors de la feuille, les points ne sont pas des boutons.
      await planCard().findByRole('button', { name: 'Proposition Casier A' });
      expect(planCard().queryByRole('button', { name: 'Case C1' })).not.toBeInTheDocument();
      const s = await openProposal('Casier A');
      // Cadre [0.1, 0.1, 0.4, 0.5] : image agrandie 1/0.3, décalée de −0.1/0.3 et −0.1/0.4.
      const crop = screen.getByRole('dialog', { name: 'Proposition' }).querySelector<HTMLElement>('.plan-crop__inner')!;
      expect(crop.style.width).toBe('333.33%');
      expect(crop.style.left).toBe('-33.33%');
      expect(crop.style.top).toBe('-25%');
      const names = within(s.getByRole('group', { name: 'Noms des cases' }));
      expect(names.getAllByRole('textbox').map((i) => i.getAttribute('placeholder'))).toEqual(['C1', 'C2', 'C3', 'C4']);
      await userEvent.click(s.getByRole('button', { name: 'Case C3' }));
      expect(names.getByLabelText('Nom de la case C3')).toHaveFocus();
      await userEvent.type(names.getByLabelText('Nom de la case C1'), ' Bordeaux ');
      // Le point montre le nom donné, son nom accessible aussi.
      expect(s.getByRole('button', { name: 'Case Bordeaux (C1)' })).toBeInTheDocument();
      // Grille réduite à une ligne : la liste suit, les noms des cases disparues ne partent pas.
      await userEvent.type(names.getByLabelText('Nom de la case C3'), 'Loire');
      await userEvent.clear(s.getByLabelText('Lignes'));
      await userEvent.type(s.getByLabelText('Lignes'), '1');
      expect(within(s.getByRole('group', { name: 'Noms des cases' })).getAllByRole('textbox')).toHaveLength(2);
      await userEvent.click(s.getByRole('button', { name: 'Accepter' }));
      await waitFor(() => expect(accept).toHaveBeenCalledWith('p1', 's1', { name: 'Casier A', rows: 1, cols: 2, cellNames: { C1: 'Bordeaux' }, cellPrefix: 'C' }));
    });

    it('lettre de la proposition (C) : aperçu « Cases C1 à C6 », points nommés par rangée et colonne ; colonnes changées, ils se renomment', async () => {
      // Noms de l'api ignorés (proposition d'avant la 2.27 : « B2 ») : la feuille les recalcule.
      const cells: api.DetectedCell[] = [
        { box: [0.1, 0.1, 0.2, 0.3], row: 0, col: 0, name: 'A1' },
        { box: [0.3, 0.1, 0.4, 0.3], row: 0, col: 2, name: 'A3' },
        { box: [0.2, 0.3, 0.3, 0.5], row: 1, col: 1, name: 'B2' },
      ];
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([{ ...casierA, name: 'Casier C', rows: 2, cols: 3, cellCount: 3, cells, cellPrefix: 'C' }]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const s = await openProposal('Casier C');
      expect(s.getByText('Cases C1 à C6')).toBeInTheDocument();
      expect(s.getAllByRole('button', { name: /^Case / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Case C1', 'Case C3', 'Case C5']);
      await userEvent.clear(s.getByLabelText('Colonnes'));
      await userEvent.type(s.getByLabelText('Colonnes'), '2');
      // Rangée 1, colonne 1 → C4 ; la colonne 2 sort de la grille : plus de nom.
      expect(s.getAllByRole('button', { name: /^Case / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Case C1', 'Case C4']);
    });

    it('proposition sans cases repérées (d’avant) : pas de phrase sur les cases repérées', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([casierA]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      const s = await openProposal('Casier A');
      expect(s.queryByText(/repérées? sur la photo/)).not.toBeInTheDocument();
    });

    it('Rejeter retire la proposition', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([casierA]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      const reject = vi.spyOn(api, 'rejectSuggestion').mockResolvedValue(undefined);
      mount();
      const s = await openProposal('Casier A');
      await userEvent.click(s.getByRole('button', { name: 'Rejeter' }));
      await waitFor(() => expect(reject).toHaveBeenCalledWith('p1', 's1'));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Proposition' })).not.toBeInTheDocument());
    });

    it('le refus de l’api s’affiche dans la feuille, qui reste ouverte', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([casierA]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      vi.spyOn(api, 'acceptSuggestion').mockRejectedValue(new api.ApiError(409, 'Une zone porte déjà ce nom'));
      mount();
      const s = await openProposal('Casier A');
      await userEvent.click(s.getByRole('button', { name: 'Accepter' }));
      expect(await s.findByRole('alert')).toHaveTextContent('Une zone porte déjà ce nom');
      expect(screen.getByRole('dialog', { name: 'Proposition' })).toBeInTheDocument();
    });

    it('toucher le plan hors des cadres pose toujours un « + »', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue(analysed([casierA]));
      vi.spyOn(api, 'getZones').mockResolvedValue([]);
      mount();
      await planCard().findByRole('button', { name: 'Proposition Casier A' });
      await tapPlan(0.9, 0.9);
      expect(planCard().getByRole('group', { name: 'Nommer cet endroit' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Proposition' })).not.toBeInTheDocument();
    });
  });

  describe('ajuster les cases sur le plan', () => {
    const c1: [number, number, number, number] = [0.1, 0.2, 0.2, 0.4];
    const c2: [number, number, number, number] = [0.3, 0.2, 0.4, 0.4];
    const casier: api.Zone = {
      ...zones[2], marker: { planId: 'p1', x: 0.25, y: 0.3 }, grid: { rows: 1, cols: 3 }, cellPrefix: 'C', cellNames: { C2: 'Champagnes' }, cellBoxes: { C1: c1, C2: c2 },
    };
    const marker: api.PlanMarker = { zoneId: 'z3', planId: 'p1', name: 'Cellier', number: 1, x: 0.25, y: 0.3, cellBoxes: { C1: c1, C2: c2 }, cellNames: { C2: 'Champagnes' } };
    /** Toucher le plan de la feuille à (x, y) en fractions de l'image. */
    function tapSheetPlan(s: ReturnType<typeof within>, x: number, y: number) {
      const box = s.getByRole('group', { name: /^Plan de la cave\. Touchez une case/ });
      box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
      fireEvent.click(box, { clientX: x * 400, clientY: y * 200 });
    }

    it('seulement pour une zone avec grille, lettre et repère', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [main], markers: [marker] });
      vi.spyOn(api, 'getZones').mockResolvedValue([zones[0], { ...zones[1], grid: { rows: 1, cols: 2 }, cellPrefix: 'G' }, casier]);
      mount();
      await userEvent.click(within(await zonesCard().findByRole('listitem', { name: 'Garage' })).getByRole('button', { name: 'Modifier' }));
      expect(within(screen.getByRole('dialog', { name: 'Modifier Garage' })).queryByRole('button', { name: 'Ajuster les cases sur le plan' })).not.toBeInTheDocument();
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Modifier Garage' })).getByRole('button', { name: 'Annuler' }));
      await userEvent.click(zoneRow('Cellier').getByRole('button', { name: 'Modifier' }));
      expect(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).getByRole('button', { name: 'Ajuster les cases sur le plan' })).toBeInTheDocument();
    });

    it('toucher une case puis le plan la déplace ; une case sans position se pose ; Enregistrer envoie toutes les positions', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [main], markers: [marker] });
      vi.spyOn(api, 'getZones').mockResolvedValue([casier]);
      const update = vi.spyOn(api, 'updateZone').mockResolvedValue(casier);
      mount();
      await userEvent.click(within(await zonesCard().findByRole('listitem', { name: 'Cellier' })).getByRole('button', { name: 'Modifier' }));
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).getByRole('button', { name: 'Ajuster les cases sur le plan' }));
      const s = within(screen.getByRole('dialog', { name: 'Ajuster les cases de Cellier' }));
      // Plan recadré sur les cases : englobant [0.1, 0.2, 0.4, 0.4] plus 4 %.
      expect(screen.getByRole('dialog', { name: 'Ajuster les cases de Cellier' }).querySelector('.plan-crop')).toBeInTheDocument();
      expect(s.getByRole('button', { name: 'Case Champagnes (C2)' })).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(s.getByRole('button', { name: 'Case C1' }));
      expect(s.getByRole('button', { name: 'Case C1' })).toHaveAttribute('aria-pressed', 'true');
      expect(s.getByRole('status')).toHaveTextContent('Case C1 choisie : touchez son nouvel endroit sur le plan.');
      tapSheetPlan(s, 0.2, 0.3);
      const missing = within(s.getByRole('group', { name: 'Cases sans position' }));
      await userEvent.click(missing.getByRole('button', { name: 'C3' }));
      expect(s.getByRole('status')).toHaveTextContent('Case C3 choisie : touchez le plan pour la poser.');
      tapSheetPlan(s, 0.35, 0.3);
      expect(s.queryByRole('group', { name: 'Cases sans position' })).not.toBeInTheDocument();
      await userEvent.click(s.getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() => expect(update).toHaveBeenCalledWith('z3', { cellBoxes: { C1: [0.15, 0.2, 0.25, 0.4], C2: c2, C3: [0.3, 0.2, 0.4, 0.4] } }));
      expect(await zonesCard().findByRole('status')).toHaveTextContent('Positions des cases enregistrées.');
      expect(screen.queryByRole('dialog', { name: 'Ajuster les cases de Cellier' })).not.toBeInTheDocument();
    });

    it('« Voir tout le plan » enlève le recadrage : une case se pose n’importe où ; recadré, elle reste dans le cadre', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [main], markers: [marker] });
      vi.spyOn(api, 'getZones').mockResolvedValue([casier]);
      const update = vi.spyOn(api, 'updateZone').mockResolvedValue(casier);
      mount();
      await userEvent.click(within(await zonesCard().findByRole('listitem', { name: 'Cellier' })).getByRole('button', { name: 'Modifier' }));
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).getByRole('button', { name: 'Ajuster les cases sur le plan' }));
      const dialog = screen.getByRole('dialog', { name: 'Ajuster les cases de Cellier' });
      const s = within(dialog);
      // Recadré sur [0.06, 0.16, 0.44, 0.44] : les flèches ne sortent pas la case du cadre.
      await userEvent.click(s.getByRole('button', { name: 'Case Champagnes (C2)' }));
      for (let i = 0; i < 3; i++) await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
      const toggle = s.getByRole('button', { name: 'Voir tout le plan' });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(dialog.querySelector('.plan-crop')).not.toBeInTheDocument();
      await userEvent.click(s.getByRole('button', { name: 'Case C1' }));
      tapSheetPlan(s, 0.9, 0.9);
      await userEvent.click(s.getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() => expect(update).toHaveBeenCalledWith('z3', { cellBoxes: { C1: [0.85, 0.8, 0.95, 1], C2: [0.34, 0.2, 0.44, 0.4] } }));
    });

    it('fermer la feuille avec des positions non enregistrées demande confirmation', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [main], markers: [marker] });
      vi.spyOn(api, 'getZones').mockResolvedValue([casier]);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
      mount();
      await userEvent.click(within(await zonesCard().findByRole('listitem', { name: 'Cellier' })).getByRole('button', { name: 'Modifier' }));
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).getByRole('button', { name: 'Ajuster les cases sur le plan' }));
      const dialog = screen.getByRole('dialog', { name: 'Ajuster les cases de Cellier' });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Case C1' }));
      tapSheetPlan(within(dialog), 0.3, 0.3);
      fireEvent.click(dialog);
      expect(confirm).toHaveBeenCalledWith('Abandonner les positions non enregistrées ?');
      expect(screen.getByRole('dialog', { name: 'Ajuster les cases de Cellier' })).toBeInTheDocument();
      fireEvent.click(dialog);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ajuster les cases de Cellier' })).not.toBeInTheDocument());
    });

    it('Annuler n’envoie rien et revient à « Modifier »', async () => {
      vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [main], markers: [marker] });
      vi.spyOn(api, 'getZones').mockResolvedValue([casier]);
      const update = vi.spyOn(api, 'updateZone');
      mount();
      await userEvent.click(within(await zonesCard().findByRole('listitem', { name: 'Cellier' })).getByRole('button', { name: 'Modifier' }));
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Modifier Cellier' })).getByRole('button', { name: 'Ajuster les cases sur le plan' }));
      const s = within(screen.getByRole('dialog', { name: 'Ajuster les cases de Cellier' }));
      await userEvent.click(s.getByRole('button', { name: 'Case C1' }));
      tapSheetPlan(s, 0.5, 0.5);
      await userEvent.click(s.getByRole('button', { name: 'Annuler' }));
      expect(screen.getByRole('dialog', { name: 'Modifier Cellier' })).toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();
    });
  });

  it('archiver une zone placée ou changer l’ordre relit les plans : repère disparu, numéros échangés', async () => {
    const z3: api.PlanMarker = { zoneId: 'z3', planId: 'p1', name: 'Cellier', number: 2, x: 0.8, y: 0.8 };
    const two = { plans: [main], markers: [m1, z3] };
    const swapped = { plans: [main], markers: [{ ...z3, number: 1 }, { ...m1, number: 2 }] };
    const archived = { plans: [main], markers: [m1] };
    const getPlans = vi.spyOn(api, 'getPlans').mockResolvedValueOnce(two).mockResolvedValueOnce(swapped).mockResolvedValue(archived);
    const both: api.Zone[] = [placed[0], zones[1], { ...zones[2], marker: { planId: 'p1', x: 0.8, y: 0.8 } }];
    vi.spyOn(api, 'getZones').mockResolvedValue(both);
    vi.spyOn(api, 'reorderZones').mockResolvedValue(both);
    vi.spyOn(api, 'deleteZone').mockResolvedValue({ archived: true, unplaced: 0 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount();
    expect(await planCard().findByRole('button', { name: 'Zone 2 : Cellier' })).toBeInTheDocument();
    await userEvent.click(zoneRow('Cellier').getByRole('button', { name: 'Monter Cellier' }));
    expect(await planCard().findByRole('button', { name: 'Zone 1 : Cellier' })).toBeInTheDocument();
    expect(planCard().getByRole('button', { name: 'Zone 2 : Cave 1' })).toBeInTheDocument();
    await userEvent.click(zoneRow('Cellier').getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(planCard().queryByRole('button', { name: /Cellier/ })).not.toBeInTheDocument());
    expect(planCard().getByRole('button', { name: 'Zone 1 : Cave 1' })).toBeInTheDocument();
    expect(getPlans).toHaveBeenCalledTimes(3);
  });
});
