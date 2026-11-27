import { render, screen } from '@testing-library/react';
import { BarList } from './BarList';
import { ColorRing } from './ColorRing';
import { YearColumns } from './YearColumns';

it('BarList masque les lignes à zéro, et ne rend rien si tout est à zéro', () => {
  const { container, rerender } = render(<BarList title="Apogée" rows={[{ key: 'a', label: 'À boire', bottles: 6, share: 1 }, { key: 'p', label: 'Passée', bottles: 0, share: 0 }]} />);
  expect(screen.getByText('À boire')).toBeInTheDocument();
  expect(screen.queryByText('Passée')).toBeNull();
  rerender(<BarList title="Apogée" rows={[{ key: 'p', label: 'Passée', bottles: 0, share: 0 }]} />);
  expect(container).toBeEmptyDOMElement();
});

it('ColorRing : légende chiffrée en texte, un cercle plein pour une seule couleur', () => {
  const { container, rerender } = render(<ColorRing rows={[{ key: 'ROUGE', label: 'Rouge', bottles: 22, share: 0.786, color: 'red' }, { key: 'BLANC', label: 'Blanc', bottles: 6, share: 0.214, color: 'gold' }, { key: 'ROSE', label: 'Rosé', bottles: 0, share: 0 }]} />);
  expect(screen.getByText('Rouge 22')).toBeInTheDocument();
  expect(screen.getByText('Blanc 6')).toBeInTheDocument();
  expect(screen.queryByText(/Rosé/)).toBeNull();
  expect(container.querySelectorAll('.ring__arc')).toHaveLength(2);
  rerender(<ColorRing rows={[{ key: 'ROUGE', label: 'Rouge', bottles: 3, share: 1, color: 'red' }]} />);
  expect(container.querySelectorAll('circle.ring__arc')).toHaveLength(1);
});

it('YearColumns : une colonne par millésime, nommée, dans l’ordre reçu ; une seule colonne sans NaN', () => {
  const { container, rerender } = render(<YearColumns rows={[{ key: '2015', label: '2015', bottles: 4, share: 0.4 }, { key: 'Non millésimé', label: 'Non millésimé', bottles: 2, share: 0.2 }]} />);
  expect(screen.getAllByRole('img').map((c) => c.getAttribute('aria-label'))).toEqual(['2015 : 4 bouteilles', 'Non millésimé : 2 bouteilles']);
  rerender(<YearColumns rows={[{ key: 'Non millésimé', label: 'Non millésimé', bottles: 1, share: 1 }]} />);
  expect(container.innerHTML).not.toContain('NaN');
  expect(screen.getByRole('img', { name: 'Non millésimé : 1 bouteille' })).toBeInTheDocument();
});
