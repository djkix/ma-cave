import { useQuery } from '@tanstack/react-query';
import { FormEvent, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { AccordsResult, ApiError, postAccords, WineColor } from '../lib/api-client';
import { apogeePairingLabel, apogeeProgress } from '../lib/apogee';

const COLOR_LABEL: Record<WineColor, string> = { ROUGE: 'Rouge', BLANC: 'Blanc', ROSE: 'Rosé', PETILLANT: 'Pétillant' };

/** Dernier plat et sa réponse : la liste revient telle quelle au retour de la fiche, sans nouvel appel. */
const STORAGE_KEY = 'accords:dernier';
type Stored = { dish: string; result: AccordsResult };

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* stockage indisponible (navigation privée) : la liste sera simplement redemandée */
  }
}

/** Le strict nécessaire de l'API Web Speech (absente des types du DOM). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

/** Écran tactile (téléphone, tablette) : la dictée n'est proposée que là ; sur ordinateur, le champ texte. */
function isTouchDevice(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function speechRecognition(): RecognitionCtor | undefined {
  if (!isTouchDevice()) return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const MIC_DENIED = 'Micro refusé : autorisez-le dans le navigateur, ou écrivez le plat.';

function errorText(e: unknown): string {
  // 503 : l'api dit pourquoi (IA en pause jusqu'à…, quota épuisé, part de la cave atteinte).
  if (e instanceof ApiError && e.status === 429) return 'Trop de demandes, réessayez dans une minute';
  if (e instanceof ApiError && (e.status === 502 || e.status === 504)) return 'Accords indisponibles pour le moment (le serveur n’a pas répondu)';
  return e instanceof Error ? e.message : 'Une erreur est survenue';
}

/** « Accords » : on dit (ou écrit) le plat, l'IA propose des vins de la cave, à boire d'abord. */
export function AccordsPage() {
  const Speech = speechRecognition();
  const [stored] = useState(readStored);
  const [dish, setDish] = useState<string | null>(stored?.dish ?? null);
  const [text, setText] = useState(stored?.dish ?? '');
  const [writing, setWriting] = useState(!Speech);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);

  const query = useQuery({
    queryKey: ['accords', dish],
    queryFn: async () => {
      const result = await postAccords(dish!);
      writeStored({ dish: dish!, result });
      return result;
    },
    enabled: !!dish,
    initialData: () => (stored && stored.dish === dish ? stored.result : undefined),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });

  function submit(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setText(clean);
    // Même plat après une erreur : on redemande ; après un succès, la liste en cache suffit.
    if (clean === dish && query.isError) void query.refetch();
    else setDish(clean);
  }

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!Speech) return;
    const rec = new Speech();
    let transcript = '';
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      transcript = Array.from(e.results, (r) => r[0].transcript).join('');
      setHeard(transcript);
    };
    rec.onerror = (e) => {
      transcript = '';
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setMicError(MIC_DENIED);
        setWriting(true);
      } else if (e.error === 'no-speech') setMicError('Je n’ai rien entendu, réessayez.');
      else if (e.error !== 'aborted') setMicError('Dictée impossible, écrivez le plat.');
    };
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      submit(transcript);
    };
    recognition.current = rec;
    setMicError(null);
    setHeard('');
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      setMicError(MIC_DENIED);
      setWriting(true);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(text);
  }

  const result = query.data;
  const year = new Date().getFullYear();
  return (
    <>
      <TopBar title="Accords" />
      <main className="page">
        <section className="accords-head">
          <h2>Qu’est-ce qu’on mange ?</h2>
          {Speech && (
            <button type="button" className={`mic${listening ? ' mic--on' : ''}`} onClick={toggleMic} aria-label={listening ? 'Arrêter l’écoute' : 'Dicter le plat'} aria-pressed={listening}>
              <Icon name={listening ? 'stop' : 'mic'} />
            </button>
          )}
          <p aria-live="polite" className="list__meta" style={{ margin: 0, fontSize: 15 }}>
            {listening ? heard || 'Je vous écoute…' : Speech && !writing ? 'Touchez le micro et dites le plat.' : ''}
          </p>
          {micError && <p role="alert" className="text-error" style={{ margin: 0 }}>{micError}</p>}
          {writing ? (
            <form className="accords-form" onSubmit={onSubmit}>
              <label className="field__label" htmlFor="accords-dish">Le plat</label>
              <input id="accords-dish" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Ex. sole meunière, daube provençale" />
              <Button type="submit" disabled={!text.trim() || query.isFetching}>Proposer des vins</Button>
            </form>
          ) : (
            <Button variant="link" onClick={() => setWriting(true)}>Écrire plutôt</Button>
          )}
        </section>

        <section aria-live="polite" aria-busy={query.isFetching} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {query.isFetching && <p className="centered" role="status">Je cherche dans votre cave…</p>}
          {query.isError && !query.isFetching && <p role="alert" className="text-error">{errorText(query.error)}</p>}
          {result && !query.isFetching && (
            <>
              {result.dish && <p className="list__meta" style={{ margin: 0 }}>{`Pour : ${result.dish}`}</p>}
              {result.wineCount === 0 ? (
                <p className="centered">Votre cave est vide : ajoutez des bouteilles pour recevoir des accords.</p>
              ) : (
                <>
                  {result.understood.length > 0 && (
                    <div>
                      <h3 className="field__label" style={{ margin: 0 }}>Ce que l’IA a compris</h3>
                      <ul className="dish-pills" aria-label="Ce que l’IA a compris">
                        {result.understood.map((u) => <li key={u} className="dish-pill">{u}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.picks.length === 0 ? (
                    <div className="card">
                      <p style={{ margin: 0 }}>Aucun vin de votre cave ne convient vraiment à ce plat.</p>
                      {result.ideal && <p className="list__meta" style={{ margin: 'var(--space-xs) 0 0', fontSize: 13 }}>{`L’idéal : ${result.ideal}`}</p>}
                    </div>
                  ) : (
                    <ol className="list" aria-label="Vins proposés" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {result.picks.map((p) => {
                        const label = apogeePairingLabel(p.apogee);
                        const progress = apogeeProgress(p.apogee, year);
                        return (
                          <li key={p.wineId}>
                            <Link to={`/cave/${p.wineId}`} state={{ from: '/accords' }} className="cave-row accord-row">
                              <span style={{ minWidth: 0 }}>
                                <span className="list__title" style={{ display: 'block' }}>
                                  {p.producer}{p.cuvee ? ` — ${p.cuvee}` : ''}, {p.vintage ?? 'NV'}
                                </span>
                                <span className="list__meta" style={{ display: 'block' }}>
                                  {[p.appellation, COLOR_LABEL[p.color], `${p.quantity} btl`, p.place].filter(Boolean).join(' · ')}
                                </span>
                                {p.reason && <span style={{ display: 'block', fontSize: 13, marginTop: 2 }}>{p.reason}</span>}
                                {progress != null && <span className="apogee-bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>}
                                {label && <span className="list__meta" style={{ display: 'block' }}>{label}</span>}
                              </span>
                              <span className="accord-row__score num" aria-label={`Accord ${p.score} %`}>{p.score} %</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </main>
      <BottomNav />
    </>
  );
}
