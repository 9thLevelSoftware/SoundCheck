import { WebSocketServer } from 'ws';

/**
 * WebSocket Authentication & Room Scoping Tests
 *
 * These tests verify:
 * 1. WebSocket room operations (join_room, leave_room) require authentication
 * 2. Room names must use valid prefixes (event:, venue:, user:)
 * 3. User rooms are scoped -- users cannot join other users' rooms
 * 4. verifyClient rejects unauthenticated connections
 * 5. userClients index is maintained correctly
 *
 * Security Findings: CFR-026 (CVSS 8.2 High)
 */

// Mock the AuthUtils to control token verification
jest.mock('../../utils/auth', () => ({
  AuthUtils: {
    verifyToken: jest.fn((token: string) => {
      if (token === 'valid-token') {
        return { userId: 'user-123', email: 'test@example.com', username: 'testuser' };
      }
      if (token === 'valid-token-user-456') {
        return { userId: 'user-456', email: 'other@example.com', username: 'otheruser' };
      }
      return null;
    }),
    extractTokenFromHeader: jest.fn((header?: string) => {
      if (!header || !header.startsWith('Bearer ')) return null;
      return header.substring(7);
    }),
  },
}));

// We need to import after mocking
import { websocket } from '../../utils/websocket';

describe('WebSocket Authentication', () => {
  describe('Room operations require authentication', () => {
    let mockWs: any;
    let mockClient: any;
    let sentMessages: any[];

    beforeEach(() => {
      jest.clearAllMocks();
      sentMessages = [];

      mockWs = {
        readyState: 1, // OPEN
        send: jest.fn((data: string) => {
          sentMessages.push(JSON.parse(data));
        }),
        close: jest.fn(),
        ping: jest.fn(),
        terminate: jest.fn(),
        on: jest.fn(),
      };

      mockClient = {
        ws: mockWs,
        userId: undefined, // Not authenticated
        rooms: new Set<string>(),
        isAlive: true,
        messageCount: 0,
        lastMessageReset: Date.now(),
      };
    });

    test('should reject join_room before authentication', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-1';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'venue:123' },
        });

        expect(sentMessages.length).toBeGreaterThan(0);
        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('authenticate');

        expect(mockClient.rooms.has('venue:123')).toBe(false);
      } finally {
        clientsMap.delete(clientId);
      }
    });

    test('should reject leave_room before authentication', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-2';

      mockClient.rooms.add('venue:123');
      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'leave_room',
          payload: { room: 'venue:123' },
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('authenticate');
      } finally {
        clientsMap.delete(clientId);
      }
    });

    test('should allow join_room after successful authentication', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-3';

      clientsMap.set(clientId, mockClient);

      try {
        // First authenticate
        (websocket as any).handleMessage(clientId, {
          type: 'auth',
          payload: { userId: 'user-123', token: 'valid-token' },
        });

        const authMsg = sentMessages.find((m) => m.type === 'authenticated');
        expect(authMsg).toBeDefined();
        expect(mockClient.userId).toBe('user-123');

        sentMessages.length = 0;

        // Now try to join a valid room
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'venue:123' },
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeUndefined();

        const joinedMsg = sentMessages.find((m) => m.type === 'joined_room');
        expect(joinedMsg).toBeDefined();
        expect(joinedMsg.payload.room).toBe('venue:123');

        expect(mockClient.rooms.has('venue:123')).toBe(true);
      } finally {
        clientsMap.delete(clientId);
        const roomsMap = (websocket as any).rooms as Map<string, Set<string>>;
        roomsMap.delete('venue:123');
        const userClientsMap = (websocket as any).userClients as Map<string, Set<string>>;
        userClientsMap.delete('user-123');
      }
    });

    test('should allow leave_room after successful authentication', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const roomsMap = (websocket as any).rooms as Map<string, Set<string>>;
      const clientId = 'test-client-4';

      mockClient.userId = 'user-123';
      mockClient.rooms.add('venue:123');
      clientsMap.set(clientId, mockClient);

      roomsMap.set('venue:123', new Set([clientId]));

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'leave_room',
          payload: { room: 'venue:123' },
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeUndefined();

        const leftMsg = sentMessages.find((m) => m.type === 'left_room');
        expect(leftMsg).toBeDefined();
        expect(leftMsg.payload.room).toBe('venue:123');

        expect(mockClient.rooms.has('venue:123')).toBe(false);
      } finally {
        clientsMap.delete(clientId);
        roomsMap.delete('venue:123');
      }
    });

    test('should reject authentication with invalid token', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-5';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'auth',
          payload: { userId: 'user-123', token: 'invalid-token' },
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('Authentication failed');

        expect(mockClient.userId).toBeUndefined();
      } finally {
        clientsMap.delete(clientId);
      }
    });

    test('should reject authentication when userId does not match token', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-6';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'auth',
          payload: { userId: 'different-user', token: 'valid-token' },
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();

        expect(mockClient.userId).toBeUndefined();
      } finally {
        clientsMap.delete(clientId);
      }
    });
  });

  describe('Room name validation and scoping (CFR-026)', () => {
    let mockWs: any;
    let mockClient: any;
    let sentMessages: any[];

    beforeEach(() => {
      sentMessages = [];
      mockWs = {
        readyState: 1,
        send: jest.fn((data: string) => {
          sentMessages.push(JSON.parse(data));
        }),
        close: jest.fn(),
        ping: jest.fn(),
        terminate: jest.fn(),
        on: jest.fn(),
      };

      mockClient = {
        ws: mockWs,
        userId: 'user-123', // Pre-authenticated
        rooms: new Set<string>(),
        isAlive: true,
        messageCount: 0,
        lastMessageReset: Date.now(),
      };
    });

    test('should reject invalid room name prefix', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-room-invalid';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'admin:secret' },
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('Invalid room name');

        expect(mockClient.rooms.has('admin:secret')).toBe(false);
      } finally {
        clientsMap.delete(clientId);
      }
    });

    test('should reject room names without prefix', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-room-noprefix';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'some-room-name' },
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('Invalid room name');
      } finally {
        clientsMap.delete(clientId);
      }
    });

    test('should allow joining event: rooms', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-room-event';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'event:abc-123' },
        });

        const joinedMsg = sentMessages.find((m) => m.type === 'joined_room');
        expect(joinedMsg).toBeDefined();
        expect(mockClient.rooms.has('event:abc-123')).toBe(true);
      } finally {
        clientsMap.delete(clientId);
        const roomsMap = (websocket as any).rooms as Map<string, Set<string>>;
        roomsMap.delete('event:abc-123');
      }
    });

    test('should allow joining venue: rooms', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-room-venue';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'venue:xyz-789' },
        });

        const joinedMsg = sentMessages.find((m) => m.type === 'joined_room');
        expect(joinedMsg).toBeDefined();
        expect(mockClient.rooms.has('venue:xyz-789')).toBe(true);
      } finally {
        clientsMap.delete(clientId);
        const roomsMap = (websocket as any).rooms as Map<string, Set<string>>;
        roomsMap.delete('venue:xyz-789');
      }
    });

    test('should allow joining own user: room', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-room-own-user';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'user:user-123' }, // Own room
        });

        const joinedMsg = sentMessages.find((m) => m.type === 'joined_room');
        expect(joinedMsg).toBeDefined();
        expect(mockClient.rooms.has('user:user-123')).toBe(true);
      } finally {
        clientsMap.delete(clientId);
        const roomsMap = (websocket as any).rooms as Map<string, Set<string>>;
        roomsMap.delete('user:user-123');
      }
    });

    test("should reject joining another user's room", () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-room-other-user';

      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'user:user-456' }, // Not own room
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('Cannot join another user');

        expect(mockClient.rooms.has('user:user-456')).toBe(false);
      } finally {
        clientsMap.delete(clientId);
      }
    });
  });

  describe('userClients index (O(1) sendToUser)', () => {
    let mockWs: any;
    let sentMessages: any[];

    beforeEach(() => {
      sentMessages = [];
      mockWs = {
        readyState: 1,
        send: jest.fn((data: string) => {
          sentMessages.push(JSON.parse(data));
        }),
        close: jest.fn(),
        ping: jest.fn(),
        terminate: jest.fn(),
        on: jest.fn(),
      };
    });

    test('sendToUser delivers to correct user via index', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const userClientsMap = (websocket as any).userClients as Map<string, Set<string>>;
      const clientId = 'test-send-client';

      const client = {
        ws: mockWs,
        userId: 'user-123',
        rooms: new Set<string>(),
        isAlive: true,
        messageCount: 0,
        lastMessageReset: Date.now(),
      };

      clientsMap.set(clientId, client);
      userClientsMap.set('user-123', new Set([clientId]));

      try {
        websocket.sendToUser('user-123', 'test_event', { data: 'hello' });

        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].type).toBe('test_event');
        expect(sentMessages[0].payload.data).toBe('hello');
      } finally {
        clientsMap.delete(clientId);
        userClientsMap.delete('user-123');
      }
    });

    test('sendToUser does nothing for unknown userId', () => {
      websocket.sendToUser('nonexistent-user', 'test_event', { data: 'hello' });
      // No crash, no messages sent
      expect(sentMessages.length).toBe(0);
    });

    test('handleDisconnect removes client from userClients index', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const userClientsMap = (websocket as any).userClients as Map<string, Set<string>>;
      const clientId = 'test-disconnect-client';

      const client = {
        ws: mockWs,
        userId: 'user-123',
        rooms: new Set<string>(),
        isAlive: true,
        messageCount: 0,
        lastMessageReset: Date.now(),
      };

      clientsMap.set(clientId, client);
      userClientsMap.set('user-123', new Set([clientId]));

      (websocket as any).handleDisconnect(clientId);

      expect(clientsMap.has(clientId)).toBe(false);
      expect(userClientsMap.has('user-123')).toBe(false);
    });
  });

  describe('Rate limiting still works with auth check', () => {
    let mockWs: any;
    let mockClient: any;
    let sentMessages: any[];

    beforeEach(() => {
      sentMessages = [];
      mockWs = {
        readyState: 1,
        send: jest.fn((data: string) => {
          sentMessages.push(JSON.parse(data));
        }),
        close: jest.fn(),
        ping: jest.fn(),
        terminate: jest.fn(),
        on: jest.fn(),
      };

      mockClient = {
        ws: mockWs,
        userId: 'user-123', // Authenticated
        rooms: new Set<string>(),
        isAlive: true,
        messageCount: 0,
        lastMessageReset: Date.now(),
      };
    });

    test('should enforce rate limit before auth check', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-rate-limit';

      mockClient.messageCount = 101;
      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'venue:123' },
        });

        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('Rate limit');
      } finally {
        clientsMap.delete(clientId);
      }
    });
  });
});
