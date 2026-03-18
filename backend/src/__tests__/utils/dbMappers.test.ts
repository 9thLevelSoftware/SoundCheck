import { sanitizeUserForClient, mapDbUserToUser } from '../../utils/dbMappers';

describe('sanitizeUserForClient', () => {
  const fullUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: false,
    isActive: true,
    isAdmin: true,
    isPremium: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  it('should strip isAdmin from user object', () => {
    const sanitized = sanitizeUserForClient(fullUser);
    expect(sanitized).not.toHaveProperty('isAdmin');
  });

  it('should strip isPremium from user object', () => {
    const sanitized = sanitizeUserForClient(fullUser);
    expect(sanitized).not.toHaveProperty('isPremium');
  });

  it('should preserve all other user fields', () => {
    const sanitized = sanitizeUserForClient(fullUser);
    expect(sanitized.id).toBe('user-123');
    expect(sanitized.email).toBe('test@example.com');
    expect(sanitized.username).toBe('testuser');
    expect(sanitized.firstName).toBe('Test');
    expect(sanitized.lastName).toBe('User');
    expect(sanitized.isVerified).toBe(false);
    expect(sanitized.isActive).toBe(true);
    expect(sanitized.createdAt).toBe('2024-01-01T00:00:00Z');
    expect(sanitized.updatedAt).toBe('2024-01-01T00:00:00Z');
  });

  it('should handle user objects where isAdmin/isPremium are false', () => {
    const regularUser = { ...fullUser, isAdmin: false, isPremium: false };
    const sanitized = sanitizeUserForClient(regularUser);
    expect(sanitized).not.toHaveProperty('isAdmin');
    expect(sanitized).not.toHaveProperty('isPremium');
  });

  it('should handle user objects where isAdmin/isPremium are undefined', () => {
    const { isAdmin, isPremium, ...userWithoutFlags } = fullUser;
    const sanitized = sanitizeUserForClient(userWithoutFlags as any);
    expect(sanitized).not.toHaveProperty('isAdmin');
    expect(sanitized).not.toHaveProperty('isPremium');
  });
});

describe('mapDbUserToUser', () => {
  it('should map database row to User object with isAdmin and isPremium (for server-side use)', () => {
    const row = {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      is_verified: false,
      is_active: true,
      is_admin: true,
      is_premium: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const user = mapDbUserToUser(row);

    // Server-side user MUST have isAdmin/isPremium for authorization checks
    expect(user.isAdmin).toBe(true);
    expect(user.isPremium).toBe(true);
  });
});
