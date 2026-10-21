import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../lib/api-client';
import { GeminiModelSection } from './GeminiModelSection';

afterEach(() => vi.restoreAllMocks());

const view = (over: Partial<api.GeminiModelView> = {}): api.GeminiModelView => ({
  model: 'gemini-3.5-flash',
  source: 'ADMIN',
  models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite'],
  error: null,
  ...over,
});

const mount = (v: api.GeminiModelView) => {
  vi.spyOn(api, 'getGeminiModel').mockResolvedValue(v);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GeminiModelSection />
    </QueryClientProvider>,
  );
};

it('titre, usages, liste des modèles proposés, modèle en vigueur sélectionné', async () => {
  mount(view());
  expect(screen.getByRole('heading', { name: 'Modèle de l’IA' })).toBeInTheDocument();
  expect(screen.getByText('Sert à la lecture des étiquettes, aux accords, aux descriptifs, à la recherche d’image et à l’analyse des plans.')).toBeInTheDocument();
  const select = await screen.findByLabelText('Modèle');
  await waitFor(() => expect(select).toHaveValue('gemini-3.5-flash'));
  expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  expect(screen.queryByText(/Valeur du serveur/)).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('source ENV : mention de la valeur du serveur', async () => {
  mount(view({ source: 'ENV' }));
  expect(await screen.findByText('Valeur du serveur (.env) tant qu’aucun modèle n’est choisi ici.')).toBeInTheDocument();
});

it('« Enregistrer » désactivé tant que rien ne change, puis enregistre et confirme', async () => {
  mount(view());
  const put = vi.spyOn(api, 'putGeminiModel').mockResolvedValue({ model: 'gemini-3.5-flash-lite', source: 'ADMIN' });
  const select = await screen.findByLabelText('Modèle');
  const save = screen.getByRole('button', { name: 'Enregistrer' });
  await waitFor(() => expect(select).toHaveValue('gemini-3.5-flash'));
  expect(save).toBeDisabled();
  await userEvent.selectOptions(select, 'gemini-3.5-flash-lite');
  expect(save).toBeEnabled();
  await userEvent.click(save);
  expect(put).toHaveBeenCalledWith('gemini-3.5-flash-lite');
  expect(await screen.findByRole('status')).toHaveTextContent('Modèle enregistré : il sert dès le prochain appel.');
  expect(save).toBeDisabled();
  expect(screen.queryByText(/Valeur du serveur/)).not.toBeInTheDocument();
});

it('modèle en vigueur absent de la liste de Google : proposé quand même', async () => {
  mount(view({ model: 'gemini-2.0-flash', models: ['gemini-3.5-flash'] }));
  const select = (await screen.findByLabelText('Modèle')) as HTMLSelectElement;
  await waitFor(() => expect(select).toHaveValue('gemini-2.0-flash'));
  expect([...select.options].map((o) => o.value)).toEqual(['gemini-2.0-flash', 'gemini-3.5-flash']);
});

it('liste indisponible : l’erreur de l’api en clair, le modèle courant reste enregistrable', async () => {
  mount(view({ source: 'ENV', models: ['gemini-3.5-flash'], error: 'Liste des modèles indisponible : Google a répondu 503' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Liste des modèles indisponible : Google a répondu 503');
  const put = vi.spyOn(api, 'putGeminiModel').mockResolvedValue({ model: 'gemini-3.5-flash', source: 'ADMIN' });
  const save = screen.getByRole('button', { name: 'Enregistrer' });
  // Valeur du .env : la choisir ici l'enregistre comme choix de l'Administration.
  expect(save).toBeEnabled();
  await userEvent.click(save);
  expect(put).toHaveBeenCalledWith('gemini-3.5-flash');
});

it('400 de l’api : message affiché tel quel', async () => {
  mount(view());
  vi.spyOn(api, 'putGeminiModel').mockRejectedValue(new api.ApiError(400, 'Modèle inconnu de Google'));
  const select = await screen.findByLabelText('Modèle');
  await waitFor(() => expect(select).toHaveValue('gemini-3.5-flash'));
  await userEvent.selectOptions(select, 'gemini-3.5-flash-lite');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Modèle inconnu de Google');
});
