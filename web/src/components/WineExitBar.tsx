import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError, cancelMovement, createOut, MovementResult, Place } from '../lib/api-client';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon } from './Icon';

/** Lectures rafraîchies après une sortie ou son annulation : fiche, cave, accueil (mouvements), stats, emplacements. */
const REFRESHED = ['cave', 'wine', 'movements', 'stats', 'locations', 'zone-cells'];

/**
 * « Sortir une bouteille » collé au-dessus de la barre d'onglets de la fiche
 * (propriétaire) : une bouteille de ce vin, d'un toucher. Plusieurs endroits :
 * une feuille demande d'où ; un seul ou aucun : sortie directe (sans endroit,
 * l'api applique sa règle). Confirmation avec « Annuler » (annulation du
 * mouvement, comme dans le journal). Hors ligne : désactivé — la file hors
 * ligne ne porte que des photos d'entrée.
 */
export function WineExitBar({ wineId, quantity, places }: { wineId: string; quantity: number; places: Place[] | undefined }) {
  const qc = useQueryClient();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [choosing, setChoosing] = useState(false);
  const [result, setResult] = useState<MovementResult | null>(null);
  const [cancelled, setCancelled] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // Une clé par sortie voulue : gardée après un échec (le nouvel essai ne débite qu'une fois), neuve après un succès.
  const key = useRef<string | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const refresh = () => qc.invalidateQueries({ predicate: (q) => REFRESHED.includes(String(q.queryKey[0])) });

  async function sortir(locationId?: string | null) {
    if (sending.current) return;
    sending.current = true;
    setChoosing(false);
    setBusy(true);
    setError(null);
    try {
      key.current ??= crypto.randomUUID();
      const r = await createOut({ idempotencyKey: key.current, wineId, quantity: 1, ...(locationId !== undefined ? { locationId } : {}) });
      key.current = null;
      setResult(r);
      setCancelled(null);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sortie impossible');
      // 409 (endroit vidé entre-temps) : la fiche est relue, la feuille montre les quantités à jour.
      if (e instanceof ApiError && e.status === 409) void qc.invalidateQueries({ queryKey: ['wine', wineId] });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function annuler() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const r = await cancelMovement(result.movement.id, crypto.randomUUID());
      setResult(null);
      setCancelled(r.stock);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Annulation impossible');
    } finally {
      setBusy(false);
    }
  }

  function onTap() {
    if (places && places.length > 1) setChoosing(true);
    else void sortir(places?.[0]?.id);
  }

  // Stock à 0 : plus de bouton, mais la confirmation de la dernière sortie (et son « Annuler ») reste.
  if (quantity < 1 && !result && cancelled === null && !error) return null;
  return (
    <div className="dock wine-exit">
      {result && (
        <p role="status" className="wine-exit__status">
          {/* created: false — sortie déjà écrite (double envoi) : rien n'a bougé à l'instant. */}
          <span>{result.created ? 'Bouteille sortie' : 'Déjà sortie'} — il en reste {result.stock}</span>
          <Button variant="link" onClick={annuler} disabled={busy} aria-label="Annuler la sortie">Annuler</Button>
        </p>
      )}
      {cancelled !== null && <p role="status" className="wine-exit__status">Sortie annulée — {cancelled} en stock</p>}
      {error && <p role="alert" className="text-error wine-exit__status">{error}</p>}
      {quantity > 0 && (
        <>
          <Button variant="dark" className="wine-exit__button" onClick={onTap} disabled={busy || !online}>
            <Icon name="remove_circle_outline" />
            {busy ? 'Sortie…' : 'Sortir une bouteille'}
          </Button>
          {!online && <span className="dock__hint">Hors ligne : la sortie sera possible au retour du réseau.</span>}
        </>
      )}
      {/* Montée seulement ouverte : un <dialog> fermé resterait dans l'arbre d'accessibilité des tests. */}
      {choosing && <BottomSheet open title="Sortir depuis quel endroit ?" onClose={() => setChoosing(false)}>
        <div className="wine-exit__places">
          {places?.map((p) => (
            <Button key={p.id ?? ''} variant="outline" onClick={() => void sortir(p.id)}>
              <span>{p.label}</span><span className="num">{`× ${p.quantity}`}</span>
            </Button>
          ))}
        </div>
      </BottomSheet>}
    </div>
  );
}
