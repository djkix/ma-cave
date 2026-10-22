import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { CavePlan, PlanAnalysisInfo, relaunchAnalysis } from '../lib/api-client';
import { replacePlanInCache } from '../lib/locations';
import { Button } from './Button';
import { Icon } from './Icon';

type Pending = Extract<PlanAnalysisInfo, { waiting: unknown }>;
type Failed = Extract<PlanAnalysisInfo, { failedReason: unknown }>;

const REASONS: Record<Failed['failedReason'], string> = {
  GEMINI: 'L’IA n’a pas répondu après plusieurs essais.',
  REFUS: 'L’IA a refusé la demande. Réessayez plus tard.',
  BUDGET: 'Le budget de l’IA est épuisé.',
  IMAGE: 'La photo du plan est introuvable : remplacez-la.',
  ILLISIBLE: 'L’IA n’a pas su lire cette photo : essayez une photo plus nette, prise de face.',
  ERREUR: 'Une erreur est survenue.',
};

/** Heure locale « 15:40 ». */
const hour = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
/** Jour local « 1 nov. ». */
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/** « il y a 20 s », « il y a 4 min », « il y a 2 h ». */
function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `il y a ${s} s`;
  const min = Math.floor(s / 60);
  return min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`;
}

/** Avancement d'une analyse en attente, en une phrase. */
export function pendingText(info: Pending, now: number): string {
  switch (info.waiting) {
    case 'GEMINI_PAUSE':
      return [
        info.pauseUntil ? `En attente : Gemini est en pause jusqu’à ${hour(info.pauseUntil)}.` : 'En attente : Gemini est en pause.',
        info.nextAttemptAt && `Nouvel essai à ${hour(info.nextAttemptAt)}.`,
      ].filter(Boolean).join(' ');
    case 'QUOTA':
      return info.message ?? 'En attente : limite de l’IA atteinte.';
    case 'BUDGET':
      return `En attente : budget de l’IA atteint ce mois-ci. ${info.nextAttemptAt ? `Nouvel essai le ${day(info.nextAttemptAt)} à ${hour(info.nextAttemptAt)}.` : 'Nouvel essai plus tard.'}`;
    case 'RETRY':
      return `Nouvel essai ${info.nextAttemptAt ? `à ${hour(info.nextAttemptAt)}` : 'bientôt'} (tentative ${info.attempt} sur ${info.maxAttempts}).`;
    default: {
      const elapsed = now - Date.parse(info.since);
      return `Envoyée à l’IA ${ago(elapsed)} · ${elapsed >= 180_000 ? 'plus long que prévu, l’analyse continue' : 'résultat attendu d’ici une minute'}`;
    }
  }
}

/**
 * Heure courante, relue dès que `since` est donné (jamais figée d'un état précédent), puis
 * chaque seconde pendant la première minute et chaque minute ensuite, calée sur `since`.
 */
function useNow(since: string | undefined): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!since) return;
    const start = Date.parse(since);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const elapsed = t - start;
      timer = setTimeout(tick, elapsed < 60_000 ? 1000 - (elapsed % 1000) : 60_000 - (elapsed % 60_000));
    };
    tick();
    return () => clearTimeout(timer);
  }, [since]);
  return now;
}

/**
 * Bandeau d'analyse du plan affiché : en cours (avancement), en échec (raison,
 * « Relancer l’analyse »), juste terminée (`done`, jusqu'à la prochaine action),
 * ou, jamais analysé, le lien « Proposer des zones ». Le refus de la relance s'y affiche.
 */
export function AnalysisBanner({ plan, done }: { plan: CavePlan; done: boolean }) {
  const qc = useQueryClient();
  const info = plan.analysisInfo;
  const now = useNow(plan.analysis === 'PENDING' && info && 'waiting' in info && (info.waiting === 'QUEUED' || info.waiting === 'RUNNING') ? info.since : undefined);
  const relaunch = useMutation({
    mutationFn: () => relaunchAnalysis(plan.id),
    // Le plan rendu (en attente) remplace l'ancien : le bandeau repasse en cours et la relecture des 10 s reprend.
    // Refus (409 : déjà en cours) : l'état du serveur est relu, la relecture des 10 s reprend.
    onError: () => qc.invalidateQueries({ queryKey: ['plans'] }),
    onSuccess: (next) => replacePlanInCache(qc, next),
  });
  const error = relaunch.isError && <p role="alert" className="text-error" style={{ margin: 0 }}>{(relaunch.error as Error).message}</p>;

  if (plan.analysis === 'NONE') {
    return (
      <div className="zone-row__actions">
        <Button variant="link" disabled={relaunch.isPending} onClick={() => relaunch.mutate()}>Proposer des zones</Button>
        {error}
      </div>
    );
  }
  if (plan.analysis === 'PENDING') {
    return (
      <div role="status" aria-label="Analyse du plan" className="analysis-banner">
        <Icon name="progress_activity" className="spin" />
        <div>
          <p className="analysis-banner__title">Analyse du plan en cours</p>
          {/* La durée change chaque seconde : masquée aux lecteurs d'écran, qui reliraient sinon le bandeau sans cesse. */}
          {info && 'waiting' in info && (
            <p className="analysis-banner__text" aria-hidden={info.waiting === 'QUEUED' || info.waiting === 'RUNNING' || undefined}>{pendingText(info, now)}</p>
          )}
        </div>
      </div>
    );
  }
  if (plan.analysis === 'FAILED') {
    const reason = info && 'failedReason' in info ? info.failedReason : 'ERREUR';
    return (
      <div role="status" aria-label="Analyse du plan" className="analysis-banner analysis-banner--error">
        <Icon name="error" />
        <div className="analysis-banner__body">
          <p className="analysis-banner__title">Les zones n’ont pas pu être proposées</p>
          <p className="analysis-banner__text">{REASONS[reason]}</p>
          {reason !== 'IMAGE' && (
            <Button variant="outline" disabled={relaunch.isPending} onClick={() => relaunch.mutate()}>Relancer l’analyse</Button>
          )}
          {error}
          <p className="analysis-banner__text">Vous pouvez aussi placer les zones à la main.</p>
        </div>
      </div>
    );
  }
  if (!done) return null;
  const n = plan.suggestions.length;
  return (
    <div role="status" aria-label="Analyse du plan" className="analysis-banner">
      <Icon name="check_circle" />
      <p className="analysis-banner__title">
        {n === 0 ? 'Aucune zone détectée sur cette photo. Placez-les à la main.'
          : n === 1 ? '1 zone proposée : touchez-la sur le plan pour l’accepter.'
            : `${n} zones proposées : touchez-les sur le plan pour les accepter.`}
      </p>
    </div>
  );
}
