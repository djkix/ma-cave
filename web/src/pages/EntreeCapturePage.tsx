import { ChangeEvent, useCallback, useRef, useState } from 'react';
import { useCurrentCave } from '../lib/use-current-cave';
import { Link } from 'react-router-dom';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { QuantityPicker } from '../components/QuantityPicker';
import { Icon } from '../components/Icon';
import { OfflineQueueBanner } from '../components/OfflineQueueBanner';
import { BottomNav } from '../components/BottomNav';
import { TopBar } from '../components/TopBar';
import { CaveRow, createMovement, getWinesByEan } from '../lib/api-client';
import { enqueuePhoto, notifyQueueChanged, QueueFullError } from '../lib/offline-queue';
import { kickSender } from '../lib/photo-sender';
import { shrinkPhoto } from '../lib/shrink-photo';

/**
 * Entrée en rafale : chaque photo est réduite, rangée dans la file locale, puis
 * l'envoyeur est relancé sans être attendu. L'écran est aussitôt prêt pour la
 * suivante — l'envoi et l'analyse se font en arrière-plan, la confirmation dans
 * « À confirmer ».
 *
 * Code-barres : un code déjà retenu ajoute les bouteilles au vin choisi, sans
 * photo ni analyse ; un code inconnu part avec la photo suivante et sera retenu
 * sur le vin à sa validation.
 */
export function EntreeCapturePage() {
  const input = useRef<HTMLInputElement>(null);
  const [taken, setTaken] = useState(0);
  // Nombre de bouteilles de la prochaine photo ; revient à 1 après chaque prise.
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // Une rafale = un lot : chaque photo prise sur cet écran en porte l'identifiant (avancement « 6/8 »).
  const [batchId] = useState(() => crypto.randomUUID());
  // Lu au moment de ranger la photo (après la réduction), pas à celui du rendu.
  const userId = useRef<string | undefined>(undefined);
  userId.current = useCurrentCave().me?.id;
  // Feuille du scan : caméra, puis vins trouvés (vide = code inconnu, null = recherche impossible).
  const [scan, setScan] = useState<{ ean: string | null; wines?: CaveRow[] | null } | null>(null);
  // Code inconnu joint à la prochaine photo.
  const [pendingEan, setPendingEan] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onCode = useCallback((ean: string) => {
    setScan({ ean });
    getWinesByEan(ean).then((wines) => setScan({ ean, wines }), () => setScan({ ean, wines: null }));
  }, []);

  /** Photo du vin scanné : le code part avec elle. Appelé dans le clic, pour que le sélecteur s'ouvre. */
  function photoFor(ean: string) {
    setPendingEan(ean);
    setScan(null);
    input.current?.click();
  }

  async function addTo(w: CaveRow) {
    setBusy(true);
    setError(null);
    try {
      await createMovement({
        idempotencyKey: crypto.randomUUID(), quantity,
        wine: { producer: w.producer, cuvee: w.cuvee, appellationRaw: w.appellationRaw, vintage: w.vintage, color: w.color, formatCl: w.formatCl },
      });
      setAdded(`+${quantity} · ${[w.producer, w.cuvee, w.vintage ?? 'non millésimé'].filter(Boolean).join(' ')}`);
      setQuantity(1);
      setScan(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Entrée impossible');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Réinitialisé tout de suite : la même photo peut être reprise, et le champ
    // est prêt pour la suivante pendant la réduction.
    e.target.value = '';
    if (!file) return;
    const chosen = quantity;
    const ean = pendingEan ?? undefined;
    setQuantity(1);
    setPendingEan(null);
    setError(null);
    try {
      const blob = await shrinkPhoto(file);
      await enqueuePhoto(blob, 'entry', userId.current, chosen, batchId, ean);
    } catch (err) {
      setError(err instanceof QueueFullError ? err.message : 'Photo non enregistrée sur le téléphone — reprenez-la');
      return;
    }
    notifyQueueChanged();
    kickSender();
    setTaken((n) => n + 1);
  }

  return (
    <>
      <TopBar title="Rentrer du vin" back="/" />
      <main className="page capture">
        <OfflineQueueBanner />
        <p style={{ textAlign: 'center', color: 'var(--color-secondary)' }}>
          Photographiez chaque carton (mentions imprimées) ou étiquette à la suite. L’envoi et l’analyse se font en arrière-plan ; vous confirmerez les vins ensuite.
        </p>
        <p className="num" style={{ fontSize: 40, margin: 0 }} aria-hidden="true">{taken}</p>
        <small>{taken} photo{taken > 1 ? 's' : ''} prise{taken > 1 ? 's' : ''}</small>
        <div role="group" aria-label="Bouteilles" style={{ width: '100%' }}>
          <QuantityPicker key={taken} value={quantity} onChange={setQuantity} />
        </div>
        <input ref={input} className="capture__input" type="file" accept="image/*" capture="environment" onChange={onFile} aria-label="Prendre une photo" />
        <Button variant="primary" onClick={() => input.current?.click()} style={{ width: '100%', minHeight: 'var(--size-action-height)' }}>
          <Icon name="photo_camera" />
          {taken === 0 ? 'Prendre une photo' : 'Photo suivante'}
        </Button>
        <Button variant="outline" onClick={() => { setAdded(null); setScan({ ean: null }); }} style={{ width: '100%' }}>
          <Icon name="barcode_scanner" />
          Scanner le code-barres
        </Button>
        {pendingEan && <small>Code <span className="num">{pendingEan}</span> joint à la prochaine photo</small>}
        {added && <p role="status" style={{ margin: 0 }}>{added}</p>}
        {error && <p role="alert" className="text-error">{error}</p>}
        <Link to="/a-confirmer" className="btn btn--outline">Voir les vins à confirmer</Link>
      </main>
      <BottomSheet open={scan !== null} title="Code-barres" onClose={() => setScan(null)}>
        {scan?.ean === null && (
          <>
            <BarcodeScanner onCode={onCode} />
            <p className="list__meta">Visez le code-barres de la contre-étiquette.</p>
          </>
        )}
        {scan?.ean && scan.wines === undefined && <p className="centered">Recherche…</p>}
        {scan?.ean && scan.wines && scan.wines.length > 0 && (
          <>
            <ul className="scan-wines">
              {scan.wines.map((w) => (
                <li key={w.id}>
                  <span>
                    <strong>{w.producer}{w.cuvee ? ` ${w.cuvee}` : ''}</strong>
                    <small className="list__meta"> {w.vintage ?? 'Non millésimé'} · {w.quantity} en stock</small>
                  </span>
                  <Button variant="primary" disabled={busy} onClick={() => void addTo(w)}>Ajouter {quantity}</Button>
                </li>
              ))}
            </ul>
            <Button variant="link" onClick={() => photoFor(scan.ean!)}>Autre millésime : prendre une photo</Button>
          </>
        )}
        {scan?.ean && scan.wines !== undefined && !scan.wines?.length && (
          <>
            <p style={{ marginTop: 0 }}>
              {scan.wines === null ? 'Recherche impossible (réseau).' : 'Code inconnu dans votre cave.'} Prenez une photo de l’étiquette : le code sera retenu pour la prochaine fois.
            </p>
            <Button variant="primary" onClick={() => photoFor(scan.ean!)}><Icon name="photo_camera" />Prendre la photo</Button>
          </>
        )}
      </BottomSheet>
      <BottomNav />
    </>
  );
}
