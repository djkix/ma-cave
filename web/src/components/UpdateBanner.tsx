import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../lib/api-client';
import { useAppUpdate } from '../lib/pwa';
import { versionState } from '../lib/version';
import { Button } from './Button';
import { Icon } from './Icon';

/** Sans rafraîchissement, l'écart de version n'arrive jamais sur une application restée ouverte. */
const HEALTH_REFETCH_MS = 5 * 60_000;

interface UpdateBannerViewProps {
  visible: boolean;
  /** Version proposée, affichée quand le serveur l'a déjà annoncée. */
  version: string | null;
  onReload: () => void;
}

/**
 * Bandeau de mise à jour, au-dessus de la barre d'onglets (`dock`, comme les
 * autres barres flottantes). La vue est séparée du branchement sur les données :
 * elle se teste sans réseau ni service worker.
 */
export function UpdateBannerView({ visible, version, onReload }: UpdateBannerViewProps) {
  if (!visible) return null;
  return (
    <div className="dock">
      <aside className="banner" role="status">
        <Icon name="download" />
        <span>Nouvelle version disponible{version ? ` (${version})` : ''}.</span>
        <Button onClick={onReload}>Recharger</Button>
      </aside>
    </div>
  );
}

export function UpdateBanner() {
  const update = useAppUpdate();
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false, refetchInterval: HEALTH_REFETCH_MS });
  const { label, stale } = versionState(health.data?.version);

  // Deux signaux complémentaires : le service worker a téléchargé une nouvelle
  // coque, ou le serveur annonce une version plus récente que celle chargée,
  // cas d'un cache qui n'a pas encore été rafraîchi.
  const visible = update.needRefresh || stale;

  return <UpdateBannerView visible={visible} version={stale ? label : null} onReload={update.reload} />;
}
