import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Fold } from './Fold';

it('fermé par défaut, s’ouvre d’un toucher sur le titre', async () => {
  render(<Fold title="Le domaine"><p>Contenu</p></Fold>);
  expect(screen.getByText('Contenu')).not.toBeVisible();
  await userEvent.click(screen.getByText('Le domaine'));
  expect(screen.getByText('Contenu')).toBeVisible();
});

it('« open » : ouvert d’emblée', () => {
  render(<Fold title="Stock" open><p>Contenu</p></Fold>);
  expect(screen.getByText('Contenu')).toBeVisible();
});

it('la note s’ajoute au titre entre parenthèses', () => {
  const { container } = render(<Fold title="Le domaine" note="en préparation"><p>Contenu</p></Fold>);
  expect(container.querySelector('summary')).toHaveTextContent('Le domaine (en préparation)');
});

it('« disabled » : ne s’ouvre pas et ne rend pas son contenu', async () => {
  const { container } = render(<Fold title="Le domaine" note="en préparation" disabled><p>Contenu</p></Fold>);
  const summary = container.querySelector('summary')!;
  expect(summary).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(summary);
  expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(false);
  expect(screen.queryByText('Contenu')).toBeNull();
});
