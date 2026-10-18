import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { localLogin } from '../lib/api-client';

// Retour de Google en échec (OAuthRedirectFilter, `?error=…`) : un titre et une
// explication simple, sans jargon. `unauthorized` couvre tous les refus (Google
// indisponible, connexion annulée, compte pas encore ouvert ou bloqué).
const REDIRECT_ERRORS: Record<string, { title: string; text: string }> = {
  unauthorized: {
    title: 'La connexion n’a pas abouti',
    text: 'Réessayez dans un instant. Si le problème continue, votre accès n’est peut-être pas encore ouvert : contactez l’administrateur de la cave.',
  },
  session: {
    title: 'La connexion a été interrompue',
    text: 'Réessayez : cela suffit le plus souvent.',
  },
};

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Compte de secours : formulaire caché, ouvert seulement par /login?secours
  // (le jour où Google ne répond plus), pour garder l'écran simple.
  const showLocal = params.has('secours');
  const redirectError = REDIRECT_ERRORS[params.get('error') ?? ''] ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await localLogin(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    }
  }

  return (
    <main className="login">
      <img src="/icons/icon.svg" alt="" className="login__logo" width={72} height={72} />
      <h1 className="login__title">Ma Cave</h1>
      {redirectError && (
        <div role="alert" className="login__notice">
          <p className="login__notice-title">{redirectError.title}</p>
          <p>{redirectError.text}</p>
        </div>
      )}
      <a className="btn btn--primary" href="/api/auth/google">
        Se connecter avec Google
      </a>
      {showLocal && (
        <form onSubmit={submit} className="login__form">
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p role="alert" className="text-error">{error}</p>}
          <button type="submit" className="btn btn--dark">Connexion</button>
        </form>
      )}
    </main>
  );
}
