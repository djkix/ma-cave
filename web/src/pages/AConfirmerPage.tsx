import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyboardEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BatchProgressList } from '../components/AnalysisQueueBanner';
import { Button } from '../components/Button';
import { LOW_CONFIDENCE } from '../components/ConfidenceBadge';
import { EditableField } from '../components/EditableField';
import { EntryLocationBlock } from '../components/PlanCellPicker';
import { OfflineQueueBanner } from '../components/OfflineQueueBanner';
import { QuantityPicker } from '../components/QuantityPicker';
import { TopBar } from '../components/TopBar';
import { Icon } from '../components/Icon';
import { Apogee, ApiError, BulkResult, createMovementsBulk, dismissPhoto, getEntryInbox, getPhotoQueueStatus, LocationInput, PhotoDto, WineColor, WineDraft, WineExtraction } from '../lib/api-client';
import { apogeeRange } from '../lib/apogee';
import { extractionToDraft, initialQuantity } from '../lib/extraction-to-draft';
import { EMPTY_LOCATION, toLocationInput, useLastLocation } from '../lib/locations';

interface Row {
  photoId: string;
  idempotencyKey: string;
  draft: WineDraft;
  confidences: Partial<Record<keyof WineDraft, number>>;
  globalConfidence: number;
  quantity: number;
  detected: number | null;
  ignored: boolean;
  /** Emplacement saisi ; absent tant qu'on n'y touche pas (pré-rempli avec la dernière entrée rangée). */
  location?: LocationInput;
  /** Couleur et format lus sur l'étiquette (« Rouge · 75 cl »), vide si rien n'a été lu. */
  read: string;
  /** Apogée estimée par l'api à partir de la lecture ; pas recalculée si l'on corrige les champs. */
  apogee: Apogee | null;
}

const COLOR_LABEL: Record<WineColor, string> = { ROUGE: 'Rouge', BLANC: 'Blanc', ROSE: 'Rosé', PETILLANT: 'Pétillant' };

/** Couleur et format tels que lus ; un champ non lu est omis (pas la valeur par défaut de la fiche). */
function readSummary(e: WineExtraction): string {
  return [e.color.value && COLOR_LABEL[e.color.value], e.formatCl.value && `${e.formatCl.value} cl`].filter(Boolean).join(' · ');
}

function toRow(p: PhotoDto): Row | null {
  if (!p.extraction) return null;
  const { draft, confidences, detectedQuantity } = extractionToDraft(p.extraction);
  return { photoId: p.id, idempotencyKey: crypto.randomUUID(), draft, confidences, globalConfidence: p.extraction.globalConfidence, quantity: initialQuantity(p.requestedQuantity ?? null, detectedQuantity), detected: detectedQuantity, ignored: false, read: readSummary(p.extraction), apogee: p.apogee ?? null };
}

function rowProblem(r: Row): string | null {
  if (!r.draft.producer.trim()) return 'Producteur requis';
  if (!r.draft.appellationRaw.trim()) return 'Appellation requise';
  if (r.draft.vintage != null && (r.draft.vintage < 1900 || r.draft.vintage > new Date().getFullYear())) {
    return `Millésime entre 1900 et ${new Date().getFullYear()}`;
  }
  return null;
}

type Tab = 'valider' | 'analyse' | 'illisibles';
const TABS: { id: Tab; label: string }[] = [
  { id: 'valider', label: 'À valider' },
  { id: 'analyse', label: 'En cours d’analyse' },
  { id: 'illisibles', label: 'Lecture impossible' },
];

/** Libellé accessible du bouton « Écarter » : le vin quand il est connu, sinon la photo. */
function dismissLabel(draft?: WineDraft): string {
  const producer = draft?.producer.trim();
  if (!producer) return 'Écarter cette photo';
  return ['Écarter', producer, draft?.cuvee?.trim(), draft?.vintage?.toString()].filter(Boolean).join(' ');
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

function Thumb({ photoId }: { photoId: string }) {
  return <img src={`/api/photos/${photoId}/image?variant=display`} alt="" width={64} height={80} loading="lazy" decoding="async" className="confirm-thumb" />;
}

/**
 * Liste des photos d'entrée en attente d'une décision : fiches lues à valider,
 * photos encore en analyse, photos illisibles à saisir à la main. Remplace la
 * revue groupée de l’ancien mode campagne.
 */
export function AConfirmerPage() {
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: ['entry-inbox'], queryFn: getEntryInbox, refetchInterval: 10_000 });
  const [rows, setRows] = useState<Row[]>([]);
  // Photos validées ou écartées pendant cette visite : une réponse de
  // rafraîchissement partie avant la validation ne doit pas les faire revenir
  // (avec une nouvelle clé d'idempotence, elles seraient validables deux fois).
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<BulkResult | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const { locations, zones, last, loading: locationsLoading } = useLastLocation();
  const locationOf = (r: Row) => r.location ?? last ?? EMPTY_LOCATION;

  useEffect(() => {
    if (!inbox.data) return;
    const toConfirm = inbox.data.toConfirm;
    setRows((prev) => {
      // Fusion par photo : une fiche en cours de correction garde ses modifications.
      const known = new Map(prev.map((r) => [r.photoId, r]));
      return toConfirm
        .filter((p) => !handled.has(p.id))
        .map((p) => known.get(p.id) ?? toRow(p))
        .filter((r): r is Row => r !== null)
        .sort((a, b) => a.globalConfidence - b.globalConfidence);
    });
  }, [inbox.data, handled]);

  const markHandled = (ids: string[]) => {
    setHandled((h) => new Set([...h, ...ids]));
    setRows((rs) => rs.filter((r) => !ids.includes(r.photoId)));
  };

  const refreshAfterChange = () => {
    for (const queryKey of [['entry-inbox'], ['cave'], ['movements'], ['stats'], ['locations'], ['zone-cells']]) void qc.invalidateQueries({ queryKey });
  };

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.photoId === id ? { ...r, ...patch } : r)));
  const kept = rows.filter((r) => !r.ignored && rowProblem(r) === null);
  const incomplete = rows.filter((r) => !r.ignored && rowProblem(r) !== null).length;
  const inProgress = (inbox.data?.inProgress ?? []).filter((p) => !handled.has(p.id));
  // Une photo lue mais dont l'extraction est illisible n'a pas de fiche à
  // pré-remplir : elle rejoint « Lecture impossible » plutôt que de disparaître.
  const unreadable = (inbox.data?.toConfirm ?? []).filter((p) => !p.extraction);
  const failed = [...(inbox.data?.failed ?? []), ...unreadable].filter((p) => !handled.has(p.id));
  // Avancement des rafales, seulement tant que des photos sont en analyse.
  const queue = useQuery({ queryKey: ['photos', 'queue-status'], queryFn: getPhotoQueueStatus, refetchInterval: 10_000, enabled: inProgress.length > 0 });

  async function validate(selection: Row[]) {
    setBusy(true);
    setError(null);
    setItemErrors({});
    try {
      const res = await createMovementsBulk(
        selection.map((r) => ({
          idempotencyKey: r.idempotencyKey, photoId: r.photoId, wine: { ...r.draft, cuvee: r.draft.cuvee || null, vintage: r.draft.vintage ?? null },
          quantity: r.quantity, location: toLocationInput(locationOf(r)),
        })),
      );
      setResult(res);
      const okKeys = new Set(res.filter((x) => x.ok).map((x) => x.idempotencyKey));
      const errors: Record<string, string> = {};
      res.forEach((x) => {
        if (!x.ok) errors[x.idempotencyKey] = x.error;
      });
      setItemErrors(errors);
      if (okKeys.size > 0) {
        markHandled(selection.filter((r) => okKeys.has(r.idempotencyKey)).map((r) => r.photoId));
        refreshAfterChange();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation impossible');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(photoId: string) {
    // Écarter est définitif (la photo ne revient plus) : on demande confirmation.
    if (!window.confirm('Écarter cette photo ? Elle ne sera plus proposée.')) return;
    setBusy(true);
    setError(null);
    try {
      await dismissPhoto(photoId);
      markHandled([photoId]);
      refreshAfterChange();
    } catch (e) {
      // 404 : la photo n'existe plus, il n'y a plus rien à écarter.
      if (e instanceof ApiError && e.status === 404) {
        markHandled([photoId]);
        refreshAfterChange();
      } else {
        setError(e instanceof Error ? e.message : 'Impossible d’écarter cette photo');
      }
    } finally {
      setBusy(false);
    }
  }

  const okCount = result?.filter((x) => x.ok).length ?? 0;
  const koCount = result ? result.length - okCount : 0;
  const empty = rows.length === 0 && inProgress.length === 0 && failed.length === 0;

  const counts = { valider: rows.length, analyse: inProgress.length, illisibles: failed.length };
  // Onglet par défaut : « À valider », ou le premier non vide ; un choix explicite est respecté.
  const active: Tab = tab ?? (TABS.find((t) => counts[t.id] > 0)?.id ?? 'valider');
  const bottles = kept.reduce((n, r) => n + r.quantity, 0);
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (TABS.findIndex((t) => t.id === active) + step + TABS.length) % TABS.length;
    setTab(TABS[i].id);
    document.getElementById(`tab-${TABS[i].id}`)?.focus();
  };

  return (
    <>
      <TopBar title="À confirmer" back="/" />
      <main className="page confirm-page" style={{ paddingBottom: 'calc(var(--size-bottomnav-height) + var(--size-action-height) + var(--space-xl))' }}>
        {/* Le titre est déjà dans la barre du haut : ici, seulement le nombre de fiches prêtes. */}
        {rows.length > 0 && (
          <div className="confirm-head">
            <span className="confirm-chip">{rows.length} prêt{rows.length > 1 ? 's' : ''}</span>
          </div>
        )}
        <OfflineQueueBanner />
        {result && (
          <p role="status" className={`badge ${okCount > 0 ? 'badge--ok' : 'badge--warn'}`}>
            {okCount} fiche{okCount > 1 ? 's' : ''} validée{okCount > 1 ? 's' : ''}
            {koCount > 0 && ` · ${koCount} en erreur`}
          </p>
        )}
        {error && <p role="alert" className="text-error">{error}</p>}
        {inbox.isError && <p role="alert" className="text-error">Impossible de charger les vins à confirmer.</p>}
        {inbox.isPending && <p className="centered">Chargement…</p>}
        {inbox.isSuccess && empty && (
          <p className="centered">Aucun vin à confirmer. Les photos prises en rafale apparaîtront ici une fois analysées.</p>
        )}

        {inbox.isSuccess && !empty && (
          <>
            <div role="tablist" aria-label="Photos à confirmer" className="confirm-tabs">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`}
                  tabIndex={active === t.id ? 0 : -1} className="confirm-tab" onClick={() => setTab(t.id)} onKeyDown={onTabKey}>
                  {t.label} ({counts[t.id]})
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="confirm-panel">
              {counts[active] === 0 && <p className="centered">Rien dans cette liste.</p>}

              {active === 'valider' && rows.map((r) => {
                const problem = rowProblem(r);
                const itemError = itemErrors[r.idempotencyKey];
                const subline = [r.draft.appellationRaw.trim(), r.draft.vintage?.toString()].filter(Boolean).join(' · ');
                return (
                  <article key={r.photoId} className="card confirm-card" style={{ opacity: r.ignored ? 0.5 : 1 }}>
                    <div className="confirm-card__head">
                      <Thumb photoId={r.photoId} />
                      <div className="confirm-card__id">
                        <span className={`badge ${r.globalConfidence >= LOW_CONFIDENCE ? 'badge--ok' : 'badge--warn'}`}>Confiance {Math.round(r.globalConfidence * 100)} %</span>
                        <strong className="confirm-card__title">{r.draft.producer.trim() || 'Producteur à saisir'}</strong>
                        {subline && <span className="confirm-card__sub">{subline}</span>}
                        {r.read && <span className="confirm-card__read">{r.read}</span>}
                      </div>
                    </div>
                    {r.apogee && (
                      <p className="confirm-apogee">
                        <Icon name="hourglass_top" />
                        {/* Fourchette tirée de la lecture de l'IA (appellation, millésime, couleur) : toujours une estimation. */}
                        <span>{apogeeRange(r.apogee)} <em>· estimée</em></span>
                      </p>
                    )}
                    <div className="confirm-card__flags">
                      {!r.ignored && problem && <span className="badge badge--warn">{problem}</span>}
                      {itemError && <span className="badge badge--warn">{itemError}</span>}
                      <Button variant="link" onClick={() => update(r.photoId, { ignored: !r.ignored })}>{r.ignored ? 'Reprendre' : 'Mettre de côté'}</Button>
                    </div>
                    {!r.ignored && (
                      <>
                        <EditableField label="Producteur" serif value={r.draft.producer} confidence={r.confidences.producer} onChange={(v) => update(r.photoId, { draft: { ...r.draft, producer: v } })} />
                        <div className="confirm-grid">
                          <EditableField label="Cuvée" serif value={r.draft.cuvee ?? ''} confidence={r.confidences.cuvee} onChange={(v) => update(r.photoId, { draft: { ...r.draft, cuvee: v } })} />
                          <EditableField label="Appellation" appellation serif value={r.draft.appellationRaw} confidence={r.confidences.appellationRaw} onChange={(v) => update(r.photoId, { draft: { ...r.draft, appellationRaw: v } })} />
                        </div>
                        <div className="confirm-inset">
                          <EditableField label="Millésime" type="number" value={r.draft.vintage?.toString() ?? ''} confidence={r.confidences.vintage} onChange={(v) => update(r.photoId, { draft: { ...r.draft, vintage: v ? Number(v) : null } })} />
                        </div>
                        <p className="confirm-label">Conditionnement &amp; Nombre</p>
                        <div className="confirm-qty"><QuantityPicker value={r.quantity} detected={r.detected} onChange={(n) => update(r.photoId, { quantity: n })} /></div>
                        <p className="confirm-label">Emplacement suggéré</p>
                        <div className="confirm-loc"><EntryLocationBlock value={locationOf(r)} onChange={(v) => update(r.photoId, { location: v })} locations={locations} zones={zones} /></div>
                      </>
                    )}
                    <div className="confirm-actions">
                      <Button variant="outline" onClick={() => dismiss(r.photoId)} disabled={busy} aria-label={dismissLabel(r.draft)}>Écarter</Button>
                      {!r.ignored && (
                        <Button variant="dark" onClick={() => validate([r])} disabled={busy || locationsLoading || problem !== null}>Valider ce vin</Button>
                      )}
                    </div>
                  </article>
                );
              })}

              {active === 'analyse' && <BatchProgressList batches={queue.data?.batches} />}
              {active === 'analyse' && (
                <ul className="list confirm-list">
                  {inProgress.map((p) => (
                    <li key={p.id} className="card confirm-row">
                      <Thumb photoId={p.id} />
                      <span>{p.errorMessage || 'Analyse en cours (environ 1 min)'}</span>
                    </li>
                  ))}
                </ul>
              )}

              {active === 'illisibles' && (
                <ul className="list confirm-list">
                  {failed.map((p) => (
                    <li key={p.id} className="card confirm-row">
                      <Thumb photoId={p.id} />
                      <span className="confirm-row__msg">{p.errorMessage || 'Étiquette non lue'}</span>
                      <Link to={`/entree/${p.id}`} className="btn btn--outline">Saisir à la main</Link>
                      <Button variant="link" onClick={() => dismiss(p.id)} disabled={busy} aria-label={dismissLabel()}>Écarter</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {rows.length > 0 && (
          <div className="dock">
            <Button variant="dark" onClick={() => validate(kept)} disabled={busy || locationsLoading || kept.length === 0}>
              Tout valider ({plural(kept.length, 'vin')} · {plural(bottles, 'bouteille')})
            </Button>
            <span className="dock__hint">
              Un mouvement d’entrée par fiche · les fiches mises de côté restent à confirmer
              {incomplete > 0 && ` · ${plural(incomplete, 'fiche')} incomplète${incomplete > 1 ? 's' : ''} à corriger ou à mettre de côté`}
            </span>
          </div>
        )}
      </main>
    </>
  );
}
