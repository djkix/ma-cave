import { ChangeEvent, useRef, useState } from 'react';
import { useCurrentCave } from '../lib/use-current-cave';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { QuantityPicker } from '../components/QuantityPicker';
import { Icon } from '../components/Icon';
import { OfflineQueueBanner } from '../components/OfflineQueueBanner';
import { BottomNav } from '../components/BottomNav';
import { TopBar } from '../components/TopBar';
import { enqueuePhoto, notifyQueueChanged, QueueFullError } from '../lib/offline-queue';
import { kickSender } from '../lib/photo-sender';
import { shrinkPhoto } from '../lib/shrink-photo';

/**
 * Entrée en rafale : chaque photo est réduite, rangée dans la file locale, puis
 * l'envoyeur est relancé sans être attendu. L'écran est aussitôt prêt pour la
 * suivante — l'envoi et l'analyse se font en arrière-plan, la confirmation dans
 * « À confirmer ».
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

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Réinitialisé tout de suite : la même photo peut être reprise, et le champ
    // est prêt pour la suivante pendant la réduction.
    e.target.value = '';
    if (!file) return;
    const chosen = quantity;
    setQuantity(1);
    setError(null);
    try {
      const blob = await shrinkPhoto(file);
      await enqueuePhoto(blob, 'entry', userId.current, chosen, batchId);
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
        {error && <p role="alert" className="text-error">{error}</p>}
        <Link to="/a-confirmer" className="btn btn--outline">Voir les vins à confirmer</Link>
      </main>
      <BottomNav />
    </>
  );
}
