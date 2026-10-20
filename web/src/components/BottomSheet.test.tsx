import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { BottomSheet } from './BottomSheet';

// jsdom n'a ni showModal ni close : on les simule comme les autres tests de <dialog>.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

it('ouvert, montre la feuille nommée par son titre', () => {
  render(<BottomSheet open title="Inviter" onClose={() => {}}><p>Contenu</p></BottomSheet>);
  expect(screen.getByRole('dialog', { name: 'Inviter' })).toBeInTheDocument();
  expect(screen.getByText('Contenu')).toBeInTheDocument();
});

it('Échap et clic sur le fond appellent onClose', async () => {
  const onClose = vi.fn();
  render(<BottomSheet open title="Inviter" onClose={onClose}><p>x</p></BottomSheet>);
  const dialog = screen.getByRole('dialog', { name: 'Inviter' });
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await userEvent.click(dialog);
  expect(onClose).toHaveBeenCalledTimes(2);
  await userEvent.click(screen.getByText('x').parentElement!);
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('la fermeture native appelle onClose, pas la fermeture par React', () => {
  const onClose = vi.fn();
  const { rerender } = render(<BottomSheet open title="T" onClose={onClose}>x</BottomSheet>);
  screen.getByRole('dialog').dispatchEvent(new Event('close'));
  expect(onClose).toHaveBeenCalledTimes(1);
  rerender(<BottomSheet open={false} title="T" onClose={onClose}>x</BottomSheet>);
  document.querySelector('dialog')!.dispatchEvent(new Event('close'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('fermé, rend le focus au bouton qui l’a ouverte', async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Ouvrir</button>
        <BottomSheet open={open} title="Inviter" onClose={() => setOpen(false)}>
          <button onClick={() => setOpen(false)}>Fermer</button>
        </BottomSheet>
      </>
    );
  }
  render(<Host />);
  const opener = screen.getByRole('button', { name: 'Ouvrir' });
  await userEvent.click(opener);
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
