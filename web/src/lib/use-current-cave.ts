import { useQuery } from '@tanstack/react-query';
import { CaveRole, CaveSummary, getMe, getRegistrations, Me } from './api-client';

/** Session courante (`/auth/me`), partagée par toute l'application sous la clé `['me']`. */
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: getMe, retry: false });
}

export interface CurrentCave {
  me: Me | undefined;
  caveId: string | null;
  cave: CaveSummary | null;
  role: CaveRole | null;
  caves: CaveSummary[];
  /** Propriétaire de la cave courante : seul rôle qui écrit, voit le journal, les photos et les prix. */
  isOwner: boolean;
  isAdmin: boolean;
}

/**
 * Seule source du rôle courant : chaque écran, onglet ou requête réservé au
 * propriétaire se règle là-dessus. Tant que la session n'est pas chargée, rien
 * n'est autorisé (`isOwner` faux) : aucune requête réservée ne part à l'aveugle.
 */
export function useCurrentCave(): CurrentCave {
  const me = useMe().data;
  const caves = me?.caves ?? [];
  const cave = caves.find((c) => c.id === me?.currentCaveId) ?? null;
  return {
    me,
    caveId: cave?.id ?? null,
    cave,
    role: cave?.role ?? null,
    caves,
    isOwner: cave?.role === 'OWNER',
    isAdmin: me?.isAdmin === true,
  };
}

/** Relecture des inscriptions en attente, application ouverte (et à chaque retour au premier plan). */
const REGISTRATIONS_POLL_MS = 5 * 60_000;

/**
 * Nombre d'inscriptions en attente, pour l'administrateur seulement (`undefined`
 * pendant le chargement, et toujours pour un autre compte : aucune requête ne part).
 * Même clé que l'écran Administration › Comptes : une validation y met tout à jour.
 */
export function usePendingRegistrations(): number | undefined {
  const { isAdmin } = useCurrentCave();
  const regs = useQuery({ queryKey: ['admin', 'registrations'], queryFn: getRegistrations, enabled: isAdmin, retry: false, refetchInterval: REGISTRATIONS_POLL_MS });
  return isAdmin ? regs.data?.length : undefined;
}
