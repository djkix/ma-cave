import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlanMarker } from '../lib/api-client';
import { PlanView } from './PlanView';

const plan = { width: 2400, height: 1200, updatedAt: '2026-10-13T10:00:00.000Z' };
const markers: PlanMarker[] = [
  { zoneId: 'z1', name: 'Cave 1', number: 1, x: 0.1, y: 0.2 },
  { zoneId: 'z2', name: 'Garage', number: 2, x: 0.75, y: 0.5 },
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
