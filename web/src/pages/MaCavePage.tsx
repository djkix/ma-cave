import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChangeEvent, FormEvent, useEffect, useId, useRef, useState } from 'react';
import { ActionMenu } from '../components/ActionMenu';
import { AnalysisBanner } from '../components/AnalysisBanner';
import { BottomNav } from '../components/BottomNav';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ZoneDetails } from '../components/LocationFields';
import { PersonRow } from '../components/PersonRow';
import { PhotoPicker } from '../components/PhotoPicker';
import { PlanView } from '../components/PlanView';
import { TopBar } from '../components/TopBar';
import {
  acceptSuggestion, CavePlan, createPlan, createZone, deletePlan, deleteZone, exportUrl, getMembers, inviteMember, MemberView, planImageUrl, PlanSuggestion, rejectSuggestion,
  removeMember, removeZoneMarker, removeZonePhoto, renameCave, renamePlan, relaunchAnalysis, reorderZones, replacePlanImage, setZoneMarker, updateZone, uploadZonePhoto, Zone,
} from '../lib/api-client';
import { cellsPreview, GRID_MAX_COLS, GRID_MAX_ROWS, parseGrid } from '../lib/grid';
import { replacePlanInCache, usePlans, useZones } from '../lib/locations';
import { shrinkPhoto } from '../lib/shrink-photo';
import { useCurrentCave } from '../lib/use-current-cave';

/** Plus grand côté du plan envoyé : celui que garde l'api. */
const PLAN_MAX_SIDE = 2400;
const PLAN_NAME_MAX = 40;

const NAME_MAX = 80;
const NAME_ERROR = 'Le nom de la cave doit faire de 1 à 80 caractères';

function RenameCard() {
  const qc = useQueryClient();
  const { cave } = useCurrentCave();
  // Brouillon : nul tant que l'utilisateur n'a rien tapé, le nom courant est alors affiché.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? cave?.name ?? '';
  const trimmed = value.trim();
  const invalid = trimmed.length === 0 || trimmed.length > NAME_MAX;
  const rename = useMutation({
    mutationFn: (name: string) => renameCave(name),
    onSuccess: () => {
      setDraft(null);
      // Le nom vient de la session (sélecteur de cave, ce formulaire) : on la relit.
      return qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!invalid) rename.mutate(trimmed);
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <label className="field__label" htmlFor="cave-name">Nom de la cave</label>
      <input
        id="cave-name"
        value={value}
        maxLength={200}
        aria-invalid={Boolean(cave) && invalid}
        aria-describedby={cave && invalid ? 'cave-name-error' : undefined}
        onChange={(e) => { setDraft(e.target.value); rename.reset(); }}
      />
      {cave && invalid && <p id="cave-name-error" className="text-error" style={{ margin: 0 }}>{NAME_ERROR}</p>}
      {rename.isError && <p role="alert" className="text-error" style={{ margin: 0 }}>{(rename.error as Error).message}</p>}
      {rename.isSuccess && <p role="status" className="list__meta" style={{ margin: 0 }}>Nom enregistré</p>}
      <button type="submit" className="btn btn--dark" disabled={!cave || invalid || rename.isPending}>Enregistrer</button>
    </form>
  );
}

function MemberRow({ member, busy, onRemove }: { member: MemberView; busy: boolean; onRemove: (m: MemberView) => void }) {
  const owner = member.role === 'OWNER';
  return (
    <PersonRow
      title={member.displayName ?? member.email}
      subtitle={member.displayName ? member.email : null}
      badges={[
        owner ? { label: 'Propriétaire', tone: 'ok' } : { label: 'Lecture seule', tone: 'warn' },
        ...(member.pending ? [{ label: 'Invitation en attente', tone: 'warn' as const }] : []),
      ]}
      action={!owner && (
        <Button variant="link" aria-label={`Retirer ${member.email}`} disabled={busy} onClick={() => onRemove(member)}>
          Retirer
        </Button>
      )}
    />
  );
}

const ZONE_NAME_MAX = 40;
const INDICATION_MAX = 300;

/** Lignes et colonnes d'une grille de cases (saisies en texte), et l'aperçu des cases quand elles sont valides. */
function GridFields({ idPrefix, rows, cols, setRows, setCols }: {
  idPrefix: string; rows: string; cols: string; setRows: (v: string) => void; setCols: (v: string) => void;
}) {
  const grid = parseGrid(rows, cols);
  return (
    <>
      <label className="field__label" htmlFor={`${idPrefix}-rows`}>Lignes</label>
      <input id={`${idPrefix}-rows`} type="number" inputMode="numeric" min={1} max={GRID_MAX_ROWS} value={rows} onChange={(e) => setRows(e.target.value)} />
      <label className="field__label" htmlFor={`${idPrefix}-cols`}>Colonnes</label>
      <input id={`${idPrefix}-cols`} type="number" inputMode="numeric" min={1} max={GRID_MAX_COLS} value={cols} onChange={(e) => setCols(e.target.value)} />
      {grid && <p className="list__meta" style={{ margin: 0 }}>{cellsPreview(grid.rows, grid.cols)}</p>}
    </>
  );
}

/**
 * Nom et indication d'une zone : ceux de l'ajout et de « Modifier ». « Modifier »
 * (`onCancel`) ajoute la grille : Lignes et Colonnes, vides = pas de grille.
 */
function ZoneForm({ label, initial, submitLabel, busy, onSubmit, onCancel, idPrefix }: {
  label: string; initial: { name: string; indication: string; grid?: Zone['grid'] }; submitLabel: string; busy: boolean;
  onSubmit: (v: { name: string; indication: string | null; grid?: Zone['grid'] }) => void; onCancel?: () => void; idPrefix: string;
}) {
  const [name, setName] = useState(initial.name);
  const [indication, setIndication] = useState(initial.indication);
  const [rows, setRows] = useState(initial.grid ? String(initial.grid.rows) : '');
  const [cols, setCols] = useState(initial.grid ? String(initial.grid.cols) : '');
  // undefined : une seule dimension, ou hors bornes ; on n'enregistre pas.
  const grid = parseGrid(rows, cols);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && grid !== undefined) onSubmit({ name: name.trim(), indication: indication.trim() || null, ...(onCancel && { grid }) });
  }
  return (
    <form aria-label={label} onSubmit={submit} className="zone-form">
      <label className="field__label" htmlFor={`${idPrefix}-name`}>{onCancel ? 'Nom' : 'Nom de la nouvelle zone'}</label>
      <input id={`${idPrefix}-name`} value={name} maxLength={ZONE_NAME_MAX} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      <label className="field__label" htmlFor={`${idPrefix}-indication`}>{onCancel ? 'Indication' : 'Indication de la nouvelle zone'}</label>
      <textarea id={`${idPrefix}-indication`} value={indication} maxLength={INDICATION_MAX} rows={2}
        placeholder="à gauche en entrant, au fond derrière l’escalier" onChange={(e) => setIndication(e.target.value)} />
      {onCancel && <GridFields idPrefix={idPrefix} rows={rows} cols={cols} setRows={setRows} setCols={setCols} />}
      <button type="submit" className={onCancel ? 'btn btn--dark' : 'btn btn--primary'} disabled={!name.trim() || grid === undefined || busy}>{submitLabel}</button>
      {onCancel && <Button variant="link" onClick={onCancel}>Annuler</Button>}
    </form>
  );
}

function ZoneRow({ zone, index, count, busy, error, photoVersion, onMove, onAction, onPhotoChanged, onEdit }: {
  zone: Zone; index: number; count: number; busy: boolean; photoVersion?: number;
  /** Refus de l'api, repris dans la feuille « Modifier » qui masque la carte. */
  error: string | null;
  onMove: (delta: -1 | 1) => void; onPhotoChanged: () => void;
  /** Ouverture de « Modifier » : efface l'ancien refus, pour qu'il ne reparaisse pas dans la feuille. */
  onEdit: () => void;
  /** `run` peut rendre un message d'état à annoncer (« Zone supprimée »). */
  onAction: (run: () => Promise<unknown>, after?: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const id = useId();
  function confirmDelete() {
    if (window.confirm(`Supprimer la zone ${zone.name} ? Les bouteilles qui y sont rangées restent en stock, sans emplacement.`)) {
      onAction(async () => {
        const { archived, unplaced } = await deleteZone(zone.id);
        if (unplaced > 0) return `Zone archivée : ${unplaced} bouteille${unplaced > 1 ? 's' : ''} sans emplacement`;
        return archived ? 'Zone archivée (elle reste dans l’historique)' : 'Zone supprimée';
      });
    }
  }
  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onAction(async () => uploadZonePhoto(zone.id, await shrinkPhoto(file)), onPhotoChanged);
  }
  return (
    <li aria-label={zone.name} className="zone-row">
      <div className="zone-row__head">
        <p className="list__title" style={{ margin: 0, overflowWrap: 'anywhere', flex: 1, minWidth: 0 }}>{zone.name}</p>
        <button type="button" className="btn btn--outline zone-row__arrow" aria-label={`Monter ${zone.name}`} disabled={busy || index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="btn btn--outline zone-row__arrow" aria-label={`Descendre ${zone.name}`} disabled={busy || index === count - 1} onClick={() => onMove(1)}>↓</button>
      </div>
      <ZoneDetails key={photoVersion} zone={zone} version={photoVersion} />
      <div className="zone-row__actions">
        <Button variant="link" disabled={busy} onClick={() => { onEdit(); setEditing(true); }}>Modifier</Button>
        <Button variant="link" disabled={busy} onClick={confirmDelete}>Supprimer</Button>
      </div>
      <BottomSheet open={editing} title={`Modifier ${zone.name}`} onClose={() => setEditing(false)}>
        <ZoneForm label={`Modifier ${zone.name}`} idPrefix={id} initial={{ name: zone.name, indication: zone.indication ?? '', grid: zone.grid }} submitLabel="Enregistrer" busy={busy}
          onSubmit={(v) => onAction(() => updateZone(zone.id, v), () => setEditing(false))} onCancel={() => setEditing(false)} />
        {error && <p role="alert" className="text-error" style={{ margin: 0 }}>{error}</p>}
      </BottomSheet>
      <div className="zone-row__actions">
        <PhotoPicker id={`${id}-photo`} label={`${zone.hasPhoto ? 'Changer la photo' : 'Ajouter une photo'} de ${zone.name}`} disabled={busy} onChange={pickPhoto} />
        {zone.hasPhoto && <Button variant="link" disabled={busy} onClick={() => onAction(() => removeZonePhoto(zone.id))}>Retirer la photo</Button>}
      </div>
    </li>
  );
}

/**
 * Zones de la cave : nom, indication, photo, ordre d'affichage (↑ ↓). Toutes
 * les erreurs de l'api sont montrées telles quelles.
 */
function ZonesCard() {
  const qc = useQueryClient();
  const zones = useZones();
  // Avec un plan, une zone naît d'un toucher sur un plan (PlanCard) : pas de second formulaire d'ajout ici.
  const hasPlan = !!usePlans().data?.plans.length;
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Version de la photo de chaque zone remplacée ici : la nouvelle image est relue sous la même adresse.
  const [versions, setVersions] = useState<Record<string, number>>({});
  // Clé du formulaire d'ajout : changée après un ajout réussi, pour le vider.
  const [addKey, setAddKey] = useState(0);
  const list = zones.data ?? [];

  async function act(run: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await run();
      if (typeof result === 'string') setStatus(result);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible');
    } finally {
      setBusy(false);
      // Zones et libellés (emplacements, fiches, cave) suivent un renommage, un nouvel ordre ou une suppression.
      void qc.invalidateQueries({ predicate: (q) => ['zones', 'plans', 'locations', 'wine', 'cave', 'movements'].includes(String(q.queryKey[0])) });
    }
  }

  function move(index: number, delta: -1 | 1) {
    const ids = list.map((z) => z.id);
    const target = index + delta;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void act(() => reorderZones(ids));
  }

  return (
    <section className="card" aria-labelledby={titleId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <h2 id={titleId} style={{ fontSize: 18, margin: 0 }}>Zones</h2>
      <p className="list__meta" style={{ margin: 0 }}>Les endroits de la cave où ranger les bouteilles. L’indication et la photo aident à les retrouver.</p>
      {zones.isError && <p role="alert" className="text-error">{(zones.error as Error).message}</p>}
      {zones.data?.length === 0 && <p className="list__meta">Aucune zone pour l’instant.</p>}
      {list.length > 0 && (
        <ul className="zone-list">
          {list.map((z, i) => (
            <ZoneRow key={z.id} zone={z} index={i} count={list.length} busy={busy} error={error} photoVersion={versions[z.id]}
              onEdit={() => setError(null)} onMove={(d) => move(i, d)} onAction={(run, after) => void act(run, after)}
              onPhotoChanged={() => setVersions((v) => ({ ...v, [z.id]: Date.now() }))} />
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-error" style={{ margin: 0 }}>{error}</p>}
      {status && <p role="status" className="list__meta" style={{ margin: 0 }}>{status}</p>}
      {hasPlan ? (
        <p className="list__meta" style={{ margin: 0 }}>Pour ajouter une zone, touchez un plan ci-dessus à son endroit.</p>
      ) : (
        <ZoneForm key={addKey} label="Ajouter une zone" idPrefix={`${titleId}-new`} initial={{ name: '', indication: '' }} submitLabel="Ajouter une zone" busy={busy}
          onSubmit={(v) => void act(() => createZone(v), () => setAddKey((k) => k + 1))} />
      )}
    </section>
  );
}

/** Proposition de l'analyse du plan : nom, lignes et colonnes préremplis et modifiables ; Accepter crée la zone, Rejeter la retire. */
function ProposalForm({ suggestion, idPrefix, busy, onAccept, onReject }: {
  suggestion: PlanSuggestion; idPrefix: string; busy: boolean;
  onAccept: (v: { name: string; rows: number; cols: number }) => void; onReject: () => void;
}) {
  const [name, setName] = useState(suggestion.name);
  const [rows, setRows] = useState(String(suggestion.rows));
  const [cols, setCols] = useState(String(suggestion.cols));
  const grid = parseGrid(rows, cols);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && grid) onAccept({ name: name.trim(), ...grid });
  }
  return (
    <form className="zone-form" onSubmit={submit}>
      <label className="field__label" htmlFor={`${idPrefix}-name`}>Nom</label>
      <input id={`${idPrefix}-name`} value={name} maxLength={ZONE_NAME_MAX} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      <GridFields idPrefix={idPrefix} rows={rows} cols={cols} setRows={setRows} setCols={setCols} />
      <button type="submit" className="btn btn--primary" disabled={!name.trim() || !grid || busy}>Accepter</button>
      <Button variant="link" disabled={busy} onClick={onReject}>Rejeter</Button>
    </form>
  );
}

/** Ce que montre le plan en dehors de l'image : un repère à attribuer, une zone choisie, ou une zone à déplacer (« + » au clavier en x, y). */
type PlanMode = { kind: 'idle' } | { kind: 'pending'; x: number; y: number } | { kind: 'selected'; zoneId: string } | { kind: 'moving'; zoneId: string; x: number; y: number };

/**
 * Plans de la cave, en onglets : en ajouter un (nom puis photo) ; le menu ⋯
 * renomme (feuille du bas), remplace la photo, relance l'analyse ou supprime le plan affiché ; puis y créer les zones.
 * Toucher le plan pose un « + » et demande le nom de l'endroit : la zone est
 * créée avec son repère sur ce plan (ou on choisit une zone existante encore
 * sans repère). Toucher un repère montre sa zone, avec « Déplacer » et
 * « Retirer le repère ». Erreurs de l'api telles quelles.
 */
function PlanCard() {
  const qc = useQueryClient();
  const query = usePlans();
  const zones = useZones();
  const titleId = useId();
  const inputId = useId();
  const planRef = useRef<HTMLSpanElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  // Onglet choisi : id d'un plan, ou « new » pour l'ajout.
  const [tab, setTab] = useState('');
  const [mode, setMode] = useState<PlanMode>({ kind: 'idle' });
  const [newName, setNewName] = useState('');
  const [planName, setPlanName] = useState('');
  // Photo du nouveau plan, gardée jusqu'à « Créer le plan » : nom et photo dans l'ordre qu'on veut.
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Proposition ouverte (feuille « Proposition ») ; fermée d'elle-même si elle disparaît des plans relus.
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Plan dont l'analyse vient de finir, écran ouvert : bandeau de succès jusqu'à la prochaine action.
  const [doneId, setDoneId] = useState<string | null>(null);
  const lastAnalysis = useRef<Record<string, CavePlan['analysis']>>({});
  const plans = query.data?.plans ?? [];
  useEffect(() => {
    for (const p of query.data?.plans ?? []) {
      if (lastAnalysis.current[p.id] === 'PENDING' && p.analysis === 'DONE') setDoneId(p.id);
      lastAnalysis.current[p.id] = p.analysis;
    }
  }, [query.data]);
  // Plan affiché : celui de l'onglet, sinon le premier (premier affichage, plan supprimé).
  const plan = tab === 'new' ? null : plans.find((p) => p.id === tab) ?? plans[0] ?? null;
  const adding = query.isSuccess && !plan;
  const markers = (query.data?.markers ?? []).filter((m) => m.planId === plan?.id);
  const list = zones.data ?? [];
  const suggestions = plan?.suggestions ?? [];
  const proposal = suggestions.find((sg) => sg.id === proposalId);

  async function act(run: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    setDoneId(null);
    try {
      await run();
      setMode({ kind: 'idle' });
      if (done) setStatus(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible');
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ predicate: (q) => ['plans', 'zones'].includes(String(q.queryKey[0])) });
    }
  }

  function choose(id: string) {
    setTab(id);
    setDoneId(null);
    setMode({ kind: 'idle' });
    setRenaming(null);
    setError(null);
    setStatus(null);
  }

  /** Fichier choisi, réduit à 2400 px (ce que garde l'api, plus fin qu'une photo d'étiquette) ; l'original si la réduction échoue. */
  function picked(e: ChangeEvent<HTMLInputElement>, send: (file: File | Blob) => Promise<unknown>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void act(async () => send(await shrinkPhoto(file, PLAN_MAX_SIDE)));
  }

  function choosePlanFile(e: ChangeEvent<HTMLInputElement>) {
    setPlanFile(e.target.files?.[0] ?? null);
    e.target.value = '';
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const name = planName.trim();
    const file = planFile;
    if (!name || !file) return;
    void act(async () => {
      setTab((await createPlan(name, await shrinkPhoto(file, PLAN_MAX_SIDE))).id);
      setPlanName('');
      setPlanFile(null);
    });
  }

  function rename(e: FormEvent, id: string) {
    e.preventDefault();
    const name = renaming?.trim();
    if (name) void act(async () => { await renamePlan(id, name); setRenaming(null); });
  }

  function confirmDelete(id: string, name: string) {
    if (window.confirm(`Supprimer le plan « ${name} » ? Les zones et leurs bouteilles sont gardées.`)) void act(() => deletePlan(id), `Plan « ${name} » supprimé.`);
  }

  /** Relance, même après une analyse réussie : les propositions en attente sont remplacées (confirmation), les zones acceptées ne bougent pas. */
  function confirmRelaunch(p: CavePlan) {
    if (p.suggestions.length > 0 && !window.confirm('Relancer l’analyse ? Les propositions en attente seront remplacées.')) return;
    void act(async () => replacePlanInCache(qc, await relaunchAnalysis(p.id)));
  }

  function tap(planId: string, x: number, y: number) {
    if (busy) return;
    setDoneId(null);
    if (mode.kind === 'moving') void act(() => setZoneMarker(mode.zoneId, planId, x, y));
    else {
      if (mode.kind !== 'pending') setNewName('');
      setMode({ kind: 'pending', x, y });
    }
  }

  function createHere(e: FormEvent, planId: string, x: number, y: number) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    // ponytail: deux appels ; si le repère échoue, la zone reste sans repère et revient en raccourci au prochain toucher.
    void act(async () => setZoneMarker((await createZone({ name })).id, planId, x, y), `Zone « ${name} » ajoutée.`);
  }

  function startMoving(zone: Zone) {
    setMode({ kind: 'moving', zoneId: zone.id, x: zone.marker?.x ?? 0.5, y: zone.marker?.y ?? 0.5 });
    planRef.current?.focus();
  }

  function openProposal(id: string) {
    setError(null);
    setStatus(null);
    setDoneId(null);
    setProposalId(id);
  }

  const selected = mode.kind === 'selected' || mode.kind === 'moving' ? list.find((z) => z.id === mode.zoneId) : undefined;

  return (
    <section className="card" aria-labelledby={titleId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <h2 id={titleId} style={{ fontSize: 18, margin: 0 }}>Plans de la cave</h2>
      {query.isError && <p role="alert" className="text-error">{(query.error as Error).message}</p>}
      {query.isSuccess && plans.length === 0 && (
        <p className="list__meta" style={{ margin: 0 }}>Photographiez la pièce ou un schéma dessiné à la main, puis placez vos zones dessus.</p>
      )}
      {query.isSuccess && (
        <div className="plan-tabs-row">
          <div role="tablist" aria-label="Plans de la cave" className="plan-tabs">
            {plans.map((p) => (
              <button key={p.id} type="button" role="tab" className="plan-tabs__tab" aria-selected={p.id === plan?.id} onClick={() => choose(p.id)}
                aria-label={p.analysis === 'PENDING' ? `${p.name}, analyse en cours` : undefined}>
                {p.name}
                {p.analysis === 'PENDING' && <span className="plan-tabs__dot" aria-hidden="true" />}
              </button>
            ))}
            <button type="button" role="tab" className="plan-tabs__tab" aria-selected={adding} onClick={() => choose('new')}>+ Ajouter un plan</button>
          </div>
          {plan && (
            <ActionMenu label={`Actions du plan ${plan.name}`} items={[
              { label: 'Renommer', disabled: busy, onSelect: () => { setMode({ kind: 'idle' }); setError(null); setRenaming(plan.name); } },
              { label: 'Remplacer la photo', disabled: busy, onSelect: () => photoRef.current?.click() },
              { label: 'Relancer l’analyse', disabled: busy || plan.analysis === 'PENDING', onSelect: () => confirmRelaunch(plan) },
              { label: 'Supprimer le plan', disabled: busy, onSelect: () => confirmDelete(plan.id, plan.name) },
            ]} />
          )}
        </div>
      )}
      {adding && (
        <form className="zone-form" aria-label="Nouveau plan" onSubmit={add}>
          <label className="field__label" htmlFor={`${inputId}-new-name`}>Nom du plan</label>
          <input id={`${inputId}-new-name`} value={planName} maxLength={PLAN_NAME_MAX} autoComplete="off" placeholder="Plan principal, cellier, garage…"
            onChange={(e) => setPlanName(e.target.value)} />
          <span className="field__label">Photo du plan</span>
          <PhotoPicker id={`${inputId}-new-photo`} label={planFile ? 'Changer la photo' : 'Choisir une photo'} disabled={busy} fileName={planFile?.name} onChange={choosePlanFile} />
          <button type="submit" className="btn btn--primary" disabled={busy || !planName.trim() || !planFile}>Créer le plan</button>
        </form>
      )}
      {plan && (
        <>
          <AnalysisBanner key={plan.id} plan={plan} done={doneId === plan.id} />
          {mode.kind === 'idle' && <p className="list__meta" style={{ margin: 0 }}>Touchez le plan à l’endroit où vous rangez des bouteilles, puis nommez-le.</p>}
          {suggestions.length > 0 && doneId !== plan.id && (
            <p className="list__meta" style={{ margin: 0 }}>
              {suggestions.length === 1 ? '1 zone proposée : touchez-la pour l’accepter.' : `${suggestions.length} zones proposées : touchez-les pour les accepter.`}
            </p>
          )}
          <PlanView src={planImageUrl(plan.id, plan.updatedAt)} plan={plan} markers={markers}
            // Pendant « Déplacer », tout toucher pose le repère : pas de cadres.
            suggestions={mode.kind === 'moving' ? [] : suggestions} onSuggestionClick={openProposal}
            pending={mode.kind === 'pending' || mode.kind === 'moving' ? { x: mode.x, y: mode.y } : null} highlightZoneId={selected?.id}
            onPlanClick={(x, y) => tap(plan.id, x, y)} planRef={planRef}
            onMarkerClick={mode.kind === 'moving' ? undefined : (zoneId) => setMode({ kind: 'selected', zoneId })}
            onPendingMove={(x, y) => setMode((m) => (m.kind === 'pending' || m.kind === 'moving' ? { ...m, x, y } : m))} onCancel={() => setMode({ kind: 'idle' })} />
        </>
      )}
      {plan && mode.kind === 'pending' && (
        <div role="group" aria-label="Nommer cet endroit" className="plan-chooser">
          <form className="zone-form" aria-label="Nouvelle zone" onSubmit={(e) => createHere(e, plan.id, mode.x, mode.y)}>
            <label className="field__label" htmlFor={`${inputId}-zone`}>Nom de l’endroit</label>
            <input id={`${inputId}-zone`} value={newName} maxLength={ZONE_NAME_MAX} autoComplete="off" placeholder="Casier gauche, étagère du fond…"
              onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className="btn btn--primary" disabled={!newName.trim() || busy}>Enregistrer</button>
          </form>
          {list.some((z) => !z.marker) && <p className="list__meta" style={{ margin: 0 }}>ou choisir une zone existante :</p>}
          {list.filter((z) => !z.marker).map((z) => (
            <Button key={z.id} variant="outline" disabled={busy} onClick={() => void act(() => setZoneMarker(z.id, plan.id, mode.x, mode.y))}>{z.name}</Button>
          ))}
          <Button variant="link" onClick={() => setMode({ kind: 'idle' })}>Annuler</Button>
        </div>
      )}
      {mode.kind === 'selected' && selected && (
        <div className="plan-chooser">
          <p className="list__title" style={{ margin: 0 }}>{selected.name}</p>
          {selected.indication && <p className="zone-details__text">{selected.indication}</p>}
          <div className="zone-row__actions">
            <Button variant="outline" disabled={busy} onClick={() => startMoving(selected)}>Déplacer</Button>
            <Button variant="link" disabled={busy} onClick={() => void act(() => removeZoneMarker(selected.id))}>Retirer le repère</Button>
            <Button variant="link" onClick={() => setMode({ kind: 'idle' })}>Fermer</Button>
          </div>
        </div>
      )}
      {mode.kind === 'moving' && selected && (
        <div className="zone-row__actions">
          <p className="list__meta" style={{ margin: 0 }}>{`Touchez le nouvel endroit de ${selected.name} sur le plan, ou déplacez le « + » avec les flèches puis Entrée.`}</p>
          <Button variant="link" onClick={() => setMode({ kind: 'idle' })}>Annuler</Button>
        </div>
      )}
      {error && <p role="alert" className="text-error" style={{ margin: 0 }}>{error}</p>}
      {status && <p role="status" className="list__meta" style={{ margin: 0 }}>{status}</p>}
      {plan && (
        <>
          {/* Ouvert par « Remplacer la photo » du menu ⋯ ; hors de l'ordre du clavier. */}
          <input ref={photoRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-label={`Photo de remplacement du plan ${plan.name}`}
            disabled={busy} onChange={(e) => picked(e, (file) => replacePlanImage(plan.id, file))} />
          <BottomSheet open={renaming !== null} title="Renommer le plan" onClose={() => setRenaming(null)}>
            <form className="zone-form" aria-label="Renommer le plan" onSubmit={(e) => rename(e, plan.id)}>
              <label className="field__label" htmlFor={`${inputId}-name`}>Nom du plan</label>
              <input id={`${inputId}-name`} value={renaming ?? ''} maxLength={PLAN_NAME_MAX} autoComplete="off" onChange={(e) => setRenaming(e.target.value)} />
              <button type="submit" className="btn btn--dark" disabled={!renaming?.trim() || busy}>Enregistrer</button>
              <Button variant="link" onClick={() => setRenaming(null)}>Annuler</Button>
            </form>
            {error && <p role="alert" className="text-error" style={{ margin: 0 }}>{error}</p>}
          </BottomSheet>
          <BottomSheet open={!!proposal} title="Proposition" onClose={() => setProposalId(null)}>
            {proposal && (
              <ProposalForm key={proposal.id} suggestion={proposal} idPrefix={`${inputId}-proposal`} busy={busy}
                onAccept={(v) => void act(async () => { await acceptSuggestion(plan.id, proposal.id, v); setProposalId(null); }, `Zone « ${v.name} » ajoutée.`)}
                onReject={() => void act(async () => { await rejectSuggestion(plan.id, proposal.id); setProposalId(null); })} />
            )}
            {error && <p role="alert" className="text-error" style={{ margin: 0 }}>{error}</p>}
          </BottomSheet>
        </>
      )}
    </section>
  );
}

/** Propriétaire : nom de la cave, plans, zones, membres en lecture seule (inviter, retirer), puis sauvegarde Excel. */
export function MaCavePage() {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ['members'], queryFn: getMembers });
  const [email, setEmail] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['members'] });
  const invite = useMutation({
    mutationFn: (address: string) => inviteMember(address),
    onMutate: (): void => remove.reset(),
    onSuccess: () => {
      setEmail('');
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeMember(id),
    onMutate: (): void => invite.reset(),
    onSuccess: refresh,
  });

  function submitInvite(e: FormEvent) {
    e.preventDefault();
    if (email.trim()) invite.mutate(email.trim());
  }

  function confirmRemove(m: MemberView) {
    if (window.confirm(`Retirer ${m.email} de la cave ?`)) remove.mutate(m.id);
  }

  const error = (invite.error ?? remove.error) as Error | null;

  return (
    <>
      <TopBar title="Ma cave" back="/compte" />
      <main className="page">
        <RenameCard />

        <PlanCard />

        <ZonesCard />

        <section className="card" aria-labelledby="members-title">
          <h2 id="members-title" style={{ fontSize: 18 }}>Membres</h2>
          <p className="list__meta">Un membre invité voit la cave, les fiches et les statistiques, sans les prix ni le journal, et ne peut rien modifier.</p>
          <form onSubmit={submitInvite} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <label className="field__label" htmlFor="invite-email">Adresse e-mail</label>
            <input id="invite-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className="btn btn--primary" disabled={!email.trim() || invite.isPending}>Inviter</button>
          </form>
          {error && <p role="alert" className="text-error">{error.message}</p>}
          {members.isError && <p role="alert" className="text-error">{(members.error as Error).message}</p>}
          <div className="list">
            {members.data?.map((m) => <MemberRow key={m.id} member={m} busy={remove.isPending} onRemove={confirmRemove} />)}
          </div>
        </section>

        <section className="card" aria-labelledby="backup-title">
          <h2 id="backup-title" style={{ fontSize: 18 }}>Sauvegarde</h2>
          <p className="list__meta">Toute la cave dans un classeur Excel : stock, journal, cotes.</p>
          <a className="btn btn--primary" style={{ width: '100%' }} href={exportUrl()} download>
            <Icon name="download" />
            Télécharger la sauvegarde Excel
          </a>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
