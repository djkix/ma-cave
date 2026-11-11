import { ChangeEvent, useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';
import { TopBar } from '../components/TopBar';
import { CaveRow, getWinesByEan, uploadPhoto } from '../lib/api-client';

/**
 * Sortie par photo (analyse, candidats) ou par code-barres : un code retenu à
 * l'entrée ouvre la fiche du vin en stock, dont la barre « Sortir une bouteille »
 * demande l'endroit et permet d'annuler.
 */

export function SortieCapturePage() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Feuille du scan : caméra (ean null), puis vins en stock (null = recherche impossible).
  const [scan, setScan] = useState<{ ean: string | null; wines?: CaveRow[] | null } | null>(null);

  const onCode = useCallback((ean: string) => {
    setScan({ ean });
    getWinesByEan(ean).then(
      (all) => {
        const wines = all.filter((w) => w.quantity > 0);
        if (wines.length === 1) navigate(`/cave/${wines[0].id}`);
        else setScan({ ean, wines });
      },
      () => setScan({ ean, wines: null }),
    );
  }, [navigate]);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { id } = await uploadPhoto(file, 'EXIT');
      navigate(`/sortie/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    lastFile.current = file;
    await send(file);
  }

  async function retry() {
    if (lastFile.current) await send(lastFile.current);
  }

  return (
    <>
      <TopBar title="Sortir une bouteille" back="/" />
      <main className="page capture">
        <p style={{ textAlign: 'center', color: 'var(--color-secondary)' }}>Photographiez l’étiquette de la bouteille.</p>
        <input ref={input} className="capture__input" type="file" accept="image/*" capture="environment" onChange={onFile} aria-label="Photographier l’étiquette" />
        <Button variant="dark" onClick={() => input.current?.click()} disabled={busy}>
          <Icon name="photo_camera" />
          {busy ? 'Envoi…' : 'Prendre la photo'}
        </Button>
        <Button variant="outline" onClick={() => setScan({ ean: null })} disabled={busy}>
          <Icon name="barcode_scanner" />
          Scanner le code-barres
        </Button>
        {error && (
          <>
            <p role="alert" className="text-error">{error}</p>
            <Button variant="dark" onClick={retry} disabled={busy}>Réessayer l’envoi</Button>
            <Link to="/cave" className="btn btn--outline">Chercher dans la cave</Link>
          </>
        )}
      </main>
      <BottomSheet open={scan !== null} title="Code-barres" onClose={() => setScan(null)}>
        {scan?.ean === null && (
          <>
            <BarcodeScanner onCode={onCode} />
            <p className="list__meta">Visez le code-barres de la contre-étiquette.</p>
          </>
        )}
        {scan?.ean && scan.wines === undefined && <p className="centered">Recherche…</p>}
        {scan?.ean && scan.wines && scan.wines.length > 1 && (
          <ul className="scan-wines">
            {scan.wines.map((w) => (
              <li key={w.id}>
                <span>
                  <strong>{w.producer}{w.cuvee ? ` ${w.cuvee}` : ''}</strong>
                  <small className="list__meta"> {w.vintage ?? 'Non millésimé'} · {w.quantity} en stock</small>
                </span>
                <Link to={`/cave/${w.id}`} className="btn btn--outline">Choisir</Link>
              </li>
            ))}
          </ul>
        )}
        {scan?.ean && scan.wines !== undefined && !scan.wines?.length && (
          <>
            <p style={{ marginTop: 0 }}>
              {scan.wines === null ? 'Recherche impossible (réseau).' : 'Aucun vin en stock avec ce code.'} Photographiez l’étiquette.
            </p>
            <Button variant="dark" onClick={() => { setScan(null); input.current?.click(); }}><Icon name="photo_camera" />Prendre la photo</Button>
          </>
        )}
      </BottomSheet>
      <BottomNav />
    </>
  );
}
