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
import IORedis from 'ioredis';
import { createPubSubConnection } from '../config/redis';
import winstonLogger from './logger';

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
  private userClients: Map<string, Set<string>> = new Map(); // userId -> clientIds index for O(1) sendToUser
  private rooms: Map<string, Set<string>> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private subscriber: IORedis | null = null;

  init(server: Server): void {
    if (!process.env.ENABLE_WEBSOCKET || process.env.ENABLE_WEBSOCKET !== 'true') {
      winstonLogger.info('WebSocket disabled (set ENABLE_WEBSOCKET=true to enable)');
      return;
    }

    this.wss = new WebSocket.Server({
      server,
      verifyClient: (info, callback) => {
        try {
          // Extract token from query string or Authorization header
          const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
          const token = url.searchParams.get('token')
            || AuthUtils.extractTokenFromHeader(info.req.headers.authorization);

          if (!token) {
            callback(false, 401, 'Authentication required');
            return;
          }

          const payload = AuthUtils.verifyToken(token);
          if (!payload) {
            callback(false, 401, 'Invalid or expired token');
            return;
          }

          // Attach userId to the upgrade request for use in connection handler
          (info.req as any).userId = payload.userId;
          callback(true);
        } catch (error) {
          winstonLogger.error('WebSocket verifyClient error', { error: error instanceof Error ? error.message : String(error) });
          callback(false, 500, 'Authentication error');
        }
      },
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const userId = (req as any).userId; // Set from verifyClient
      const client: Client = {
        ws,
        userId,
        rooms: new Set(),
        isAlive: true,
        messageCount: 0,
        lastMessageReset: Date.now(),
      };

      this.clients.set(clientId, client);

      // Maintain userId -> clientId index for O(1) sendToUser
      if (userId) {
        if (!this.userClients.has(userId)) {
          this.userClients.set(userId, new Set());
        }
        this.userClients.get(userId)!.add(clientId);
      }

      winstonLogger.info(`WebSocket client connected: ${clientId} (user: ${userId || 'unknown'})`);

      // Handle messages
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(clientId, data);
        } catch (error) {
          winstonLogger.error('Invalid WebSocket message', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
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

    // Subscribe to Redis Pub/Sub for multi-instance fan-out
    try {
      this.subscriber = createPubSubConnection();
      this.subscriber.subscribe('checkin:new');
      this.subscriber.on('message', (channel: string, message: string) => {
        if (channel === 'checkin:new') {
          try {
            this.handleCheckinPubSub(JSON.parse(message));
          } catch (err) {
            winstonLogger.error('Error handling checkin Pub/Sub message', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
          }
        }
      });
      winstonLogger.info('Redis Pub/Sub subscriber connected for WebSocket fan-out');
    } catch (err) {
      winstonLogger.warn('Redis Pub/Sub not available, WebSocket fan-out disabled', { error: (err as Error).message });
      this.subscriber = null;
    }

    winstonLogger.info('WebSocket server initialized');
  }

  /**
   * Handle a check-in event received via Redis Pub/Sub.
   * Fans out 'new_checkin' events to follower WebSocket clients.
   * Detects same-event attendance and sends 'same_event_checkin' events.
   */
  private handleCheckinPubSub(data: {
    type: string;
    checkin: any;
    followerIds: string[];
    eventId: string;
  }): void {
    const { checkin, followerIds, eventId } = data;

    // Get users currently in the event room (for same-event detection)
    const eventRoomUsers = eventId ? this.getRoomUsers(`event:${eventId}`) : [];
    const eventRoomUserSet = new Set(eventRoomUsers);

    for (const followerId of followerIds) {
      // Same-event detection: if follower is in the event room, send special event
      if (eventRoomUserSet.has(followerId)) {
        this.sendToUser(followerId, 'same_event_checkin', {
          ...checkin,
          message: `${checkin.username} is here too!`,
        });
      } else {
        this.sendToUser(followerId, 'new_checkin', checkin);
      }
    }

    if (followerIds.length > 0) {
      winstonLogger.debug(`Fan-out new_checkin to ${followerIds.length} followers`);
    }
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

    // Authentication gate for room operations
    // Security: Prevent unauthenticated clients from joining/leaving rooms
    // This fixes CVSS 8.2 High vulnerability where rooms could be joined without auth
    if (['join_room', 'leave_room'].includes(type)) {
      if (!client.userId) {
        this.send(clientId, 'error', {
          message: 'You must authenticate before joining or leaving rooms',
        });
        return;
      }
    }

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
        winstonLogger.warn(`Unknown WebSocket message type: ${type}`);
    }
  }

  private authenticateClient(clientId: string, userId: string, token: string): void {
    const decoded = AuthUtils.verifyToken(token);

    if (!decoded || decoded.userId !== userId) {
      winstonLogger.warn(`Client ${clientId} failed authentication: Invalid token or user mismatch`);
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
      // Update userId -> clientId index if user was not already set by verifyClient
      if (!client.userId) {
        client.userId = userId;
        if (!this.userClients.has(userId)) {
          this.userClients.set(userId, new Set());
        }
        this.userClients.get(userId)!.add(clientId);
      }
      this.send(clientId, 'authenticated', { userId });
      winstonLogger.info(`Client ${clientId} authenticated as user ${userId}`);
    }
  }

  private joinRoom(clientId: string, room: string): void {
    const client = this.clients.get(clientId);
    if (!client || !client.userId) return;

    // Validate room name format and authorize access
    const validRoomPrefixes = ['event:', 'venue:', 'user:'];
    const isValidRoom = validRoomPrefixes.some(prefix => room.startsWith(prefix));
    if (!isValidRoom) {
      this.send(clientId, 'error', { message: 'Invalid room name' });
      return;
    }

    // User-specific rooms: only allow joining own room
    if (room.startsWith('user:') && room !== `user:${client.userId}`) {
      this.send(clientId, 'error', { message: 'Cannot join another user\'s room' });
      return;
    }

    client.rooms.add(room);

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);

    this.send(clientId, 'joined_room', { room });
    winstonLogger.info(`Client ${clientId} joined room: ${room}`);
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

    // Remove from userId -> clientId index
    if (client.userId) {
      const userSet = this.userClients.get(client.userId);
      if (userSet) {
        userSet.delete(clientId);
        if (userSet.size === 0) {
          this.userClients.delete(client.userId);
        }
      }
    }

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
    winstonLogger.info(`WebSocket client disconnected: ${clientId}`);
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
   * Send message to specific user (all their connections).
   * Uses O(1) userId index instead of O(N) client iteration.
   */
  sendToUser(userId: string, type: string, payload: any): void {
    const clientIds = this.userClients.get(userId);
    if (!clientIds) return;
    for (const clientId of clientIds) {
      this.send(clientId, type, payload);
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

    this.subscriber?.quit();
    this.subscriber = null;

    this.wss?.close();

    winstonLogger.info('WebSocket server closed');
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
  SAME_EVENT_CHECKIN: 'same_event_checkin',
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
