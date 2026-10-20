import { render, screen } from '@testing-library/react';
import { PersonRow } from './PersonRow';

it('montre titre, sous-titre, badges, méta et action', () => {
  render(
    <PersonRow title="Paul" subtitle="paul@x.fr" badges={[{ label: 'Actif', tone: 'ok' }, { label: 'En attente', tone: 'warn' }]} meta="Depuis mai" action={<button>Agir</button>} />,
  );
  expect(screen.getByText('Paul')).toBeInTheDocument();
  expect(screen.getByText('paul@x.fr')).toBeInTheDocument();
  expect(screen.getByText('Actif')).toHaveClass('badge--ok');
  expect(screen.getByText('En attente')).toHaveClass('badge--warn');
  expect(screen.getByText('Depuis mai')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Agir' })).toBeInTheDocument();
});

it('n’affiche pas de sous-titre absent', () => {
  const { container } = render(<PersonRow title="Paul" subtitle={null} badges={[{ label: 'Actif', tone: 'ok' }]} />);
  expect(container.querySelector('.list__meta')).toBeNull();
  expect(screen.getByText('Actif')).toBeInTheDocument();
});
