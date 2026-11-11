/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { PushController } from './push.controller';

const user = { id: 'u1' } as any;
const valid = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPk', auth: 'xyz' } };

function setup() {
  const push = { vapid: jest.fn(async () => ({ publicKey: 'PUB', privateKey: 'PRIV', subject: 'mailto:a@example.com' })), subscribe: jest.fn(), unsubscribe: jest.fn() };
  return { push, controller: new PushController(push as any) };
}

describe('PushController', () => {
  it('GET key : la clé publique seulement', async () => {
    await expect(setup().controller.key()).resolves.toEqual({ publicKey: 'PUB' });
  });

  it('POST subscriptions : enregistre l’abonnement pour le compte connecté', async () => {
    const { push, controller } = setup();
    await controller.subscribe(valid, user);
    expect(push.subscribe).toHaveBeenCalledWith('u1', valid);
  });

  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('POST subscriptions accepte le service push %s', async (endpoint) => {
    const { push, controller } = setup();
    await controller.subscribe({ ...valid, endpoint }, user);
    expect(push.subscribe).toHaveBeenCalled();
  });

  it.each([
    ['sans clés', { endpoint: valid.endpoint }],
    ['adresse en http', { ...valid, endpoint: 'http://push.example/x' }],
    ['adresse invalide', { ...valid, endpoint: 'pas une adresse' }],
    ['hôte du réseau local', { ...valid, endpoint: 'https://192.168.1.1/x' }],
    ['hôte inconnu', { ...valid, endpoint: 'https://push.example/x' }],
    ['service push sur un autre port', { ...valid, endpoint: 'https://fcm.googleapis.com:8443/x' }],
    ['faux sous-domaine', { ...valid, endpoint: 'https://fcm.googleapis.com.evil.test/x' }],
    ['clé vide', { ...valid, keys: { p256dh: '', auth: 'x' } }],
  ])('POST subscriptions refuse un corps %s', async (_name, body) => {
    const { push, controller } = setup();
    await expect(controller.subscribe(body, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(push.subscribe).not.toHaveBeenCalled();
  });

  it('DELETE subscriptions : endpoint en corps, compte connecté seulement', async () => {
    const { push, controller } = setup();
    await controller.unsubscribe({ endpoint: valid.endpoint }, user);
    expect(push.unsubscribe).toHaveBeenCalledWith('u1', valid.endpoint);
    await expect(controller.unsubscribe({}, user)).rejects.toBeInstanceOf(BadRequestException);
  });
});
