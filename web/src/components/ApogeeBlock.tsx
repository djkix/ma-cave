import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Apogee, CaveRow, clearApogee, setApogee } from '../lib/api-client';
import { apogeeRange, apogeeReasonMessage, apogeeStatusLabel, CONFIDENCE_LABEL } from '../lib/apogee';
import { at } from '../lib/accord-view';
import { Button } from './Button';
import { Icon } from './Icon';

const YEAR = /^\d{4}$/;

const STATUS_CHIP: Record<NonNullable<Apogee['status']>, { label: string; tone: string }> = {
  TROP_JEUNE: { label: 'Trop jeune', tone: 'neutral' },
  A_BOIRE: { label: 'À son apogée', tone: 'ok' },
  A_BOIRE_VITE: { label: 'À boire vite', tone: 'warn' },
  PASSEE: { label: 'Apogée passée', tone: 'past' },
};

/**
 * Frise de l'apogée : du millésime (sinon du début de la fenêtre) à deux ans après
 * la fin ; positions en % (fenêtre d'apogée et année courante). Pure, pour les tests.
 */
export function apogeeTimeline(vintage: number | null, min: number, max: number, year: number) {
  const scale = { from: Math.min(vintage ?? min, min, year), to: Math.max(max, year) + 2 };
  const start = at(min, scale);
  return { scale, start, width: Math.round((at(max, scale) - start) * 10) / 10, now: at(year, scale) };
}

function check(minText: string, maxText: string): { min: number; max: number } | string {
  if (!YEAR.test(minText) || !YEAR.test(maxText)) return 'Saisis deux années sur quatre chiffres';
  const min = Number(minText);
  const max = Number(maxText);
  if (min < 1900 || max > 2200) return 'Années entre 1900 et 2200';
  if (min > max) return 'L’année de début doit précéder ou égaler l’année de fin';
  return { min, max };
}

function Timeline({ vintage, min, max }: { vintage: number | null; min: number; max: number }) {
  const year = new Date().getFullYear();
  const t = apogeeTimeline(vintage, min, max, year);
  return (
    <div className="apogee-line" role="img" aria-label={`Frise : apogée de ${min} à ${max}, année en cours ${year}`}>
      <div className="apogee-line__track" aria-hidden="true">
        <span className="apogee-line__window" style={{ left: `${t.start}%`, width: `${t.width}%` }} />
        <span className="apogee-line__now" style={{ left: `${t.now}%` }}><b>{year}</b></span>
      </div>
      <div className="apogee-line__ends" aria-hidden="true">
        <span>{vintage ? `${vintage} (Récolte)` : t.scale.from}</span>
        <span className="apogee-line__mid">{min === max ? min : `${min} – ${max}`}</span>
        <span>{t.scale.to}+</span>
      </div>
    </div>
  );
}

/** `readOnly` : membre en lecture seule, sans correction manuelle. */
export function ApogeeBlock({ wine, readOnly = false }: { wine: CaveRow; readOnly?: boolean }) {
  const qc = useQueryClient();
  const apogee = wine.apogee;
  const [editing, setEditing] = useState(false);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!apogee) return null;

  const refresh = () => qc.invalidateQueries({ predicate: (q) => ['cave', 'wine'].includes(String(q.queryKey[0])) });
  const verdict = check(minText, maxText);

  function open() {
    const year = new Date().getFullYear();
    setMinText(String(apogee!.min ?? year));
    setMaxText(String(apogee!.max ?? year));
    setError(null);
    setEditing(true);
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(false);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  const range = apogeeRange(apogee);
  const status = apogeeStatusLabel(apogee);
  return (
    <section className="card">
      <h3 className="wine-card__title">
        <Icon name="hourglass_empty" />Période d’apogée
        {apogee.status && <span className={`wine-chip wine-chip--${STATUS_CHIP[apogee.status].tone}`}>{STATUS_CHIP[apogee.status].label}</span>}
      </h3>
      {range ? (
        <>
          <p className="wine-apogee__range">{range}{apogee.source === 'IA' ? ' (estimée par l’IA)' : ''}</p>
          {apogee.confidence && (
            <span className={`badge ${apogee.confidence === 'FAIBLE' ? 'badge--warn' : 'badge--ok'}`}>{CONFIDENCE_LABEL[apogee.confidence]}</span>
          )}
          {status && <p className="list__meta" style={{ margin: 'var(--space-xs) 0 0' }}>{status}</p>}
          {apogee.min != null && apogee.max != null && <Timeline vintage={wine.vintage} min={apogee.min} max={apogee.max} />}
        </>
      ) : (
        apogee.reason && <p className="list__meta">{apogeeReasonMessage(apogee.reason)}</p>
      )}
      {error && <p role="alert" className="text-error">{error}</p>}
      {readOnly ? null : editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
          <label className="field__label" htmlFor="apogee-min">Année de début</label>
          <input id="apogee-min" inputMode="numeric" value={minText} onChange={(e) => setMinText(e.target.value.trim())} />
          <label className="field__label" htmlFor="apogee-max">Année de fin</label>
          <input id="apogee-max" inputMode="numeric" value={maxText} onChange={(e) => setMaxText(e.target.value.trim())} />
          {typeof verdict === 'string' && <p className="text-error" style={{ margin: 0 }}>{verdict}</p>}
          <Button variant="dark" disabled={busy || typeof verdict === 'string'} onClick={() => typeof verdict !== 'string' && run(() => setApogee(wine.id, verdict))}>
            Enregistrer l’apogée
          </Button>
          <Button variant="link" onClick={() => { setEditing(false); setError(null); }}>Abandonner</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={open}>Corriger</Button>
          {apogee.confidence === 'SAISIE' && (
            <Button variant="link" disabled={busy} onClick={() => run(() => clearApogee(wine.id))}>Revenir à l’estimation</Button>
          )}
        </div>
      )}
    </section>
  );
}
