import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateBannerView } from './UpdateBanner';

it('ne montre rien tant qu’aucune mise à jour n’est disponible', () => {
  render(<UpdateBannerView visible={false} version="2.18.0" onReload={() => undefined} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('annonce la nouvelle version et recharge au clic', async () => {
  const onReload = vi.fn();
  render(<UpdateBannerView visible version="2.18.0" onReload={onReload} />);
  expect(screen.getByRole('status')).toHaveTextContent('Nouvelle version disponible (2.18.0).');
  await userEvent.click(screen.getByRole('button', { name: 'Recharger' }));
  expect(onReload).toHaveBeenCalledOnce();
});

it('sans numéro annoncé (service worker en attente), propose quand même le rechargement', () => {
  render(<UpdateBannerView visible version={null} onReload={() => undefined} />);
  expect(screen.getByRole('status')).toHaveTextContent('Nouvelle version disponible.');
});
