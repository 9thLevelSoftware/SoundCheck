import express from 'express';
import request from 'supertest';

const findById = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ query: jest.fn() }),
  },
}));

jest.mock('../../services/UserService', () => ({
  UserService: jest.fn().mockImplementation(() => ({ findById })),
}));

jest.mock('../../utils/auth', () => ({
  AuthUtils: {
    extractTokenFromHeader: (header?: string) => (header ? 'token' : null),
    verifyToken: () => ({ userId: 'user-1', iat: 1_700_000_000 }),
  },
}));

import adminRoutes from '../../routes/adminRoutes';
import moderationRoutes from '../../routes/moderationRoutes';
import claimRoutes from '../../routes/claimRoutes';

describe('admin route gates', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/moderation', moderationRoutes);
  app.use('/api/admin/claims', claimRoutes.admin);
  app.use('/api/admin', adminRoutes);

  beforeEach(() => {
    findById.mockReset();
    findById.mockResolvedValue({
      id: 'user-1',
      username: 'fan',
      isActive: true,
      isAdmin: false,
      credentialsChangedAt: null,
    });
  });

  it('rejects anonymous moderate, moderation, and claim reads', async () => {
    expect((await request(app).post('/api/admin/moderate')).status).toBe(401);
    expect((await request(app).get('/api/admin/moderation')).status).toBe(401);
    expect((await request(app).get('/api/admin/claims')).status).toBe(401);
  });

  it('rejects an authenticated non-admin before the moderate handler', async () => {
    const response = await request(app)
      .post('/api/admin/moderate')
      .set('Authorization', 'Bearer token')
      .send({ action: 'ban' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Admin privileges required');
  });
});
