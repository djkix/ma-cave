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
import { RatingBlock } from '../components/RatingBlock';
import { SortieConfirmation } from '../components/SortieConfirmation';
import { TopBar } from '../components/TopBar';
import { WineThumb } from '../components/WineThumb';
import { ApiError, getWine, LocationInput, postInventory } from '../lib/api-client';
import { EMPTY_LOCATION, NO_LOCATION, toLocationInput, useLocations, useZones } from '../lib/locations';
import { useCurrentCave } from '../lib/use-current-cave';

/** Mouvements : jour et heure (« 23 oct. 2026, 14:05 »), heure de l'appareil. */
const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  const { isOwner, isAdmin } = useCurrentCave();
  const readOnly = !isOwner;
  const detail = useQuery({
    queryKey: ['wine', wineId],
    queryFn: () => getWine(wineId),
    refetchInterval: (q) => {
      const wine = q.state.data?.wine;
      const pairing = pairingPollInterval(wine?.pairing);
      const producer = producerPollInterval(wine?.producerKey ?? null, wine?.producerProfile);
      return pairing || producer;
    },
  });
  const [counting, setCounting] = useState(false);
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
          <Link to="/cave" className="btn btn--outline">Retour à la cave</Link>
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
    <div key={m.id} className="list__row">
      <span className={`list__delta ${m.delta > 0 ? 'list__delta--in' : 'list__delta--out'} num`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
      <span className="list__meta">
        {/* Type, puis date et heure, puis la description (emplacement, note). */}
        {TYPE_LABEL[m.type]}{' · '}{fmt.format(new Date(m.occurredAt))}
        {m.type === 'MOVE' ? ` · ${m.locationLabel ?? NO_LOCATION}` : m.locationLabel ? ` · ${m.locationLabel}` : ''}
        {m.note ? ` · ${m.note}` : ''}
      </span>
    </div>
  );

  return (
    <>
      <TopBar title="Fiche vin" back={back} />
      <main className="page">
        {/* En-tête (vignette + titre) sur une ligne ; la recherche d'image et sa
            fenêtre de choix dessous, sur toute la largeur de la carte : dans la
            colonne de la vignette, à 375 px, tout y serait écrasé. */}
        <section className="card wine-head">
          <div className="wine-head__row">
            <WineThumb photoId={wine.referencePhotoId} size={96} />
            <div>
              <h2 className="list__title" style={{ fontSize: 20, margin: 0 }}>
                {wine.producer}{wine.cuvee ? ` — ${wine.cuvee}` : ''}
              </h2>
              <p className="list__meta">{wine.appellationRaw} · {wine.vintage ?? 'NV'} · {wine.formatCl} cl</p>
              <p className="num" style={{ fontSize: 22, margin: 0 }}>{wine.quantity} en stock</p>
            </div>
            {places && places.length > 0 && <LocationButton places={places} />}
          </div>
          <ImageSearchBlock wine={wine} readOnly={readOnly} />
        </section>

        {/* Le domaine, puis les accords, juste sous la photo du vin. */}
        <DomaineBlock key={`domaine-${wine.id}`} wineId={wine.id} producerKey={wine.producerKey} producerProfile={wine.producerProfile} canEdit={isAdmin} />
        <PairingBlock key={`pairing-${wine.id}`} wineId={wine.id} pairing={wine.pairing} readOnly={readOnly} />

        {/* Clé distincte de celle de SortieConfirmation : deux enfants du même
            <main> partageant la même clé troublent la réconciliation de React
            (avertissement « two children with the same key », rendu dupliqué). */}
        <ApogeeBlock key={`apogee-${wine.id}`} wine={wine} readOnly={readOnly} />
        <RatingBlock key={`rating-${wine.id}`} wine={wine} readOnly={readOnly} />
        {/* Cote : un prix, propriétaire seulement ; un membre ne reçoit pas les clés et le bloc n'est pas monté. */}
        {isOwner && detail.data.searchLinks !== undefined && (
          <QuoteBlock key={`quote-${wine.id}`} wineId={wine.id} quote={detail.data.quote ?? null}
            searchLinks={detail.data.searchLinks} savedUrl={detail.data.savedUrl ?? null} />
        )}

        {places && places.length > 0 && <LocationsBlock key={`locations-${wine.id}`} wineId={wine.id} places={places} readOnly={readOnly} />}

        {/* Sortie et correction du stock dans un même bloc. Endroits toujours
            fournis (vide = inconnus) : la sortie ne relit pas la fiche que la page tient déjà. */}
        {!readOnly && (
          <SortieConfirmation key={wine.id} wine={wine} places={places ?? []} exitDefault={detail.data.exitDefault}>
            {inventoryMessage && <p role="status" style={{ margin: 0 }}>{inventoryMessage}</p>}
            {!counting ? (
              <Button variant="link" onClick={() => { setCounting(true); setCounted(String(wine.quantity)); setInventoryMessage(null); setInventoryPlace(null); setIncreaseTo(EMPTY_LOCATION); }}>
                Corriger le stock
              </Button>
            ) : (
              <>
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
              </>
            )}
          </SortieConfirmation>
        )}

        <h2 style={{ fontSize: 14, letterSpacing: '0.08em', color: 'var(--color-secondary)' }}>DERNIERS MOUVEMENTS</h2>
        {/* Les trois derniers mouvements ; les autres repliés sous « Plus d'historique ». */}
        <div className="list">{movements.slice(0, RECENT_MOVEMENTS).map(movementRow)}</div>
        {movements.length > RECENT_MOVEMENTS && (
          <details className="history-more">
            <summary>Plus d’historique ({movements.length - RECENT_MOVEMENTS})</summary>
            <div className="list">{movements.slice(RECENT_MOVEMENTS).map(movementRow)}</div>
          </details>
        )}
      </main>
      <BottomNav />
    </>
  );
}
