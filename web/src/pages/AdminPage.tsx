import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ActionMenu } from '../components/ActionMenu';
import { BottomNav } from '../components/BottomNav';
import { PersonRow } from '../components/PersonRow';
import { TopBar } from '../components/TopBar';
import { BudgetSection } from '../components/admin/BudgetSection';
import { GeminiUsageSection } from '../components/admin/GeminiUsageSection';
import { GuardsSection } from '../components/admin/GuardsSection';
import { ReadingQualitySection } from '../components/admin/ReadingQualitySection';
import { RegistrationsSection } from '../components/admin/RegistrationsSection';
import { VintagesSection } from '../components/admin/VintagesSection';
import { AdminUser, createUserCave, getAdminUsers, getRegistrations, updateAdminUser } from '../lib/api-client';
import { useMe } from '../lib/use-current-cave';

const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const TABS = [
  { id: 'comptes', label: 'Comptes' },
  { id: 'couts', label: 'Coûts de l’IA' },
  { id: 'donnees', label: 'Données du vin' },
] as const;

type Patch = { status?: AdminUser['status']; isAdmin?: boolean };

function AdminUserRow({ user, isSelf, onUpdate, onCreateCave, pending }: {
  user: AdminUser;
  isSelf: boolean;
  onUpdate: (patch: Patch) => void;
  onCreateCave: () => void;
  pending: boolean;
}) {
  const blocked = user.status === 'BLOCKED';
  // Compte actif sans cave à lui (invité seulement, ou validé à la main) : l'administrateur peut la créer.
  const canCreateCave = user.status === 'ACTIVE' && !user.hasCave;
  const items = isSelf ? [] : [
    blocked
      ? { label: 'Réactiver', onSelect: () => onUpdate({ status: 'ACTIVE' }) }
      : { label: 'Bloquer', onSelect: () => window.confirm(`Bloquer ${user.email} ? Le compte ne pourra plus se connecter.`) && onUpdate({ status: 'BLOCKED' }) },
    user.isAdmin
      ? { label: 'Retirer les droits', onSelect: () => window.confirm(`Retirer les droits d’administrateur de ${user.email} ?`) && onUpdate({ isAdmin: false }) }
      : { label: 'Promouvoir administrateur', onSelect: () => onUpdate({ isAdmin: true }) },
  ];
  // Sa propre ligne n'a pas de menu, sauf pour créer sa cave s'il n'en a pas.
  if (canCreateCave) items.push({ label: 'Créer sa cave', onSelect: onCreateCave });
  return (
    <PersonRow
      title={user.displayName ?? user.email}
      subtitle={user.displayName ? user.email : null}
      badges={[
        ...(user.isAdmin ? [{ label: 'Administrateur', tone: 'ok' as const }] : []),
        ...(blocked ? [{ label: 'Bloqué', tone: 'warn' as const }] : []),
        ...(user.status === 'PENDING' ? [{ label: 'En attente', tone: 'warn' as const }] : []),
      ]}
      meta={
        <span className="list__meta">
          Créé le {fmt.format(new Date(user.createdAt))} · Dernière connexion{' '}
          {user.lastLoginAt ? fmt.format(new Date(user.lastLoginAt)) : 'jamais'}
        </span>
      }
      action={
        <>
          {isSelf && <span className="list__meta">votre compte</span>}
          {items.length > 0 && <ActionMenu label={`Actions pour ${user.email}`} items={items.map((it) => ({ ...it, disabled: pending }))} />}
        </>
      }
    />
  );
}

function AccountsCard({ meId }: { meId: string }) {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: getAdminUsers });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) => updateAdminUser(id, patch),
    onMutate: (): void => createCave.reset(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
  // La cave créée peut être celle de l'administrateur lui-même : on relit aussi la session.
  const createCave = useMutation({
    mutationFn: (id: string) => createUserCave(id),
    onMutate: (): void => update.reset(),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'users'] }), qc.invalidateQueries({ queryKey: ['me'] })]),
  });
  const rowError = (update.error ?? createCave.error) as Error | null;

  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Comptes</h2>
      {rowError && <p role="alert" className="text-error">{rowError.message}</p>}
      {users.isError && <p role="alert" className="text-error">{(users.error as Error).message}</p>}
      <div className="list">
        {users.data?.map((u) => (
          <AdminUserRow
            key={u.id}
            user={u}
            isSelf={u.id === meId}
            pending={update.isPending || createCave.isPending}
            onUpdate={(patch) => update.mutate({ id: u.id, patch })}
            onCreateCave={() => createCave.mutate(u.id)}
          />
        ))}
        {users.data?.length === 0 && <p className="centered">Aucun compte.</p>}
      </div>
    </section>
  );
}

/** Administration (« Application » du hub) : un onglet par adresse, /admin/comptes, /admin/couts, /admin/donnees. */
export function AdminPage() {
  const { tab } = useParams();
  const me = useMe();
  const isAdmin = me.data?.isAdmin === true;
  // Même clé que la carte Inscriptions : le badge de l'onglet Comptes ne coûte pas de requête de plus.
  const regs = useQuery({ queryKey: ['admin', 'registrations'], queryFn: getRegistrations, enabled: isAdmin });

  if (!TABS.some((t) => t.id === tab)) return <Navigate to="/admin/comptes" replace />;

  return (
    <>
      <TopBar title="Administration" back="/compte" />
      <main className="page">
        {me.data && !isAdmin && <p className="centered">Réservé à l’administrateur.</p>}
        {me.data?.isAdmin && (
          <>
            <nav aria-label="Administration" className="plan-tabs">
              {TABS.map((t) => (
                <Link key={t.id} to={`/admin/${t.id}`} className="plan-tabs__tab" aria-current={t.id === tab ? 'page' : undefined}>
                  {t.label}
                  {t.id === 'comptes' && !!regs.data?.length && <span className="badge badge--warn">{regs.data.length}</span>}
                </Link>
              ))}
            </nav>
            {tab === 'comptes' && (
              <>
                <RegistrationsSection />
                <AccountsCard meId={me.data.id} />
              </>
            )}
            {tab === 'couts' && (
              <>
                <BudgetSection />
                <GeminiUsageSection />
              </>
            )}
            {tab === 'donnees' && (
              <>
                <ReadingQualitySection />
                <VintagesSection />
                <GuardsSection />
              </>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
