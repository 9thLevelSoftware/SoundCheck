import { WebSocketServer } from 'ws';

/**
 * WebSocket Authentication Tests
 *
 * These tests verify that WebSocket room operations (join_room, leave_room)
 * require authentication before they can be executed.
 *
 * Security Finding: CVSS 8.2 High - WebSocket rooms can be joined before authentication
 */

// Mock the AuthUtils to control token verification
jest.mock('../../utils/auth', () => ({
  AuthUtils: {
    verifyToken: jest.fn((token: string) => {
      if (token === 'valid-token') {
        return { userId: 'user-123', email: 'test@example.com', username: 'testuser' };
      }
      return null;
    }),
  },
}));

// We need to import after mocking
import { websocket } from '../../utils/websocket';

describe('WebSocket Authentication', () => {
  // We'll test the WebSocketServer class directly by mocking its internals
  // since we can't easily spin up a real WebSocket server in unit tests

  describe('Room operations require authentication', () => {
    let mockWs: any;
    let mockClient: any;
    let sentMessages: any[];

    beforeEach(() => {
      jest.clearAllMocks();
      sentMessages = [];

      // Create a mock WebSocket
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

      // Access private members for testing
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
      // Simulate receiving a join_room message from an unauthenticated client
      // We need to test the handleMessage logic

      // Access the clients Map (private)
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-1';

      // Add mock client without userId (unauthenticated)
      clientsMap.set(clientId, mockClient);

      try {
        // Call handleMessage directly
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'venue_123' },
        });

        // Verify error was sent
        expect(sentMessages.length).toBeGreaterThan(0);
        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('authenticate');

        // Verify client did NOT join the room
        expect(mockClient.rooms.has('venue_123')).toBe(false);
      } finally {
        // Cleanup
        clientsMap.delete(clientId);
      }
    });

    test('should reject leave_room before authentication', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-2';

      // Add client to a room manually (simulating a bug scenario)
      mockClient.rooms.add('venue_123');
      clientsMap.set(clientId, mockClient);

      try {
        // Try to leave room without being authenticated
        (websocket as any).handleMessage(clientId, {
          type: 'leave_room',
          payload: { room: 'venue_123' },
        });

        // Verify error was sent
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

        // Verify authentication succeeded
        const authMsg = sentMessages.find((m) => m.type === 'authenticated');
        expect(authMsg).toBeDefined();
        expect(mockClient.userId).toBe('user-123');

        // Clear previous messages
        sentMessages.length = 0;

        // Now try to join room
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'venue_123' },
        });

        // Verify join succeeded (no error, got joined_room message)
        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeUndefined();

        const joinedMsg = sentMessages.find((m) => m.type === 'joined_room');
        expect(joinedMsg).toBeDefined();
        expect(joinedMsg.payload.room).toBe('venue_123');

        // Verify client is in room
        expect(mockClient.rooms.has('venue_123')).toBe(true);
      } finally {
        clientsMap.delete(clientId);
        // Clean up rooms
        const roomsMap = (websocket as any).rooms as Map<string, Set<string>>;
        roomsMap.delete('venue_123');
      }
    });

    test('should allow leave_room after successful authentication', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const roomsMap = (websocket as any).rooms as Map<string, Set<string>>;
      const clientId = 'test-client-4';

      // Set up authenticated client already in a room
      mockClient.userId = 'user-123';
      mockClient.rooms.add('venue_123');
      clientsMap.set(clientId, mockClient);

      // Add client to room tracking
      roomsMap.set('venue_123', new Set([clientId]));

      try {
        // Leave room as authenticated user
        (websocket as any).handleMessage(clientId, {
          type: 'leave_room',
          payload: { room: 'venue_123' },
        });

        // Verify no error
        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeUndefined();

        // Verify left_room message was sent
        const leftMsg = sentMessages.find((m) => m.type === 'left_room');
        expect(leftMsg).toBeDefined();
        expect(leftMsg.payload.room).toBe('venue_123');

        // Verify client left the room
        expect(mockClient.rooms.has('venue_123')).toBe(false);
      } finally {
        clientsMap.delete(clientId);
        roomsMap.delete('venue_123');
      }
    });

    test('should reject authentication with invalid token', () => {
      const clientsMap = (websocket as any).clients as Map<string, any>;
      const clientId = 'test-client-5';

      clientsMap.set(clientId, mockClient);

      try {
        // Try to authenticate with invalid token
        (websocket as any).handleMessage(clientId, {
          type: 'auth',
          payload: { userId: 'user-123', token: 'invalid-token' },
        });

        // Verify error was sent
        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('Authentication failed');

        // Verify client was NOT authenticated
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
        // Try to authenticate with mismatched userId
        (websocket as any).handleMessage(clientId, {
          type: 'auth',
          payload: { userId: 'different-user', token: 'valid-token' }, // Token is for user-123
        });

        // Verify error was sent
        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();

        // Verify client was NOT authenticated
        expect(mockClient.userId).toBeUndefined();
      } finally {
        clientsMap.delete(clientId);
      }
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

      // Set message count over limit
      mockClient.messageCount = 101;
      clientsMap.set(clientId, mockClient);

      try {
        (websocket as any).handleMessage(clientId, {
          type: 'join_room',
          payload: { room: 'venue_123' },
        });

        // Should get rate limit error, not auth error
        const errorMsg = sentMessages.find((m) => m.type === 'error');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.payload.message).toContain('Rate limit');
      } finally {
        clientsMap.delete(clientId);
      }
    });
  });
});
