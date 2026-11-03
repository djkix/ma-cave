import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from '../lib/api-client';
import { AppellationField } from './AppellationField';

const MSG = /Appellation inconnue du référentiel/;
afterEach(() => vi.restoreAllMocks());

it('affiche les suggestions en options', async () => {
  vi.spyOn(api, 'getAppellations').mockResolvedValue([
    { name: 'Pommard', region: 'Bourgogne', similarity: 0.9 },
    { name: 'Pomerol', region: 'Bordeaux', similarity: 0.6 },
  ]);
  const { container } = render(<AppellationField id="a" value="Pom" onChange={() => {}} />);
  await waitFor(() => expect(container.querySelectorAll('datalist option')).toHaveLength(2));
  expect(container.querySelector('datalist option')).toHaveAttribute('value', 'Pommard');
  expect(api.getAppellations).toHaveBeenCalledWith('Pom');
});

it('signale une appellation inconnue', async () => {
  vi.spyOn(api, 'getAppellations').mockResolvedValue([]);
  render(<AppellationField id="a" value="Barolo" onChange={() => {}} />);
  expect(await screen.findByText(MSG)).toBeInTheDocument();
});

it('ne signale rien pour une appellation reconnue', async () => {
  const spy = vi.spyOn(api, 'getAppellations').mockResolvedValue([{ name: 'Pommard', region: 'Bourgogne', similarity: 0.9 }]);
  render(<AppellationField id="a" value="Pommard" onChange={() => {}} />);
  await waitFor(() => expect(spy).toHaveBeenCalled());
  await waitFor(() => expect(document.querySelectorAll('datalist option')).toHaveLength(1));
  expect(screen.queryByText(MSG)).toBeNull();
});
