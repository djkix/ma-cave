import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/api-client';
import { viewerMe } from '../test-fixtures';
import { WinePage } from './WinePage';

afterEach(() => vi.restoreAllMocks());

const detail: api.WineDetail = {
  wine: {
    id: 'w1', producer: 'Domaine Tempier', cuvee: 'La Tourtine', appellationRaw: 'Bandol', vintage: 2019, color: 'ROUGE', formatCl: 75, referencePhotoId: 'p1', quantity: 6,
    referencePhotoSource: null, referencePhotoSourceUrl: null, pairing: null, producerKey: null, producerProfile: null,
  },
  movements: [
    { id: 'mv2', delta: 2, type: 'MOVE', occurredAt: '2026-10-02T10:00:00Z', note: null, reversesId: null, locationId: 'l1', locationLabel: 'Cave 2 / B / 3' },
    { id: 'mv1', delta: -2, type: 'MOVE', occurredAt: '2026-10-02T10:00:00Z', note: null, reversesId: null, locationId: null, locationLabel: null },
    { id: 'm1', delta: 6, type: 'IN', occurredAt: '2026-09-21T10:00:00Z', note: null, reversesId: null, locationId: null, locationLabel: null },
  ],
  locations: [
    { id: 'l1', label: 'Cave 2 / B / 3', quantity: 2, zoneId: 'z2' },
    { id: 'l2', label: 'Garage', quantity: 1, zoneId: 'z1' },
    { id: null, label: 'Sans emplacement', quantity: 3, zoneId: null },
  ],
  exitDefault: 'l1',
};

const cellar: api.Location[] = [
  { id: 'l1', zoneId: 'z2', zone: 'Cave 2', casier: 'B', position: '3', label: 'Cave 2 / B / 3', lastUsed: true },
  { id: 'l2', zoneId: 'z1', zone: 'Garage', casier: null, position: null, label: 'Garage', lastUsed: false },
];

const zones: api.Zone[] = [
  { id: 'z1', name: 'Garage', indication: 'Au fond, derrière l’escalier', hasPhoto: true, sortOrder: 0, marker: null, grid: null },
  { id: 'z2', name: 'Cave 2', indication: null, hasPhoto: false, sortOrder: 1, marker: null, grid: null },
];

beforeEach(() => {
  vi.spyOn(api, 'getZones').mockResolvedValue(zones);
});

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/cave/w1']}>
        <Routes>
          <Route path="/cave/:wineId" element={<WinePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const section = () => within(screen.getByRole('region', { name: 'Emplacements' }));

it('liste chaque endroit et sa quantité, et les déplacements au journal du vin', async () => {
  vi.spyOn(api, 'getWine').mockResolvedValue(detail);
  mount();
  await screen.findByRole('region', { name: 'Emplacements' });
  const items = section().getAllByRole('listitem').map((li) => li.textContent);
  expect(items).toEqual(['Cave 2 / B / 3 × 2', 'Garage × 1', 'Sans emplacement × 3']);
  expect(section().queryByText('Au fond, derrière l’escalier')).not.toBeInTheDocument();
  expect(screen.getByText(/Déplacé · Cave 2 \/ B \/ 3/)).toBeInTheDocument();
  expect(screen.getByText(/Déplacé · Sans emplacement/)).toBeInTheDocument();
});

it('toucher un emplacement montre ou cache l’indication et la photo de sa zone', async () => {
  vi.spyOn(api, 'getWine').mockResolvedValue(detail);
  mount();
  await screen.findByRole('region', { name: 'Emplacements' });
  const garage = await section().findByRole('button', { name: /Garage/ });
  expect(garage).toHaveAttribute('aria-expanded', 'false');
  // Zone sans indication ni photo, ou « Sans emplacement » : rien à révéler, pas de bouton.
  expect(section().queryByRole('button', { name: /Cave 2/ })).not.toBeInTheDocument();
  expect(section().queryByRole('button', { name: /Sans emplacement/ })).not.toBeInTheDocument();
  await userEvent.click(garage);
  expect(garage).toHaveAttribute('aria-expanded', 'true');
  expect(section().getByText('Au fond, derrière l’escalier')).toBeInTheDocument();
  expect(section().getByRole('img', { name: 'Photo de la zone Garage' })).toHaveAttribute('src', '/api/caves/zones/z1/photo');
  await userEvent.click(garage);
  expect(section().queryByText('Au fond, derrière l’escalier')).not.toBeInTheDocument();
});

it('membre : voit les emplacements et le détail des zones, mais aucun bouton ni requête d’écriture', async () => {
  const me = vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  const getWine = vi.spyOn(api, 'getWine').mockResolvedValue(detail);
  const locations = vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
  const recent = vi.spyOn(api, 'getRecentMovements').mockResolvedValue([]);
  const move = vi.spyOn(api, 'moveWine');
  mount();
  await screen.findByRole('region', { name: 'Emplacements' });
  await waitFor(() => expect(me).toHaveBeenCalled());
  // Fiche et session lues (rôle connu) avant de constater l'absence d'actions.
  await act(async () => { await Promise.all([me.mock.results[0].value, getWine.mock.results[0].value]); });
  expect(section().getAllByRole('listitem')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'Ranger / déplacer' })).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'D\'où sort-elle ?' })).not.toBeInTheDocument();
  // Seuls boutons, ouverts au membre : l'icône d'emplacement de l'en-tête et le détail de la zone « Garage ».
  expect(screen.queryAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Voir l’emplacement', expect.stringContaining('Garage')]);
  await userEvent.click(section().getByRole('button', { name: /Garage/ }));
  expect(section().getByText('Au fond, derrière l’escalier')).toBeInTheDocument();
  expect(locations).not.toHaveBeenCalled();
  expect(recent).not.toHaveBeenCalled();
  expect(move).not.toHaveBeenCalled();
});

describe('plan de la cave', () => {
  const plan = { id: 'p1', name: 'Plan principal', width: 1200, height: 800, updatedAt: '2026-10-13T10:00:00.000Z', analysis: 'NONE' as const, suggestions: [], analysisInfo: null };
  // Casier C : cases C1, C2 et C15 (« Champagnes »), englobant [0.29, 0.14, 0.46, 0.56] → vignette [0.25, 0.1, 0.5, 0.6].
  const casierC: api.PlanMarker = {
    zoneId: 'z3', planId: 'p1', name: 'Casier C', number: 3, x: 0.4, y: 0.3,
    cellBoxes: { C1: [0.29, 0.14, 0.37, 0.24], C2: [0.37, 0.14, 0.46, 0.24], C15: [0.37, 0.46, 0.46, 0.56] }, cellNames: { C15: 'Champagnes' },
  };
  const markers: api.PlanMarker[] = [{ zoneId: 'z1', planId: 'p1', name: 'Garage', number: 1, x: 0.2, y: 0.3 }, { zoneId: 'z2', planId: 'p1', name: 'Cave 2', number: 2, x: 0.6, y: 0.7 }, casierC];
  const placed: api.Zone[] = [
    { ...zones[0], marker: { planId: 'p1', x: 0.2, y: 0.3 } }, { ...zones[1], marker: { planId: 'p1', x: 0.6, y: 0.7 } },
    { id: 'z3', name: 'Casier C', indication: null, hasPhoto: false, sortOrder: 2, marker: { planId: 'p1', x: 0.4, y: 0.3 }, grid: { rows: 4, cols: 12 }, cellPrefix: 'C', cellNames: { C15: 'Champagnes' } },
  ];
  const inCasier: api.WineDetail = {
    ...detail,
    locations: [
      { id: 'l3', label: 'Casier C / Champagnes (C15)', quantity: 2, zoneId: 'z3', casier: 'champagnes' },
      { id: 'l4', label: 'Casier C / Loire', quantity: 1, zoneId: 'z3', casier: 'Loire' },
      ...detail.locations!,
    ],
  };
  function mountPlaced(wine = inCasier) {
    vi.spyOn(api, 'getZones').mockResolvedValue(placed);
    vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [plan], markers });
    vi.spyOn(api, 'getWine').mockResolvedValue(wine);
    mount();
  }
  /** Bouton du dépliant d'un endroit, trouvé par le texte alternatif de sa vignette. */
  const thumbnail = async (label: string) => (await within(await screen.findByRole('region', { name: 'Emplacements' })).findByRole('img', { name: `Plan : ${label}` })).closest('button')!;
  const crop = (el: HTMLElement) => el.querySelector<HTMLElement>('.plan-crop__inner')!.style;

  it('case connue : vignette recadrée sur le casier, sans toucher, case de la bouteille en évidence, légende « … × 2 »', async () => {
    mountPlaced();
    const button = await thumbnail('Casier C / Champagnes (C15)');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveTextContent('Casier C / Champagnes (C15) × 2');
    expect(crop(button)).toMatchObject({ width: '400%', left: '-100%', top: '-20%' });
    expect(button.querySelectorAll('.plan-view__zone-cell')).toHaveLength(3);
    const current = button.querySelectorAll('.plan-view__zone-cell--current');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Champagnes');
    // Seul le repère de la zone est sur la vignette.
    expect(within(button).queryByRole('img', { name: /Zone [12]/ })).not.toBeInTheDocument();
  });

  it('casier « Loire » (hors grille) : même recadrage, aucune case en évidence', async () => {
    mountPlaced();
    const button = await thumbnail('Casier C / Loire');
    expect(button).toHaveTextContent('Casier C / Loire × 1');
    expect(crop(button)).toMatchObject({ width: '400%', left: '-100%', top: '-20%' });
    expect(button.querySelectorAll('.plan-view__zone-cell')).toHaveLength(3);
    expect(button.querySelector('.plan-view__zone-cell--current')).toBeNull();
  });

  it('zone avec un repère sans cases : vignette autour du repère, repère en évidence', async () => {
    mountPlaced();
    const button = await thumbnail('Cave 2 / B / 3');
    // Fenêtre [0.4, 0.5, 0.8, 0.9] autour du repère (0.6, 0.7).
    expect(crop(button)).toMatchObject({ width: '250%', left: '-100%', top: '-125%' });
    expect(within(button).getByRole('img', { name: 'Zone 2 : Cave 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('zone sans repère, ou « Sans emplacement » : texte seul, et le plan n’est lu que si une zone a un repère', async () => {
    const getPlans = vi.spyOn(api, 'getPlans').mockResolvedValue({ plans: [], markers: [] });
    vi.spyOn(api, 'getWine').mockResolvedValue(detail);
    mount();
    await screen.findByRole('region', { name: 'Emplacements' });
    await userEvent.click(await section().findByRole('button', { name: /Garage/ }));
    expect(section().queryByRole('img', { name: /Plan/ })).not.toBeInTheDocument();
    expect(section().getByText('Sans emplacement').closest('li')!.querySelector('img')).toBeNull();
    expect(getPlans).not.toHaveBeenCalled();
  });

  it('toucher la vignette montre l’indication, la photo et le plan entier de la zone ; membre en lecture seule : idem, sans commande', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
    const set = vi.spyOn(api, 'setZoneMarker');
    mountPlaced(detail);
    const button = await thumbnail('Garage');
    expect(section().queryByText('Au fond, derrière l’escalier')).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(section().getByText('Au fond, derrière l’escalier')).toBeInTheDocument();
    const photo = section().getByRole('img', { name: 'Photo de la zone Garage' });
    const planImg = section().getByRole('img', { name: 'Plan de la cave' });
    expect(planImg).toHaveAttribute('src', '/api/caves/plans/p1/image?v=2026-10-13T10%3A00%3A00.000Z');
    expect(photo.compareDocumentPosition(planImg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Plan entier : tous les repères, celui de la zone en avant.
    const whole = within(planImg.closest('.plan-view') as HTMLElement);
    expect(whole.getByRole('img', { name: 'Zone 1 : Garage' })).toHaveAttribute('aria-current', 'true');
    expect(whole.getByRole('img', { name: 'Zone 2 : Cave 2' })).not.toHaveAttribute('aria-current');
    // Aucun repère ni case n'est un bouton (les vignettes sont nommées « Plan : … »).
    expect(screen.queryByRole('button', { name: /^Zone \d/ })).not.toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(section().queryByRole('img', { name: 'Plan de la cave' })).not.toBeInTheDocument();
  });

  it('Ranger / déplacer : « Vers » se choisit en touchant la case sur le plan', async () => {
    vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
    vi.spyOn(api, 'getZoneCells').mockResolvedValue([]);
    const move = vi.spyOn(api, 'moveWine').mockResolvedValue({ locations: inCasier.locations! });
    mountPlaced();
    await userEvent.click(await screen.findByRole('button', { name: 'Ranger / déplacer' }));
    const form = within(screen.getByRole('form', { name: 'Ranger / déplacer' }));
    await userEvent.click(await form.findByRole('button', { name: 'Case C2, Casier C' }));
    expect(form.getByRole('status')).toHaveTextContent('Casier C · case C2');
    await userEvent.click(form.getByRole('button', { name: 'Déplacer' }));
    await waitFor(() => expect(move).toHaveBeenCalledWith('w1', expect.objectContaining({ to: { zoneId: 'z3', casier: 'C2', position: null } })));
  });

  it('fenêtre « Emplacement » : vignette, la toucher montre le plan entier', async () => {
    mountPlaced();
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    await userEvent.click(await screen.findByRole('button', { name: 'Voir l’emplacement' }));
    const dialog = within(screen.getByRole('dialog', { hidden: true }));
    const thumb = await dialog.findByRole('img', { name: 'Plan : Casier C / Champagnes (C15)', hidden: true });
    expect(dialog.queryByRole('img', { name: 'Plan de la cave', hidden: true })).not.toBeInTheDocument();
    await userEvent.click(thumb.closest('button')!);
    expect(dialog.getByRole('img', { name: 'Plan de la cave', hidden: true })).toBeInTheDocument();
  });
});

it('sortie depuis la fiche : question avec la pré-sélection de la fiche', async () => {
  vi.spyOn(api, 'getWine').mockResolvedValue(detail);
  mount();
  const group = await screen.findByRole('group', { name: 'D\'où sort-elle ?' });
  expect(within(group).getByRole('radio', { name: 'Cave 2 / B / 3 · 2' })).toBeChecked();
});

describe('Ranger / déplacer', () => {
  it('déplace depuis l’endroit choisi vers la zone choisie et le casier saisi, avec la datalist', async () => {
    const getWine = vi.spyOn(api, 'getWine').mockResolvedValue(detail);
    vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
    const move = vi.spyOn(api, 'moveWine').mockResolvedValue({ locations: detail.locations! });
    const { container } = mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Ranger / déplacer' }));
    const form = within(screen.getByRole('form', { name: 'Ranger / déplacer' }));
    const from = form.getByLabelText('De');
    expect([...(from as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Cave 2 / B / 3 · 2', 'Garage · 1', 'Sans emplacement · 3']);
    await userEvent.selectOptions(from, 'Sans emplacement · 3');
    const casier = form.getByLabelText('Casier');
    await waitFor(() => expect(container.querySelector(`datalist#${CSS.escape(casier.getAttribute('list')!)} option[value="B"]`)).not.toBeNull());
    await userEvent.selectOptions(await form.findByLabelText('Zone'), 'Cave 2');
    await userEvent.type(casier, 'A');
    const qty = form.getByLabelText('Quantité');
    expect(qty).toHaveAttribute('max', '3');
    await userEvent.clear(qty);
    await userEvent.type(qty, '3');
    await userEvent.click(form.getByRole('button', { name: 'Déplacer' }));
    await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
    expect(move).toHaveBeenCalledWith('w1', {
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/), from: null, to: { zoneId: 'z2', casier: 'A', position: null }, quantity: 3,
    });
    await waitFor(() => expect(getWine).toHaveBeenCalledTimes(2));
  });

  it('affiche tel quel le refus de l’API', async () => {
    vi.spyOn(api, 'getWine').mockResolvedValue(detail);
    vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
    vi.spyOn(api, 'moveWine').mockRejectedValue(new api.ApiError(409, 'Pas assez de bouteilles à cet emplacement'));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Ranger / déplacer' }));
    const form = within(screen.getByRole('form', { name: 'Ranger / déplacer' }));
    await userEvent.type(form.getByLabelText('Casier'), 'Haut');
    await userEvent.click(form.getByRole('button', { name: 'Déplacer' }));
    expect(await form.findByRole('alert')).toHaveTextContent('Pas assez de bouteilles à cet emplacement');
  });
});

describe('inventaire', () => {
  async function count(n: string) {
    await userEvent.click(await screen.findByRole('button', { name: 'Corriger le stock' }));
    await userEvent.clear(screen.getByLabelText('Bouteilles comptées'));
    await userEvent.type(screen.getByLabelText('Bouteilles comptées'), n);
  }

  it('en baisse : demande d’où elles sortent, pré-sélection de la fiche, et l’envoie', async () => {
    vi.spyOn(api, 'getWine').mockResolvedValue(detail);
    vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
    const inventory = vi.spyOn(api, 'postInventory').mockResolvedValue({ movement: { id: 'a1' }, stock: 5, delta: -1, created: true });
    mount();
    await count('5');
    const inv = screen.getByRole('group', { name: 'D\'où sortent-elles ?' });
    expect(within(inv).getByRole('radio', { name: 'Cave 2 / B / 3 · 2' })).toBeChecked();
    await userEvent.click(within(inv).getByRole('radio', { name: 'Garage · 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’inventaire' }));
    await waitFor(() => expect(inventory).toHaveBeenCalledWith('w1', { idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/), counted: 5, locationId: 'l2' }));
  });

  it('en hausse : range dans la zone choisie et au casier saisi', async () => {
    vi.spyOn(api, 'getWine').mockResolvedValue(detail);
    vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
    const inventory = vi.spyOn(api, 'postInventory').mockResolvedValue({ movement: { id: 'a1' }, stock: 8, delta: 2, created: true });
    mount();
    await count('8');
    const where = within(screen.getByRole('group', { name: 'Emplacement' }));
    const zone = await where.findByLabelText('Zone');
    expect(zone).toHaveValue('');
    await waitFor(() => expect(within(zone).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sans zone', 'Garage', 'Cave 2']));
    await userEvent.selectOptions(zone, 'Garage');
    expect(where.getByText('Au fond, derrière l’escalier')).toBeInTheDocument();
    await userEvent.type(where.getByLabelText('Casier'), 'Haut');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’inventaire' }));
    await waitFor(() => expect(inventory).toHaveBeenCalledWith('w1', {
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/), counted: 8, location: { zoneId: 'z1', casier: 'Haut', position: null },
    }));
  });

  it('en hausse sans rien choisir : « Sans emplacement »', async () => {
    vi.spyOn(api, 'getWine').mockResolvedValue(detail);
    vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
    const inventory = vi.spyOn(api, 'postInventory').mockResolvedValue({ movement: { id: 'a1' }, stock: 8, delta: 2, created: true });
    mount();
    await count('8');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’inventaire' }));
    await waitFor(() => expect(inventory).toHaveBeenCalledWith('w1', { idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/), counted: 8, locationId: null }));
  });

  it('affiche tel quel le 409 de l’endroit', async () => {
    vi.spyOn(api, 'getWine').mockResolvedValue(detail);
    vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
    vi.spyOn(api, 'postInventory').mockRejectedValue(new api.ApiError(409, 'Pas assez de bouteilles à cet emplacement'));
    mount();
    await count('3');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’inventaire' }));
    expect(await screen.findByText('Pas assez de bouteilles à cet emplacement')).toBeInTheDocument();
  });
});

it('masque la section quand le vin n’a plus de stock', async () => {
  vi.spyOn(api, 'getWine').mockResolvedValue({ ...detail, wine: { ...detail.wine, quantity: 0 }, locations: [], exitDefault: undefined });
  mount();
  await screen.findByRole('heading', { name: /Domaine Tempier/ });
  expect(screen.queryByRole('region', { name: 'Emplacements' })).not.toBeInTheDocument();
});

it('« Vers » est un groupe de champs nommé', async () => {
  vi.spyOn(api, 'getWine').mockResolvedValue(detail);
  vi.spyOn(api, 'getLocations').mockResolvedValue(cellar);
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Ranger / déplacer' }));
  const to = screen.getByRole('group', { name: 'Vers' });
  expect(within(to).getByLabelText('Zone')).toBeInTheDocument();
});

it('l’icône d’emplacement de l’en-tête ouvre la fenêtre avec la photo de la zone', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue(viewerMe());
  vi.spyOn(api, 'getWine').mockResolvedValue(detail);
  mount();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  await userEvent.click(await screen.findByRole('button', { name: 'Voir l’emplacement' }));
  expect(await screen.findByRole('img', { name: 'Photo de la zone Garage' })).toBeInTheDocument();
});
