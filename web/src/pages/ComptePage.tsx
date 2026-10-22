import { useQuery } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { getMembers, getRegistrations } from '../lib/api-client';
import { usePlans, useZones } from '../lib/locations';
import { useCurrentCave } from '../lib/use-current-cave';
import { APP_VERSION } from '../lib/version';

// Zéro reste au singulier, comme d'usage en français (« 0 zone »).
const count = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Résumé de la carte « Ma cave » : « 3 plans · 12 zones · 2 membres », « Aucun plan » sans plan. */
export function caveSummary(plans: number, zones: number, members: number): string {
  return [plans === 0 ? 'Aucun plan' : count(plans, 'plan'), count(zones, 'zone'), count(members, 'membre')].join(' · ');
}

/** Initiales du nom affiché, sinon de l'adresse : « Franck Laval » → « FL », « camille@… » → « C ». */
function initials(name: string): string {
  return name.split('@')[0].split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function NavCard({ to, icon, title, summary }: { to: string; icon: string; title: string; summary?: ReactNode }) {
  return (
    <Link to={to} className="card nav-card">
      <Icon name={icon} className="nav-card__icon" />
      <span className="nav-card__text">
        <span className="nav-card__title">{title}</span>
        {/* Vide pendant le chargement, omis en erreur : la carte reste un lien. */}
        {summary && <span className="list__meta nav-card__summary">{summary}</span>}
      </span>
      <Icon name="chevron_right" />
    </Link>
  );
}

/** Résumé « Ma cave » (« Analyse du plan en cours » tant qu'un plan l'est) : seulement monté pour le propriétaire, ses requêtes ne partent jamais pour un invité. */
function useCaveSummary(enabled: boolean): string | undefined {
  const plans = usePlans(enabled);
  const zones = useZones(enabled);
  // Même clé que la carte Membres de « Ma cave » : le cache est partagé.
  const members = useQuery({ queryKey: ['members'], queryFn: getMembers, enabled, retry: false });
  if (plans.data?.plans.some((p) => p.analysis === 'PENDING')) return 'Analyse du plan en cours';
  if (!plans.data || !zones.data || !members.data) return undefined;
  return caveSummary(plans.data.plans.length, zones.data.length, members.data.length);
}

function useAdminSummary(enabled: boolean): ReactNode {
  // Même clé que la carte Inscriptions de l'administration.
  const regs = useQuery({ queryKey: ['admin', 'registrations'], queryFn: getRegistrations, enabled, retry: false });
  if (!regs.data) return undefined;
  if (regs.data.length === 0) return 'Comptes, coûts de l’IA, données du vin';
  return <span className="badge badge--warn">{count(regs.data.length, 'inscription')} en attente</span>;
}

/** Hub « Réglages » (onglet du bas) : profil, puis une carte par écran de réglage permis à ce compte. */
export function ComptePage() {
  const { me, caves, isOwner, isAdmin } = useCurrentCave();
  const caveText = useCaveSummary(isOwner);
  const adminText = useAdminSummary(isAdmin);
  return (
    <>
      <TopBar title="Réglages" />
      <main className="page">
        {me && (
          <section className="profile">
            <span className="profile__avatar" aria-hidden="true">{initials(me.displayName ?? me.email)}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {me.displayName && <strong style={{ display: 'block' }}>{me.displayName}</strong>}
              <span className="list__meta">{me.email}</span>
            </span>
          </section>
        )}
        <NavCard to="/compte/moi" icon="person" title="Moi" summary={me && count(caves.length, 'cave')} />
        {isOwner && <NavCard to="/ma-cave" icon="wine_bar" title="Ma cave" summary={caveText} />}
        {isAdmin && <NavCard to="/admin" icon="admin_panel_settings" title="Application" summary={adminText} />}
        <NavCard to="/compte/a-propos" icon="info" title="À propos" summary={`Version ${APP_VERSION}`} />
      </main>
      <BottomNav />
    </>
  );
}
