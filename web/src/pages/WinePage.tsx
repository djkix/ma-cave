import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApogeeBlock } from '../components/ApogeeBlock';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/Button';
import { DomaineBlock, producerPollInterval } from '../components/DomaineBlock';
import { Icon } from '../components/Icon';
import { ImageSearchBlock } from '../components/ImageSearchBlock';
import { PlacePicker } from '../components/LocationFields';
import { PlanCellPicker } from '../components/PlanCellPicker';
import { LocationButton, LocationsBlock } from '../components/LocationsBlock';
import { PairingBlock, pairingPollInterval } from '../components/PairingBlock';
import { QuoteBlock } from '../components/QuoteBlock';
import { TraitsBlock, traitsPollInterval } from '../components/TraitsBlock';
import { RatingBlock } from '../components/RatingBlock';
import { TastedPairingsBlock } from '../components/TastedPairings';
import { TopBar } from '../components/TopBar';
import { WineEditForm } from '../components/WineEditForm';
import { WineExitBar } from '../components/WineExitBar';
import { WineThumb } from '../components/WineThumb';
import { ApiError, getWine, LocationInput, postInventory, WineColor } from '../lib/api-client';
import { EMPTY_LOCATION, NO_LOCATION, toLocationInput, useLocations, useZones } from '../lib/locations';
import { movementNote } from '../lib/movement-note';
import { useCurrentCave } from '../lib/use-current-cave';

/** Mouvements : jour et heure (« 23 oct. 2026, 14:05 »), heure de l'appareil. */
const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const COLOR_LABEL: Record<WineColor, string> = { ROUGE: 'Rouge', BLANC: 'Blanc', ROSE: 'Rosé', PETILLANT: 'Pétillant' };
const TYPE_LABEL = { IN: 'Entrée', OUT: 'Sortie', ADJUST: 'Correction', MOVE: 'Déplacé' } as const;

function plural(n: number) {
  return `${n} bouteille${Math.abs(n) > 1 ? 's' : ''}`;
}

const MAX_COUNTED = 100_000;

/** Mouvements visibles d'emblée sur la fiche ; les autres sont repliés. */
const RECENT_MOVEMENTS = 3;

export function WinePage() {
  // Arrivé depuis « Accords » : la flèche y ramène, sur la même liste.
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  const back = from === '/accords' ? from : '/cave';
  const { wineId = '' } = useParams();
  const qc = useQueryClient();
  // Membre en lecture seule : tout le contenu, aucune action. Le descriptif du
  // domaine, commun à toutes les caves, ne s'écrit que par un administrateur.
  const { isOwner } = useCurrentCave();
  const readOnly = !isOwner;
  const detail = useQuery({
    queryKey: ['wine', wineId],
    queryFn: () => getWine(wineId),
    refetchInterval: (q) => {
      const wine = q.state.data?.wine;
      const pairing = pairingPollInterval(wine?.pairing);
      const producer = producerPollInterval(wine?.producerKey ?? null, wine?.producerProfile);
      return pairing || producer || traitsPollInterval(wine?.traits);
    },
  });
  const [counting, setCounting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [counted, setCounted] = useState('');
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Baisse : endroit choisi à l'écran, sinon la pré-sélection. Hausse : emplacement saisi, sinon « Sans emplacement ».
  const [inventoryPlace, setInventoryPlace] = useState<{ id: string | null } | null>(null);
  const [increaseTo, setIncreaseTo] = useState<LocationInput>(EMPTY_LOCATION);
  // Hausse : suggestions et zones de la cave, lues seulement quand le propriétaire compte.
  const cellar = useLocations(isOwner && counting);
  const zones = useZones(isOwner && counting);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inventoryKey = useMemo(() => crypto.randomUUID(), [wineId, counting]);

  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <>
        <TopBar title="Fiche vin" back={back} />
        <main className="page">
          <p className="centered">{notFound ? 'Vin introuvable' : 'Impossible de charger la fiche.'}</p>
          <Link to="/cave" className="btn btn--outline">{notFound ? 'Voir la cave' : 'Retour à la cave'}</Link>
        </main>
      </>
    );
  }
  if (!detail.data) return <TopBar title="Fiche vin" back={back} />;

  const { wine, movements } = detail.data;
  // Même borne que l'API : au-delà, la colonne INTEGER déborderait.
  const tooMany = /^\d+$/.test(counted) && Number(counted) > MAX_COUNTED;
  const parsed = /^\d+$/.test(counted) && !tooMany ? Number(counted) : null;
  const delta = parsed === null ? null : parsed - wine.quantity;
  const places = detail.data.locations;
  // Baisse : même choix d'endroit que la sortie ; un seul endroit, pas de question.
  const decreasePlaceIds = places?.map((p) => p.id) ?? [];
  const decreasePlace =
    inventoryPlace && decreasePlaceIds.includes(inventoryPlace.id) ? inventoryPlace.id
      : detail.data.exitDefault !== undefined && decreasePlaceIds.includes(detail.data.exitDefault) ? detail.data.exitDefault
        : places?.[0]?.id ?? null;
  const increaseInput = toLocationInput(increaseTo);
  // Fiche sans endroits (ancienne api) : pas de champ, l'api applique sa règle.
  const inventoryLocation = places === undefined || delta === null || delta === 0
    ? {}
    : delta < 0 ? { locationId: places.length > 0 ? decreasePlace : null }
      : increaseInput ? { location: increaseInput } : { locationId: null };

  async function saveInventory() {
    if (parsed === null || delta === 0) return;
    setSaving(true);
    setInventoryError(null);
    try {
      const r = await postInventory(wine.id, { idempotencyKey: inventoryKey, counted: parsed, ...inventoryLocation });
      setInventoryMessage(`Stock corrigé : ${r.stock} en stock`);
      setCounting(false);
      void qc.invalidateQueries({ predicate: (q) => ['cave', 'wine', 'movements', 'locations', 'zone-cells'].includes(String(q.queryKey[0])) });
    } catch (e) {
      setInventoryError(e instanceof Error ? e.message : 'Correction impossible');
    } finally {
      setSaving(false);
    }
  }

  const movementRow = (m: (typeof movements)[number]) => (
    <div key={m.id} className="wine-move">
      <span className={`wine-move__dot ${m.delta > 0 ? 'wine-move__dot--in' : 'wine-move__dot--out'}`}><Icon name={m.delta > 0 ? 'add' : 'remove'} /></span>
      <span className="wine-move__body">
        <span className="wine-move__title">{TYPE_LABEL[m.type]}</span>
        {/* Date et heure, puis la description (emplacement, note). */}
        <span className="list__meta wine-move__meta">
          {fmt.format(new Date(m.occurredAt))}
          {m.type === 'MOVE' ? ` · ${m.locationLabel ?? NO_LOCATION}` : m.locationLabel ? ` · ${m.locationLabel}` : ''}
          {movementNote(m, movements) ? ` · ${movementNote(m, movements)}` : ''}
        </span>
      </span>
      <span className={`list__delta ${m.delta > 0 ? 'list__delta--in' : 'list__delta--out'} num wine-move__delta`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
    </div>
  );

  return (
    <>
      <TopBar title="Fiche vin" back={back} />
      <main className={`page wine-page${isOwner ? ' wine-page--exit' : ''}`}>
        {/* En-tête (vignette + titre) sur une ligne ; la recherche d'image et sa
            fenêtre de choix dessous, sur toute la largeur de la carte : dans la
            colonne de la vignette, à 375 px, tout y serait écrasé. */}
        <section className="card wine-head">
          <div className="wine-head__row">
            <WineThumb photoId={wine.referencePhotoId} size={96} />
            <div className="wine-head__text">
              <h2 className="wine-head__title">{wine.producer}</h2>
              <p className="wine-head__sub">{[wine.cuvee, wine.appellationRaw].filter(Boolean).join(' · ')}</p>
              <p className="list__meta wine-head__facts">
                <span>{wine.vintage ?? 'NV'}</span>
                {wine.formatCl > 0 && <span>{wine.formatCl} cl</span>}
                <span className="wine-head__color"><i className={`wine-dot wine-dot--${wine.color.toLowerCase()}`} />{COLOR_LABEL[wine.color]}</span>
              </p>
              {places && places.length > 0 && <LocationButton places={places} label={places.map((p) => p.label).join(' · ')} />}
            </div>
            {!readOnly && !counting && !editing && (
              <button type="button" className="wine-head__edit" aria-label="Corriger le stock"
                onClick={() => { setCounting(true); setCounted(String(wine.quantity)); setInventoryMessage(null); setInventoryPlace(null); setIncreaseTo(EMPTY_LOCATION); }}>
                <Icon name="edit" />
              </button>
            )}
          </div>
          <div className="wine-stock">
            <p className="wine-stock__qty"><span className="num wine-stock__n">{wine.quantity}</span> en stock</p>
            {!readOnly && !counting && !editing && <Button variant="link" onClick={() => setEditing(true)}>Modifier</Button>}
          </div>
          {inventoryMessage && <p role="status" className="list__meta" style={{ margin: 0 }}>{inventoryMessage}</p>}
          {/* Correction du stock (inventaire, casse, oubli) : ouverte par le crayon à côté du stock. */}
          {!readOnly && counting && (
            <div className="stock-edit">
              <p className="field__label" style={{ margin: 0 }}>Corriger le stock : ajouter ou enlever des bouteilles</p>
              <div className="stock-stepper">
                <Button variant="outline" onClick={() => setCounted(String(Math.max(0, (parsed ?? wine.quantity) - 1)))} disabled={parsed === 0} aria-label="Enlever une bouteille">
                  <Icon name="remove" />
                </Button>
                <label className="visually-hidden" htmlFor={`counted-${wine.id}`}>Bouteilles comptées</label>
                <input id={`counted-${wine.id}`} className="num stock-stepper__value" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.trim())} />
                <Button variant="outline" onClick={() => setCounted(String(Math.min(MAX_COUNTED, (parsed ?? wine.quantity) + 1)))} aria-label="Ajouter une bouteille">
                  <Icon name="add" />
                </Button>
              </div>
              {places && delta !== null && delta < 0 && places.length > 1 && (
                <PlacePicker legend="D'où sortent-elles ?" places={places} value={decreasePlace} onChange={(id) => setInventoryPlace({ id })} />
              )}
              {places && delta !== null && delta > 0 && (
                <fieldset className="move-form__to">
                  <legend className="field__label">Emplacement</legend>
                  <PlanCellPicker value={increaseTo} onChange={setIncreaseTo} locations={cellar.data ?? []} zones={zones.data} />
                </fieldset>
              )}
              <p style={{ margin: 0, textAlign: 'center' }}>{tooMany ? 'Nombre de bouteilles trop élevé' : delta === null ? 'Saisis un nombre entier' : delta === 0 ? 'Stock déjà juste' : `${delta > 0 ? '+' : '−'}${plural(Math.abs(delta))}`}</p>
              {inventoryError && <p role="alert" className="text-error">{inventoryError}</p>}
              <Button variant="dark" onClick={saveInventory} disabled={saving || delta === null || delta === 0}>Enregistrer le stock</Button>
              <Button variant="link" onClick={() => setCounting(false)}>Abandonner</Button>
            </div>
          )}
          {/* Modifier l'identité du vin, ouvert comme la correction du stock ; la région se corrige dans les caractéristiques. */}
          {!readOnly && editing && <WineEditForm key={wine.id} wine={wine} onClose={() => setEditing(false)} />}
          <ImageSearchBlock wine={wine} readOnly={readOnly} />
        </section>

        {/* Le domaine, puis les accords, juste sous la photo du vin. */}
        <DomaineBlock key={`domaine-${wine.id}`} producerKey={wine.producerKey} producerProfile={wine.producerProfile} />
        <PairingBlock key={`pairing-${wine.id}`} wineId={wine.id} pairing={wine.pairing} readOnly={readOnly} />
        <TraitsBlock key={`traits-${wine.id}`} wineId={wine.id} traits={wine.traits} region={wine.region} regionSource={wine.regionSource} country={wine.country} readOnly={readOnly}
          domainGrapes={wine.producerProfile?.fields.cepages ?? null} />

        <ApogeeBlock key={`apogee-${wine.id}`} wine={wine} readOnly={readOnly} />
        <RatingBlock key={`rating-${wine.id}`} wine={wine} readOnly={readOnly} lastOpenedAt={detail.data.lastOpenedAt} />
        <TastedPairingsBlock key={`tasted-${wine.id}`} wineId={wine.id} items={detail.data.tastedPairings ?? []} readOnly={readOnly} />
        {/* Cote : un prix, propriétaire seulement ; un membre ne reçoit pas les clés et le bloc n'est pas monté. */}
        {isOwner && detail.data.searchLinks !== undefined && (
          <QuoteBlock key={`quote-${wine.id}`} wineId={wine.id} quote={detail.data.quote ?? null}
            searchLinks={detail.data.searchLinks} savedUrl={detail.data.savedUrl ?? null} />
        )}

        {places && places.length > 0 && <LocationsBlock key={`locations-${wine.id}`} wineId={wine.id} places={places} readOnly={readOnly} />}


        <section className="card" aria-labelledby="wine-moves-title">
          <h2 id="wine-moves-title" className="wine-card__title"><Icon name="history" />Derniers mouvements</h2>
          {/* Les trois derniers mouvements ; les autres repliés sous « Plus d'historique ». */}
          <div className="wine-moves">{movements.slice(0, RECENT_MOVEMENTS).map(movementRow)}</div>
          {movements.length > RECENT_MOVEMENTS && (
            <details className="history-more">
              <summary>Plus d’historique ({movements.length - RECENT_MOVEMENTS})</summary>
              <div className="wine-moves">{movements.slice(RECENT_MOVEMENTS).map(movementRow)}</div>
            </details>
          )}
        </section>
      </main>
      {/* Sortie d'une bouteille de ce vin, collée au-dessus des onglets : propriétaire seulement. */}
      {isOwner && <WineExitBar key={`exit-${wine.id}`} wineId={wine.id} quantity={wine.quantity} places={places} />}
      <BottomNav />
    </>
  );
}
