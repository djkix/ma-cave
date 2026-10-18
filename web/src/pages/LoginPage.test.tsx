import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

function mount(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

it('explains that the connection was refused (blocked account or otherwise)', () => {
  mount('/login?error=unauthorized');
  expect(screen.getByRole('alert')).toHaveTextContent('La connexion n’a pas abouti');
  expect(screen.getByRole('alert')).toHaveTextContent('contactez l’administrateur de la cave');
});

it('explains that the session could not be created', () => {
  mount('/login?error=session');
  expect(screen.getByRole('alert')).toHaveTextContent('La connexion a été interrompue');
});

it('says nothing for an unknown error value or no error at all', () => {
  mount('/login?error=autre-chose');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  mount('/login');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('écran épuré : Google seulement, sans compte de secours, version ni lien de confidentialité', () => {
  mount('/login');
  expect(screen.getByRole('link', { name: 'Se connecter avec Google' })).toHaveAttribute('href', '/api/auth/google');
  expect(screen.queryByText(/secours/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Version/)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Confidentialité' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument();
});

it('/login?secours ouvre le formulaire du compte de secours', () => {
  mount('/login?secours');
  expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
  expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
});
