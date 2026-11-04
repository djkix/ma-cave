import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhotosController } from './photos.controller';

describe('PhotosController — GET :id/image', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  const user = { id: 'u1' } as any;

  function setup(status = 'DONE', access: { caveId: string; role: string } | null = { caveId: 'c1', role: 'VIEWER' }) {
    const photos = {
      findById: jest.fn(async () => ({ id, status, caveId: 'c1' })),
      readNormalized: jest.fn(async () => Buffer.from('origine')),
      readDisplay: jest.fn(async () => Buffer.from('affichage')),
    };
    const res = { setHeader: jest.fn(), send: jest.fn() };
    const caves = { findAccess: jest.fn(async () => access) };
    return { controller: new PhotosController(photos as any, caves as any, {} as any), photos, caves, res };
  }

  it('sans paramètre : l’image d’origine, comme avant', async () => {
    const { controller, photos, res } = setup();
    await controller.image(user, id, undefined, res as any);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('origine'));
    expect(photos.readDisplay).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=86400');
  });

  it('variant=display : la version d’affichage', async () => {
    const { controller, photos, res } = setup();
    await controller.image(user, id, 'display', res as any);
    expect(photos.readDisplay).toHaveBeenCalledWith(id);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('affichage'));
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=86400');
  });

  it('variant=display sur une photo en attente : pas de mise en cache par le navigateur', async () => {
    const { controller, res } = setup('PENDING');
    await controller.image(user, id, 'display', res as any);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
  });

  it('variante inconnue : 400 « Variante d’image inconnue »', async () => {
    const { controller, photos, res } = setup();
    const call = controller.image(user, id, 'geante', res as any);
    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.image(user, id, 'geante', res as any)).rejects.toThrow("Variante d'image inconnue");
    expect(res.send).not.toHaveBeenCalled();
    expect(photos.readNormalized).not.toHaveBeenCalled();
  });

  it('photo d’une cave où le compte est membre (même en lecture, même hors de la cave courante) : servie', async () => {
    const { controller, caves, res } = setup('DONE', { caveId: 'c1', role: 'VIEWER' });
    await controller.image(user, id, 'display', res as any);
    expect(caves.findAccess).toHaveBeenCalledWith('u1', 'c1');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('affichage'));
  });

  it('photo d’une cave sans accès : 404 « Photo introuvable », rien n’est lu', async () => {
    const { controller, photos, res } = setup('DONE', null);
    await expect(controller.image(user, id, undefined, res as any)).rejects.toThrow(new NotFoundException('Photo introuvable'));
    expect(photos.readNormalized).not.toHaveBeenCalled();
    expect(photos.readDisplay).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe('PhotosController — POST / quantité', () => {
  const cave = { caveId: 'c1' } as any;
  const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as any;
  function setup() {
    const photos = { ingest: jest.fn(async () => ({ photo: { id: 'p1', status: 'PENDING' }, duplicate: false })) };
    return { controller: new PhotosController(photos as any, {} as any, {} as any), photos };
  }

  it('quantity=6 : transmise à l’ingestion', async () => {
    const { controller, photos } = setup();
    await controller.upload(cave, file, undefined, '6');
    expect(photos.ingest).toHaveBeenCalledWith('c1', file.buffer, 'image/jpeg', 'ENTRY', 6, null);
  });

  it('sans champ : null', async () => {
    const { controller, photos } = setup();
    await controller.upload(cave, file);
    expect(photos.ingest).toHaveBeenCalledWith('c1', file.buffer, 'image/jpeg', 'ENTRY', null, null);
  });

  it('quantity=121 : acceptée, sans maximum (comme les mouvements)', async () => {
    const { controller, photos } = setup();
    await controller.upload(cave, file, undefined, '121');
    expect(photos.ingest).toHaveBeenCalledWith('c1', file.buffer, 'image/jpeg', 'ENTRY', 121, null);
  });

  it.each(['0', '2.5', 'abc'])('quantity=%s : 400 « Quantité invalide »', async (q) => {
    const { controller, photos } = setup();
    await expect(controller.upload(cave, file, undefined, q)).rejects.toThrow(new BadRequestException('Quantité invalide'));
    expect(photos.ingest).not.toHaveBeenCalled();
  });
});

describe('PhotosController — lot de rafale', () => {
  const cave = { caveId: 'c1' } as any;
  const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' } as any;
  const lot = '22222222-2222-4222-8222-222222222222';
  function setup() {
    const photos = {
      ingest: jest.fn(async () => ({ photo: { id: 'p1', status: 'PENDING' }, duplicate: false })),
      queueStatus: jest.fn(async () => ({ waiting: 2, oldestWaitingAt: null, lastReason: null })),
      batchProgress: jest.fn(async () => [{ batchId: lot, done: 6, total: 8 }]),
      entryInbox: jest.fn(async () => ({ toConfirm: [{ id: 'p1', extraction: null }, { id: 'p2', extraction: null }], inProgress: [], failed: [] })),
    };
    const entryApogee = { forExtractions: jest.fn(async () => [null, { min: 2026, max: 2034 }]) };
    return { controller: new PhotosController(photos as any, {} as any, entryApogee as any), photos };
  }

  it('batchId transmis à l’ingestion', async () => {
    const { controller, photos } = setup();
    await controller.upload(cave, file, undefined, undefined, lot);
    expect(photos.ingest).toHaveBeenCalledWith('c1', file.buffer, 'image/jpeg', 'ENTRY', null, lot);
  });

  it('batchId qui n’est pas un uuid : 400 « Lot invalide »', async () => {
    const { controller, photos } = setup();
    await expect(controller.upload(cave, file, undefined, undefined, 'lot-1')).rejects.toThrow(new BadRequestException('Lot invalide'));
    expect(photos.ingest).not.toHaveBeenCalled();
  });

  it('queue-status porte l’avancement des lots', async () => {
    const { controller } = setup();
    expect(await controller.queueStatus(cave)).toEqual({ waiting: 2, oldestWaitingAt: null, lastReason: null, batches: [{ batchId: lot, done: 6, total: 8 }] });
  });

  it('entry-inbox : apogée estimée sur chaque fiche à valider', async () => {
    const { controller } = setup();
    const inbox = await controller.entryInbox(cave);
    expect(inbox.toConfirm.map((p) => p.apogee)).toEqual([null, { min: 2026, max: 2034 }]);
  });
});
