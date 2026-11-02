import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { PRODUCER_POLL_MS } from '../components/DomaineBlock';
import { TopBar } from '../components/TopBar';
import { WineThumb } from '../components/WineThumb';
import { getProducer, ProducerField, regenerateProducer, setProducerField } from '../lib/api-client';
import { useCurrentCave } from '../lib/use-current-cave';

const FIELDS: Array<[ProducerField, string]> = [['histoire', 'Histoire'], ['terroir', 'Terroir'], ['cepages', 'Cépages'], ['style', 'Style'], ['nez', 'Nez']];
const MAX_LENGTH = 600;

export function DomainePage() {
  const { key = '' } = useParams();
  const qc = useQueryClient();
  const { isAdmin } = useCurrentCave();
  const q = useQuery({
    queryKey: ['producer', key],
    queryFn: () => getProducer(key),
    refetchInterval: (query) => {
      const p = query.state.data?.profile;
      return !p || p.status === 'PENDING' ? PRODUCER_POLL_MS : false;
    },
  });
  const [editing, setEditing] = useState<ProducerField | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['producer', key] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  const profile = q.data?.profile;
  const empty = !profile || FIELDS.every(([f]) => !profile.fields[f]);

  return (
    <>
      <TopBar title={profile?.displayName ?? 'Domaine'} back="/cave" />
      <main className="page">
        {q.isError && <p role="alert" className="text-error">Domaine introuvable</p>}
        {q.data && (
          <>
            {empty && profile?.status === 'UNKNOWN' && <p className="list__meta">Domaine inconnu de l’IA</p>}
            {empty && profile?.status === 'FAILED' && <p className="list__meta">Fiche du domaine indisponible</p>}
            {empty && profile?.status !== 'UNKNOWN' && profile?.status !== 'FAILED' && <p className="list__meta">Fiche du domaine en préparation</p>}
            {error && <p role="alert" className="text-error">{error}</p>}
            {profile && FIELDS.map(([f, title]) => (
              <section key={f} className="card">
                <h3 style={{ fontSize: 16, margin: 0 }}>{title}</h3>
                {editing === f ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    <textarea aria-label={title} value={text} maxLength={MAX_LENGTH} rows={5} onChange={(e) => setText(e.target.value)} />
                    <p className="list__meta" style={{ margin: 0 }}>{text.length} / {MAX_LENGTH}</p>
                    <Button variant="dark" disabled={busy || !text.trim()} onClick={() => run(() => setProducerField(key, f, text.trim()))}>Enregistrer</Button>
                    <Button variant="link" onClick={() => { setEditing(null); setError(null); }}>Abandonner</Button>
                  </div>
                ) : (
                  <>
                    <p style={{ margin: 'var(--space-xs) 0' }}>{profile.fields[f] ?? '—'}</p>
                    {isAdmin && (
                      <Button variant="outline" onClick={() => { setText(profile.fields[f] ?? ''); setError(null); setEditing(f); }}>Corriger</Button>
                    )}
                  </>
                )}
              </section>
            ))}
            {isAdmin && profile && (
              <Button variant="link" disabled={busy} onClick={() => run(() => regenerateProducer(key))}>Régénérer</Button>
            )}
            <section className="card">
              <h3 style={{ fontSize: 16, margin: 0 }}>Vos vins</h3>
              {q.data.wines.map((w) => (
                <Link key={w.id} to={`/cave/${w.id}`} className="list__row">
                  <WineThumb photoId={w.referencePhotoId} />
                  <span className="list__title">{w.cuvee ?? 'Sans cuvée'}</span>
                  <span className="list__meta">{w.vintage ?? 'NV'} · {w.quantity} en stock</span>
                </Link>
              ))}
            </section>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
