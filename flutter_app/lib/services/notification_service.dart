import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Local notifications: budget alerts, recurring-entry confirmations, payment
/// reminders, and admin broadcasts pushed over the WebSocket.
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  static const _channel = AndroidNotificationChannel(
    'sisirbindu_default',
    'SisirBindu Tracker',
    description: 'Budget alerts, reminders, and account notifications',
    importance: Importance.high,
  );

  Future<void> initialize() async {
    if (_ready) return;

    // @mipmap/ic_launcher would render as a full-colour blob in the status bar.
    // Android wants a white-on-transparent silhouette — ic_stat_notification is
    // generated from the logo for exactly this.
    const android = AndroidInitializationSettings('@drawable/ic_stat_notification');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );

    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    _ready = true;
  }

  /// Android 13+ requires the runtime POST_NOTIFICATIONS grant.
  Future<bool> requestPermission() async {
    final android = _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      return await android.requestNotificationsPermission() ?? false;
    }
    final ios = _plugin
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    if (ios != null) {
      return await ios.requestPermissions(alert: true, badge: true, sound: true) ?? false;
    }
    return false;
  }

  Future<void> show({
    required String title,
    required String body,
    int? id,
    String? payload,
  }) async {
    await initialize();
    await _plugin.show(
      id ?? DateTime.now().millisecondsSinceEpoch.remainder(100000),
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          color: const Color(0xFF0E7C66),
          styleInformation: BigTextStyleInformation(body),
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: payload,
    );
  }

  Future<void> cancelAll() => _plugin.cancelAll();
}
