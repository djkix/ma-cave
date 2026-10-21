import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns status ok and the server version', async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    const controller = moduleRef.get(HealthController);
    // Les tests tournent sans APP_VERSION : même repli que la coque.
    expect(controller.check()).toEqual({ status: 'ok', version: 'dev' });
  });
});
