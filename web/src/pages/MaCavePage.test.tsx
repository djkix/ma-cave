import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import { MaCavePage } from './MaCavePage';

afterEach(() => vi.restoreAllMocks());

// jsdom n'a ni showModal ni close : simulés comme dans les tests de BottomSheet.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

const zones: api.Zone[] = [
  { id: 'z1', name: 'Cave 1', indication: 'À gauche en entrant', hasPhoto: true, sortOrder: 0, marker: null },
  { id: 'z2', name: 'Garage', indication: null, hasPhoto: false, sortOrder: 1, marker: null },
  { id: 'z3', name: 'Cellier', indication: 'Au fond, derrière l’escalier', hasPhoto: false, sortOrder: 2, marker: null },
];

// Zones lues par défaut (vide) : les tests des membres et du nom n'en dépendent pas.
beforeEach(() => {
  vi.spyOn(api, 'getZones').mockResolvedValue([]);
  vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [], markers: [] });
});

const members: api.MemberView[] = [
  { id: 'm1', email: 'franck@example.com', displayName: 'Franck', role: 'OWNER', pending: false },
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

it('regroupe le nom de la cave, le plan, les zones, les membres puis la sauvegarde, sous le titre « Ma cave › Réglages »', async () => {
  vi.spyOn(api, 'getMembers').mockResolvedValue(members);
  mount();
  expect(screen.getByRole('heading', { level: 1, name: 'Ma cave › Réglages' })).toBeInTheDocument();
  await screen.findByText('franck@example.com');
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
    const create = vi.spyOn(api, 'createZone').mockResolvedValue({ id: 'z4', name: 'Placard', indication: null, hasPhoto: false, sortOrder: 3, marker: null });
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
    await waitFor(() => expect(update).toHaveBeenCalledWith('z3', { name: 'Cellier du bas', indication: null }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modifier Cellier' })).not.toBeInTheDocument());
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

  it('« Supprimer » demande confirmation et affiche tel quel le 409 des bouteilles encore rangées', async () => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const remove = vi.spyOn(api, 'deleteZone').mockRejectedValue(new api.ApiError(409, 'Des bouteilles sont encore rangées dans cette zone'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mount();
    await zonesCard().findByText('Garage');
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Supprimer' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Garage'));
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(zoneRow('Garage').getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('z2'));
    expect(await zonesCard().findByRole('alert')).toHaveTextContent('Des bouteilles sont encore rangées dans cette zone');
  });

  it.each([
    [false, 'Zone supprimée'],
    [true, 'Zone archivée (elle reste dans l’historique)'],
  ])('après « Supprimer » (archived: %s) : « %s »', async (archived, message) => {
    vi.spyOn(api, 'getZones').mockResolvedValue(zones);
    const remove = vi.spyOn(api, 'deleteZone').mockResolvedValue({ archived });
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
  expect(await screen.findByText('franck@example.com')).toBeInTheDocument();
  // Ligne de personne commune : nom affiché en titre, e-mail dessous ; sans nom, l'e-mail en titre.
  expect(rowOf('franck@example.com')).toHaveClass('person-row');
  const owner = within(rowOf('franck@example.com'));
  expect(owner.getByText('Franck').tagName).toBe('STRONG');
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
  await waitFor(() => expect(input).toHaveValue('Cave de Franck'));
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
  await waitFor(() => expect(input).toHaveValue('Cave de Franck'));
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
  await waitFor(() => expect(input).toHaveValue('Cave de Franck'));
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Le nom de la cave doit faire de 1 à 80 caractères');
});

describe('plan de la cave', () => {
  const main: api.CavePlan = { id: 'p1', name: 'Plan principal', width: 2000, height: 1000, updatedAt: '2026-10-13T10:00:00.000Z' };
  const cellier: api.CavePlan = { id: 'p2', name: 'Cellier', width: 800, height: 600, updatedAt: '2026-10-20T09:00:00.000Z' };
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
    const input = planCard().getByLabelText('Photo du plan');
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
    const garage: api.CavePlan = { id: 'p3', name: 'Garage', width: 1000, height: 1000, updatedAt: '2026-10-20T10:00:00.000Z' };
    const get = vi.spyOn(api, 'getPlans').mockResolvedValueOnce(twoPlans).mockResolvedValue({ plans: [main, cellier, garage], markers: [m1, m3] });
    const create = vi.spyOn(api, 'createPlan').mockResolvedValue(garage);
    mount();
    await userEvent.click(await findTab('+ Ajouter un plan'));
    expect(tabs().getByRole('tab', { name: '+ Ajouter un plan' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.type(planCard().getByLabelText('Nom du plan'), ' Garage ');
    const file = new File(['x'], 'garage.jpg', { type: 'image/jpeg' });
    await userEvent.upload(planCard().getByLabelText('Photo du plan'), file);
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

  it('menu « ⋯ » du plan affiché : Renommer, Remplacer la photo, Supprimer le plan', async () => {
    vi.spyOn(api, 'getPlans').mockResolvedValue(twoPlans);
    mount();
    await userEvent.click(await findTab('Cellier'));
    expect(planCard().queryByRole('button', { name: 'Renommer' })).not.toBeInTheDocument();
    const menu = planCard().getByRole('button', { name: 'Actions du plan Cellier' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Renommer', 'Remplacer la photo', 'Supprimer le plan']) expect(planCard().getByRole('button', { name })).toBeInTheDocument();
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

  it('archiver une zone placée ou changer l’ordre relit les plans : repère disparu, numéros échangés', async () => {
    const z3: api.PlanMarker = { zoneId: 'z3', planId: 'p1', name: 'Cellier', number: 2, x: 0.8, y: 0.8 };
    const two = { plans: [main], markers: [m1, z3] };
    const swapped = { plans: [main], markers: [{ ...z3, number: 1 }, { ...m1, number: 2 }] };
    const archived = { plans: [main], markers: [m1] };
    const getPlans = vi.spyOn(api, 'getPlans').mockResolvedValueOnce(two).mockResolvedValueOnce(swapped).mockResolvedValue(archived);
    const both: api.Zone[] = [placed[0], zones[1], { ...zones[2], marker: { planId: 'p1', x: 0.8, y: 0.8 } }];
    vi.spyOn(api, 'getZones').mockResolvedValue(both);
    vi.spyOn(api, 'reorderZones').mockResolvedValue(both);
    vi.spyOn(api, 'deleteZone').mockResolvedValue({ archived: true });
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
