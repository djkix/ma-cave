import { useQuery } from '@tanstack/react-query';
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { AccordsParVin } from '../components/AccordsParVin';
import { AccordsResults } from '../components/AccordsResults';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { AccordsResult, ApiError, getCave, postAccords } from '../lib/api-client';
import { DISHES } from '../lib/accords-base/data';
import { accordsFor, findDishes, normalizeDish, suggestDishes } from '../lib/accords-base/match';
import { DISH_CATEGORIES, DishCategory, DishEntry } from '../lib/accords-base/types';

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

/** Dernier plat, entrée choisie et passage par l'IA : l'écran se retrouve tel quel au retour de la fiche. */
const PLAT_KEY = 'accords:plat';
type Plat = { dish: string; entryId: string | null; ai: boolean };

function readPlat(): Plat | null {
  try {
    const raw = sessionStorage.getItem(PLAT_KEY);
    return raw ? (JSON.parse(raw) as Plat) : null;
  } catch {
    return null;
  }
}

function writePlat(value: Plat) {
  try {
    sessionStorage.setItem(PLAT_KEY, JSON.stringify(value));
  } catch {
    /* stockage indisponible : on repartira d'un écran vide */
  }
}

/** Entrées de la base par rubrique, en ordre alphabétique. */
const byCategory = (c: DishCategory) => DISHES.filter((d) => d.category === c).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

/** Onglet et vin choisis : on les retrouve au retour de la fiche. */
const ENTREE_KEY = 'accords:entree';
type Entree = { mode: 'plat' | 'vin'; wineId?: string };

function readEntree(): Entree {
  try {
    const raw = sessionStorage.getItem(ENTREE_KEY);
    const v = raw ? (JSON.parse(raw) as Entree) : null;
    return v && (v.mode === 'plat' || v.mode === 'vin') ? v : { mode: 'plat' };
  } catch {
    return { mode: 'plat' };
  }
}

function writeEntree(value: Entree) {
  try {
    sessionStorage.setItem(ENTREE_KEY, JSON.stringify(value));
  } catch {
    /* stockage indisponible : on repartira de l'onglet « plat » */
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

/** Au-delà, on explique l'attente : Gemini saturé, l'api essaie un modèle après l'autre (45 s au plus chacun). */
export const SLOW_SEARCH_S = 20;

/** Recherche en cours : barre animée et secondes écoulées, pour voir qu'elle avance et n'a pas planté. */
function SearchProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" style={{ display: 'grid', gap: 'var(--space-sm)' }}>
      <div className="progress" aria-hidden="true"><span /></div>
      <p className="centered" style={{ margin: 0 }}>Je cherche dans votre cave… <span className="num">{seconds} s</span></p>
      {seconds >= SLOW_SEARCH_S && (
        <p className="centered list__meta" style={{ margin: 0 }}>
          L’IA est lente en ce moment : j’essaie un autre modèle si besoin. Cela peut prendre une à deux minutes.
        </p>
      )}
    </div>
  );
}

/** « Accords » : on dit (ou écrit) le plat, l'IA propose des vins de la cave, à boire d'abord. */
export function AccordsPage() {
  const Speech = speechRecognition();
  // `?plat=` : arrivée depuis un accord de la fiche vin, recherche lancée sur ce plat.
  const [params] = useSearchParams();
  const linked = params.get('plat')?.trim().slice(0, 200) || null;
  const [entree, setEntree] = useState<Entree>(() => (linked ? { mode: 'plat' } : readEntree()));
  const choose = (next: Entree) => { setEntree(next); writeEntree(next); };
  const [stored] = useState(readStored);
  const [plat, setPlatState] = useState<Plat | null>(() => {
    if (!linked) return readPlat();
    const v = { dish: linked, entryId: null, ai: false };
    writePlat(v);
    return v;
  });
  const setPlat = (next: Plat) => { setPlatState(next); writePlat(next); };
  const dish = plat?.dish ?? null;
  const [text, setText] = useState(dish ?? '');
  const [browse, setBrowse] = useState<DishCategory>('PLAT');
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
    enabled: !!dish && !!plat?.ai,
    initialData: () => (stored && stored.dish === dish ? stored.result : undefined),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });

  // Accord local, immédiat : sur l'entrée choisie (suggestion, pastille, « Plutôt »), sinon la dominante du plat.
  const cave = useQuery({ queryKey: ['cave', {}], queryFn: () => getCave({}) });
  const recognized = dish ? findDishes(dish, DISHES) : [];
  const chosen = DISHES.find((d) => d.id === plat?.entryId) ?? recognized[0];
  const others = recognized.filter((d) => d !== chosen);
  const local = chosen && dish && cave.data ? accordsFor(chosen, dish, cave.data) : null;
  const suggestions = writing && normalizeDish(text) !== normalizeDish(dish ?? '') ? suggestDishes(text, DISHES) : [];

  function submit(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setText(clean);
    setPlat({ dish: clean, entryId: null, ai: false });
  }

  function pickEntry(e: DishEntry) {
    setText(e.name);
    setPlat({ dish: e.name, entryId: e.id, ai: false });
  }

  function askAi() {
    if (!dish) return;
    // Même plat après une erreur : on redemande ; après un succès, la liste en cache suffit.
    if (plat?.ai && query.isError) void query.refetch();
    else setPlat({ ...plat!, ai: true });
  }

  const onBrowseKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (DISH_CATEGORIES.findIndex((c) => c.value === browse) + step + DISH_CATEGORIES.length) % DISH_CATEGORIES.length;
    setBrowse(DISH_CATEGORIES[i].value);
    document.getElementById(`browse-tab-${DISH_CATEGORIES[i].value}`)?.focus();
  };

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

  const ai = !!plat?.ai;
  const result = ai ? query.data : undefined;
  const year = new Date().getFullYear();
  const askButton = <Button variant="outline" onClick={askAi} disabled={query.isFetching}>Demander à l’IA</Button>;

  /** Liste des vins (IA ou base locale) : cave vide, aucun vin adapté, ou vins classés. */
  const picksView = (r: AccordsResult) => (r.wineCount === 0 ? (
    <p className="centered">Votre cave est vide : ajoutez des bouteilles pour recevoir des accords.</p>
  ) : r.picks.length === 0 ? (
    <div className="card">
      <p style={{ margin: 0 }}>Aucun vin de votre cave ne convient vraiment à ce plat.</p>
      {r.ideal && <p className="list__meta" style={{ margin: 'var(--space-xs) 0 0', fontSize: 13 }}>{`L’idéal : ${r.ideal}`}</p>}
    </div>
  ) : (
    <AccordsResults picks={r.picks} year={year} />
  ));

  return (
    <>
      <TopBar title="Accords" />
      <main className="page">
        <div className="accords-tabs">
          {(['plat', 'vin'] as const).map((m) => (
            <Button key={m} variant={entree.mode === m ? 'primary' : 'outline'} aria-pressed={entree.mode === m} onClick={() => choose({ mode: m, wineId: entree.wineId })}>
              {m === 'plat' ? 'J’ai un plat' : 'J’ai un vin'}
            </Button>
          ))}
        </div>
        {entree.mode === 'vin' ? (
          <AccordsParVin wineId={entree.wineId ?? null} onPick={(id) => choose({ mode: 'vin', wineId: id ?? undefined })} />
        ) : (
        <>
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
              <input id="accords-dish" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Ex. sole meunière, daube provençale" autoComplete="off" />
              {suggestions.length > 0 && (
                <ul className="accords-suggest" aria-label="Suggestions">
                  {suggestions.map((d) => <li key={d.id}><button type="button" className="accords-chip" onClick={() => pickEntry(d)}>{d.name}</button></li>)}
                </ul>
              )}
              <Button type="submit" disabled={!text.trim() || query.isFetching}>Proposer des vins</Button>
            </form>
          ) : (
            <Button variant="link" onClick={() => setWriting(true)}>Écrire plutôt</Button>
          )}
        </section>

        <section aria-live="polite" aria-busy={query.isFetching} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {dish && !ai && (chosen ? (
            <>
              <div className="accords-on">
                <p style={{ margin: 0 }}>Accord sur : <strong>{chosen.name}</strong></p>
                {others.length > 0 && (
                  <ul className="accords-suggest" aria-label="Autres ingrédients reconnus">
                    {others.map((d) => <li key={d.id}><button type="button" className="accords-chip" onClick={() => setPlat({ dish, entryId: d.id, ai: false })}>{`Plutôt : ${d.name}`}</button></li>)}
                  </ul>
                )}
              </div>
              {cave.isError && <p role="alert" className="text-error">Impossible de charger la cave.</p>}
              {local && picksView(local)}
            </>
          ) : (
            <p className="centered">Plat non reconnu dans la base.</p>
          ))}
          {query.isFetching && <SearchProgress />}
          {ai && query.isError && !query.isFetching && <p role="alert" className="text-error">{errorText(query.error)}</p>}
          {result && !query.isFetching && (
            <>
              {result.dish && <p className="list__meta" style={{ margin: 0 }}>{`Pour : ${result.dish}`}</p>}
              {result.wineCount > 0 && result.understood.length > 0 && (
                <div>
                  <h3 className="field__label" style={{ margin: 0 }}>Ce que l’IA a compris</h3>
                  <ul className="dish-pills" aria-label="Ce que l’IA a compris">
                    {result.understood.map((u) => <li key={u} className="dish-pill">{u}</li>)}
                  </ul>
                </div>
              )}
              {picksView(result)}
            </>
          )}
          {dish && (!ai || query.isError) && askButton}
        </section>

        {(!dish || (!ai && !chosen)) && (
          <section className="accords-browse" aria-label="Parcourir la base">
            <div role="tablist" aria-label="Rubriques" className="confirm-tabs">
              {DISH_CATEGORIES.map((c) => (
                <button key={c.value} type="button" role="tab" id={`browse-tab-${c.value}`} aria-selected={browse === c.value} aria-controls="browse-panel"
                  tabIndex={browse === c.value ? 0 : -1} className="confirm-tab" onClick={() => setBrowse(c.value)} onKeyDown={onBrowseKey}>
                  {c.label}
                </button>
              ))}
            </div>
            <ul role="tabpanel" id="browse-panel" aria-labelledby={`browse-tab-${browse}`} className="accords-suggest">
              {byCategory(browse).map((d) => <li key={d.id}><button type="button" className="accords-chip" onClick={() => pickEntry(d)}>{d.name}</button></li>)}
            </ul>
          </section>
        )}
        </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
