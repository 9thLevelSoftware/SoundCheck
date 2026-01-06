/**
 * WebSocket server for real-time features
 *
 * FEATURES:
 * - Real-time event notifications
 * - Live check-in updates
 * - Typing indicators for comments
 * - Online/offline status
 * - Room-based messaging
 *
 * SETUP INSTRUCTIONS:
 * 1. Install: npm install ws @types/ws
 * 2. Uncomment implementation code
 * 3. Call initWebSocket(server) in index.ts
 *
 * USAGE:
 * import { broadcast, sendToUser, joinRoom, leaveRoom } from './utils/websocket';
 *
 * // Broadcast to all clients
 * broadcast('new_checkin', { venueId: '123', userId: '456' });
 *
 * // Send to specific user
 * sendToUser(userId, 'notification', { message: 'New follower!' });
 *
 * // Room-based messaging
 * joinRoom(userId, 'venue:123');
 * broadcastToRoom('venue:123', 'new_review', reviewData);
 */

import { Server } from 'http';
import { AuthUtils } from './auth';
import WebSocket from 'ws';

interface Client {
  ws: WebSocket;
  userId?: string;
  rooms: Set<string>;
  isAlive: boolean;
  messageCount: number;
  lastMessageReset: number;
}

class WebSocketServer {
  private wss?: WebSocket.Server;
  private clients: Map<string, Client> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;

  init(server: Server): void {
    if (!process.env.ENABLE_WEBSOCKET || process.env.ENABLE_WEBSOCKET !== 'true') {
      console.log('🔌 WebSocket disabled (set ENABLE_WEBSOCKET=true to enable)');
      return;
    }

    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const client: Client = {
        ws,
        userId: undefined,
        rooms: new Set(),
        isAlive: true,
        messageCount: 0,
        lastMessageReset: Date.now(),
      };

      this.clients.set(clientId, client);
      console.log(`WebSocket client connected: ${clientId}`);

      // Handle messages
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(clientId, data);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });

      // Handle ping/pong for heartbeat
      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.isAlive = true;
        }
      });

      // Handle disconnect
      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      // Send welcome message
      this.send(clientId, 'connected', { clientId });
    });

    // Start heartbeat
    this.startHeartbeat();

    console.log('WebSocket server initialized');
  }

  private handleMessage(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Rate limiting: max 100 messages per 10 seconds
    const now = Date.now();
    if (now - client.lastMessageReset > 10000) {
      client.messageCount = 0;
      client.lastMessageReset = now;
    }
    client.messageCount++;
    if (client.messageCount > 100) {
      this.send(clientId, 'error', { message: 'Rate limit exceeded' });
      return;
    }

    const { type, payload } = data;

    switch (type) {
      case 'auth':
        this.authenticateClient(clientId, payload.userId, payload.token);
        break;

      case 'join_room':
        this.joinRoom(clientId, payload.room);
        break;

      case 'leave_room':
        this.leaveRoom(clientId, payload.room);
        break;

      case 'ping':
        this.send(clientId, 'pong', {});
        break;

      default:
        console.warn(`Unknown WebSocket message type: ${type}`);
    }
  }

  private authenticateClient(clientId: string, userId: string, token: string): void {
    const decoded = AuthUtils.verifyToken(token);

    if (!decoded || decoded.userId !== userId) {
      console.warn(`❌ Client ${clientId} failed authentication: Invalid token or user mismatch`);
      this.send(clientId, 'error', { message: 'Authentication failed' });
      // Close connection on auth failure
      const client = this.clients.get(clientId);
      if (client) {
        client.ws.close(4001, 'Authentication failed');
        this.handleDisconnect(clientId);
      }
      return;
    }

    const client = this.clients.get(clientId);
    if (client) {
      client.userId = userId;
      this.send(clientId, 'authenticated', { userId });
      console.log(`✅ Client ${clientId} authenticated as user ${userId}`);
    }
  }

  private joinRoom(clientId: string, room: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.rooms.add(room);

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);

    this.send(clientId, 'joined_room', { room });
    console.log(`✅ Client ${clientId} joined room: ${room}`);
  }

  private leaveRoom(clientId: string, room: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.rooms.delete(room);

    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(clientId);
      if (roomClients.size === 0) {
        this.rooms.delete(room);
      }
    }

    this.send(clientId, 'left_room', { room });
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Leave all rooms
    client.rooms.forEach(room => {
      const roomClients = this.rooms.get(room);
      if (roomClients) {
        roomClients.delete(clientId);
        if (roomClients.size === 0) {
          this.rooms.delete(room);
        }
      }
    });

    this.clients.delete(clientId);
    console.log(`❌ WebSocket client disconnected: ${clientId}`);
  }

  /**
   * Send message to specific client
   */
  send(clientId: string, type: string, payload: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type, payload }));
    }
  }

  /**
   * Send message to specific user (all their connections)
   */
  sendToUser(userId: string, type: string, payload: any): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.userId === userId) {
        this.send(clientId, type, payload);
      }
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(type: string, payload: any): void {
    for (const clientId of this.clients.keys()) {
      this.send(clientId, type, payload);
    }
  }

  /**
   * Broadcast message to all clients in a room
   */
  broadcastToRoom(room: string, type: string, payload: any): void {
    const roomClients = this.rooms.get(room);
    if (!roomClients) return;

    for (const clientId of roomClients) {
      this.send(clientId, type, payload);
    }
  }

  /**
   * Get all users in a room
   */
  getRoomUsers(room: string): string[] {
    const roomClients = this.rooms.get(room);
    if (!roomClients) return [];

    const userIds: string[] = [];
    for (const clientId of roomClients) {
      const client = this.clients.get(clientId);
      if (client?.userId) {
        userIds.push(client.userId);
      }
    }

    return [...new Set(userIds)]; // Remove duplicates
  }

  /**
   * Heartbeat to detect disconnected clients
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of this.clients.entries()) {
        if (!client.isAlive) {
          // Client didn't respond to last ping, terminate
          client.ws.terminate();
          this.handleDisconnect(clientId);
          continue;
        }

        client.isAlive = false;
        client.ws.ping();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get connection stats
   */
  getStats(): {
    totalClients: number;
    authenticatedClients: number;
    totalRooms: number;
  } {
    let authenticatedClients = 0;
    for (const client of this.clients.values()) {
      if (client.userId) {
        authenticatedClients++;
      }
    }

    return {
      totalClients: this.clients.size,
      authenticatedClients,
      totalRooms: this.rooms.size,
    };
  }

  /**
   * Close WebSocket server
   */
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss?.close();

    console.log('WebSocket server closed');
  }
}

// Export singleton instance
export const websocket = new WebSocketServer();

// Export convenience methods
export const initWebSocket = (server: Server) => websocket.init(server);
export const broadcast = (type: string, payload: any) => websocket.broadcast(type, payload);
export const sendToUser = (userId: string, type: string, payload: any) =>
  websocket.sendToUser(userId, type, payload);
export const broadcastToRoom = (room: string, type: string, payload: any) =>
  websocket.broadcastToRoom(room, type, payload);
export const getRoomUsers = (room: string) => websocket.getRoomUsers(room);
export const getWebSocketStats = () => websocket.getStats();

// Event types for type safety
export const WebSocketEvents = {
  // Connection
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  DISCONNECTED: 'disconnected',

  // Rooms
  JOINED_ROOM: 'joined_room',
  LEFT_ROOM: 'left_room',

  // Real-time updates
  NEW_CHECKIN: 'new_checkin',
  NEW_REVIEW: 'new_review',
  NEW_FOLLOWER: 'new_follower',
  NEW_COMMENT: 'new_comment',
  NEW_TOAST: 'new_toast',
  TOAST_REMOVED: 'toast_removed',
  COMMENT_DELETED: 'comment_deleted',

  // Typing indicators
  USER_TYPING: 'user_typing',
  USER_STOPPED_TYPING: 'user_stopped_typing',

  // Status
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
};
