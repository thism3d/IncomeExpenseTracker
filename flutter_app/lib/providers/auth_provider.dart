import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../services/lock_service.dart';
import '../services/ws_client.dart';
import '../utils/constants.dart';

enum AuthStatus { unknown, unauthenticated, needsLock, locked, authenticated }

class AuthProvider extends ChangeNotifier {
  User? _user;
  AuthStatus _status = AuthStatus.unknown;
  bool _busy = false;
  String? _error;

  User? get user => _user;
  AuthStatus get status => _status;
  bool get busy => _busy;
  String? get error => _error;
  bool get isAuthenticated => _user != null;

  StreamSubscription<WsEvent>? _events;

  AuthProvider() {
    _events = WsClient.instance.events.listen(_onEvent);
  }

  void _onEvent(WsEvent e) {
    // The admin can suspend an account mid-session — don't leave a half-dead
    // shell on screen.
    if (e.name == 'account:status' && e.payload['status'] == 'SUSPENDED') {
      logout();
    }
  }

  /// The server refuses every data route until an app lock exists. If any call
  /// comes back with LOCK_REQUIRED — which happens when a user registered on the
  /// web, or when an old build somehow slipped past the client gate — push them
  /// to the setup screen instead of showing an unexplained error.
  void handleApiError(Object error) {
    if (error is! ApiException) return;
    if (error.code == 'LOCK_REQUIRED' && _status != AuthStatus.needsLock) {
      _set(AuthStatus.needsLock);
    } else if (error.code == 'SUSPENDED') {
      logout();
    }
  }

  void _set(AuthStatus s) {
    _status = s;
    notifyListeners();
  }

  bool _deviceLockConfigured = false;

  /// Called once at startup, after the splash.
  Future<void> bootstrap() async {
    await ApiService.loadToken();
    final prefs = await SharedPreferences.getInstance();
    _deviceLockConfigured = prefs.getBool('sb_device_lock_configured') ?? false;

    if (ApiService.token == null) {
      _set(AuthStatus.unauthenticated);
      return;
    }

    // Show the cached user immediately so the lock screen can greet by name even
    // if the network is slow, then refresh from the server.
    final cached = prefs.getString(AppConstants.userKey);
    if (cached != null) {
      try {
        _user = User.fromJson(jsonDecode(cached) as Map<String, dynamic>);
      } catch (_) {/* a corrupt cache is not worth crashing over */}
    }

    try {
      _user = await ApiService.me();
      await _cacheUser();
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) {
        await logout();
        return;
      }
      // Offline: keep the cached user and let the lock screen still gate entry.
      if (_user == null) {
        _set(AuthStatus.unauthenticated);
        return;
      }
    }

    _resolveGate();
  }

  /// Where a signed-in user lands: lock setup (mandatory, first time), the lock
  /// screen, or straight into the app.
  void _resolveGate() {
    final u = _user;
    if (u == null) {
      _set(AuthStatus.unauthenticated);
      return;
    }
    if (!u.lockConfigured || !_deviceLockConfigured) {
      _set(AuthStatus.needsLock);   // cannot be skipped
      return;
    }
    _set(LockService.instance.isUnlocked ? AuthStatus.authenticated : AuthStatus.locked);
  }

  Future<void> _cacheUser() async {
    final u = _user;
    if (u == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.userKey, jsonEncode(u.toJson()));
  }

  Future<T?> _run<T>(Future<T> Function() action) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      return await action();
    } on ApiException catch (e) {
      _error = e.message;
      // LOCK_REQUIRED / SUSPENDED change where the user belongs, not just what
      // the form says.
      handleApiError(e);
      return null;
    } catch (_) {
      _error = 'Something went wrong. Please try again.';
      return null;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  // ---------------------------------------------------------------- login

  Future<bool> login(String identifier, String password) async {
    final u = await _run(() => ApiService.login(identifier, password));
    if (u == null) return false;
    _user = u;
    await _cacheUser();
    // A fresh password login counts as proving who you are.
    LockService.instance.markUnlocked();
    _resolveGate();
    return true;
  }

  // ------------------------------------------------------------- register

  Future<Map<String, dynamic>?> sendRegisterOtp(String identifier) =>
      _run(() => ApiService.registerSendOtp(identifier));

  Future<String?> verifyRegisterOtp(String identifier, String code) =>
      _run(() => ApiService.registerVerifyOtp(identifier, code));

  Future<bool> completeRegistration({
    required String ticket,
    required String name,
    required String password,
  }) async {
    final u = await _run(() => ApiService.registerSetPassword(
          ticket: ticket,
          name: name,
          password: password,
        ));
    if (u == null) return false;
    _user = u;
    await _cacheUser();
    LockService.instance.markUnlocked();
    _resolveGate();   // -> needsLock, always, for a brand-new account
    return true;
  }

  // ------------------------------------------------------ forgot password

  Future<Map<String, dynamic>?> forgotPassword(String identifier) =>
      _run(() => ApiService.forgotPassword(identifier));

  Future<bool> resetPassword({
    required String identifier,
    required String code,
    required String password,
  }) async {
    final u = await _run(() => ApiService.resetPassword(
          identifier: identifier,
          code: code,
          password: password,
        ));
    if (u == null) return false;
    _user = u;
    await _cacheUser();
    LockService.instance.markUnlocked();
    _resolveGate();
    return true;
  }

  // ------------------------------------------------------------- app lock

  Future<bool> setupLock({required String pin, required bool biometricEnabled}) async {
    final u = await _run(() => ApiService.setupLock(
          pin: pin,
          biometricEnabled: biometricEnabled,
        ));
    if (u == null) return false;
    _user = u;
    await _cacheUser();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('sb_device_lock_configured', true);
    _deviceLockConfigured = true;

    await LockService.instance.setBiometricPreferred(biometricEnabled);
    LockService.instance.markUnlocked();
    _set(AuthStatus.authenticated);
    return true;
  }

  Future<bool> unlockWithPin(String pin) async {
    final ok = await _run(() => ApiService.verifyPin(pin));
    if (ok != true) return false;
    LockService.instance.markUnlocked();
    _set(AuthStatus.authenticated);
    return true;
  }

  Future<bool> unlockWithBiometrics() async {
    final ok = await LockService.instance.authenticate();
    if (!ok) return false;
    LockService.instance.markUnlocked();
    _set(AuthStatus.authenticated);
    return true;
  }

  Future<bool> updateLock({String? currentPin, String? pin, bool? biometricEnabled}) async {
    final u = await _run(() => ApiService.updateLock(
          currentPin: currentPin,
          pin: pin,
          biometricEnabled: biometricEnabled,
        ));
    if (u == null) return false;
    _user = u;
    await _cacheUser();
    if (biometricEnabled != null) {
      await LockService.instance.setBiometricPreferred(biometricEnabled);
    }
    return true;
  }

  /// The app went to the background — start the clock on the grace period.
  void onBackgrounded() {
    if (_status == AuthStatus.authenticated) {
      LockService.instance.onBackgrounded();
    }
  }

  /// The app came back from the background — re-lock if it was away long enough.
  void onResume() {
    if (_user == null) return;
    if (_status != AuthStatus.authenticated) return;
    if (LockService.instance.shouldRelockOnResume()) {
      _set(AuthStatus.locked);
    }
  }

  // -------------------------------------------------------------- profile

  Future<bool> updateProfile({String? name, String? currency}) async {
    final u = await _run(() => ApiService.updateProfile(name: name, currency: currency));
    if (u == null) return false;
    _user = u;
    await _cacheUser();
    return true;
  }

  Future<bool> changePassword(String currentPassword, String password) async {
    final r = await _run(() async {
      await ApiService.changePassword(currentPassword, password);
      return true;
    });
    return r == true;
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('sb_device_lock_configured');
    _deviceLockConfigured = false;

    await ApiService.clearToken();
    LockService.instance.lock();
    _user = null;
    _error = null;
    _set(AuthStatus.unauthenticated);
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }
}
