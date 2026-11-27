import { useQuery } from '@tanstack/react-query';
import { getEntryInbox } from './api-client';
import { useCurrentCave } from './use-current-cave';

/**
 * Vins qui attendent une décision (fiches à valider et photos illisibles), pour
 * la pastille de l'onglet Mouvements et le bandeau de l'accueil : une seule
 * lecture partagée (clé `entry-inbox`), relue toutes les 30 s. Réservé au
 * propriétaire (403 pour un membre) : 0 sans requête pour les autres. Une lecture
 * de moins de 10 s suffit : la barre du bas montée sur chaque page ne la refait pas.
 */
export function useToConfirmCount(): number {
  const { isOwner } = useCurrentCave();
  const inbox = useQuery({ queryKey: ['entry-inbox'], queryFn: getEntryInbox, refetchInterval: 30_000, staleTime: 10_000, enabled: isOwner });
  return isOwner ? (inbox.data?.toConfirm.length ?? 0) + (inbox.data?.failed.length ?? 0) : 0;
}
