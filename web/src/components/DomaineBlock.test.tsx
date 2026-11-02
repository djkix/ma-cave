import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../lib/api-client';
import { DomaineBlock, producerPollInterval } from './DomaineBlock';

const mount = (producerKey: string | null, producerProfile: api.ProducerProfile | null | undefined) =>
  render(
    <MemoryRouter>
      <DomaineBlock producerKey={producerKey} producerProfile={producerProfile} />
    </MemoryRouter>,
  );

const gemini = (overrides: Partial<api.ProducerProfile> = {}): api.ProducerProfile => ({
  key: 'domaine tempier', displayName: 'Domaine Tempier', status: 'DONE', description: null,
  fields: { histoire: 'Un domaine du Var…', terroir: null, cepages: null, style: null, nez: null }, manualFields: [],
  source: 'GEMINI', errorMessage: null, generatedAt: '2026-10-05T10:00:00Z', updatedBy: null,
  ...overrides,
});

it('ne montre rien et ne demande rien quand le domaine n’a pas de clé', () => {
  const { container } = mount(null, null);
  expect(container).toBeEmptyDOMElement();
  expect(producerPollInterval(null, null)).toBe(false);
});

it('dit que la fiche est en préparation sans profil ou sans texte', () => {
  mount('domaine tempier', null);
  expect(screen.getByText('Descriptif en préparation…')).toBeInTheDocument();
  expect(producerPollInterval('domaine tempier', null)).toBe(5000);
});

it('montre un aperçu de l’histoire et le lien Voir le domaine', () => {
  mount('château x', gemini());
  expect(screen.getByText('Un domaine du Var…')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Voir le domaine' })).toHaveAttribute('href', `/domaine/${encodeURIComponent('château x')}`);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('dit que le domaine est peu documenté', () => {
  mount('domaine tempier', gemini({ status: 'UNKNOWN', fields: { histoire: null, terroir: null, cepages: null, style: null, nez: null } }));
  expect(screen.getByText('Domaine peu documenté : Gemini n’a pas d’information fiable.')).toBeInTheDocument();
});

it('rafraîchit la fiche toutes les 5 s tant que le descriptif est en préparation, pas sinon', () => {
  expect(producerPollInterval('domaine tempier', null)).toBe(5000);
  expect(producerPollInterval('domaine tempier', gemini({ status: 'PENDING' }))).toBe(5000);
  expect(producerPollInterval('domaine tempier', gemini({ status: 'DONE' }))).toBe(false);
  expect(producerPollInterval('domaine tempier', gemini({ status: 'FAILED' }))).toBe(false);
  expect(producerPollInterval('domaine tempier', gemini({ status: 'UNKNOWN' }))).toBe(false);
  expect(producerPollInterval(null, null)).toBe(false);
});
