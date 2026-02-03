import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;

import '../api/api_config.dart';
import 'log_service.dart';

/// WebSocket event types matching backend
class WebSocketEvents {
  static const String connected = 'connected';
  static const String authenticated = 'authenticated';
  static const String disconnected = 'disconnected';
  static const String joinedRoom = 'joined_room';
  static const String leftRoom = 'left_room';
  static const String newCheckin = 'new_checkin';
  static const String newReview = 'new_review';
  static const String newFollower = 'new_follower';
  static const String newComment = 'new_comment';
  static const String newToast = 'new_toast';
  static const String toastRemoved = 'toast_removed';
  static const String commentDeleted = 'comment_deleted';
  static const String userTyping = 'user_typing';
  static const String userStoppedTyping = 'user_stopped_typing';
  static const String userOnline = 'user_online';
  static const String userOffline = 'user_offline';
  static const String badgeEarned = 'badge_earned';
  static const String sameEventCheckin = 'same_event_checkin';
  static const String error = 'error';
  static const String pong = 'pong';
}

/// WebSocket message model
class WebSocketMessage {
  final String type;
  final Map<String, dynamic> payload;

  WebSocketMessage({
    required this.type,
    required this.payload,
  });

  factory WebSocketMessage.fromJson(Map<String, dynamic> json) {
    return WebSocketMessage(
      type: json['type'] as String? ?? '',
      payload: json['payload'] as Map<String, dynamic>? ?? {},
    );
  }

  Map<String, dynamic> toJson() => {
        'type': type,
        'payload': payload,
      };
}

/// WebSocket service for real-time communication
class WebSocketService {
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _pingTimer;
  Timer? _reconnectTimer;

  bool _isConnected = false;
  bool _isAuthenticated = false;
  String? _clientId;
  String? _authToken;
  String? _userId;

  final Set<String> _joinedRooms = {};

  // Event streams
  final _messageController = StreamController<WebSocketMessage>.broadcast();
  final _connectionController = StreamController<bool>.broadcast();
  final _toastController = StreamController<Map<String, dynamic>>.broadcast();
  final _commentController = StreamController<Map<String, dynamic>>.broadcast();
  final _newCheckinController = StreamController<Map<String, dynamic>>.broadcast();
  final _sameEventController = StreamController<Map<String, dynamic>>.broadcast();

  /// Stream of all WebSocket messages
  Stream<WebSocketMessage> get messageStream => _messageController.stream;

  /// Stream of connection status changes
  Stream<bool> get connectionStream => _connectionController.stream;

  /// Stream of new toast notifications
  Stream<Map<String, dynamic>> get toastStream => _toastController.stream;

  /// Stream of new comment notifications
  Stream<Map<String, dynamic>> get commentStream => _commentController.stream;

  /// Stream of new check-in events (friend checked in)
  Stream<Map<String, dynamic>> get newCheckinStream => _newCheckinController.stream;

  /// Stream of same-event check-in events ("Alex is here too!")
  Stream<Map<String, dynamic>> get sameEventCheckinStream => _sameEventController.stream;

  /// Whether the WebSocket is connected
  bool get isConnected => _isConnected;

  /// Whether the WebSocket is authenticated
  bool get isAuthenticated => _isAuthenticated;

  /// Get WebSocket URL based on environment
  String get _wsUrl {
    final baseUrl = ApiConfig.baseUrl;
    // Convert http(s) URL to ws(s) URL
    final wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
    final host = baseUrl
        .replaceFirst('https://', '')
        .replaceFirst('http://', '')
        .replaceFirst('/api', '');
    return '$wsProtocol://$host';
  }

  /// Connect to WebSocket server
  Future<void> connect({String? authToken, String? userId}) async {
    if (_isConnected) {
      LogService.w('WebSocket already connected');
      return;
    }

    _authToken = authToken;
    _userId = userId;

    try {
      LogService.i('Connecting to WebSocket: $_wsUrl');

      _channel = WebSocketChannel.connect(Uri.parse(_wsUrl));

      // Wait for connection to be ready
      await _channel!.ready;

      _isConnected = true;
      _connectionController.add(true);
      LogService.i('WebSocket connected');

      // Listen to messages
      _subscription = _channel!.stream.listen(
        _handleMessage,
        onError: _handleError,
        onDone: _handleDisconnect,
      );

      // Start ping timer to keep connection alive
      _startPingTimer();

      // Authenticate if we have credentials
      if (_authToken != null && _userId != null) {
        authenticate(_userId!, _authToken!);
      }
    } catch (e, stack) {
      LogService.e('WebSocket connection failed', e, stack);
      _isConnected = false;
      _connectionController.add(false);
      _scheduleReconnect();
    }
  }

  /// Disconnect from WebSocket server
  void disconnect() {
    LogService.i('Disconnecting WebSocket');

    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _subscription?.cancel();

    _channel?.sink.close(status.goingAway);

    _isConnected = false;
    _isAuthenticated = false;
    _clientId = null;
    _joinedRooms.clear();

    _connectionController.add(false);
  }

  /// Authenticate the WebSocket connection
  void authenticate(String userId, String token) {
    if (!_isConnected) {
      LogService.w('Cannot authenticate: not connected');
      return;
    }

    _userId = userId;
    _authToken = token;

    _send(WebSocketMessage(
      type: 'auth',
      payload: {
        'userId': userId,
        'token': token,
      },
    ),);
  }

  /// Join a room for targeted messages
  void joinRoom(String room) {
    if (!_isConnected) {
      LogService.w('Cannot join room: not connected');
      return;
    }

    _send(WebSocketMessage(
      type: 'join_room',
      payload: {'room': room},
    ),);

    _joinedRooms.add(room);
  }

  /// Leave a room
  void leaveRoom(String room) {
    if (!_isConnected) {
      LogService.w('Cannot leave room: not connected');
      return;
    }

    _send(WebSocketMessage(
      type: 'leave_room',
      payload: {'room': room},
    ),);

    _joinedRooms.remove(room);
  }

  /// Join a check-in room to receive toast/comment updates
  void joinCheckinRoom(String checkinId) {
    joinRoom('checkin:$checkinId');
  }

  /// Leave a check-in room
  void leaveCheckinRoom(String checkinId) {
    leaveRoom('checkin:$checkinId');
  }

  /// Send a raw message
  void _send(WebSocketMessage message) {
    if (!_isConnected || _channel == null) {
      LogService.w('Cannot send message: not connected');
      return;
    }

    try {
      final json = jsonEncode(message.toJson());
      _channel!.sink.add(json);
      LogService.d('WS sent: ${message.type}');
    } catch (e) {
      LogService.e('Failed to send WebSocket message', e);
    }
  }

  /// Handle incoming message
  void _handleMessage(dynamic data) {
    try {
      final json = jsonDecode(data as String) as Map<String, dynamic>;
      final message = WebSocketMessage.fromJson(json);

      LogService.d('WS received: ${message.type}');

      // Handle specific message types
      switch (message.type) {
        case WebSocketEvents.connected:
          _clientId = message.payload['clientId'] as String?;
          LogService.i('WebSocket client ID: $_clientId');
          break;

        case WebSocketEvents.authenticated:
          _isAuthenticated = true;
          LogService.i('WebSocket authenticated');
          // Re-join previously joined rooms
          for (final room in _joinedRooms) {
            _send(WebSocketMessage(
              type: 'join_room',
              payload: {'room': room},
            ),);
          }
          break;

        case WebSocketEvents.error:
          LogService.e('WebSocket error: ${message.payload['message']}');
          break;

        case WebSocketEvents.pong:
          // Heartbeat response
          break;

        case WebSocketEvents.newToast:
          _toastController.add(message.payload);
          break;

        case WebSocketEvents.newComment:
          _commentController.add(message.payload);
          break;

        case WebSocketEvents.newCheckin:
          _newCheckinController.add(message.payload);
          break;

        case WebSocketEvents.sameEventCheckin:
          _sameEventController.add(message.payload);
          break;

        default:
          break;
      }

      // Emit to general message stream
      _messageController.add(message);
    } catch (e, stack) {
      LogService.e('Failed to parse WebSocket message', e, stack);
    }
  }

  /// Handle WebSocket error
  void _handleError(dynamic error) {
    LogService.e('WebSocket error', error);
    _isConnected = false;
    _isAuthenticated = false;
    _connectionController.add(false);
    _scheduleReconnect();
  }

  /// Handle WebSocket disconnect
  void _handleDisconnect() {
    LogService.w('WebSocket disconnected');
    _isConnected = false;
    _isAuthenticated = false;
    _connectionController.add(false);
    _scheduleReconnect();
  }

  /// Start ping timer to keep connection alive
  void _startPingTimer() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (_isConnected) {
        _send(WebSocketMessage(
          type: 'ping',
          payload: {},
        ),);
      }
    });
  }

  /// Schedule a reconnection attempt
  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      if (!_isConnected && _authToken != null) {
        LogService.i('Attempting WebSocket reconnection...');
        connect(authToken: _authToken, userId: _userId);
      }
    });
  }

  /// Clean up resources
  void dispose() {
    disconnect();
    _messageController.close();
    _connectionController.close();
    _toastController.close();
    _commentController.close();
    _newCheckinController.close();
    _sameEventController.close();
  }
}
