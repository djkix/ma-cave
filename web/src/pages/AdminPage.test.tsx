import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../lib/api-client';
import { meFixture } from '../test-fixtures';
import { AdminPage } from './AdminPage';

afterEach(() => vi.restoreAllMocks());

// jsdom n'a ni showModal ni close : simulés comme dans les tests de BottomSheet.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

const me: api.Me = meFixture({ id: 'u1', email: 'admin@example.com', displayName: 'Admin', isAdmin: true });
const users: api.AdminUser[] = [
  { id: 'u1', email: 'admin@example.com', displayName: 'Admin', status: 'ACTIVE', isAdmin: true, isBreakGlass: false, createdAt: '2026-01-01T00:00:00Z', lastLoginAt: '2026-02-01T00:00:00Z', hasCave: true },
  { id: 'u2', email: 'sophie@example.fr', displayName: 'Sophie', status: 'ACTIVE', isAdmin: false, isBreakGlass: false, createdAt: '2026-01-02T00:00:00Z', lastLoginAt: null, hasCave: true },
];
const budget: api.AdminBudget = { caveShare: 0.2, invitedShare: 0.6, capCents: 500, spentThisMonthCents: 123 };

// Sections ajoutées par les caves : réponses neutres par défaut, chaque test les remplace au besoin.
beforeEach(() => {
  vi.spyOn(api, 'getRegistrations').mockResolvedValue([]);
  vi.spyOn(api, 'getAdminBudget').mockResolvedValue(budget);
  vi.spyOn(api, 'getReadingQuality').mockResolvedValue({ days: 30, entries: 0, rate: null, fields: [] });
  vi.spyOn(api, 'getGeminiUsage').mockResolvedValue({ rows: [], totals: { ok: 0, refused: 0, errors: 0, costCents: 0 }, pause: { until: null, reason: null } });
  vi.spyOn(api, 'getVintages').mockResolvedValue({ regions: [], qualities: [] });
  vi.spyOn(api, 'searchGuards').mockResolvedValue([]);
});

const rowOf = (text: string) => screen.getAllByText(text)[0].closest<HTMLElement>('.list__row')!;

function mount(path = '/admin/comptes') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/:tab" element={<AdminPage />} />
          <Route path="*" element={<p>ailleurs</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

/** Ouvre le menu ⋯ d'un compte et choisit une action. */
async function choose(email: string, action: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Actions pour ${email}` }));
  await userEvent.click(screen.getByRole('button', { name: action }));
}

describe('Onglets', () => {
  it('montre les trois onglets, l’actif marqué, et le nombre d’inscriptions sur Comptes', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    vi.spyOn(api, 'getRegistrations').mockResolvedValue([
      { id: 'r1', email: 'lea@example.com', displayName: null, createdAt: '2026-10-03T08:30:00Z' },
      { id: 'r2', email: 'zoe@example.com', displayName: null, createdAt: '2026-10-05T18:00:00Z' },
    ]);
    mount('/admin/couts');
    const tabs = within(await screen.findByRole('tablist', { name: 'Administration' }));
    const comptes = tabs.getByRole('link', { name: /Comptes/ });
    expect(comptes).toHaveAttribute('href', '/admin/comptes');
    expect(await within(comptes).findByText('2')).toHaveClass('badge', 'badge--warn');
    expect(tabs.getByRole('link', { name: 'Coûts de l’IA' })).toHaveAttribute('aria-current', 'page');
    expect(comptes).not.toHaveAttribute('aria-current');
    expect(tabs.getByRole('link', { name: 'Données du vin' })).toHaveAttribute('href', '/admin/donnees');
  });

  it('Coûts de l’IA : budget et consommation, sans les comptes', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    const list = vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    mount('/admin/couts');
    expect(await screen.findByRole('heading', { name: 'Budget' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Consommation Gemini' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Comptes' })).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  it('Données du vin : lecture, millésimes et gardes', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    mount('/admin/donnees');
    expect(await screen.findByRole('heading', { name: 'Gardes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Qualité de la lecture/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Qualité des millésimes/ })).toBeInTheDocument();
  });

  it('n’a plus de lien Confidentialité', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    for (const path of ['/admin/comptes', '/admin/couts', '/admin/donnees']) {
      mount(path);
      await screen.findByRole('tablist', { name: 'Administration' });
      expect(screen.queryByRole('link', { name: /Confidentialité/ })).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('renvoie un onglet inconnu vers Comptes', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    mount('/admin/inconnu');
    expect(await screen.findByRole('heading', { name: 'Comptes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Comptes/ })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Comptes', () => {
  it('liste les comptes dans la carte Comptes', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    mount();
    const card = within((await screen.findByRole('heading', { name: 'Comptes' })).closest('section')!);
    expect(await card.findByText('sophie@example.fr')).toBeInTheDocument();
    expect(card.getByText('Sophie')).toBeInTheDocument();
    expect(within(rowOf('admin@example.com')).getByText('Administrateur')).toHaveClass('badge--ok');
    expect(within(rowOf('sophie@example.fr')).getByText(/Dernière connexion jamais/)).toBeInTheDocument();
  });

  it('bloque un compte après confirmation, et rien sans', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    const update = vi.spyOn(api, 'updateAdminUser').mockResolvedValue({ ...users[1], status: 'BLOCKED' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mount();
    await choose('sophie@example.fr', 'Bloquer');
    expect(confirm).toHaveBeenCalledWith('Bloquer sophie@example.fr ? Le compte ne pourra plus se connecter.');
    expect(update).not.toHaveBeenCalled();
    await choose('sophie@example.fr', 'Bloquer');
    await waitFor(() => expect(update).toHaveBeenCalledWith('u2', { status: 'BLOCKED' }));
  });

  it('retire les droits d’administrateur après confirmation', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue([users[0], { ...users[1], isAdmin: true }]);
    const update = vi.spyOn(api, 'updateAdminUser').mockResolvedValue(users[1]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mount();
    await choose('sophie@example.fr', 'Retirer les droits');
    expect(confirm).toHaveBeenCalledWith('Retirer les droits d’administrateur de sophie@example.fr ?');
    expect(update).not.toHaveBeenCalled();
    await choose('sophie@example.fr', 'Retirer les droits');
    await waitFor(() => expect(update).toHaveBeenCalledWith('u2', { isAdmin: false }));
  });

  it('réactive et promeut sans confirmation', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue([users[0], { ...users[1], status: 'BLOCKED' }]);
    const update = vi.spyOn(api, 'updateAdminUser').mockResolvedValue(users[1]);
    const confirm = vi.spyOn(window, 'confirm');
    mount();
    await screen.findByText('sophie@example.fr');
    expect(within(rowOf('sophie@example.fr')).getByText('Bloqué')).toHaveClass('badge--warn');
    await choose('sophie@example.fr', 'Réactiver');
    await waitFor(() => expect(update).toHaveBeenCalledWith('u2', { status: 'ACTIVE' }));
    await choose('sophie@example.fr', 'Promouvoir administrateur');
    await waitFor(() => expect(update).toHaveBeenCalledWith('u2', { isAdmin: true }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('sa propre ligne : pas de menu, « votre compte »', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    mount();
    await screen.findByText('sophie@example.fr');
    const self = within(rowOf('admin@example.com'));
    expect(self.queryByRole('button')).not.toBeInTheDocument();
    expect(self.getByText('votre compte')).toBeInTheDocument();
  });
});

it('montre « Réservé à l’administrateur. » à un non-administrateur, sans aucune requête d’administration', async () => {
  vi.spyOn(api, 'getMe').mockResolvedValue({ ...me, isAdmin: false });
  const calls = [vi.spyOn(api, 'getAdminUsers'), vi.spyOn(api, 'getRegistrations'), vi.spyOn(api, 'getAdminBudget'), vi.spyOn(api, 'getGeminiUsage')];
  mount('/admin/couts');
  expect(await screen.findByText('Réservé à l’administrateur.')).toBeInTheDocument();
  for (const c of calls) expect(c).not.toHaveBeenCalled();
});

describe('Inscriptions', () => {
  const registrations: api.Registration[] = [
    { id: 'r1', email: 'lea@example.com', displayName: 'Léa Martin', createdAt: '2026-10-03T08:30:00Z' },
    { id: 'r2', email: 'zoe@example.com', displayName: null, createdAt: '2026-10-05T18:00:00Z' },
  ];

  it('liste les inscriptions en attente avec nom, e-mail et date', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    vi.spyOn(api, 'getRegistrations').mockResolvedValue(registrations);
    mount();
    expect(await screen.findByRole('heading', { name: 'Inscriptions' })).toBeInTheDocument();
    await screen.findByText('lea@example.com');
    const lea = within(rowOf('lea@example.com'));
    expect(lea.getByText('Léa Martin')).toBeInTheDocument();
    expect(lea.getByText(/3 oct\.? 2026/)).toBeInTheDocument();
    const zoe = within(rowOf('zoe@example.com'));
    expect(zoe.queryByText(/null/)).not.toBeInTheDocument();
    expect(zoe.getByRole('button', { name: 'Valider' })).toBeInTheDocument();
    expect(zoe.getByRole('button', { name: 'Refuser' })).toBeInTheDocument();
  });

  it('dit qu’aucune inscription n’attend', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    mount();
    expect(await screen.findByText('Aucune inscription en attente')).toBeInTheDocument();
  });

  it('valide une inscription puis relit inscriptions et comptes', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    const list = vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    const regs = vi.spyOn(api, 'getRegistrations').mockResolvedValue(registrations);
    const validate = vi.spyOn(api, 'validateRegistration').mockResolvedValue({ id: 'r1', status: 'ACTIVE', cave: { id: 'c9', name: 'Cave de Léa Martin' } });
    mount();
    await screen.findByText('lea@example.com');
    await userEvent.click(within(rowOf('lea@example.com')).getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(validate).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(regs).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('refuse une inscription seulement après confirmation', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    vi.spyOn(api, 'getRegistrations').mockResolvedValue(registrations);
    const refuse = vi.spyOn(api, 'refuseRegistration').mockResolvedValue({ id: 'r2', status: 'BLOCKED' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mount();
    await screen.findByText('zoe@example.com');
    const button = within(rowOf('zoe@example.com')).getByRole('button', { name: 'Refuser' });
    await userEvent.click(button);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('zoe@example.com'));
    expect(refuse).not.toHaveBeenCalled();
    await userEvent.click(button);
    await waitFor(() => expect(refuse).toHaveBeenCalledWith('r2'));
  });

  it('affiche tel quel le refus de l’api', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    vi.spyOn(api, 'getRegistrations').mockResolvedValue(registrations);
    vi.spyOn(api, 'validateRegistration').mockRejectedValue(new api.ApiError(404, 'Inscription introuvable'));
    mount();
    await screen.findByText('lea@example.com');
    await userEvent.click(within(rowOf('lea@example.com')).getByRole('button', { name: 'Valider' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Inscription introuvable');
  });
});

describe('Créer sa cave', () => {
  const withoutCave: api.AdminUser[] = [
    users[0],
    { ...users[1], hasCave: false },
    { id: 'u3', email: 'blocked@example.com', displayName: null, status: 'BLOCKED', isAdmin: false, isBreakGlass: false, createdAt: '2026-01-03T00:00:00Z', lastLoginAt: null, hasCave: false },
  ];

  it('n’est proposé qu’aux comptes actifs sans cave, et crée la cave', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    const list = vi.spyOn(api, 'getAdminUsers').mockResolvedValue(withoutCave);
    const create = vi.spyOn(api, 'createUserCave').mockResolvedValue({ id: 'c9', name: 'Cave de Sophie' });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions pour blocked@example.com' }));
    expect(screen.queryByRole('button', { name: 'Créer sa cave' })).not.toBeInTheDocument();
    await choose('sophie@example.fr', 'Créer sa cave');
    await waitFor(() => expect(create).toHaveBeenCalledWith('u2'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('affiche le refus de l’api', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(withoutCave);
    vi.spyOn(api, 'createUserCave').mockRejectedValue(new api.ApiError(409, 'Ce compte a déjà une cave'));
    mount();
    await choose('sophie@example.fr', 'Créer sa cave');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce compte a déjà une cave');
  });
});

describe('Budget', () => {
  it('montre la dépense du mois, le plafond, la part en pourcentage et la cave exemptée', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    mount('/admin/couts');
    expect(await screen.findByText(/Dépensé ce mois : 1,23\s€ sur 5,00\s€/)).toBeInTheDocument();
    expect(screen.getByLabelText('Part maximale par cave (%)')).toHaveValue(20);
    expect(screen.getByText(/La cave de l’administrateur principal n’est pas limitée/)).toBeInTheDocument();
  });

  it('enregistre la part en fraction (35 % → 0,35)', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    const put = vi.spyOn(api, 'putAdminBudget').mockResolvedValue({ ...budget, caveShare: 0.35 });
    mount('/admin/couts');
    const input = await screen.findByLabelText('Part maximale par cave (%)');
    await waitFor(() => expect(input).toHaveValue(20));
    await userEvent.clear(input);
    await userEvent.type(input, '35');
    await userEvent.click(within(screen.getByRole('heading', { name: 'Budget' }).closest('section')!).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith({ caveShare: 0.35, invitedShare: 0.6 }));
  });

  it('enregistre aussi la part de l’ensemble des caves invitées (45 % → 0,45)', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    const put = vi.spyOn(api, 'putAdminBudget').mockResolvedValue({ ...budget, invitedShare: 0.45 });
    mount('/admin/couts');
    const input = await screen.findByLabelText('Part maximale de l’ensemble des caves invitées (%)');
    await waitFor(() => expect(input).toHaveValue(60));
    await userEvent.clear(input);
    await userEvent.type(input, '45');
    await userEvent.click(within(screen.getByRole('heading', { name: 'Budget' }).closest('section')!).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith({ caveShare: 0.2, invitedShare: 0.45 }));
  });

  it('refuse une part hors de 0 à 100 ou non entière, sans appel', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    const put = vi.spyOn(api, 'putAdminBudget');
    mount('/admin/couts');
    const input = await screen.findByLabelText('Part maximale par cave (%)');
    await waitFor(() => expect(input).toHaveValue(20));
    const save = within(screen.getByRole('heading', { name: 'Budget' }).closest('section')!).getByRole('button', { name: 'Enregistrer' });
    for (const bad of ['101', '12.5']) {
      await userEvent.clear(input);
      await userEvent.type(input, bad);
      expect(save).toBeDisabled();
      expect(screen.getByText('Entrez un pourcentage entier entre 0 et 100')).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
    }
    await userEvent.clear(input);
    expect(save).toBeDisabled();
    await userEvent.type(input, '0');
    expect(save).toBeEnabled();
    expect(screen.queryByText('Entrez un pourcentage entier entre 0 et 100')).not.toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it('affiche tel quel le refus de l’api', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(me);
    vi.spyOn(api, 'getAdminUsers').mockResolvedValue(users);
    vi.spyOn(api, 'putAdminBudget').mockRejectedValue(new api.ApiError(400, 'La part par cave doit être comprise entre 0 et 1'));
    mount('/admin/couts');
    const input = await screen.findByLabelText('Part maximale par cave (%)');
    await waitFor(() => expect(input).toHaveValue(20));
    await userEvent.click(within(screen.getByRole('heading', { name: 'Budget' }).closest('section')!).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La part par cave doit être comprise entre 0 et 1');
  });
});

