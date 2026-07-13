import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as ws_status;

import '../utils/constants.dart';

/// The error every API call throws. `code` mirrors the backend's error codes
/// (INVALID_OTP, MAINTENANCE, SUSPENDED, …) so callers can branch on it.
class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  final Map<String, dynamic> detail;

  ApiException(this.status, this.code, this.message, [this.detail = const {}]);

  @override
  String toString() => message;
}

/// The single transport. Every route the REST API exposes is reachable here —
/// the backend turns each frame into a synthetic Express request and re-enters
/// the same router, so `get('/accounts')` hits the identical handler an HTTP GET
/// would, and we get server push for free.
///
/// Binary bodies (file upload, report download) can't ride this — they go over
/// real HTTP in ApiService.
class WsClient {
  WsClient._();
  static final WsClient instance = WsClient._();

  WebSocketChannel? _channel;
  final Map<String, _Pending> _pending = {};
  final _events = StreamController<WsEvent>.broadcast();
  final _status = StreamController<bool>.broadcast();

  int _counter = 0;
  int _attempts = 0;
  bool _connecting = false;
  bool _closedByUs = false;
  String? _token;

  Stream<WsEvent> get events => _events.stream;
  Stream<bool> get connection => _status.stream;
  bool get isConnected => _channel != null && !_connecting;

  void setToken(String? token) {
    _token = token;
    // Rebind the socket so pushes for this user find us.
    if (_channel != null) {
      unawaited(_bind());
    }
  }

  Future<void> connect() async {
    if (_connecting || _channel != null) return;
    _connecting = true;
    _closedByUs = false;

    try {
      final channel = WebSocketChannel.connect(Uri.parse(AppConstants.wsUrl));
      await channel.ready.timeout(const Duration(seconds: 8));
      _channel = channel;
      _connecting = false;
      _attempts = 0;
      _status.add(true);

      channel.stream.listen(
        _onMessage,
        onDone: _onDisconnect,
        onError: (_) => _onDisconnect(),
        cancelOnError: false,
      );

      // Re-issue whatever was in flight when the socket dropped, so a brief
      // blip doesn't surface as an error. Once only — a request that itself
      // kills the connection must not loop.
      for (final p in _pending.values) {
        if (!p.retried) {
          p.retried = true;
          channel.sink.add(jsonEncode(p.frame));
        }
      }

      if (_token != null) await _bind();
    } catch (_) {
      _connecting = false;
      _channel = null;
      _scheduleReconnect();
    }
  }

  /// Ask for the current user purely so the server sees the token on this socket
  /// and can route pushes to it.
  Future<void> _bind() async {
    try {
      await request('auth/me', method: 'GET');
    } catch (_) {
      // A bad/expired token just means no pushes; the next real call will 401.
    }
  }

  void _onMessage(dynamic raw) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }

    if (msg['type'] == 'event') {
      _events.add(WsEvent(
        '${msg['event']}',
        (msg['payload'] as Map<String, dynamic>?) ?? const {},
      ));
      return;
    }

    final pending = _pending.remove('${msg['id']}');
    if (pending == null) return;
    pending.timer.cancel();

    final status = (msg['status'] as num?)?.toInt() ?? 500;
    final payload = (msg['payload'] as Map<String, dynamic>?) ?? const {};

    if (status >= 200 && status < 300) {
      pending.completer.complete(payload);
    } else {
      final error = (payload['error'] as Map<String, dynamic>?) ?? const {};
      pending.completer.completeError(ApiException(
        status,
        '${error['code'] ?? 'UNKNOWN'}',
        '${error['message'] ?? 'Something went wrong'}',
        error,
      ));
    }
  }

  void _onDisconnect() {
    _channel = null;
    _status.add(false);
    // Don't fail the in-flight requests here — a reconnect re-issues them, and
    // their own timeouts are the backstop if it never comes back.
    if (!_closedByUs) _scheduleReconnect();
  }

  void _scheduleReconnect() {
    _attempts += 1;
    final delay = Duration(
      milliseconds: (1000 * (1 << (_attempts - 1).clamp(0, 4))).clamp(1000, 15000),
    );
    Timer(delay, () {
      if (!_closedByUs) connect();
    });
  }

  Future<Map<String, dynamic>> request(
    String action, {
    String method = 'POST',
    Map<String, dynamic>? payload,
    Map<String, dynamic>? query,
  }) async {
    var path = action.startsWith('/') ? action.substring(1) : action;
    if (query != null && query.isNotEmpty) {
      final qs = query.entries
          .where((e) => e.value != null && '${e.value}'.isNotEmpty)
          .map((e) => '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent('${e.value}')}')
          .join('&');
      if (qs.isNotEmpty) path = '$path?$qs';
    }

    final id = 'r${++_counter}_${DateTime.now().microsecondsSinceEpoch}';
    final frame = <String, dynamic>{
      'id': id,
      'action': path,
      'method': method,
      'payload': payload ?? const {},
      if (_token != null) 'token': 'Bearer $_token',
    };

    final completer = Completer<Map<String, dynamic>>();
    final timer = Timer(AppConstants.requestTimeout, () {
      if (_pending.remove(id) != null && !completer.isCompleted) {
        completer.completeError(ApiException(
          408,
          'TIMEOUT',
          'The server took too long to respond. Check your connection.',
        ));
      }
    });

    _pending[id] = _Pending(completer, frame, timer);

    if (_channel != null) {
      _channel!.sink.add(jsonEncode(frame));
    } else {
      // Hold it: connect() flushes the pending map on open.
      unawaited(connect());
    }

    return completer.future;
  }

  void disconnect() {
    _closedByUs = true;
    _channel?.sink.close(ws_status.normalClosure);
    _channel = null;
    for (final p in _pending.values) {
      p.timer.cancel();
    }
    _pending.clear();
  }
}

class WsEvent {
  final String name;
  final Map<String, dynamic> payload;
  const WsEvent(this.name, this.payload);
}

class _Pending {
  final Completer<Map<String, dynamic>> completer;
  final Map<String, dynamic> frame;
  final Timer timer;
  bool retried = false;

  _Pending(this.completer, this.frame, this.timer);
}
