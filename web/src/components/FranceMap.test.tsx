import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { regionCounts } from '../lib/region-counts';
import type { CaveRow } from '../lib/api-client';
import { FranceMap } from './FranceMap';
import { FRANCE_REGIONS } from './france-regions';

const row = (o: Partial<CaveRow>): CaveRow => ({
  id: 'x', producer: 'P', cuvee: null, appellationRaw: '', vintage: null, color: 'ROUGE', formatCl: 75, referencePhotoId: null, quantity: 1, ...o,
});

it('a les douze régions du référentiel', () => {
  expect(FRANCE_REGIONS.map((r) => r.name).sort()).toEqual(
    ['Alsace', 'Beaujolais', 'Bordeaux', 'Bourgogne', 'Champagne', 'Jura', 'Languedoc-Roussillon', 'Loire', 'Provence', 'Rhône', 'Savoie', 'Sud-Ouest'],
  );
});

it('région atteignable au clavier : Entrée et Espace appellent onSelect', async () => {
  const onSelect = vi.fn();
  render(<FranceMap counts={regionCounts([row({ region: 'Bourgogne', quantity: 21 }), row({ region: null, country: 'FR', quantity: 2 })])} onSelect={onSelect} />);
  const bourgogne = screen.getByRole('button', { name: 'Bourgogne, 21 bouteilles' });
  expect(screen.getByRole('button', { name: 'Alsace, 0 bouteille' })).toBeInTheDocument();
  await userEvent.tab();
  while (document.activeElement !== bourgogne) await userEvent.tab();
  await userEvent.keyboard('{Enter}');
  expect(onSelect).toHaveBeenCalledWith('Bourgogne');
  await userEvent.keyboard(' ');
  expect(onSelect).toHaveBeenCalledTimes(2);
  expect(screen.getByText('dont 2 sans région')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Hors de France/ }));
  expect(onSelect).toHaveBeenLastCalledWith('HORS_FRANCE');
});

it('cave vide : « Aucune bouteille pour l’instant »', () => {
  render(<FranceMap counts={regionCounts([])} onSelect={() => {}} />);
  expect(screen.getByText('Aucune bouteille pour l’instant')).toBeInTheDocument();
});
