class AppConstants {
  AppConstants._();

  // ---- identity
  static const String appName = 'SISIRBINDU TRACKERAPP';
  static const String appShortName = 'SisirBindu';
  static const String appId = 'com.sisirbindu.tracker';

  // The source of truth for the Android versionName/versionCode — android/app/
  // build.gradle.kts reads these out of this file. They must match what the admin
  // publishes to app_versions, or the update check will never fire.
  static const String appVersion = '1.0.1';
  static const int appBuildNumber = 2;

  // ------------------------------------------------------------------- API
  //
  // THE ONLY TWO LINES TO CHANGE WHEN THE DOMAIN MOVES.
  // sisirbindu.site today; sisirbindu.com later — edit `_prodHost` and rebuild.
  //
  // Everything below derives from these, including the WebSocket URL.

  static const String _prodHost = 'api.sisirbindu.site';

  /// true  = talk to the dev backend on this machine
  /// false = talk to `_prodHost`
  ///
  /// Override without touching the file — useful for CI and release builds:
  ///   flutter build apk --release --dart-define=USE_LOCAL_BACKEND=false
  ///   flutter run --dart-define=API_HOST=192.168.0.102:5051   (physical device)
  static const bool useLocalBackend =
      bool.fromEnvironment('USE_LOCAL_BACKEND', defaultValue: false);

  /// 10.0.2.2 is the Android emulator's alias for the host machine's localhost.
  /// A physical device on the same wifi needs the machine's LAN IP instead — pass
  /// it with --dart-define=API_HOST=192.168.x.x:5051
  static const String _localHost =
      String.fromEnvironment('API_HOST', defaultValue: '10.0.2.2:5051');

  static const String apiBaseUrl = useLocalBackend
      ? 'http://$_localHost/api'
      : 'https://$_prodHost/api';

  static String get wsUrl {
    final base = apiBaseUrl
        .replaceFirst(RegExp(r'^https'), 'wss')
        .replaceFirst(RegExp(r'^http'), 'ws')
        .replaceFirst(RegExp(r'/api/?$'), '');
    return '$base/ws';
  }

  // ---- storage keys
  static const String tokenKey = 'sb_token';
  static const String userKey = 'sb_user';
  static const String onboardedKey = 'sb_onboarded';
  static const String themeKey = 'sb_theme';
  static const String biometricKey = 'sb_biometric';

  // ---- behaviour
  static const int otpLength = 6;
  static const int otpResendSeconds = 60;
  static const int pinMinLength = 4;
  static const int pinMaxLength = 6;
  static const int pageSize = 25;
  static const Duration requestTimeout = Duration(seconds: 20);

  // How long the app can sit in the background before the lock screen comes back.
  static const Duration lockGracePeriod = Duration(minutes: 2);

  static const String currency = 'BDT';
  static const String currencySymbol = '৳'; // ৳
}
