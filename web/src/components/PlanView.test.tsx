import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../lib/api-client';
import type { PlanMarker } from '../lib/api-client';
import { PlanView, thumbnailBox, ZonePlan } from './PlanView';

const plan = { width: 2400, height: 1200, updatedAt: '2026-10-13T10:00:00.000Z' };
const markers: PlanMarker[] = [
  { zoneId: 'z1', planId: 'p1', name: 'Cave 1', number: 1, x: 0.1, y: 0.2 },
  { zoneId: 'z2', planId: 'p1', name: 'Garage', number: 2, x: 0.75, y: 0.5 },
];

it('montre l’image (texte alternatif), réserve sa place au format du plan et place les repères en pourcentage', () => {
  const { container } = render(<PlanView src="/plan.jpg" plan={plan} markers={markers} onMarkerClick={() => undefined} />);
  expect(screen.getByRole('img', { name: 'Plan de la cave' })).toHaveAttribute('src', '/plan.jpg');
  expect((container.firstChild as HTMLElement).style.aspectRatio).toBe('2400 / 1200');
  const garage = screen.getByRole('button', { name: 'Zone 2 : Garage' });
  expect(garage).toHaveTextContent('2');
  expect(garage.style.left).toBe('75%');
  expect(garage.style.top).toBe('50%');
  expect(screen.getByRole('button', { name: 'Zone 1 : Cave 1' }).style.left).toBe('10%');
});

it('un toucher sur le plan donne la position en fractions de la boîte rendue, à toute taille', () => {
  const onPlanClick = vi.fn();
  const { container } = render(<PlanView src="/plan.jpg" plan={plan} markers={[]} onPlanClick={onPlanClick} />);
  const box = container.firstChild as HTMLElement;
  box.getBoundingClientRect = () => ({ left: 20, top: 100, width: 300, height: 150, right: 320, bottom: 250, x: 20, y: 100, toJSON: () => ({}) });
  fireEvent.click(box, { clientX: 95, clientY: 130 });
  expect(onPlanClick).toHaveBeenLastCalledWith(0.25, 0.2);
  // Bord dépassé (arrondi du navigateur) : ramené dans [0, 1].
  fireEvent.click(box, { clientX: 400, clientY: 90 });
  expect(onPlanClick).toHaveBeenLastCalledWith(1, 0);
});

it('toucher un repère le désigne, sans compter comme un toucher sur le plan', async () => {
  const onPlanClick = vi.fn();
  const onMarkerClick = vi.fn();
  render(<PlanView src="/plan.jpg" plan={plan} markers={markers} onPlanClick={onPlanClick} onMarkerClick={onMarkerClick} />);
  await userEvent.click(screen.getByRole('button', { name: 'Zone 1 : Cave 1' }));
  expect(onMarkerClick).toHaveBeenCalledWith('z1');
  expect(onPlanClick).not.toHaveBeenCalled();
});

it('met en avant le repère de la zone demandée', () => {
  render(<PlanView src="/plan.jpg" plan={plan} markers={markers} highlightZoneId="z2" />);
  expect(screen.getByRole('img', { name: 'Zone 2 : Garage' })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('img', { name: 'Zone 1 : Cave 1' })).not.toHaveAttribute('aria-current');
});

it('sans action : les repères sont des images nommées, pas des boutons', () => {
  render(<PlanView src="/plan.jpg" plan={plan} markers={markers} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Zone 2 : Garage' })).toHaveTextContent('2');
});

it('repère qui vient d’être posé : « + », nommé « Nouveau repère », mis en avant, jamais un bouton', () => {
  render(<PlanView src="/plan.jpg" plan={plan} markers={markers} pending={{ x: 0.4, y: 0.6 }} onMarkerClick={() => undefined} />);
  const pending = screen.getByRole('img', { name: 'Nouveau repère' });
  expect(pending).toHaveTextContent('+');
  expect(pending).toHaveAttribute('aria-current', 'true');
  expect(pending.style.left).toBe('40%');
});

it('propositions : cadres en pointillés placés en pourcentage, étiquette « Casier A · 24 cases » ; un toucher ouvre la proposition, pas le plan', async () => {
  const onPlanClick = vi.fn();
  const onSuggestionClick = vi.fn();
  const suggestions: api.PlanSuggestion[] = [
    { id: 's1', kind: 'CASIER', name: 'Casier A', box: [0.1, 0.2, 0.4, 0.8], rows: 6, cols: 4 },
    { id: 's2', kind: 'AUTRE', name: 'Rangement A', box: [0.5, 0.5, 0.6, 0.6], rows: 1, cols: 1 },
  ];
  render(<PlanView src="/plan.jpg" plan={plan} markers={markers} suggestions={suggestions} onPlanClick={onPlanClick} onSuggestionClick={onSuggestionClick} />);
  const frame = screen.getByRole('button', { name: 'Proposition Casier A' });
  expect(frame).toHaveTextContent('Casier A · 24 cases');
  expect(frame.style.left).toBe('10%');
  expect(frame.style.top).toBe('20%');
  expect(frame.style.width).toBe('30%');
  expect(frame.style.height).toBe('60%');
  expect(screen.getByRole('button', { name: 'Proposition Rangement A' })).toHaveTextContent('Rangement A · 1 case');
  await userEvent.click(frame);
  expect(onSuggestionClick).toHaveBeenCalledWith('s1');
  expect(onPlanClick).not.toHaveBeenCalled();
});

it('proposition avec cases repérées : étiquette sur cellCount ; cases ouvertes : un point nommé par case, non cliquable', async () => {
  const onSuggestionClick = vi.fn();
  const cells: api.DetectedCell[] = [
    { box: [0.1, 0.2, 0.2, 0.4], row: 0, col: 0, name: 'A1' },
    { box: [0.2, 0.2, 0.4, 0.4], row: 0, col: 1, name: 'A2' },
    { box: [0.1, 0.4, 0.2, 0.8], row: null, col: null, name: null },
  ];
  const suggestions: api.PlanSuggestion[] = [
    { id: 's1', kind: 'CASIER', name: 'Casier A', box: [0.1, 0.2, 0.4, 0.8], rows: 2, cols: 2, cellCount: 3, cells },
    { id: 's2', kind: 'CASIER', name: 'Casier B', box: [0.5, 0.5, 0.6, 0.6], rows: 2, cols: 3 },
  ];
  const props = { src: '/plan.jpg', plan, markers, suggestions, onSuggestionClick };
  const { container, rerender } = render(<PlanView {...props} />);
  expect(screen.getByRole('button', { name: 'Proposition Casier A' })).toHaveTextContent('Casier A · 3 cases');
  // Proposition d'avant les cases repérées : rows × cols.
  expect(screen.getByRole('button', { name: 'Proposition Casier B' })).toHaveTextContent('Casier B · 6 cases');
  expect(container.querySelector('.plan-view__cell')).toBeNull();

  rerender(<PlanView {...props} openSuggestionId="s1" />);
  const drawn = [...container.querySelectorAll<HTMLElement>('.plan-view__cell')];
  expect(drawn).toHaveLength(3);
  expect(drawn.map((c) => c.textContent)).toEqual(['A1', 'A2', '']);
  expect(drawn[1].style.left).toBe('20%');
  expect(drawn[1].style.top).toBe('20%');
  expect(drawn[1].style.width).toBe('20%');
  expect(drawn[1].style.height).toBe('20%');
  expect(drawn.every((c) => c.getAttribute('aria-hidden') === 'true' && c.tagName === 'SPAN')).toBe(true);
  expect(container.querySelector('.plan-view__cells')).toHaveAttribute('aria-hidden', 'true');

  rerender(<PlanView {...props} openSuggestionId="s2" />);
  expect(container.querySelector('.plan-view__cell')).toBeNull();
});

it('feuille « Proposition » (`onCellClick`) : chaque case repérée et nommée devient un bouton « Case B3 » qui montre le nom donné', async () => {
  const onCellClick = vi.fn();
  const cells: api.DetectedCell[] = [
    { box: [0.1, 0.2, 0.2, 0.4], row: 0, col: 0, name: 'A1' },
    { box: [0.2, 0.2, 0.4, 0.4], row: 0, col: 1, name: 'A2' },
    { box: [0.1, 0.4, 0.2, 0.8], row: null, col: null, name: null },
  ];
  const suggestions: api.PlanSuggestion[] = [{ id: 's1', kind: 'CASIER', name: 'Casier A', box: [0.1, 0.2, 0.4, 0.8], rows: 2, cols: 2, cellCount: 3, cells }];
  const { container } = render(<PlanView src="/plan.jpg" plan={plan} markers={[]} suggestions={suggestions} openSuggestionId="s1"
    cellNames={{ A2: 'Bordeaux' }} onCellClick={onCellClick} />);
  // Le cadre n'est pas un bouton ici : seules les cases le sont.
  expect(screen.queryByRole('button', { name: 'Proposition Casier A' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Case A1', 'Case Bordeaux (A2)']);
  expect(container.querySelector('.plan-view__cells')).not.toHaveAttribute('aria-hidden');
  expect([...container.querySelectorAll('.plan-view__cell')].map((c) => c.textContent)).toEqual(['A1', 'Bordeaux', '']);
  await userEvent.click(screen.getByRole('button', { name: 'Case Bordeaux (A2)' }));
  expect(onCellClick).toHaveBeenCalledWith('A2');
});

describe('au clavier', () => {
  const props = { src: '/plan.jpg', plan, markers };
  const focusPlan = () => {
    const box = screen.getByRole('group', { name: 'Plan de la cave. Entrée pour poser un repère, flèches pour le déplacer, Échap pour annuler.' });
    box.focus();
    return box;
  };

  it('sans action sur le plan, il n’est pas atteignable au clavier', () => {
    const { container } = render(<PlanView {...props} />);
    expect(container.firstChild).not.toHaveAttribute('tabindex');
  });

  it('Entrée vaut un toucher au centre, ou au « + » s’il est posé', async () => {
    const onPlanClick = vi.fn();
    const { rerender } = render(<PlanView {...props} onPlanClick={onPlanClick} />);
    focusPlan();
    await userEvent.keyboard('{Enter}');
    expect(onPlanClick).toHaveBeenLastCalledWith(0.5, 0.5);
    rerender(<PlanView {...props} onPlanClick={onPlanClick} pending={{ x: 0.3, y: 0.7 }} />);
    await userEvent.keyboard('{Enter}');
    expect(onPlanClick).toHaveBeenLastCalledWith(0.3, 0.7);
  });

  it('les flèches déplacent le « + » de 2 % (Maj : 10 %), sans sortir de l’image ; Échap annule', async () => {
    const onPendingMove = vi.fn();
    const onCancel = vi.fn();
    render(<PlanView {...props} onPlanClick={() => undefined} pending={{ x: 0.95, y: 0.5 }} onPendingMove={onPendingMove} onCancel={onCancel} />);
    focusPlan();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onPendingMove).toHaveBeenLastCalledWith(0.93, 0.5);
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(onPendingMove).toHaveBeenLastCalledWith(1, 0.5);
    await userEvent.keyboard('{ArrowDown}');
    expect(onPendingMove).toHaveBeenLastCalledWith(0.95, 0.52);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('Entrée sur un repère reste au repère', async () => {
    const onPlanClick = vi.fn();
    const onMarkerClick = vi.fn();
    render(<PlanView {...props} onPlanClick={onPlanClick} onMarkerClick={onMarkerClick} />);
    screen.getByRole('button', { name: 'Zone 1 : Cave 1' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onMarkerClick).toHaveBeenCalledWith('z1');
    expect(onPlanClick).not.toHaveBeenCalled();
  });
});

describe('ZonePlan', () => {
  afterEach(() => vi.restoreAllMocks());

  const plans: api.CavePlan[] = [
    { id: 'p1', name: 'Plan principal', width: 2000, height: 1000, updatedAt: '2026-10-13T10:00:00.000Z', analysis: 'NONE', suggestions: [], analysisInfo: null },
    { id: 'p2', name: 'Cellier', width: 800, height: 600, updatedAt: '2026-10-20T09:00:00.000Z', analysis: 'NONE', suggestions: [], analysisInfo: null },
  ];
  const all: api.PlanMarker[] = [
    { zoneId: 'z1', planId: 'p1', name: 'Cave 1', number: 1, x: 0.1, y: 0.2 },
    { zoneId: 'z2', planId: 'p2', name: 'Garage', number: 1, x: 0.3, y: 0.3 },
    { zoneId: 'z3', planId: 'p2', name: 'Étagère', number: 2, x: 0.7, y: 0.6 },
  ];
  const mountZone = (ui: React.ReactNode) => {
    vi.spyOn(api, 'getPlans').mockResolvedValue({ plans, markers: all });
    return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
  };

  it('montre le plan du repère de la zone, ses seuls repères, celui de la zone en avant, et le nom du plan en légende', async () => {
    mountZone(<ZonePlan zoneId="z3" />);
    expect(await screen.findByRole('img', { name: 'Plan de la cave' })).toHaveAttribute('src', api.planImageUrl('p2', '2026-10-20T09:00:00.000Z'));
    expect(screen.getByText('Cellier')).toHaveClass('plan-caption');
    expect(screen.getByRole('img', { name: 'Zone 2 : Étagère' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('img', { name: 'Zone 1 : Garage' })).not.toHaveAttribute('aria-current');
  });

  it('zone sans repère : rien', async () => {
    const { container } = mountZone(<ZonePlan zoneId="z9" />);
    await vi.waitFor(() => expect(api.getPlans).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('petit plan : la légende aussi', async () => {
    mountZone(<ZonePlan zoneId="z3" mini />);
    const mini = await screen.findByRole('button', { name: 'Agrandir le plan' });
    expect(within(mini).getByRole('img', { name: 'Zone 2 : Étagère' })).toBeInTheDocument();
    expect(screen.getByText('Cellier')).toHaveClass('plan-caption');
  });
});

describe('zone acceptée avec ses cases (cellBoxes)', () => {
  const zoned: PlanMarker[] = [
    markers[0],
    { zoneId: 'z2', planId: 'p1', name: 'Casier C', number: 2, x: 0.5, y: 0.5,
      cellBoxes: { C1: [0.1, 0.2, 0.2, 0.4], C5: [0.3, 0.4, 0.5, 0.6] }, cellNames: { C1: 'Champagnes' } },
  ];

  it('repère avec cellBoxes : un point par case, nommé par son nom donné sinon son code, au centre du cadre en pourcentage ; pas de repère numéroté', () => {
    const { container } = render(<PlanView src="/plan.jpg" plan={plan} markers={zoned} />);
    const cells = [...container.querySelectorAll<HTMLElement>('.plan-view__zone-cell')];
    expect(cells.map((c) => c.textContent)).toEqual(['Champagnes', 'C5']);
    expect(cells[1].style.left).toBe('30%');
    expect(cells[1].style.top).toBe('40%');
    expect(cells[1].style.width).toBe('20%');
    expect(cells[1].style.height).toBe('20%');
    expect(cells.every((c) => c.classList.contains('plan-view__cell'))).toBe(true);
    expect(screen.queryByRole('img', { name: 'Zone 2 : Casier C' })).not.toHaveTextContent('2');
    expect(container.querySelectorAll('.plan-view__marker')).toHaveLength(1);
  });

  it('avec onMarkerClick : chaque case est un bouton « Zone 2 : Casier C, case Champagnes (C1) » qui appelle onMarkerClick(zoneId), sans toucher au plan', async () => {
    const onMarkerClick = vi.fn();
    const onPlanClick = vi.fn();
    render(<PlanView src="/plan.jpg" plan={plan} markers={zoned} onMarkerClick={onMarkerClick} onPlanClick={onPlanClick} />);
    expect(screen.getByRole('button', { name: 'Zone 2 : Casier C, case C5' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zone 2 : Casier C, case Champagnes (C1)' }));
    expect(onMarkerClick).toHaveBeenCalledWith('z2');
    expect(onPlanClick).not.toHaveBeenCalled();
  });

  it('sans action : les cases d’une zone sont dans une image nommée « Zone 2 : Casier C », pas des boutons', () => {
    const { container } = render(<PlanView src="/plan.jpg" plan={plan} markers={zoned} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const zone = screen.getByRole('img', { name: 'Zone 2 : Casier C' });
    expect(zone.querySelectorAll('.plan-view__zone-cell')).toHaveLength(2);
    expect(container.querySelectorAll('.plan-view__zone-cell')).toHaveLength(2);
  });

  it('highlightZoneId : les cases de la zone portent la classe de mise en avant ; highlightCell « C5 » : cadre de la case, point plus gros, nom affiché (classe plan-view__zone-cell--current)', () => {
    const { container, rerender } = render(<PlanView src="/plan.jpg" plan={plan} markers={zoned} highlightZoneId="z2" />);
    const cells = () => [...container.querySelectorAll<HTMLElement>('.plan-view__zone-cell')];
    expect(cells().every((c) => c.classList.contains('plan-view__zone-cell--highlight'))).toBe(true);
    expect(screen.getByRole('img', { name: 'Zone 2 : Casier C' })).toHaveAttribute('aria-current', 'true');
    expect(container.querySelector('.plan-view__zone-cell--current')).toBeNull();
    rerender(<PlanView src="/plan.jpg" plan={plan} markers={zoned} highlightZoneId="z2" highlightCell="C5" />);
    expect(cells().map((c) => c.classList.contains('plan-view__zone-cell--current'))).toEqual([false, true]);
    // Une case d'une autre zone n'est jamais « courante ».
    rerender(<PlanView src="/plan.jpg" plan={plan} markers={zoned} highlightZoneId="z1" highlightCell="C5" />);
    expect(container.querySelector('.plan-view__zone-cell--current')).toBeNull();
    expect(container.querySelector('.plan-view__zone-cell--highlight')).toBeNull();
  });

  it('repère sans cellBoxes ({} ou absent) : repère numéroté comme avant', () => {
    const { container } = render(<PlanView src="/plan.jpg" plan={plan} markers={[markers[0], { ...markers[1], cellBoxes: {} }]} />);
    expect(screen.getByRole('img', { name: 'Zone 1 : Cave 1' })).toHaveTextContent('1');
    expect(screen.getByRole('img', { name: 'Zone 2 : Garage' })).toHaveTextContent('2');
    expect(container.querySelector('.plan-view__zone-cell')).toBeNull();
  });
});

describe('thumbnailBox (vignette de la fiche vin)', () => {
  const m: PlanMarker = { zoneId: 'z3', planId: 'p1', name: 'Casier C', number: 3, x: 0.5, y: 0.5 };
  it('cases : englobant de toutes les cases, marge de 4 % coupée aux bords de l’image', () => {
    expect(thumbnailBox({ ...m, cellBoxes: { C1: [0.1, 0.2, 0.2, 0.3], C2: [0.5, 0.6, 0.98, 0.7] } })).toEqual([0.06, 0.16, 1, 0.74]);
  });
  it('repère seul : fenêtre de 40 % × 40 % centrée, décalée pour rester dans l’image', () => {
    expect(thumbnailBox({ ...m, cellBoxes: {} })).toEqual([0.3, 0.3, 0.7, 0.7]);
    expect(thumbnailBox({ ...m, x: 0.05, y: 0.9 })).toEqual([0, 0.6, 0.4, 1]);
  });
});

describe('ajuster les cases (editCells)', () => {
  const boxes = { C1: [0.1, 0.2, 0.2, 0.4] as [number, number, number, number], C2: [0.3, 0.2, 0.4, 0.4] as [number, number, number, number] };
  const HELP = 'Plan de la cave. Touchez une case puis l’endroit où la placer ; au clavier, flèches pour déplacer la case choisie (Maj : plus vite), Échap pour la désélectionner.';
  function setup(selected: string | null = null) {
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const { container } = render(<PlanView src="/plan.jpg" plan={plan} markers={[]}
      editCells={{ boxes, names: { C2: 'Champagnes' }, selected, home: { x: 0.3, y: 0.6 }, onSelect, onMove }} />);
    return { onSelect, onMove, box: container.firstChild as HTMLElement };
  }

  it('chaque case est un bouton « Case C1 » / « Case Champagnes (C2) » (aria-pressed) ; consigne lue', async () => {
    const { onSelect, onMove } = setup('C2');
    expect(screen.getByRole('group', { name: HELP })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: 'Case C1' })).toHaveAttribute('aria-pressed', 'false');
    const champagnes = screen.getByRole('button', { name: 'Case Champagnes (C2)' });
    expect(champagnes).toHaveAttribute('aria-pressed', 'true');
    expect(champagnes.parentElement).toHaveClass('plan-view__zone-cell--current');
    await userEvent.click(screen.getByRole('button', { name: 'Case C1' }));
    expect(onSelect).toHaveBeenCalledWith('C1');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('toucher le plan déplace la case choisie à ce point ; sans case choisie, rien', () => {
    const rect = { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) };
    const { onMove, box } = setup('C1');
    box.getBoundingClientRect = () => rect;
    fireEvent.click(box, { clientX: 100, clientY: 25 });
    expect(onMove).toHaveBeenCalledWith('C1', 0.5, 0.25);
  });

  it('sans case choisie, un toucher sur le plan ne fait rien', () => {
    const { onMove, box } = setup();
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(box, { clientX: 100, clientY: 25 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('au clavier : les flèches déplacent la case choisie (2 %, Maj 10 %) depuis son bouton ; Échap la désélectionne', async () => {
    const { onMove, onSelect } = setup('C1');
    screen.getByRole('button', { name: 'Case C1' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onMove).toHaveBeenLastCalledWith('C1', 0.17, 0.3);
    await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(onMove).toHaveBeenLastCalledWith('C1', 0.15, 0.2);
    await userEvent.keyboard('{Escape}');
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('au clavier : Entrée sur le plan pose une case choisie sans position au point `home`', async () => {
    const { onMove } = setup('C3');
    screen.getByRole('group', { name: HELP }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onMove).toHaveBeenCalledWith('C3', 0.3, 0.6);
  });
});
