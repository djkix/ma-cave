import { KeyboardEvent, MouseEvent, ReactNode, Ref, useState } from 'react';
import { type CavePlan, type PlanMarker, type PlanSuggestion, planImageUrl } from '../lib/api-client';
import { cellCodeOf } from '../lib/grid';
import { usePlans } from '../lib/locations';

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Pas des flèches, en fraction de l'image (Maj : 10 %), arrondi pour éviter 0.54000000000000004. */
const nudge = (v: number, d: number) => Math.round(clamp(v + d) * 1000) / 1000;
/** Fraction → pourcentage CSS, sans les restes de virgule flottante (0.3 - 0.1). */
const pct = (v: number) => `${+(v * 100).toFixed(2)}%`;
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * Plan de la cave et repères numérotés de ses zones, placés en pourcentage de
 * l'image : justes à toute taille. La place de l'image est réservée au format
 * enregistré (largeur et hauteur) avant son chargement. `onPlanClick(x, y)` :
 * position touchée en fractions de la boîte rendue ; `onMarkerClick` : repère
 * touché. Sans `onMarkerClick`, les repères ne sont pas des boutons. `pending` :
 * repère qui vient d'être posé, pas encore attribué à une zone (mis en avant).
 *
 * Au clavier (avec `onPlanClick`), le plan prend le focus : Entrée vaut un
 * toucher au « + » (au centre s'il n'y en a pas), les flèches déplacent le « + »
 * (`onPendingMove`, 2 %, Maj 10 %), Échap appelle `onCancel`.
 *
 * `suggestions` (avec `onSuggestionClick`) : zones proposées par l'analyse du
 * plan, cadres en pointillés qui sont des boutons ; un toucher dans un cadre
 * ouvre la proposition et ne compte pas comme un toucher sur le plan. Étiquette :
 * cases repérées (`cellCount`), ou lignes × colonnes pour une proposition
 * d'avant. `openSuggestionId` : proposition ouverte, dont les cases repérées
 * sont dessinées (cadre fin, point au centre et nom « B3 »), sans être
 * cliquables ni lues par les lecteurs d'écran.
 *
 * `onCellClick` (feuille « Proposition ») : les cases repérées de la proposition
 * ouverte sont dessinées et chaque case au code connu devient un bouton
 * « Case B3 » (« Case Champagnes (B3) » une fois nommée) ; les cadres ne sont plus des boutons.
 * `cellNames` : nom donné à une case, affiché à la place de son code.
 *
 * Zone acceptée avec ses cases (`cellBoxes` du repère, non vide) : dessinée par
 * ses cases (point au centre, nom donné sinon code, comme une proposition
 * ouverte) au lieu de son repère numéroté. Avec `onMarkerClick`, chaque case est
 * un bouton « Zone 2 : Casier C, case Champagnes (C1) » qui vaut un toucher sur
 * le repère ; sinon les cases forment une image « Zone 2 : Casier C ».
 * `highlightCell` : code de la case mise en évidence dans la zone `highlightZoneId`
 * (cadre, point plus gros, nom toujours affiché).
 */
export function PlanView({ src, plan, markers, highlightZoneId, highlightCell, pending, suggestions = [], openSuggestionId, cellNames, onPlanClick, onMarkerClick, onSuggestionClick, onCellClick, onPendingMove, onCancel, planRef, maxWidth, alt = 'Plan de la cave' }: {
  src: string; plan: Pick<CavePlan, 'width' | 'height'>; markers: PlanMarker[]; highlightZoneId?: string | null; highlightCell?: string | null; pending?: { x: number; y: number } | null;
  suggestions?: PlanSuggestion[]; openSuggestionId?: string | null; onSuggestionClick?: (id: string) => void;
  cellNames?: Record<string, string>; onCellClick?: (code: string) => void;
  onPlanClick?: (x: number, y: number) => void; onMarkerClick?: (zoneId: string) => void;
  onPendingMove?: (x: number, y: number) => void; onCancel?: () => void; planRef?: Ref<HTMLSpanElement>; maxWidth?: number; alt?: string;
}) {
  function click(e: MouseEvent<HTMLSpanElement>) {
    if (!onPlanClick) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    onPlanClick(clamp((e.clientX - box.left) / box.width), clamp((e.clientY - box.top) / box.height));
  }
  function key(e: KeyboardEvent<HTMLSpanElement>) {
    // Une touche sur un repère (bouton) reste au repère.
    if (!onPlanClick || e.target !== e.currentTarget) return;
    const arrow = ARROWS[e.key];
    if (e.key === 'Enter' || e.key === ' ') onPlanClick(pending?.x ?? 0.5, pending?.y ?? 0.5);
    else if (e.key === 'Escape' && onCancel) onCancel();
    else if (arrow && pending && onPendingMove) {
      const step = e.shiftKey ? 0.1 : 0.02;
      onPendingMove(nudge(pending.x, arrow[0] * step), nudge(pending.y, arrow[1] * step));
    } else return;
    e.preventDefault();
  }
  const openCells = ((onSuggestionClick || onCellClick) && suggestions.find((s) => s.id === openSuggestionId)?.cells) || [];
  return (
    // Placement au toucher (souris ou doigt) ou au clavier ; les repères restent des boutons.
    // span (affiché en bloc) : le petit plan d'« À boire » vit dans un bouton, qui n'admet pas de div.
    <span ref={planRef} className={`plan-view${onPlanClick ? ' plan-view--placing' : ''}`} style={{ aspectRatio: `${plan.width} / ${plan.height}`, maxWidth }} onClick={click}
      {...(onPlanClick && { tabIndex: 0, role: 'group', 'aria-label': `${alt}. Entrée pour poser un repère, flèches pour le déplacer, Échap pour annuler.`, onKeyDown: key })}>
      <img className="plan-view__image" src={src} alt={alt} width={plan.width} height={plan.height} decoding="async" />
      {onSuggestionClick && suggestions.map(({ id, name, box: [x0, y0, x1, y1], rows, cols, cellCount = rows * cols }) => (
        <button key={id} type="button" className="plan-view__suggestion" aria-label={`Proposition ${name}`}
          style={{ left: pct(x0), top: pct(y0), width: pct(x1 - x0), height: pct(y1 - y0) }}
          onClick={(e) => { e.stopPropagation(); onSuggestionClick(id); }}>
          <span className="plan-view__suggestion-label">{`${name} · ${cellCount} case${cellCount > 1 ? 's' : ''}`}</span>
        </button>
      ))}
      {openCells.length > 0 && (
        <span className="plan-view__cells" aria-hidden={onCellClick ? undefined : 'true'}>
          {openCells.map(({ box: [x0, y0, x1, y1], name }, i) => (
            <span key={i} className="plan-view__cell" aria-hidden={onCellClick ? undefined : 'true'} style={{ left: pct(x0), top: pct(y0), width: pct(x1 - x0), height: pct(y1 - y0) }}>
              {name && <span className="plan-view__cell-name" aria-hidden="true">{cellNames?.[name] ?? name}</span>}
              {name && onCellClick && (
                <button type="button" className="plan-view__cell-button" aria-label={cellNames?.[name] ? `Case ${cellNames[name]} (${name})` : `Case ${name}`} onClick={(e) => { e.stopPropagation(); onCellClick(name); }} />
              )}
            </span>
          ))}
        </span>
      )}
      {markers.filter(hasCells).map((m) => {
        const highlighted = m.zoneId === highlightZoneId;
        const label = `Zone ${m.number} : ${m.name}`;
        return (
          <span key={m.zoneId} className="plan-view__cells" {...(!onMarkerClick && { role: 'img', 'aria-label': label, 'aria-current': highlighted ? ('true' as const) : undefined })}>
            {Object.entries(m.cellBoxes!).map(([code, [x0, y0, x1, y1]]) => {
              const name = m.cellNames?.[code];
              const current = highlighted && code === highlightCell;
              return (
                <span key={code} className={`plan-view__cell plan-view__zone-cell${highlighted ? ' plan-view__zone-cell--highlight' : ''}${current ? ' plan-view__zone-cell--current' : ''}`}
                  style={{ left: pct(x0), top: pct(y0), width: pct(x1 - x0), height: pct(y1 - y0) }}>
                  <span className="plan-view__cell-name" aria-hidden="true">{name ?? code}</span>
                  {onMarkerClick && (
                    <button type="button" className="plan-view__cell-button" aria-label={`${label}, case ${name ? `${name} (${code})` : code}`}
                      aria-current={highlighted ? 'true' : undefined} onClick={(e) => { e.stopPropagation(); onMarkerClick(m.zoneId); }} />
                  )}
                </span>
              );
            })}
          </span>
        );
      })}
      {[...markers.filter((m) => !hasCells(m)), ...(pending ? [{ zoneId: '', name: 'Nouveau repère', number: 0, ...pending }] : [])].map((m) => {
        const highlighted = m.zoneId === '' || m.zoneId === highlightZoneId;
        const props = {
          className: `plan-view__marker${highlighted ? ' plan-view__marker--highlight' : ''}`,
          style: { left: `${m.x * 100}%`, top: `${m.y * 100}%` },
          'aria-label': m.zoneId === '' ? m.name : `Zone ${m.number} : ${m.name}`,
          'aria-current': highlighted ? ('true' as const) : undefined,
        };
        return onMarkerClick && m.zoneId !== '' ? (
          <button key={m.zoneId} type="button" {...props} onClick={(e) => { e.stopPropagation(); onMarkerClick(m.zoneId); }}>{m.number}</button>
        ) : (
          <span key={m.zoneId || 'pending'} role="img" {...props}>{m.zoneId === '' ? '+' : m.number}</span>
        );
      })}
    </span>
  );
}

const hasCells = (m: PlanMarker) => Object.keys(m.cellBoxes ?? {}).length > 0;

/**
 * Plan recadré sur `box` (fractions de l'image) : image agrandie 1/(x1 − x0),
 * décalée du coin du cadre, rognée au cadre. Hauteur bornée à `maxHeight` par la
 * largeur, pour garder le rapport (et donc les décalages en %). `children` : le
 * `PlanView` du plan entier. En span (affiché en bloc) : la vignette de la fiche vin vit dans un bouton.
 */
export function PlanCrop({ box: [x0, y0, x1, y1], plan, maxHeight = '50vh', children }: {
  box: [number, number, number, number]; plan: Pick<CavePlan, 'width' | 'height'>; maxHeight?: string; children: ReactNode;
}) {
  const ratio = ((x1 - x0) * plan.width) / ((y1 - y0) * plan.height);
  return (
    <span className="plan-crop" style={{ aspectRatio: `${(x1 - x0) * plan.width} / ${(y1 - y0) * plan.height}`, width: `min(100%, calc(${maxHeight} * ${ratio}))` }}>
      <span className="plan-crop__inner" style={{ width: pct(1 / (x1 - x0)), left: pct(-x0 / (x1 - x0)), top: pct(-y0 / (y1 - y0)) }}>{children}</span>
    </span>
  );
}

/**
 * Plan où se trouve la zone (celui de son repère), repère de la zone en avant
 * (fiche du vin, « À boire »), en lecture seule pour tous, nom du plan en
 * légende. À n'afficher que pour une zone qui a un repère (`zone.marker`) : les
 * plans ne sont lus qu'alors. Rien sans repère. `mini` : petit plan (160 px)
 * avec ce seul repère, qui s'agrandit au toucher avec tous les repères du plan.
 */
export function ZonePlan({ zoneId, mini }: { zoneId: string; mini?: boolean }) {
  const data = usePlans().data;
  const [open, setOpen] = useState(false);
  const planId = data?.markers.find((m) => m.zoneId === zoneId)?.planId;
  const plan = data?.plans.find((p) => p.id === planId);
  if (!plan) return null;
  const src = planImageUrl(plan.id, plan.updatedAt);
  const markers = data!.markers.filter((m) => m.planId === plan.id);
  const caption = <p className="plan-caption">{plan.name}</p>;
  if (mini && !open) {
    return (
      <>
        <button type="button" className="plan-mini" aria-label="Agrandir le plan" onClick={() => setOpen(true)}>
          <PlanView src={src} plan={plan} markers={markers.filter((m) => m.zoneId === zoneId)} highlightZoneId={zoneId} maxWidth={160} />
        </button>
        {caption}
      </>
    );
  }
  return (
    <div className="plan-chooser">
      <PlanView src={src} plan={plan} markers={markers} highlightZoneId={zoneId} />
      {caption}
      {mini && <button type="button" className="btn btn--link" onClick={() => setOpen(false)}>Réduire le plan</button>}
    </div>
  );
}

/** Fraction arrondie : pas de 0.06000000000000001 dans les styles ni les tests. */
const round = (v: number) => +v.toFixed(4);

/**
 * Cadre de la vignette d'une zone (fractions de l'image) : avec ses cases, leur
 * englobant plus 4 % de chaque côté, coupé aux bords ; sinon une fenêtre de
 * 40 % × 40 % centrée sur le repère, décalée pour rester dans l'image.
 */
export function thumbnailBox(marker: PlanMarker): [number, number, number, number] {
  const boxes = Object.values(marker.cellBoxes ?? {});
  if (boxes.length > 0) {
    const m = 0.04;
    return [
      clamp(Math.min(...boxes.map((b) => b[0])) - m), clamp(Math.min(...boxes.map((b) => b[1])) - m),
      clamp(Math.max(...boxes.map((b) => b[2])) + m), clamp(Math.max(...boxes.map((b) => b[3])) + m),
    ].map(round) as [number, number, number, number];
  }
  const x0 = Math.min(0.6, Math.max(0, marker.x - 0.2));
  const y0 = Math.min(0.6, Math.max(0, marker.y - 0.2));
  return [x0, y0, x0 + 0.4, y0 + 0.4].map(round) as [number, number, number, number];
}

/**
 * Vignette de l'emplacement d'une bouteille (fiche vin) : le plan de la zone
 * recadré sur ses cases (ou autour de son repère), ce seul repère, la case du
 * `casier` en évidence quand elle a une position. Rien sans repère.
 */
export function PlaceThumbnail({ zoneId, casier, label }: { zoneId: string; casier: string | null; label: string }) {
  const data = usePlans().data;
  const marker = data?.markers.find((m) => m.zoneId === zoneId);
  const plan = data?.plans.find((p) => p.id === marker?.planId);
  if (!marker || !plan) return null;
  const code = cellCodeOf(casier, marker.cellNames)?.trim().toUpperCase();
  return (
    <PlanCrop box={thumbnailBox(marker)} plan={plan} maxHeight="40vh">
      <PlanView src={planImageUrl(plan.id, plan.updatedAt)} plan={plan} markers={[marker]} highlightZoneId={zoneId}
        highlightCell={code && marker.cellBoxes?.[code] ? code : null} alt={`Plan : ${label}`} />
    </PlanCrop>
  );
}
