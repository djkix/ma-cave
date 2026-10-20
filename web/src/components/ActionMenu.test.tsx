import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ActionMenu } from './ActionMenu';
import { BottomSheet } from './BottomSheet';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.open = false; };
});

function setup() {
  const onSelect = vi.fn();
  const onOff = vi.fn();
  render(
    <div>
      <p>dehors</p>
      <ActionMenu label="Actions" items={[{ label: 'Retirer', onSelect }, { label: 'Bloqué', onSelect: onOff, disabled: true }]} />
    </div>,
  );
  return { onSelect, onOff };
}

it('ouvre le menu au clic sur ⋯', async () => {
  setup();
  const btn = screen.getByRole('button', { name: 'Actions' });
  expect(btn).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(btn);
  expect(btn).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Retirer' })).toBeInTheDocument();
});

it('choisir un élément appelle onSelect une fois et ferme', async () => {
  const { onSelect } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  await userEvent.click(screen.getByRole('button', { name: 'Retirer' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument();
});

it('Échap ou clic extérieur ferme sans onSelect', async () => {
  const { onSelect } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  await userEvent.click(screen.getByText('dehors'));
  expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

it('Tab hors du menu le ferme', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  await userEvent.tab(); await userEvent.tab(); await userEvent.tab();
  expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument();
});

it('après un choix qui ouvre une feuille, fermer la feuille rend le focus au ⋯', async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <ActionMenu label="Actions" items={[{ label: 'Retirer', onSelect: () => setOpen(true) }]} />
        <BottomSheet open={open} title="Confirmer" onClose={() => setOpen(false)}><button onClick={() => setOpen(false)}>Fermer</button></BottomSheet>
      </>
    );
  }
  render(<Host />);
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  await userEvent.click(screen.getByRole('button', { name: 'Retirer' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
  expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
});

it('un élément désactivé n’est pas cliquable', async () => {
  const { onOff } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  const item = screen.getByRole('button', { name: 'Bloqué' });
  expect(item).toBeDisabled();
  await userEvent.click(item);
  expect(onOff).not.toHaveBeenCalled();
});
