import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../utils/constants.dart';

/// The device-side half of the app lock.
///
/// The README makes lock setup mandatory: after the first login the user must
/// enable a biometric or set a PIN before reaching the home screen. Biometrics
/// are verified *on the device* — the server never sees a fingerprint — so all
/// it stores is a flag. The PIN is the fallback that always works (a phone with
/// no enrolled fingerprint, a wet thumb, a failed face scan), and it is the only
/// thing actually verifiable against the server.
class LockService {
  LockService._();
  static final LockService instance = LockService._();

  final _auth = LocalAuthentication();

  DateTime? _backgroundedAt;
  bool _unlockedThisSession = false;

  bool get isUnlocked => _unlockedThisSession;

  /// Can this device do fingerprint/face at all?
  Future<bool> get canUseBiometrics async {
    try {
      final supported = await _auth.isDeviceSupported();
      final types = await _auth.getAvailableBiometrics();
      final available = await _auth.canCheckBiometrics;
      return supported && (available || types.isNotEmpty);
    } on PlatformException {
      return false;
    }
  }

  /// What the enrolment screen should call the biometric — "Fingerprint", "Face
  /// unlock", or the generic fallback. Never promise Face ID on a device that
  /// only has a fingerprint reader.
  Future<String> biometricLabel() async {
    try {
      final types = await _auth.getAvailableBiometrics();
      if (types.contains(BiometricType.face)) return 'Face unlock';
      if (types.contains(BiometricType.fingerprint)) return 'Fingerprint';
      if (types.contains(BiometricType.iris)) return 'Iris';
      if (types.contains(BiometricType.weak)) return 'Biometric unlock';
      return 'Biometric unlock';
    } on PlatformException {
      return 'Biometric unlock';
    }
  }

  Future<bool> hasEnrolledBiometrics() async {
    try {
      final types = await _auth.getAvailableBiometrics();
      return types.isNotEmpty;
    } on PlatformException {
      return false;
    }
  }

  /// Prompt for the fingerprint/face. Setting biometricOnly: true ensures that
  /// the OS uses face/fingerprint prompts and does not fall back to the phone
  /// screen passcode/pattern, letting our app's own PIN pad act as the fallback.
  Future<bool> authenticate({String reason = 'Unlock SisirBindu Tracker'}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
          useErrorDialogs: true,
        ),
        authMessages: const [
          AndroidAuthMessages(
            signInTitle: 'SisirBindu Tracker',
            biometricHint: '',
            cancelButton: 'Use PIN',
          ),
        ],
      );
    } on PlatformException {
      // No enrolment, hardware busy, too many attempts — the caller falls back
      // to the PIN pad rather than locking the user out.
      return false;
    }
  }

  Future<bool> get biometricPreferred async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(AppConstants.biometricKey) ?? false;
  }

  Future<void> setBiometricPreferred(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(AppConstants.biometricKey, value);
  }

  void markUnlocked() {
    _unlockedThisSession = true;
    _backgroundedAt = null;
  }

  void lock() {
    _unlockedThisSession = false;
    _backgroundedAt = null;
  }

  void onBackgrounded() {
    _backgroundedAt = DateTime.now();
  }

  /// Re-lock only after a real absence. Locking on every momentary background
  /// would make the app unusable — the camera sheet, the file picker and a
  /// permission dialog all background it for a second or two.
  bool shouldRelockOnResume() {
    if (!_unlockedThisSession) return true;
    final at = _backgroundedAt;
    if (at == null) return false;
    final away = DateTime.now().difference(at);
    _backgroundedAt = null;
    if (away > AppConstants.lockGracePeriod) {
      _unlockedThisSession = false;
      return true;
    }
    return false;
  }
}
