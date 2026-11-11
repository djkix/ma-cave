import { useEffect, useRef, useState } from 'react';
import { createDetector, isEan } from '../lib/barcode';

/**
 * Caméra arrière en direct : un code lu toutes les 200 ms au plus, `onCode`
 * appelé une seule fois. La caméra est coupée dès que le composant disparaît.
 */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onCode);
  callback.current = onCode;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const release = () => stream?.getTracks().forEach((t) => t.stop());
    (async () => {
      try {
        const detector = await createDetector();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const v = video.current;
        // Fermé pendant l'ouverture de la caméra : la lâcher tout de suite.
        if (stopped || !v) return release();
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          const codes = v.readyState >= 2 ? await detector.detect(v).catch(() => []) : [];
          const found = codes.find((c) => isEan(c.rawValue));
          if (found) return callback.current(found.rawValue);
          timer = window.setTimeout(() => void tick(), 200);
        };
        void tick();
      } catch {
        if (!stopped) setError('Scan impossible : autorisez la caméra dans le navigateur, ou prenez une photo.');
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      release();
    };
  }, []);

  return error
    ? <p role="alert" className="text-error">{error}</p>
    : <video ref={video} className="scanner__video" playsInline muted aria-label="Caméra : visez le code-barres" />;
}
