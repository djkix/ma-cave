import { versionState } from './version';

it('sans réponse du serveur, affiche la version de la coque sans rien signaler', () => {
  expect(versionState(undefined, '2.17.1')).toEqual({ label: '2.17.1', stale: false });
});

it('signale l’écart entre deux versions publiées', () => {
  expect(versionState('2.18.0', '2.17.1')).toEqual({ label: '2.18.0', stale: true });
});

it('ne signale rien quand les deux versions sont identiques', () => {
  expect(versionState('2.17.1', '2.17.1')).toEqual({ label: '2.17.1', stale: false });
});

it('ne signale rien en développement, où les valeurs ne sont pas des numéros publiés', () => {
  expect(versionState('dev', 'dev').stale).toBe(false);
  expect(versionState('2.17.1', 'dev').stale).toBe(false);
});

it('ne signale rien pour une image `latest`, dont le libellé porte l’empreinte du commit', () => {
  expect(versionState('2.17.1+ab12cd3', '2.17.1').stale).toBe(false);
});
