import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionMenu } from './ActionMenu';

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
  expect(screen.getByRole('menu')).toBeInTheDocument();
});

it('choisir un élément appelle onSelect une fois et ferme', async () => {
  const { onSelect } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Retirer' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('Échap ou clic extérieur ferme sans onSelect', async () => {
  const { onSelect } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  await userEvent.click(screen.getByText('dehors'));
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

it('un élément désactivé n’est pas cliquable', async () => {
  const { onOff } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
  const item = screen.getByRole('menuitem', { name: 'Bloqué' });
  expect(item).toBeDisabled();
  await userEvent.click(item);
  expect(onOff).not.toHaveBeenCalled();
});
